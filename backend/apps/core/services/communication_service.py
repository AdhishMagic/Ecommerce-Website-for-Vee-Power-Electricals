import logging
import re
from typing import Optional, Dict, Any, List
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.template.loader import render_to_string
from django.utils import timezone

from apps.core.models import (
    CommunicationLog,
    CommunicationChannel,
    CommunicationStatus,
)
from apps.orders.models import Order, OrderStatus
from apps.finance.models import Invoice, Quotation, PaymentTransaction

logger = logging.getLogger(__name__)

# Keys that must never be stored in context snapshots for security compliance
SENSITIVE_CONTEXT_KEYS = {
    'password', 'token', 'uidb64', 'jwt', 'secret',
    'key', 'signature', 'razorpay_signature', 'auth_token'
}


class CommunicationService:
    """
    Authoritative domain service orchestrating customer communication across email channels.
    Enforces server-authoritative recipient validation, cryptographic sanitization,
    fail-safe error isolation, and strict event-level idempotency.
    """

    @classmethod
    def get_frontend_url(cls) -> str:
        return getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')

    @classmethod
    def validate_recipient_email(cls, email: Optional[str]) -> Optional[str]:
        """
        Validate and sanitize recipient email.
        Rejects non-string, empty, whitespace, and syntactically invalid addresses.
        """
        if not email or not isinstance(email, str):
            return None
        cleaned = email.strip()
        if not cleaned:
            return None
        try:
            validate_email(cleaned)
            return cleaned
        except DjangoValidationError:
            return None

    @classmethod
    def sanitize_context_for_snapshot(cls, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively strip secrets, passwords, tokens, and cryptographic keys
        before persisting context into audit logs.
        """
        safe_copy = {}
        for k, v in context.items():
            if k.lower() in SENSITIVE_CONTEXT_KEYS:
                safe_copy[k] = "[REDACTED]"
            elif isinstance(v, dict):
                safe_copy[k] = cls.sanitize_context_for_snapshot(v)
            elif isinstance(v, list):
                safe_copy[k] = [
                    cls.sanitize_context_for_snapshot(item) if isinstance(item, dict) else str(item)
                    for item in v
                ]
            elif hasattr(v, '__str__') and not callable(v):
                safe_copy[k] = str(v)
            else:
                safe_copy[k] = repr(v)
        return safe_copy

    @classmethod
    def send_email(
        cls,
        event_type: str,
        recipient: str,
        subject: str,
        template_base: str,
        context: Dict[str, Any],
        idempotency_key: str,
    ) -> Optional[CommunicationLog]:
        """
        Core low-level dispatcher.
        1. Validates recipient.
        2. Checks idempotency register to prevent duplicates.
        3. Renders both HTML and plain-text templates with escaping.
        4. Transmits via Django's configured EMAIL_BACKEND.
        5. Records immutable audit entry in CommunicationLog.
        6. Isolates failure: returns failed log entry without rolling back business transactions.
        """
        valid_recipient = cls.validate_recipient_email(recipient)
        safe_snapshot = cls.sanitize_context_for_snapshot(context)

        if not valid_recipient:
            logger.warning(
                "Communication suppressed: Invalid recipient '%s' for event '%s' [key: %s]",
                recipient, event_type, idempotency_key
            )
            # Create failed audit record for traceability
            log_record, _ = CommunicationLog.objects.update_or_create(
                idempotency_key=idempotency_key,
                defaults={
                    'event_type': event_type,
                    'channel': CommunicationChannel.EMAIL,
                    'recipient': str(recipient)[:255] if recipient else 'UNKNOWN',
                    'subject': subject[:255],
                    'template_name': template_base,
                    'status': CommunicationStatus.FAILED,
                    'error_message': f"Invalid or missing recipient email address: '{recipient}'",
                    'context_snapshot': safe_snapshot,
                }
            )
            return log_record

        # Strict idempotency check: if already SENT, skip delivery
        existing_log = CommunicationLog.objects.filter(
            idempotency_key=idempotency_key,
            status=CommunicationStatus.SENT
        ).first()

        if existing_log:
            logger.info(
                "Communication skipped: duplicate event '%s' with key '%s' already sent to %s",
                event_type, idempotency_key, valid_recipient
            )
            return existing_log

        # Ensure frontend_url is available in template context
        merged_context = dict(context)
        merged_context.setdefault('frontend_url', cls.get_frontend_url())

        # Render templates safely
        try:
            text_body = render_to_string(f"emails/{template_base}.txt", merged_context)
            html_body = render_to_string(f"emails/{template_base}.html", merged_context)
        except Exception as render_err:
            logger.error(
                "Template rendering error for '%s' (%s): %s",
                template_base, event_type, str(render_err)
            )
            log_record, _ = CommunicationLog.objects.update_or_create(
                idempotency_key=idempotency_key,
                defaults={
                    'event_type': event_type,
                    'channel': CommunicationChannel.EMAIL,
                    'recipient': valid_recipient,
                    'subject': subject[:255],
                    'template_name': template_base,
                    'status': CommunicationStatus.FAILED,
                    'error_message': f"Template rendering failed: {str(render_err)[:400]}",
                    'context_snapshot': safe_snapshot,
                }
            )
            return log_record

        # Deliver message with fail-safe error isolation
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'Vee Power Electricals <noreply@veepower.in>')

        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=from_email,
                to=[valid_recipient],
            )
            msg.attach_alternative(html_body, "text/html")
            msg.send(fail_silently=False)

            log_record, _ = CommunicationLog.objects.update_or_create(
                idempotency_key=idempotency_key,
                defaults={
                    'event_type': event_type,
                    'channel': CommunicationChannel.EMAIL,
                    'recipient': valid_recipient,
                    'subject': subject[:255],
                    'template_name': template_base,
                    'status': CommunicationStatus.SENT,
                    'sent_at': timezone.now(),
                    'error_message': None,
                    'context_snapshot': safe_snapshot,
                }
            )
            logger.info("Email '%s' sent successfully to %s [key: %s]", event_type, valid_recipient, idempotency_key)
            return log_record

        except Exception as send_err:
            # Crucial requirement: Email failure MUST NOT rollback the outer business transaction
            err_msg = str(send_err)[:500]
            logger.error("Email delivery failed for event '%s' to %s: %s", event_type, valid_recipient, err_msg)

            log_record, _ = CommunicationLog.objects.update_or_create(
                idempotency_key=idempotency_key,
                defaults={
                    'event_type': event_type,
                    'channel': CommunicationChannel.EMAIL,
                    'recipient': valid_recipient,
                    'subject': subject[:255],
                    'template_name': template_base,
                    'status': CommunicationStatus.FAILED,
                    'error_message': err_msg,
                    'context_snapshot': safe_snapshot,
                }
            )
            return log_record

    # --------------------------------------------------------------------------
    # HIGH-LEVEL DOMAIN EVENTS
    # --------------------------------------------------------------------------

    @classmethod
    def send_registration_welcome(cls, user) -> Optional[CommunicationLog]:
        """
        Event 1: Customer Account Registration.
        Dispatched upon successful customer registration.
        """
        recipient = getattr(user, 'email', '')
        customer_name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip() or getattr(user, 'username', 'Customer')
        customer_phone = getattr(user, 'phone', '')

        context = {
            'customer_name': customer_name,
            'customer_email': recipient,
            'customer_phone': customer_phone,
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='CUSTOMER_REGISTRATION',
            recipient=recipient,
            subject="Welcome to Vee Power Electricals",
            template_base='welcome',
            context=context,
            idempotency_key=f"REGISTRATION:{getattr(user, 'id', 'new')}",
        )

    @classmethod
    def send_password_reset(cls, user, uidb64: str, token: str) -> Optional[CommunicationLog]:
        """
        Event 2: Password Reset Request.
        Dispatched when an active customer requests password reset instructions.
        Token is excluded from persistent log snapshot for security compliance.
        """
        recipient = getattr(user, 'email', '')
        customer_name = getattr(user, 'first_name', '') or getattr(user, 'username', 'Customer')
        reset_url = f"{cls.get_frontend_url()}/reset-password?uid={uidb64}&token={token}"

        context = {
            'customer_name': customer_name,
            'customer_email': recipient,
            'uidb64': uidb64,
            'token': token,
            'reset_url': reset_url,
        }

        # Idempotency keyed by user and first 10 characters of cryptographic token
        return cls.send_email(
            event_type='PASSWORD_RESET',
            recipient=recipient,
            subject="Password Reset Request - Vee Power Electricals",
            template_base='password_reset',
            context=context,
            idempotency_key=f"PASSWORD_RESET:{getattr(user, 'id', 'user')}:{token[:10]}",
        )

    @classmethod
    def send_order_confirmation(cls, order: Order) -> Optional[CommunicationLog]:
        """
        Event 3: Order Confirmation.
        Dispatched when an order transitions to CONFIRMED.
        Authoritative recipient is order.customer_email.
        """
        recipient = order.customer_email
        items_data = [
            {
                'product_name': item.product_name,
                'sku': item.sku,
                'quantity': item.quantity,
                'unit_price': str(item.unit_price),
                'total_amount': str(item.total_amount),
            }
            for item in order.items.all()
        ]

        context = {
            'order_number': order.order_number,
            'customer_name': order.customer_name,
            'payment_method': order.payment_method,
            'payment_status': order.payment_status,
            'subtotal': str(order.subtotal),
            'total_discount': str(order.total_discount),
            'tax_amount': str(order.tax_amount),
            'shipping_fee': str(order.shipping_fee),
            'total_amount': str(order.total_amount),
            'shipping_address': order.shipping_address or {},
            'items': items_data,
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='ORDER_CONFIRMED',
            recipient=recipient,
            subject=f"Order Confirmed: #{order.order_number} - Vee Power Electricals",
            template_base='order_confirmation',
            context=context,
            idempotency_key=f"ORDER_CONFIRMATION:{order.id}",
        )

    @classmethod
    def send_order_status_update(cls, order: Order, new_status: str, reason: str = '') -> Optional[CommunicationLog]:
        """
        Events 6, 7, 8, 9, 10, 11, 12: Order fulfillment lifecycle changes.
        Supports canonical states: SHIPPED, DELIVERED, CANCELLED,
        RETURN_REQUESTED, RETURN_APPROVED, RETURN_REJECTED, RETURN_COMPLETED.
        """
        recipient = order.customer_email
        status_display_map = {
            OrderStatus.SHIPPED: "Shipped & In Transit",
            OrderStatus.DELIVERED: "Delivered",
            OrderStatus.CANCELLED: "Cancelled",
            OrderStatus.RETURN_REQUESTED: "Return Requested",
            OrderStatus.RETURN_APPROVED: "Return Approved",
            OrderStatus.RETURN_REJECTED: "Return Rejected",
            OrderStatus.RETURN_COMPLETED: "Return Completed & Restocked",
        }
        status_display = status_display_map.get(new_status, new_status)

        context = {
            'order_number': order.order_number,
            'customer_name': order.customer_name,
            'new_status': new_status,
            'status_display': status_display,
            'tracking_number': order.tracking_number,
            'reason': reason,
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type=f'ORDER_{new_status}',
            recipient=recipient,
            subject=f"Order #{order.order_number} Update: {status_display}",
            template_base='order_status_update',
            context=context,
            idempotency_key=f"ORDER_STATUS:{order.id}:{new_status}",
        )

    @classmethod
    def send_payment_confirmation(cls, order: Order, transaction: PaymentTransaction) -> Optional[CommunicationLog]:
        """
        Event 4: Payment Confirmation.
        Dispatched only after cryptographic payment verification succeeds on backend.
        """
        recipient = order.customer_email
        txn_ref = transaction.gateway_transaction_id or str(transaction.id)

        context = {
            'order_number': order.order_number,
            'customer_name': order.customer_name,
            'gateway': transaction.get_gateway_display() if hasattr(transaction, 'get_gateway_display') else transaction.gateway,
            'payment_method': transaction.payment_method or order.payment_method,
            'transaction_id': txn_ref,
            'amount': str(transaction.amount or order.total_amount),
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='PAYMENT_CONFIRMED',
            recipient=recipient,
            subject=f"Payment Received for Order #{order.order_number}",
            template_base='payment_confirmation',
            context=context,
            idempotency_key=f"PAYMENT_CONFIRMATION:{order.id}:{txn_ref}",
        )

    @classmethod
    def send_payment_failure(cls, order: Order, transaction: Optional[PaymentTransaction] = None, error_message: str = '') -> Optional[CommunicationLog]:
        """
        Event 5: Payment Failure.
        Dispatched when payment signature verification fails or gateway emits payment.failed.
        """
        recipient = order.customer_email
        txn_ref = transaction.gateway_order_id if transaction else f"fail_{order.id}"

        context = {
            'order_number': order.order_number,
            'customer_name': order.customer_name,
            'amount': str(order.total_amount),
            'error_message': error_message or "Payment was declined or verification failed.",
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='PAYMENT_FAILED',
            recipient=recipient,
            subject=f"Payment Failed for Order #{order.order_number}",
            template_base='payment_failure',
            context=context,
            idempotency_key=f"PAYMENT_FAILED:{order.id}:{txn_ref}",
        )

    @classmethod
    def send_invoice_notification(cls, invoice: Invoice) -> Optional[CommunicationLog]:
        """
        Event 13: Statutory GST Tax Invoice generation.
        Recipients derived from order.customer_email or client.email.
        """
        if invoice.order:
            recipient = invoice.order.customer_email
            customer_name = invoice.order.customer_name
            order_number = invoice.order.order_number
            quotation_number = None
        elif invoice.client:
            recipient = invoice.client.email
            customer_name = invoice.client.company_name
            order_number = None
            quotation_number = invoice.quotation.quotation_number if invoice.quotation else None
        else:
            return None

        context = {
            'invoice_number': invoice.invoice_number,
            'invoice_date': str(invoice.invoice_date),
            'order_number': order_number,
            'quotation_number': quotation_number,
            'customer_name': customer_name,
            'taxable_amount': str(invoice.taxable_amount),
            'cgst_amount': str(invoice.cgst_amount),
            'sgst_amount': str(invoice.sgst_amount),
            'igst_amount': str(invoice.igst_amount),
            'tax_amount': str(invoice.tax_amount),
            'total_amount': str(invoice.total_amount),
            'payment_status': invoice.payment_status or invoice.status,
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='INVOICE_GENERATED',
            recipient=recipient,
            subject=f"Tax Invoice {invoice.invoice_number} Issued - Vee Power Electricals",
            template_base='invoice_notification',
            context=context,
            idempotency_key=f"INVOICE_GENERATED:{invoice.id}",
        )

    @classmethod
    def send_quotation_notification(cls, quotation: Quotation, status_action: str = '') -> Optional[CommunicationLog]:
        """
        Events 14 & 15: Commercial Quotation Creation, Approval, or Rejection.
        Recipient is quotation.client.email.
        """
        client = quotation.client
        if not client or not client.email:
            return None

        recipient = client.email
        items_data = [
            {
                'item_name': item.item_name,
                'quantity': item.quantity,
                'unit_price': str(item.unit_price),
            }
            for item in quotation.items.all()
        ]

        context = {
            'quotation_number': quotation.quotation_number,
            'client_name': client.company_name,
            'quotation_date': str(quotation.quotation_date),
            'expiry_date': str(quotation.expiry_date),
            'total_value': str(quotation.total_value),
            'status': quotation.status,
            'notes': quotation.notes or '',
            'items': items_data,
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='QUOTATION_UPDATE',
            recipient=recipient,
            subject=f"Commercial Quotation #{quotation.quotation_number} ({quotation.status})",
            template_base='quotation_notification',
            context=context,
            idempotency_key=f"QUOTATION_UPDATE:{quotation.id}:{quotation.status}",
        )

    @classmethod
    def send_inquiry_acknowledgement(cls, inquiry) -> Optional[CommunicationLog]:
        """
        Event 16: Public Customer Support / Bulk Procurement Inquiry Acknowledgement.
        Recipient is inquiry.email.
        """
        recipient = getattr(inquiry, 'email', '')
        if not recipient:
            return None

        context = {
            'ticket_id': getattr(inquiry, 'id', 'ticket'),
            'customer_name': getattr(inquiry, 'name', 'Customer'),
            'subject': getattr(inquiry, 'subject', 'Procurement Inquiry'),
            'phone': getattr(inquiry, 'phone', ''),
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='INQUIRY_ACKNOWLEDGED',
            recipient=recipient,
            subject=f"Inquiry Received: Ticket #{inquiry.id} - Vee Power Electricals",
            template_base='inquiry_acknowledgement',
            context=context,
            idempotency_key=f"INQUIRY_ACK:{inquiry.id}",
        )
