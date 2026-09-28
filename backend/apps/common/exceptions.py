import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Union

from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError as DRFValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler

from apps.common.middleware import get_current_request_id

logger = logging.getLogger('apps.common.exceptions')

# ==============================================================================
# 1. CANONICAL BUSINESS EXCEPTIONS HIERARCHY
# ==============================================================================

class BusinessLogicError(APIException):
    """Base exception for all domain business rule violations."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'BUSINESS_LOGIC_ERROR'
    default_detail = 'A business rule violation occurred.'


class InvalidOrderTransitionError(BusinessLogicError):
    """Raised when an order transition violates the canonical FSM."""
    status_code = status.HTTP_409_CONFLICT
    default_code = 'INVALID_ORDER_TRANSITION'
    default_detail = 'The requested order status transition is invalid.'


class InsufficientStockError(BusinessLogicError):
    """Raised when an item requested exceeds current inventory."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'INSUFFICIENT_STOCK'
    default_detail = 'Insufficient stock for requested item.'


class InsufficientCreditError(BusinessLogicError):
    """Raised when a B2B order exceeds the client credit limit or credit is overdue."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'INSUFFICIENT_CREDIT'
    default_detail = 'Insufficient credit available for this transaction.'


class PaymentProcessingError(BusinessLogicError):
    """Raised when an external or internal payment gateway operation fails."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'PAYMENT_PROCESSING_ERROR'
    default_detail = 'Payment processing failed.'


class PaymentAlreadyProcessedError(BusinessLogicError):
    """Raised when attempting to pay or credit an order that is already settled."""
    status_code = status.HTTP_409_CONFLICT
    default_code = 'PAYMENT_ALREADY_PROCESSED'
    default_detail = 'This payment has already been processed.'


class PaymentAmountMismatchError(BusinessLogicError):
    """Raised when the submitted payment amount differs from the authoritative order total."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'PAYMENT_AMOUNT_MISMATCH'
    default_detail = 'Payment amount does not match order total.'


class DuplicatePaymentError(BusinessLogicError):
    """Raised when an idempotent or duplicate payment signature is detected."""
    status_code = status.HTTP_409_CONFLICT
    default_code = 'DUPLICATE_PAYMENT'
    default_detail = 'Duplicate payment detected.'


class InvalidCouponError(BusinessLogicError):
    """Raised when a discount coupon is inactive, non-existent, or below order threshold."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'INVALID_COUPON'
    default_detail = 'The coupon code is invalid.'


class CouponExpiredError(BusinessLogicError):
    """Raised when a discount coupon is past its statutory validity period."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'COUPON_EXPIRED'
    default_detail = 'The coupon code has expired.'


class DeliveryUnavailableError(BusinessLogicError):
    """Raised when a destination cannot be served by delivery configuration."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'DELIVERY_UNAVAILABLE'
    default_detail = 'Delivery is not available for the specified destination.'


class ReturnNotAllowedError(BusinessLogicError):
    """Raised when an order return is attempted outside allowable windows or statuses."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'RETURN_NOT_ALLOWED'
    default_detail = 'Return is not permitted for this order.'


class InvoiceAlreadyPaidError(BusinessLogicError):
    """Raised when attempting to mark a settled or closed invoice as paid."""
    status_code = status.HTTP_409_CONFLICT
    default_code = 'INVOICE_ALREADY_PAID'
    default_detail = 'This invoice has already been fully paid.'


class ResourceConflictError(BusinessLogicError):
    """Raised when a unique constraint or concurrency lock fails."""
    status_code = status.HTTP_409_CONFLICT
    default_code = 'RESOURCE_CONFLICT'
    default_detail = 'A resource conflict occurred.'


class ConfigurationConflictError(BusinessLogicError):
    """Raised when store, tax, delivery, or slab configurations overlap or clash."""
    status_code = status.HTTP_409_CONFLICT
    default_code = 'CONFIGURATION_CONFLICT'
    default_detail = 'Configuration conflicts with existing active rules.'


class ResourceNotFoundError(APIException):
    """Raised when an entity is not found or inaccessible."""
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'RESOURCE_NOT_FOUND'
    default_detail = 'The requested resource was not found.'


class ServiceUnavailableError(APIException):
    """Raised when an external dependency is unreachable."""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = 'SERVICE_UNAVAILABLE'
    default_detail = 'The service is temporarily unavailable. Please try again later.'


# ==============================================================================
# 2. SANITIZATION & SAFE STRING UTILITIES
# ==============================================================================

SENSITIVE_PATTERNS = [
    re.compile(r'password["\']?\s*[:=]\s*["\']?[^"\',\s]+', re.IGNORECASE),
    re.compile(r'token["\']?\s*[:=]\s*["\']?[^"\',\s]+', re.IGNORECASE),
    re.compile(r'secret["\']?\s*[:=]\s*["\']?[^"\',\s]+', re.IGNORECASE),
    re.compile(r'authorization["\']?\s*[:=]\s*["\']?[^"\',\s]+', re.IGNORECASE),
    re.compile(r'[a-zA-Z0-9_\-\.\/\\]*(\.py|\.env|\.sql|\.sh|\.cnf)', re.IGNORECASE),
]


def sanitize_error_string(text: str) -> str:
    """
    Strips raw filesystem paths, secrets, and SQL patterns from user-visible messages.
    """
    if not isinstance(text, str):
        text = str(text)
    # Check for raw SQL or filesystem disclosures
    if 'SELECT ' in text or 'INSERT ' in text or 'FROM ' in text or 'WHERE ' in text or 'TABLE ' in text:
        return 'A database operation could not be completed.'
    if 'Traceback (most recent call last)' in text or 'File "' in text:
        return 'An internal error occurred.'
    return text


def derive_machine_code(exc: Exception, status_code: int, message: str) -> str:
    """
    Derives a stable, uppercase, machine-readable error code.
    """
    # 1. Custom business logic exceptions with explicit default_code
    if isinstance(exc, BusinessLogicError):
        return str(getattr(exc, 'default_code', 'BUSINESS_LOGIC_ERROR')).upper()

    # 2. Known DRF / Auth / Permission / Not Found exceptions
    if isinstance(exc, NotAuthenticated):
        return 'NOT_AUTHENTICATED'
    if isinstance(exc, AuthenticationFailed):
        return 'AUTHENTICATION_FAILED'
    if isinstance(exc, PermissionDenied):
        return 'PERMISSION_DENIED'
    if isinstance(exc, (NotFound, Http404, ObjectDoesNotExist)):
        return 'RESOURCE_NOT_FOUND'
    if isinstance(exc, MethodNotAllowed):
        return 'METHOD_NOT_ALLOWED'
    if isinstance(exc, Throttled):
        return 'TOO_MANY_REQUESTS'
    if isinstance(exc, IntegrityError):
        return 'RESOURCE_CONFLICT'

    # 3. Message heuristic matching for business domain exceptions
    msg_lower = message.lower()
    if 'insufficient stock' in msg_lower or 'stock quantity' in msg_lower or 'available: 0' in msg_lower:
        return 'INSUFFICIENT_STOCK'
    if 'insufficient credit' in msg_lower or 'credit limit' in msg_lower:
        return 'INSUFFICIENT_CREDIT'
    if 'status transition' in msg_lower or 'cannot transition' in msg_lower:
        return 'INVALID_ORDER_TRANSITION'
    if 'already been paid' in msg_lower or 'already paid' in msg_lower or 'already been credited' in msg_lower:
        return 'PAYMENT_ALREADY_PROCESSED'
    if 'amount mismatch' in msg_lower:
        return 'PAYMENT_AMOUNT_MISMATCH'
    if 'expired' in msg_lower:
        return 'COUPON_EXPIRED'
    if 'coupon' in msg_lower:
        return 'INVALID_COUPON'
    if 'cannot be cancelled' in msg_lower or 'return' in msg_lower:
        return 'RETURN_NOT_ALLOWED'
    if 'conflict' in msg_lower or 'already converted' in msg_lower or 'duplicate' in msg_lower:
        return 'RESOURCE_CONFLICT'

    # 4. Standard validation error instances
    if isinstance(exc, (DRFValidationError, DjangoValidationError)):
        return 'VALIDATION_ERROR'

    # 5. Direct code attribute fallback if not generic 'invalid'/'error'
    if hasattr(exc, 'default_code') and exc.default_code and str(exc.default_code).lower() not in ('invalid', 'error'):
        return str(exc.default_code).upper()
    if hasattr(exc, 'code') and exc.code and str(exc.code).lower() not in ('invalid', 'error'):
        return str(exc.code).upper()

    # 6. Status code fallback
    if status_code == 400:
        return 'VALIDATION_ERROR'
    if status_code == 401:
        return 'UNAUTHORIZED'
    if status_code == 403:
        return 'FORBIDDEN'
    if status_code == 404:
        return 'NOT_FOUND'
    if status_code == 409:
        return 'CONFLICT'
    if status_code == 422:
        return 'UNPROCESSABLE_ENTITY'
    if status_code == 429:
        return 'TOO_MANY_REQUESTS'
    if status_code == 503:
        return 'SERVICE_UNAVAILABLE'
    return 'INTERNAL_SERVER_ERROR'


# ==============================================================================
# 3. CENTRALIZED GLOBAL EXCEPTION HANDLER
# ==============================================================================

def custom_exception_handler(exc: Exception, context: Dict[str, Any]) -> Optional[Response]:
    """
    Standardizes error responses across all APIs to the canonical contract:
    {
      "success": false,
      "error": {
        "code": "MACHINE_READABLE_ERROR_CODE",
        "message": "Safe human-readable message",
        "details": {},
        "request_id": "req_..."
      },
      "detail": "...",
      "errors": { ... }
    }
    Prevents leakage of raw database exceptions, secrets, credentials, or internal stack traces.
    """
    request = context.get('request')
    request_id = getattr(request, 'id', None) or get_current_request_id()
    if not request_id or request_id == '-':
        request_id = f"req_{uuid.uuid4().hex[:16]}"
        if request:
            request.id = request_id

    # 1. Handle DRF known exceptions
    response = exception_handler(exc, context)

    # 2. Handle Django / DB exceptions not handled by DRF by default
    if response is None:
        if isinstance(exc, IntegrityError):
            logger.warning(
                "Database IntegrityError caught [req:%s]: %s",
                request_id,
                str(exc)
            )
            response = Response(
                {'detail': 'A data conflict occurred. The requested resource could not be processed due to existing constraints.'},
                status=status.HTTP_409_CONFLICT,
            )
        elif isinstance(exc, ObjectDoesNotExist):
            response = Response(
                {'detail': 'The requested resource was not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        elif isinstance(exc, DjangoValidationError):
            messages = getattr(exc, 'message_dict', getattr(exc, 'messages', str(exc)))
            response = Response(
                messages if isinstance(messages, dict) else {'detail': str(messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        else:
            # Unexpected server-side failure
            logger.error(
                "Unhandled server exception [req:%s] %s: %s",
                request_id,
                type(exc).__name__,
                str(exc),
                exc_info=True,
            )
            response = Response(
                {'detail': 'An unexpected error occurred. Please try again later.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # 3. Format and normalize response under canonical contract
    if response is not None:
        data = response.data
        detail = "An error occurred while processing your request."
        details: Dict[str, Any] = {}

        if isinstance(data, dict):
            if 'detail' in data:
                detail = str(data['detail'])
                details = {k: v for k, v in data.items() if k != 'detail'}
            else:
                detail = "Validation failed."
                details = data
        elif isinstance(data, list):
            detail = str(data[0]) if data else "An error occurred."
            details = {'non_field_errors': data}
        else:
            detail = str(data)

        # Sanitize human-readable message
        safe_message = sanitize_error_string(detail)
        code = derive_machine_code(exc, response.status_code, safe_message)

        # Build canonical payload
        canonical_error = {
            'code': code,
            'message': safe_message,
            'details': details if isinstance(details, dict) else {'non_field_errors': details},
            'request_id': request_id,
        }

        # Structure out_data preserving backward compatibility
        out_data = {
            'success': False,
            'error': canonical_error,
            'detail': safe_message,
            'errors': details if isinstance(details, dict) else {'non_field_errors': details},
        }

        # Include direct field keys for standard client & test backward compatibility
        if isinstance(details, dict):
            for k, v in details.items():
                if k not in out_data:
                    out_data[k] = v

        response.data = out_data
        response['X-Request-ID'] = request_id

    return response
