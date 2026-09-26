import hmac
import hashlib
import json
import uuid
import urllib.request
import urllib.error
import base64
from decimal import Decimal
from typing import Dict, Any, Optional

from django.conf import settings
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.finance.models import (
    PaymentTransaction,
    PaymentGateway,
    PaymentTxStatus,
)
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services.order_workflow_service import OrderWorkflowService
from apps.finance.services.invoice_service import InvoiceService


class PaymentGatewayService:
    """
    Authoritative domain service managing external Razorpay payment gateway
    lifecycle, signature verification, webhook processing, and idempotent order state updates.
    """

    @classmethod
    def get_key_id(cls) -> str:
        return getattr(settings, 'RAZORPAY_KEY_ID', 'rzp_test_mock_veepower_key')

    @classmethod
    def get_key_secret(cls) -> str:
        return getattr(settings, 'RAZORPAY_KEY_SECRET', 'mock_veepower_secret_key_12345')

    @classmethod
    def get_webhook_secret(cls) -> str:
        return getattr(settings, 'RAZORPAY_WEBHOOK_SECRET', 'mock_veepower_webhook_secret_67890')

    @classmethod
    def is_live(cls) -> bool:
        key_id = cls.get_key_id()
        return bool(key_id and key_id.startswith('rzp_live_'))

    @classmethod
    @transaction.atomic
    def initiate_order_payment(cls, order_id: int, user, payment_method: str = 'UPI') -> Dict[str, Any]:
        """
        Initiate payment intent for a customer order.
        Validates ownership, enforces server-authoritative amount, creates PaymentTransaction,
        and registers the order with Razorpay.
        """
        try:
            order = Order.objects.select_for_update().get(pk=order_id)
        except Order.DoesNotExist:
            raise ValidationError("Order not found.")

        # Authorization: Customer can only pay for their own order (admins have elevated access)
        if order.user_id != user.id and not (user.is_staff or getattr(user, 'role', '') == 'admin'):
            raise ValidationError("You are not authorized to initiate payment for this order.")

        # Business Constraint: Order must be in PENDING payment status
        if order.payment_status == PaymentStatus.PAID:
            raise ValidationError("This order has already been paid.")

        if order.status == OrderStatus.CANCELLED:
            raise ValidationError("Cannot initiate payment for a cancelled order.")

        # Calculate authoritative amount in paise (1 INR = 100 paise)
        amount_in_paise = int(order.total_amount * 100)
        if amount_in_paise <= 0:
            raise ValidationError("Invalid order payable amount.")

        # Generate or retrieve Gateway Order ID
        gateway_order_id = None
        key_id = cls.get_key_id()
        key_secret = cls.get_key_secret()

        # Check if an existing INITIATED transaction exists for this order
        existing_txn = PaymentTransaction.objects.filter(
            order=order,
            gateway=PaymentGateway.RAZORPAY,
            status=PaymentTxStatus.INITIATED,
            amount=order.total_amount
        ).first()

        if existing_txn and existing_txn.gateway_order_id:
            gateway_order_id = existing_txn.gateway_order_id
            txn = existing_txn
        else:
            if cls.is_live() and key_id and key_secret:
                try:
                    payload = json.dumps({
                        "amount": amount_in_paise,
                        "currency": "INR",
                        "receipt": order.order_number,
                        "notes": {
                            "order_id": order.id,
                            "customer_email": order.customer_email,
                        }
                    }).encode('utf-8')

                    req = urllib.request.Request(
                        "https://api.razorpay.com/v1/orders",
                        data=payload,
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": "Basic " + base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
                        }
                    )
                    with urllib.request.urlopen(req, timeout=10) as response:
                        res_data = json.loads(response.read().decode('utf-8'))
                        gateway_order_id = res_data.get('id')
                except Exception:
                    # Fallback to deterministic sandbox ID if gateway call fails
                    gateway_order_id = f"order_rzp_{uuid.uuid4().hex[:14]}"
            else:
                gateway_order_id = f"order_rzp_mock_{order.id}_{uuid.uuid4().hex[:8]}"

            # Create or update PaymentTransaction record
            txn = PaymentTransaction.objects.create(
                order=order,
                gateway=PaymentGateway.RAZORPAY,
                gateway_order_id=gateway_order_id,
                payment_method=payment_method,
                amount=order.total_amount,
                currency='INR',
                status=PaymentTxStatus.INITIATED,
            )

        return {
            "key_id": key_id,
            "order_id": order.id,
            "order_number": order.order_number,
            "gateway_order_id": gateway_order_id,
            "amount": amount_in_paise,
            "amount_inr": str(order.total_amount),
            "currency": "INR",
            "customer_name": order.customer_name,
            "customer_email": order.customer_email,
            "customer_phone": order.customer_phone,
            "transaction_id": txn.id,
        }

    @classmethod
    def generate_signature(cls, razorpay_order_id: str, razorpay_payment_id: str, key_secret: Optional[str] = None) -> str:
        """
        Generate standard Razorpay HMAC-SHA256 signature for test verification.
        """
        secret = key_secret or cls.get_key_secret()
        msg = f"{razorpay_order_id}|{razorpay_payment_id}".encode('utf-8')
        return hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).hexdigest()

    @classmethod
    def verify_payment_signature(
        cls,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> bool:
        """
        Cryptographically verify Razorpay payment signature using SHA256 HMAC.
        """
        if not razorpay_order_id or not razorpay_payment_id or not razorpay_signature:
            return False

        secret = cls.get_key_secret()
        expected = cls.generate_signature(razorpay_order_id, razorpay_payment_id, secret)
        return hmac.compare_digest(expected, razorpay_signature)

    @classmethod
    def confirm_payment(
        cls,
        order_id: int,
        user,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
        payment_method: str = 'UPI',
        currency: str = 'INR',
    ) -> PaymentTransaction:
        """
        Authoritatively confirm payment on backend after cryptographic signature verification.
        Applies idempotent transitions to Order and generates invoice snapshot.
        """
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            raise ValidationError("Order not found.")

        # Currency validation: only INR accepted
        if currency and currency.upper() != 'INR':
            raise ValidationError(f"Invalid currency '{currency}'. Only INR transactions are supported.")

        # Authorization: Must be owner or admin
        if order.user_id != user.id and not (user.is_staff or getattr(user, 'role', '') == 'admin'):
            raise ValidationError("You are not authorized to confirm payment for this order.")

        # Cancelled Order Protection
        if order.status == OrderStatus.CANCELLED:
            raise ValidationError("Cannot confirm payment for a cancelled order.")

        # Integrity check: Ensure gateway_order_id is not linked to a different order
        foreign_order_txn = PaymentTransaction.objects.filter(
            gateway_order_id=razorpay_order_id
        ).exclude(order=order).first()
        if foreign_order_txn:
            raise ValidationError("Gateway order ID belongs to a different order.")

        # Integrity check: Ensure gateway payment ID hasn't been credited to a different order
        if razorpay_payment_id:
            foreign_pay_txn = PaymentTransaction.objects.filter(
                gateway_transaction_id=razorpay_payment_id
            ).exclude(order=order).first()
            if foreign_pay_txn:
                raise ValidationError("This payment ID has already been credited to another order.")

        # Validate signature
        is_valid = cls.verify_payment_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
        if not is_valid:
            # Mark transaction as FAILED if exists and persist immediately
            PaymentTransaction.objects.filter(
                order=order,
                gateway_order_id=razorpay_order_id
            ).update(
                status=PaymentTxStatus.FAILED,
                error_code="INVALID_SIGNATURE",
                error_message="Cryptographic signature verification failed."
            )
            fail_txn = PaymentTransaction.objects.filter(
                order=order,
                gateway_order_id=razorpay_order_id
            ).first()
            from apps.core.services.communication_service import CommunicationService
            CommunicationService.send_payment_failure(
                order=order,
                transaction=fail_txn,
                error_message="Cryptographic signature verification failed."
            )
            raise ValidationError("Invalid payment signature.")

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order_id)

            if order.status == OrderStatus.CANCELLED:
                raise ValidationError("Cannot confirm payment for a cancelled order.")

            # Find or create PaymentTransaction
            txn = PaymentTransaction.objects.filter(
                order=order,
                gateway_order_id=razorpay_order_id
            ).select_for_update().first()

            if not txn:
                txn = PaymentTransaction.objects.create(
                    order=order,
                    gateway=PaymentGateway.RAZORPAY,
                    gateway_order_id=razorpay_order_id,
                    gateway_transaction_id=razorpay_payment_id,
                    gateway_signature=razorpay_signature,
                    payment_method=payment_method,
                    amount=order.total_amount,
                    currency='INR',
                    status=PaymentTxStatus.SUCCESS,
                )
            else:
                # Idempotency check: if already SUCCESS, return directly without re-applying business side-effects
                if txn.status == PaymentTxStatus.SUCCESS and order.payment_status == PaymentStatus.PAID:
                    return txn

                txn.gateway_transaction_id = razorpay_payment_id
                txn.gateway_signature = razorpay_signature
                txn.payment_method = payment_method or txn.payment_method
                txn.status = PaymentTxStatus.SUCCESS
                txn.save()

            # Update Order payment status
            order.payment_status = PaymentStatus.PAID
            order.save(update_fields=['payment_status', 'updated_at'])

            # Transition order to CONFIRMED if currently PENDING
            if order.status == OrderStatus.PENDING:
                OrderWorkflowService.transition_order_status(
                    order_id=order.id,
                    target_status=OrderStatus.CONFIRMED,
                    changed_by=user,
                    reason="Payment verified and received via Razorpay"
                )

            # Generate GST tax invoice snapshot for the paid order
            try:
                invoice = InvoiceService.create_invoice_for_order(order=order)
                txn.invoice = invoice
                txn.save(update_fields=['invoice'])
            except Exception:
                # Invoice generation should not block successful payment acknowledgement if already generated
                pass

            # Dispatch payment confirmation communication
            from apps.core.services.communication_service import CommunicationService
            CommunicationService.send_payment_confirmation(order=order, transaction=txn)

            return txn

    @classmethod
    @transaction.atomic
    def process_webhook(cls, raw_body: bytes, signature_header: Optional[str]) -> Dict[str, Any]:
        """
        Process asynchronous Razorpay webhook events with signature verification and idempotency.
        """
        webhook_secret = cls.get_webhook_secret()
        if not signature_header or not webhook_secret:
            raise ValidationError("Missing webhook signature.")

        # Cryptographically verify webhook signature
        expected_sig = hmac.new(webhook_secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, signature_header):
            raise ValidationError("Invalid webhook signature.")

        try:
            payload = json.loads(raw_body.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            raise ValidationError("Malformed webhook payload.")

        event = payload.get('event', '')
        payload_entity = payload.get('payload', {})

        if event in ('payment.captured', 'order.paid'):
            payment_entity = payload_entity.get('payment', {}).get('entity', {})
            razorpay_order_id = payment_entity.get('order_id')
            razorpay_payment_id = payment_entity.get('id')
            amount_in_paise = payment_entity.get('amount')
            currency = payment_entity.get('currency', 'INR')
            payment_method = payment_entity.get('method', 'UPI')

            if not razorpay_order_id:
                return {"status": "ignored", "reason": "No order_id in payment entity"}

            # Currency validation
            if currency and currency.upper() != 'INR':
                raise ValidationError(f"Webhook currency mismatch: expected INR, received {currency}.")

            txn = PaymentTransaction.objects.filter(
                gateway_order_id=razorpay_order_id
            ).select_for_update().first()

            if not txn:
                return {"status": "ignored", "reason": "Transaction not found"}

            order = Order.objects.select_for_update().get(pk=txn.order_id)
            if not order:
                return {"status": "ignored", "reason": "Order not associated"}

            # Verify amount consistency against authoritative order amount
            expected_paise = int(order.total_amount * 100)
            if amount_in_paise is not None and int(amount_in_paise) != expected_paise:
                raise ValidationError(
                    f"Webhook amount mismatch. Expected: {expected_paise} paise, received: {amount_in_paise} paise."
                )

            # Prevent payment ID reuse across different orders
            if razorpay_payment_id and PaymentTransaction.objects.filter(
                gateway_transaction_id=razorpay_payment_id
            ).exclude(order=order).exists():
                raise ValidationError("Duplicate payment ID across different orders.")

            # Cancelled Order Protection: log receipt without order resurrection
            if order.status == OrderStatus.CANCELLED:
                txn.gateway_transaction_id = razorpay_payment_id
                txn.status = PaymentTxStatus.SUCCESS
                txn.metadata = {
                    **(txn.metadata or {}),
                    "warning": "Payment received after order cancellation. Manual reconciliation/refund required."
                }
                txn.save(update_fields=['gateway_transaction_id', 'status', 'metadata'])
                return {
                    "status": "cancelled_order_payment",
                    "order_id": order.id,
                    "reason": "Order was previously cancelled. Payment recorded for audit without order resurrection."
                }

            # Idempotency check
            if txn.status == PaymentTxStatus.SUCCESS and order.payment_status == PaymentStatus.PAID:
                return {"status": "idempotent_ok", "order_id": order.id}

            txn.gateway_transaction_id = razorpay_payment_id
            txn.status = PaymentTxStatus.SUCCESS
            txn.payment_method = payment_method
            txn.save()

            order.payment_status = PaymentStatus.PAID
            order.save(update_fields=['payment_status', 'updated_at'])

            if order.status == OrderStatus.PENDING:
                OrderWorkflowService.transition_order_status(
                    order_id=order.id,
                    target_status=OrderStatus.CONFIRMED,
                    changed_by=order.user,
                    reason="Webhook: Payment verified and captured by Razorpay"
                )

            try:
                invoice = InvoiceService.create_invoice_for_order(order=order)
                txn.invoice = invoice
                txn.save(update_fields=['invoice'])
            except Exception:
                pass

            from apps.core.services.communication_service import CommunicationService
            CommunicationService.send_payment_confirmation(order=order, transaction=txn)

            return {"status": "success", "order_id": order.id}

        elif event == 'payment.failed':
            payment_entity = payload_entity.get('payment', {}).get('entity', {})
            razorpay_order_id = payment_entity.get('order_id')
            error_code = payment_entity.get('error_code', 'PAYMENT_FAILED')
            error_desc = payment_entity.get('error_description', 'Payment failed at gateway')

            if razorpay_order_id:
                PaymentTransaction.objects.filter(
                    gateway_order_id=razorpay_order_id
                ).update(
                    status=PaymentTxStatus.FAILED,
                    error_code=error_code,
                    error_message=error_desc,
                )
                fail_txn = PaymentTransaction.objects.filter(
                    gateway_order_id=razorpay_order_id
                ).first()
                if fail_txn and fail_txn.order:
                    from apps.core.services.communication_service import CommunicationService
                    CommunicationService.send_payment_failure(
                        order=fail_txn.order,
                        transaction=fail_txn,
                        error_message=error_desc
                    )

            return {"status": "failed_recorded"}

        return {"status": "event_unhandled", "event": event}


    @classmethod
    def process_refund(cls, order_id: int, user, reason: str = '') -> Dict[str, Any]:
        """
        Direct gateway refund flow is deferred for this release.
        Manual credit notes and return inspection remain canonical.
        """
        raise NotImplementedError("Direct payment gateway refund is deferred for this release.")
