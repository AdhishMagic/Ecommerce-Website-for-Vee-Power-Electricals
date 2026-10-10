import logging
import threading
from datetime import timedelta
from typing import Optional, Dict, Any, List
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from apps.core.models import (
    CommunicationLog,
    CommunicationChannel,
    CommunicationStatus,
)
from apps.admin_settings.models import NotificationSettings
from apps.orders.models import Order, OrderStatus
from apps.finance.models import Invoice, Quotation, PaymentTransaction
from apps.core.services.brevo_service import BrevoEmailService

logger = logging.getLogger(__name__)

# Keys that must never be stored in context snapshots for security compliance
SENSITIVE_CONTEXT_KEYS = {
    'password', 'token', 'uidb64', 'jwt', 'secret',
    'key', 'signature', 'razorpay_signature', 'auth_token', 'otp'
}


class CommunicationService:
    """
    Authoritative domain service orchestrating customer communication across email channels.
    Enforces server-authoritative recipient validation, cryptographic sanitization,
    fail-safe error isolation, strict event-level idempotency, outbox queueing,
    and Brevo Transactional Email delivery.

    Delivery is additionally gated by the administrator-configurable
    :class:`apps.admin_settings.models.NotificationSettings` policy.
    """

    @classmethod
    def get_frontend_url(cls) -> str:
        return getattr(settings, 'FRONTEND_BASE_URL', getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')).rstrip('/')

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
        Recursively strip secrets, passwords, tokens, OTPs, and cryptographic keys
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
        async_send: Optional[bool] = None,
        recipient_name: str = '',
    ) -> Optional[CommunicationLog]:
        """
        Core low-level dispatcher.
        1. Validates recipient.
        2. Checks policy gate.
        3. Enforces test-mode allowlist.
        4. Checks idempotency register to prevent duplicates.
        5. Renders both HTML and plain-text templates safely.
        6. Persists durable CommunicationLog (outbox record).
        7. Dispatches synchronously or asynchronously via on_commit.
        8. Isolates failure: returns failed log entry without rolling back business transactions.
        """
        safe_snapshot = cls.sanitize_context_for_snapshot(context)

        # 1. Authoritative notification-policy gate
        if not NotificationSettings.is_event_enabled(event_type):
            category = NotificationSettings.resolve_category(event_type)
            logger.info(
                "Communication suppressed by notification policy: event '%s' (category '%s') [key: %s]",
                event_type, category, idempotency_key,
            )
            log_record, _ = CommunicationLog.objects.update_or_create(
                idempotency_key=idempotency_key,
                defaults={
                    'event_type': event_type,
                    'channel': CommunicationChannel.EMAIL,
                    'recipient': str(recipient)[:255] if recipient else 'UNKNOWN',
                    'subject': subject[:255],
                    'template_name': template_base,
                    'status': CommunicationStatus.SKIPPED,
                    'error_message': f"Suppressed by notification policy: category '{category}' is disabled.",
                    'context_snapshot': safe_snapshot,
                },
            )
            return log_record

        # 1b. Minimal customer email policy evaluation (suppresses redundant & internal states)
        from apps.core.services.email_policy import EmailNotificationPolicy
        order_obj = context.get('order')
        should_deliver, classification, policy_reason = EmailNotificationPolicy.evaluate(
            event_type=event_type,
            context=context,
            order=order_obj,
        )
        if not should_deliver:
            logger.info(
                "Communication suppressed by email policy: %s [event: %s, key: %s]",
                policy_reason, event_type, idempotency_key
            )
            log_record, _ = CommunicationLog.objects.update_or_create(
                idempotency_key=idempotency_key,
                defaults={
                    'event_type': event_type,
                    'channel': CommunicationChannel.EMAIL,
                    'recipient': str(recipient)[:255] if recipient else 'UNKNOWN',
                    'subject': subject[:255],
                    'template_name': template_base,
                    'status': CommunicationStatus.SKIPPED,
                    'error_message': policy_reason,
                    'context_snapshot': safe_snapshot,
                },
            )
            return log_record

        # 2. Recipient validation
        valid_recipient = cls.validate_recipient_email(recipient)
        if not valid_recipient:
            logger.warning(
                "Communication suppressed: Invalid recipient '%s' for event '%s' [key: %s]",
                recipient, event_type, idempotency_key
            )
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

        # 3. Test mode recipient allowlist gate (fail closed)
        # Suppresses any outgoing email to non-allowlisted recipients in test mode.
        # Bypassed only for Django's in-memory mock test suite (locmem) unless forced.
        is_locmem = getattr(settings, 'EMAIL_BACKEND', '').endswith('locmem.EmailBackend')
        if not is_locmem or getattr(settings, 'FORCE_BREVO_DELIVERY', False):
            if BrevoEmailService.is_test_mode() and not BrevoEmailService.check_test_mode_allowlist(valid_recipient):
                logger.info(
                    "Communication suppressed in test mode: recipient '%s' not in allowlist for event '%s' [key: %s]",
                    valid_recipient, event_type, idempotency_key
                )
                log_record, _ = CommunicationLog.objects.update_or_create(
                    idempotency_key=idempotency_key,
                    defaults={
                        'event_type': event_type,
                        'channel': CommunicationChannel.EMAIL,
                        'recipient': valid_recipient,
                        'subject': subject[:255],
                        'template_name': template_base,
                        'status': CommunicationStatus.SUPPRESSED,
                        'error_message': (
                            f"Suppressed in test mode: recipient '{valid_recipient}' is not in authorized allowlist."
                        ),
                        'context_snapshot': safe_snapshot,
                    }
                )
                return log_record

        # 4. Strict idempotency check: if already SENT or SENDING, skip duplicate
        existing_log = CommunicationLog.objects.filter(
            idempotency_key=idempotency_key,
            status__in=[CommunicationStatus.SENT, CommunicationStatus.SENDING]
        ).first()

        if existing_log:
            logger.info(
                "Communication skipped: duplicate event '%s' with key '%s' already sent/sending to %s",
                event_type, idempotency_key, valid_recipient
            )
            return existing_log

        # 5. Ensure frontend_url is available in template context
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

        # 6. Create durable outbox record in QUEUED status
        log_record, _ = CommunicationLog.objects.update_or_create(
            idempotency_key=idempotency_key,
            defaults={
                'event_type': event_type,
                'channel': CommunicationChannel.EMAIL,
                'recipient': valid_recipient,
                'subject': subject[:255],
                'template_name': template_base,
                'status': CommunicationStatus.QUEUED,
                'html_body': html_body,
                'text_body': text_body,
                'context_snapshot': safe_snapshot,
                'provider': 'brevo' if getattr(settings, 'BREVO_API_KEY', '') else 'django',
                'error_message': None,
            }
        )

        # Determine async vs sync dispatch
        # In unit test runs using locmem backend, default to synchronous execution unless async_send is explicit
        is_locmem = getattr(settings, 'EMAIL_BACKEND', '').endswith('locmem.EmailBackend')
        if async_send is not None:
            should_async = bool(async_send)
        elif is_locmem and not getattr(settings, 'FORCE_BREVO_DELIVERY', False):
            should_async = False
        else:
            should_async = getattr(settings, 'EMAIL_ASYNC_DISPATCH', True)

        if should_async:
            transaction.on_commit(lambda: cls.dispatch_async(log_record.id, recipient_name=recipient_name))
            return log_record
        else:
            return cls.deliver_log_record(log_record, recipient_name=recipient_name)

    @classmethod
    def dispatch_async(cls, log_id: int, recipient_name: str = '') -> None:
        """
        Asynchronously trigger outbox delivery in a background daemon thread.
        """
        def _worker():
            try:
                cls.deliver_log_record_by_id(log_id, recipient_name=recipient_name)
            except Exception as e:
                logger.error("Error in async email dispatch for log %s: %s", log_id, e)

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    @classmethod
    def process_outbox(cls, batch_size: int = 50) -> int:
        """
        Durable outbox dispatcher: processes pending QUEUED emails.
        Returns count of processed records.
        """
        from django.db.models import Q
        now = timezone.now()
        candidate_ids = list(
            CommunicationLog.objects.filter(
                status=CommunicationStatus.QUEUED
            ).filter(
                Q(next_retry_at__isnull=True) | Q(next_retry_at__lte=now)
            ).order_by('created_at')[:batch_size].values_list('id', flat=True)
        )
        processed = 0
        for log_id in candidate_ids:
            rec = cls.deliver_log_record_by_id(log_id)
            if rec:
                processed += 1
        return processed

    @classmethod
    def deliver_log_record_by_id(cls, log_id: int, recipient_name: str = '') -> Optional[CommunicationLog]:
        try:
            log_record = CommunicationLog.objects.get(pk=log_id)
            return cls.deliver_log_record(log_record, recipient_name=recipient_name)
        except CommunicationLog.DoesNotExist:
            logger.warning("CommunicationLog id %s does not exist for delivery", log_id)
            return None

    @classmethod
    def deliver_log_record(cls, log_record: CommunicationLog, recipient_name: str = '') -> CommunicationLog:
        """
        Authoritative delivery executor for a single CommunicationLog entry.
        Applies row locking, provider interaction, retry backoff, and error isolation.
        """
        with transaction.atomic():
            # Acquire lock to prevent duplicate concurrent sending
            try:
                locked_log = CommunicationLog.objects.select_for_update().get(pk=log_record.pk)
            except CommunicationLog.DoesNotExist:
                return log_record

            if locked_log.status == CommunicationStatus.SENT:
                return locked_log

            locked_log.status = CommunicationStatus.SENDING
            locked_log.locked_at = timezone.now()
            locked_log.save(update_fields=['status', 'locked_at'])

        # Outside the lock transaction to avoid holding DB row locks during HTTP calls
        brevo_key = getattr(settings, 'BREVO_API_KEY', '').strip()
        is_locmem = getattr(settings, 'EMAIL_BACKEND', '').endswith('locmem.EmailBackend')
        use_brevo = bool(brevo_key and (not is_locmem or getattr(settings, 'FORCE_BREVO_DELIVERY', False)))

        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'Vee Power Electricals <veepower.cbe@gmail.com>')

        try:
            if use_brevo:
                # Deliver via official Brevo Transactional Email REST API
                result = BrevoEmailService.send_transactional_email(
                    recipient=locked_log.recipient,
                    subject=locked_log.subject,
                    html_content=locked_log.html_body,
                    text_content=locked_log.text_body,
                    recipient_name=recipient_name,
                    tags=[locked_log.event_type],
                )

                if result.get("success"):
                    locked_log.status = CommunicationStatus.SENT
                    locked_log.provider_message_id = result.get("message_id") or ""
                    locked_log.provider_status = "accepted"
                    locked_log.sent_at = timezone.now()
                    locked_log.error_message = None
                    locked_log.save()
                    logger.info("Email '%s' sent via Brevo to %s [msgId: %s]",
                                locked_log.event_type, locked_log.recipient, locked_log.provider_message_id)

                    # If in locmem test mode, mirror to Django outbox for test compatibility
                    if is_locmem:
                        cls._mirror_to_django_outbox(locked_log, from_email)

                    return locked_log

                elif result.get("status") == "suppressed":
                    locked_log.status = CommunicationStatus.SUPPRESSED
                    locked_log.error_message = result.get("error")
                    locked_log.save()
                    return locked_log

                else:
                    # Failure handling with bounded retries on transient errors
                    is_transient = result.get("transient", False)
                    err_msg = result.get("error", "Unknown Brevo delivery failure")[:500]

                    if is_transient and locked_log.retry_count < locked_log.max_retries:
                        locked_log.retry_count += 1
                        delay_secs = (2 ** locked_log.retry_count) * 10
                        locked_log.next_retry_at = timezone.now() + timedelta(seconds=delay_secs)
                        locked_log.status = CommunicationStatus.QUEUED
                        locked_log.error_message = f"Transient: {err_msg} (Retry {locked_log.retry_count}/{locked_log.max_retries})"
                        locked_log.save()
                        logger.warning("Email '%s' to %s scheduled for retry in %ds: %s",
                                       locked_log.event_type, locked_log.recipient, delay_secs, err_msg)
                    else:
                        locked_log.status = CommunicationStatus.FAILED
                        locked_log.error_message = err_msg
                        locked_log.save()
                        logger.error("Email '%s' to %s failed permanently: %s",
                                     locked_log.event_type, locked_log.recipient, err_msg)
                    return locked_log

            else:
                # Deliver via standard Django email backend (locmem / console)
                msg = EmailMultiAlternatives(
                    subject=locked_log.subject,
                    body=locked_log.text_body,
                    from_email=from_email,
                    to=[locked_log.recipient],
                )
                if locked_log.html_body:
                    msg.attach_alternative(locked_log.html_body, "text/html")
                msg.send(fail_silently=False)

                locked_log.status = CommunicationStatus.SENT
                locked_log.sent_at = timezone.now()
                locked_log.error_message = None
                locked_log.save()
                logger.info("Email '%s' sent via Django backend to %s", locked_log.event_type, locked_log.recipient)
                return locked_log

        except Exception as send_err:
            err_msg = str(send_err)[:500]
            logger.error("Email delivery failed for event '%s' to %s: %s",
                         locked_log.event_type, locked_log.recipient, err_msg)
            locked_log.status = CommunicationStatus.FAILED
            locked_log.error_message = err_msg
            locked_log.save()
            return locked_log

    @classmethod
    def _mirror_to_django_outbox(cls, log_record: CommunicationLog, from_email: str) -> None:
        """Helper to mirror sent message to django.core.mail.outbox for unit test assertions."""
        try:
            msg = EmailMultiAlternatives(
                subject=log_record.subject,
                body=log_record.text_body,
                from_email=from_email,
                to=[log_record.recipient],
            )
            if log_record.html_body:
                msg.attach_alternative(log_record.html_body, "text/html")
            msg.send(fail_silently=True)
        except Exception:
            pass

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
            recipient_name=customer_name,
        )

    @classmethod
    def send_email_verification(cls, user, otp: str, token: str, expires_minutes: int = 15) -> Optional[CommunicationLog]:
        """
        Event 2: Email Address Verification (OTP and Link).
        Dispatched upon registration or resend request.
        """
        recipient = getattr(user, 'email', '')
        customer_name = getattr(user, 'first_name', '') or getattr(user, 'username', 'Customer')
        verify_url = f"{cls.get_frontend_url()}/verify-email?token={token}&email={recipient}"

        context = {
            'customer_name': customer_name,
            'customer_email': recipient,
            'otp': otp,
            'token': token,
            'verify_url': verify_url,
            'expires_minutes': expires_minutes,
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='EMAIL_VERIFICATION',
            recipient=recipient,
            subject="Verify Your Email Address - Vee Power Electricals",
            template_base='email_verification',
            context=context,
            idempotency_key=f"EMAIL_VERIFICATION:{getattr(user, 'id', 'new')}:{token[:10]}",
            recipient_name=customer_name,
        )

    @classmethod
    def send_email_verified_success(cls, user) -> Optional[CommunicationLog]:
        """
        Event 3: Email Verification Success.
        Dispatched when the customer verifies their email token/OTP.
        """
        recipient = getattr(user, 'email', '')
        customer_name = getattr(user, 'first_name', '') or getattr(user, 'username', 'Customer')

        context = {
            'customer_name': customer_name,
            'customer_email': recipient,
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='EMAIL_VERIFIED_SUCCESS',
            recipient=recipient,
            subject="Email Verified Successfully - Vee Power Electricals",
            template_base='email_verified_success',
            context=context,
            idempotency_key=f"EMAIL_VERIFIED_SUCCESS:{getattr(user, 'id', 'new')}",
            recipient_name=customer_name,
        )

    @classmethod
    def send_password_reset(cls, user, uidb64: str, token: str) -> Optional[CommunicationLog]:
        """
        Event 4: Password Reset Request.
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

        return cls.send_email(
            event_type='PASSWORD_RESET',
            recipient=recipient,
            subject="Password Reset Request - Vee Power Electricals",
            template_base='password_reset',
            context=context,
            idempotency_key=f"PASSWORD_RESET:{getattr(user, 'id', 'user')}:{token[:10]}",
            recipient_name=customer_name,
        )

    @classmethod
    def send_password_reset_success(cls, user) -> Optional[CommunicationLog]:
        """
        Event 5: Password Reset Completion.
        Dispatched when a password reset is successfully finalized.
        """
        recipient = getattr(user, 'email', '')
        customer_name = getattr(user, 'first_name', '') or getattr(user, 'username', 'Customer')

        context = {
            'customer_name': customer_name,
            'customer_email': recipient,
            'reset_time': timezone.now().strftime("%Y-%m-%d %H:%M:%S %Z"),
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='PASSWORD_RESET_SUCCESS',
            recipient=recipient,
            subject="Password Reset Successful - Vee Power Electricals",
            template_base='password_reset_success',
            context=context,
            idempotency_key=f"PASSWORD_RESET_SUCCESS:{getattr(user, 'id', 'user')}:{int(timezone.now().timestamp())}",
            recipient_name=customer_name,
        )

    @classmethod
    def send_google_registration(cls, user) -> Optional[CommunicationLog]:
        """
        Event 6: Google Identity First Registration.
        Dispatched upon creating a new user profile via Google OAuth.
        """
        return cls.send_registration_welcome(user)

    @classmethod
    def send_google_linked_alert(cls, user, google_email: str = '') -> Optional[CommunicationLog]:
        """
        Event 7: Google Identity Link Security Notification.
        Dispatched when an external Google account is linked to an existing local account.
        """
        recipient = getattr(user, 'email', '')
        customer_name = getattr(user, 'first_name', '') or getattr(user, 'username', 'Customer')

        context = {
            'customer_name': customer_name,
            'customer_email': recipient,
            'google_email': google_email or recipient,
            'event_time': timezone.now().strftime("%Y-%m-%d %H:%M:%S %Z"),
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='GOOGLE_LINKED',
            recipient=recipient,
            subject="Security Alert: Google Account Linked - Vee Power Electricals",
            template_base='google_link_alert',
            context=context,
            idempotency_key=f"GOOGLE_LINKED:{getattr(user, 'id', 'user')}:{google_email}",
            recipient_name=customer_name,
        )

    @classmethod
    def send_order_placed(cls, order: Order) -> Optional[CommunicationLog]:
        """
        Event 8: Order Placed (Checkout Initial).
        Dispatched immediately upon successful atomic order creation at checkout.
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
            'order_id': order.id,
            'order': order,
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
            event_type='ORDER_PLACED',
            recipient=recipient,
            subject=f"Order Received: #{order.order_number} - Vee Power Electricals",
            template_base='order_placed',
            context=context,
            idempotency_key=f"ORDER_PLACED:{order.id}",
            recipient_name=order.customer_name,
        )

    @classmethod
    def send_order_confirmation(cls, order: Order) -> Optional[CommunicationLog]:
        """
        Event 9: Order Confirmation.
        Dispatched when an order transitions to CONFIRMED.
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
            'order_id': order.id,
            'order': order,
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
            recipient_name=order.customer_name,
        )

    @classmethod
    def send_order_status_update(
        cls,
        order: Order,
        new_status: str,
        reason: str = '',
        async_send: Optional[bool] = None,
    ) -> Optional[CommunicationLog]:
        """
        Events 10-17: Order fulfillment lifecycle changes.
        Supports: PACKED, SHIPPED, DELIVERED, CANCELLED,
        RETURN_REQUESTED, RETURN_APPROVED, RETURN_REJECTED, RETURN_COMPLETED.
        """
        recipient = order.customer_email
        status_display_map = {
            OrderStatus.PACKED: "Packed & Ready for Dispatch",
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
            'order_id': order.id,
            'order': order,
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
            recipient_name=order.customer_name,
            async_send=async_send,
        )

    @classmethod
    def send_payment_confirmation(cls, order: Order, transaction: PaymentTransaction) -> Optional[CommunicationLog]:
        """
        Event 18: Payment Confirmation.
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
            recipient_name=order.customer_name,
        )

    @classmethod
    def send_payment_failure(cls, order: Order, transaction: Optional[PaymentTransaction] = None, error_message: str = '') -> Optional[CommunicationLog]:
        """
        Event 19: Payment Failure.
        Dispatched when payment verification fails or gateway emits payment.failed.
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
            recipient_name=order.customer_name,
        )

    @classmethod
    def send_invoice_notification(cls, invoice: Invoice) -> Optional[CommunicationLog]:
        """
        Event 20: Statutory GST Tax Invoice generation.
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
            recipient_name=customer_name,
        )

    @classmethod
    def send_quotation_notification(cls, quotation: Quotation, status_action: str = '') -> Optional[CommunicationLog]:
        """
        Event 21: Commercial Quotation Creation, Approval, or Rejection.
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
            recipient_name=client.company_name,
        )

    @classmethod
    def send_inquiry_acknowledgement(cls, inquiry) -> Optional[CommunicationLog]:
        """
        Event 22: Public Customer Support / Bulk Procurement Inquiry Acknowledgement.
        Recipient is inquiry.email.
        """
        recipient = getattr(inquiry, 'email', '')
        if not recipient:
            return None

        customer_name = getattr(inquiry, 'name', 'Customer')
        context = {
            'ticket_id': getattr(inquiry, 'id', 'ticket'),
            'customer_name': customer_name,
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
            recipient_name=customer_name,
        )

    @classmethod
    def send_account_security_alert(cls, user, change_description: str) -> Optional[CommunicationLog]:
        """
        Event 23: Account Security Notification for significant profile/security changes.
        """
        recipient = getattr(user, 'email', '')
        customer_name = getattr(user, 'first_name', '') or getattr(user, 'username', 'Customer')

        context = {
            'customer_name': customer_name,
            'customer_email': recipient,
            'change_description': change_description,
            'timestamp': timezone.now().strftime("%Y-%m-%d %H:%M:%S %Z"),
            'frontend_url': cls.get_frontend_url(),
        }

        return cls.send_email(
            event_type='ACCOUNT_SECURITY_ALERT',
            recipient=recipient,
            subject="Security Notice: Profile Updated - Vee Power Electricals",
            template_base='security_alert',
            context=context,
            idempotency_key=f"SECURITY_ALERT:{getattr(user, 'id', 'user')}:{int(timezone.now().timestamp())}",
            recipient_name=customer_name,
        )
