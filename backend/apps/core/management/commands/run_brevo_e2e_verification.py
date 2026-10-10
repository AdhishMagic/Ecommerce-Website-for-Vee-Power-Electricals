import sys
import uuid
from decimal import Decimal
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from apps.core.models import CommunicationLog, CommunicationStatus
from apps.core.services.communication_service import CommunicationService
from apps.core.services.brevo_service import BrevoEmailService
from apps.users.services.verification_service import VerificationService
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.orders.services.order_workflow_service import OrderWorkflowService
from apps.finance.models import (
    Client,
    Invoice,
    Quotation,
    QuotationItem,
    QuotationStatus,
    PaymentTransaction,
    PaymentGateway,
    PaymentTxStatus,
)

User = get_user_model()

RECIPIENT_1 = 'balaadhish.cbe@gmail.com'
RECIPIENT_2 = 'balaadhish333@gmail.com'
UNAUTHORIZED_RECIPIENT = 'unauthorized.stranger@externaldomain.com'


class MockInquiry:
    def __init__(self, id_val, name, email, subject, phone):
        self.id = id_val
        self.name = name
        self.email = email
        self.subject = subject
        self.phone = phone


class Command(BaseCommand):
    help = 'Executes end-to-end Brevo transactional email workflow verification for authorized recipients'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("======================================================================"))
        self.stdout.write(self.style.NOTICE("STARTING BREVO TRANSACTIONAL EMAIL END-TO-END VERIFICATION"))
        self.stdout.write(self.style.NOTICE("======================================================================"))

        # Check API key configuration (redacted in output)
        brevo_key = getattr(settings, 'BREVO_API_KEY', '')
        if not brevo_key:
            self.stderr.write(self.style.ERROR("ERROR: BREVO_API_KEY is not configured in settings!"))
            sys.exit(1)

        masked_key = f"{brevo_key[:8]}...{brevo_key[-4:]}" if len(brevo_key) > 12 else "***"
        self.stdout.write(f"Brevo API Key: {masked_key} (Sender: {settings.BREVO_SENDER_EMAIL})")
        self.stdout.write(f"Test Mode: {getattr(settings, 'EMAIL_TEST_MODE', False)}")
        self.stdout.write(f"Allowlist: {getattr(settings, 'EMAIL_TEST_ALLOWLIST', [])}")

        # Ensure synchronous dispatch during verification so provider messageIds are captured immediately
        settings.EMAIL_ASYNC_DISPATCH = False

        results = []

        # Ensure test users exist
        user_1, _ = User.objects.get_or_create(
            email=RECIPIENT_1,
            defaults={
                'username': 'balaadhish_cbe',
                'first_name': 'Bala Adhish',
                'last_name': 'Tester',
                'is_active': True,
            }
        )
        if not user_1.has_usable_password():
            user_1.set_password('VeePowerTestPass@2026')
            user_1.save()

        user_2, _ = User.objects.get_or_create(
            email=RECIPIENT_2,
            defaults={
                'username': 'balaadhish_333',
                'first_name': 'Bala Adhish Secondary',
                'last_name': 'Tester',
                'is_active': True,
            }
        )
        if not user_2.has_usable_password():
            user_2.set_password('VeePowerTestPass@2026')
            user_2.save()

        user_1.is_email_verified = False
        user_1.save(update_fields=['is_email_verified'])

        user_2.is_email_verified = False
        user_2.save(update_fields=['is_email_verified'])

        # =====================================================================
        # SUITE A: RECIPIENT 1 (balaadhish.cbe@gmail.com)
        # =====================================================================
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n--- [SUITE A] WORKFLOWS FOR RECIPIENT 1: {RECIPIENT_1} ---"))

        # A1. Account Registration Welcome
        self.stdout.write("Executing A1: CUSTOMER_REGISTRATION...")
        log_a1 = CommunicationService.send_registration_welcome(user_1)
        if not log_a1:
            log_a1 = CommunicationLog.objects.filter(
                event_type='CUSTOMER_REGISTRATION',
                recipient=RECIPIENT_1
            ).order_by('-created_at').first()
        self._record_result(results, "A1: Registration Welcome", RECIPIENT_1, log_a1)

        # A2. Email Verification OTP Request
        self.stdout.write("Executing A2: EMAIL_VERIFICATION...")
        token_a = VerificationService.create_verification_token(user_1)
        log_a2 = CommunicationService.send_email_verification(
            user=user_1,
            otp=token_a.otp,
            token=token_a.token,
            expires_minutes=15,
        )
        self._record_result(results, "A2: Email Verification OTP", RECIPIENT_1, log_a2)

        # A3. Successful Account Verification Confirmation
        self.stdout.write("Executing A3: EMAIL_VERIFIED_SUCCESS...")
        ok_verify, verified_user, _ = VerificationService.verify_otp_or_token(RECIPIENT_1, token_a.otp)
        self.stdout.write(f"   MySQL state: is_email_verified={verified_user.is_email_verified if verified_user else 'FAIL'}")
        log_a3 = CommunicationLog.objects.filter(
            event_type='EMAIL_VERIFIED_SUCCESS',
            recipient=RECIPIENT_1
        ).order_by('-created_at').first()
        self._record_result(results, "A3: Email Verified Success", RECIPIENT_1, log_a3)

        # A4. Password Reset Request
        self.stdout.write("Executing A4: PASSWORD_RESET...")
        uidb64_a = urlsafe_base64_encode(force_bytes(user_1.pk))
        token_reset_a = f"rst_{uuid.uuid4().hex[:12]}"
        log_a4 = CommunicationService.send_password_reset(user_1, uidb64_a, token_reset_a)
        self._record_result(results, "A4: Password Reset Request", RECIPIENT_1, log_a4)

        # A5. Password Reset Success Security Notification
        self.stdout.write("Executing A5: PASSWORD_RESET_SUCCESS...")
        log_a5 = CommunicationService.send_password_reset_success(user_1)
        self._record_result(results, "A5: Password Reset Completed", RECIPIENT_1, log_a5)

        # A6. Create Synthetic Order & Order Placed
        self.stdout.write("Executing A6: ORDER_PLACED...")
        order_num_1 = f"ORD-LIVE-{uuid.uuid4().hex[:6].upper()}"
        order_1 = Order.objects.create(
            order_number=order_num_1,
            user=user_1,
            customer_name="Bala Adhish",
            customer_email=RECIPIENT_1,
            customer_phone="+919876543210",
            shipping_address={'street': '123 Power Grid Rd', 'city': 'Coimbatore', 'state': 'Tamil Nadu', 'pincode': '641001'},
            billing_address={'street': '123 Power Grid Rd', 'city': 'Coimbatore', 'state': 'Tamil Nadu', 'pincode': '641001'},
            subtotal=Decimal('4500.00'),
            taxable_amount=Decimal('4500.00'),
            cgst_amount=Decimal('405.00'),
            sgst_amount=Decimal('405.00'),
            total_amount=Decimal('5310.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=order_1,
            product_name="Schneider Electric EasyPact 32A MCB 4P",
            sku="SCH-MCB-32A-4P",
            quantity=2,
            mrp=Decimal('2500.00'),
            unit_price=Decimal('2250.00'),
            subtotal=Decimal('4500.00'),
            taxable_amount=Decimal('4500.00'),
            tax_amount=Decimal('810.00'),
            total_amount=Decimal('5310.00'),
        )
        log_a6 = CommunicationService.send_order_placed(order_1)
        self._record_result(results, "A6: Order Placed", RECIPIENT_1, log_a6)

        # A7. Order Confirmed (FSM transition PENDING -> CONFIRMED)
        self.stdout.write("Executing A7: ORDER_CONFIRMED...")
        OrderWorkflowService.transition_order_status(
            order_id=order_1.id,
            target_status=OrderStatus.CONFIRMED,
            reason="Payment authorized via test gateway"
        )
        log_a7 = CommunicationLog.objects.filter(
            event_type='ORDER_CONFIRMED',
            recipient=RECIPIENT_1
        ).order_by('-created_at').first()
        self._record_result(results, "A7: Order Confirmed", RECIPIENT_1, log_a7)

        # A8. Order Packed (FSM transition CONFIRMED -> PACKED)
        self.stdout.write("Executing A8: ORDER_PACKED...")
        OrderWorkflowService.transition_order_status(
            order_id=order_1.id,
            target_status=OrderStatus.PACKED,
            reason="Warehouse quality inspection completed and packaged"
        )
        log_a8 = CommunicationLog.objects.filter(
            event_type='ORDER_PACKED',
            recipient=RECIPIENT_1
        ).order_by('-created_at').first()
        self._record_result(results, "A8: Order Packed", RECIPIENT_1, log_a8)

        # A9. Order Shipped with Carrier Tracking (PACKED -> SHIPPED)
        self.stdout.write("Executing A9: ORDER_SHIPPED...")
        tracking_code = f"BD-TRACK-{uuid.uuid4().hex[:6].upper()}"
        OrderWorkflowService.transition_order_status(
            order_id=order_1.id,
            target_status=OrderStatus.SHIPPED,
            tracking_number=tracking_code,
            reason="Dispatched via Blue Dart Express"
        )
        log_a9 = CommunicationLog.objects.filter(
            event_type='ORDER_SHIPPED',
            recipient=RECIPIENT_1
        ).order_by('-created_at').first()
        self._record_result(results, "A9: Order Shipped (Tracking)", RECIPIENT_1, log_a9)

        # A10. Order Delivered (SHIPPED -> DELIVERED)
        self.stdout.write("Executing A10: ORDER_DELIVERED...")
        OrderWorkflowService.transition_order_status(
            order_id=order_1.id,
            target_status=OrderStatus.DELIVERED,
            reason="Successfully handed over to consignee"
        )
        log_a10 = CommunicationLog.objects.filter(
            event_type='ORDER_DELIVERED',
            recipient=RECIPIENT_1
        ).order_by('-created_at').first()
        self._record_result(results, "A10: Order Delivered", RECIPIENT_1, log_a10)

        # A11. Statutory GST Tax Invoice
        self.stdout.write("Executing A11: INVOICE_GENERATED...")
        inv_1 = Invoice.objects.create(
            invoice_number=f"INV-LIVE-{uuid.uuid4().hex[:6].upper()}",
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=15),
            order=order_1,
            subtotal=order_1.subtotal,
            taxable_amount=order_1.taxable_amount,
            cgst_amount=order_1.cgst_amount,
            sgst_amount=order_1.sgst_amount,
            tax_amount=order_1.cgst_amount + order_1.sgst_amount,
            total_amount=order_1.total_amount,
            payment_status='Paid',
        )
        log_a11 = CommunicationService.send_invoice_notification(inv_1)
        self._record_result(results, "A11: GST Tax Invoice", RECIPIENT_1, log_a11)

        # A12. Idempotency Guard Verification
        self.stdout.write("Executing A12: Idempotency Prevention (Duplicate Order Confirmation)...")
        log_dup = CommunicationService.send_order_confirmation(order_1)
        is_idempotent = (log_dup is None or log_dup.id == log_a7.id)
        self.stdout.write(f"   Idempotency check: duplicate prevented={is_idempotent}")
        results.append({
            "test_name": "A12: Idempotency Check",
            "recipient": RECIPIENT_1,
            "status": "SKIPPED_DUPLICATE" if is_idempotent else "FAILED_DUPLICATE_SENT",
            "provider_message_id": "N/A (Skipped by Deduplication)",
            "provider_status": "Idempotent Safe",
        })

        # =====================================================================
        # SUITE B: RECIPIENT 2 (balaadhish333@gmail.com)
        # =====================================================================
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n--- [SUITE B] WORKFLOWS FOR RECIPIENT 2: {RECIPIENT_2} ---"))

        # B1. Account Registration Welcome
        self.stdout.write("Executing B1: CUSTOMER_REGISTRATION...")
        log_b1 = CommunicationService.send_registration_welcome(user_2)
        if not log_b1:
            log_b1 = CommunicationLog.objects.filter(
                event_type='CUSTOMER_REGISTRATION',
                recipient=RECIPIENT_2
            ).order_by('-created_at').first()
        self._record_result(results, "B1: Registration Welcome", RECIPIENT_2, log_b1)

        # B2. Email Verification OTP
        self.stdout.write("Executing B2: EMAIL_VERIFICATION...")
        token_b = VerificationService.create_verification_token(user_2)
        log_b2 = CommunicationService.send_email_verification(
            user=user_2,
            otp=token_b.otp,
            token=token_b.token,
            expires_minutes=15,
        )
        self._record_result(results, "B2: Email Verification OTP", RECIPIENT_2, log_b2)

        # B3. Verification Completion Confirmation
        self.stdout.write("Executing B3: EMAIL_VERIFIED_SUCCESS...")
        VerificationService.verify_otp_or_token(RECIPIENT_2, token_b.otp)
        log_b3 = CommunicationLog.objects.filter(
            event_type='EMAIL_VERIFIED_SUCCESS',
            recipient=RECIPIENT_2
        ).order_by('-created_at').first()
        self._record_result(results, "B3: Email Verified Success", RECIPIENT_2, log_b3)

        # B4. Payment Confirmed Notification
        self.stdout.write("Executing B4: PAYMENT_CONFIRMED...")
        order_num_2 = f"ORD-LIVE-{uuid.uuid4().hex[:6].upper()}"
        order_2 = Order.objects.create(
            order_number=order_num_2,
            user=user_2,
            customer_name="Bala Adhish Secondary",
            customer_email=RECIPIENT_2,
            customer_phone="+919876543211",
            shipping_address={'street': '456 Industrial Estate', 'city': 'Coimbatore', 'state': 'Tamil Nadu', 'pincode': '641004'},
            subtotal=Decimal('12000.00'),
            taxable_amount=Decimal('12000.00'),
            cgst_amount=Decimal('1080.00'),
            sgst_amount=Decimal('1080.00'),
            total_amount=Decimal('14160.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=order_2,
            product_name="Polycab 4 Sqmm 4 Core Copper Armoured Cable 100m",
            sku="POLY-CABLE-4SQ-4C",
            quantity=1,
            mrp=Decimal('14000.00'),
            unit_price=Decimal('12000.00'),
            subtotal=Decimal('12000.00'),
            taxable_amount=Decimal('12000.00'),
            tax_amount=Decimal('2160.00'),
            total_amount=Decimal('14160.00'),
        )
        txn_2 = PaymentTransaction.objects.create(
            order=order_2,
            gateway=PaymentGateway.RAZORPAY,
            gateway_transaction_id=f"pay_live_test_{uuid.uuid4().hex[:8]}",
            gateway_order_id=f"order_live_test_{uuid.uuid4().hex[:8]}",
            amount=order_2.total_amount,
            status=PaymentTxStatus.SUCCESS,
            payment_method="UPI",
        )
        log_b4 = CommunicationService.send_payment_confirmation(order_2, txn_2)
        self._record_result(results, "B4: Payment Confirmed", RECIPIENT_2, log_b4)

        # B5. Payment Failed Notification
        self.stdout.write("Executing B5: PAYMENT_FAILED...")
        order_num_3 = f"ORD-LIVE-{uuid.uuid4().hex[:6].upper()}"
        order_3 = Order.objects.create(
            order_number=order_num_3,
            user=user_2,
            customer_name="Bala Adhish Secondary",
            customer_email=RECIPIENT_2,
            customer_phone="+919876543211",
            shipping_address={'street': '456 Industrial Estate', 'city': 'Coimbatore', 'state': 'Tamil Nadu', 'pincode': '641004'},
            subtotal=Decimal('3500.00'),
            taxable_amount=Decimal('3500.00'),
            total_amount=Decimal('4130.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.FAILED,
        )
        log_b5 = CommunicationService.send_payment_failure(
            order=order_3,
            error_message="Card verification timed out / 3DS declined by issuing bank"
        )
        self._record_result(results, "B5: Payment Failed Notice", RECIPIENT_2, log_b5)

        # B6. Order Cancellation (PENDING -> CANCELLED)
        self.stdout.write("Executing B6: ORDER_CANCELLED...")
        OrderWorkflowService.transition_order_status(
            order_id=order_3.id,
            target_status=OrderStatus.CANCELLED,
            reason="Customer requested cancellation due to failed payment retry"
        )
        log_b6 = CommunicationLog.objects.filter(
            event_type='ORDER_CANCELLED',
            recipient=RECIPIENT_2
        ).order_by('-created_at').first()
        self._record_result(results, "B6: Order Cancelled", RECIPIENT_2, log_b6)

        # B7. Commercial Quotation Update
        self.stdout.write("Executing B7: QUOTATION_UPDATE...")
        client_2, _ = Client.objects.get_or_create(
            client_code="CLI-TEST-002",
            defaults={
                'company_name': "Adhish Power Projects Ltd",
                'contact_person': "Bala Adhish",
                'email': RECIPIENT_2,
                'phone': "+919876543211",
                'gstin': "33AAAAA0000A1Z5",
                'credit_limit': Decimal('500000.00'),
            }
        )
        if client_2.email != RECIPIENT_2:
            client_2.email = RECIPIENT_2
            client_2.save(update_fields=['email'])

        quote_2 = Quotation.objects.create(
            quotation_number=f"QUO-LIVE-{uuid.uuid4().hex[:6].upper()}",
            client=client_2,
            quotation_date=date.today(),
            expiry_date=date.today() + timedelta(days=30),
            total_value=Decimal('85000.00'),
            status=QuotationStatus.SENT,
            notes="Industrial panel distribution board quotation approved for project execution.",
        )
        QuotationItem.objects.create(
            quotation=quote_2,
            item_name="L&T 3-Phase Busbar Trunking System 100A",
            quantity=2,
            unit_price=Decimal('42500.00'),
            subtotal=Decimal('85000.00'),
        )
        log_b7 = CommunicationService.send_quotation_notification(quote_2)
        self._record_result(results, "B7: Quotation Update", RECIPIENT_2, log_b7)

        # B8. Customer Support / Inquiry Acknowledgement
        self.stdout.write("Executing B8: INQUIRY_ACKNOWLEDGED...")
        mock_inquiry = MockInquiry(
            id_val=1089,
            name="Bala Adhish Secondary",
            email=RECIPIENT_2,
            subject="Bulk Transformer & Switchgear Supply Requirement",
            phone="+919876543211"
        )
        log_b8 = CommunicationService.send_inquiry_acknowledgement(mock_inquiry)
        self._record_result(results, "B8: Inquiry Acknowledgement", RECIPIENT_2, log_b8)

        # B9. Security: Google Account Linked Alert
        self.stdout.write("Executing B9: GOOGLE_LINKED...")
        log_b9 = CommunicationService.send_google_linked_alert(user_2, RECIPIENT_2)
        self._record_result(results, "B9: Google Linked Alert", RECIPIENT_2, log_b9)

        # =====================================================================
        # SUITE C: SECURITY & TEST MODE ENFORCEMENT
        # =====================================================================
        self.stdout.write(self.style.MIGRATE_HEADING("\n--- [SUITE C] SECURITY & TEST MODE POLICY ENFORCEMENT ---"))

        # C1. Attempt sending to unauthorized external recipient
        self.stdout.write(f"Executing C1: Attempt sending to unauthorized '{UNAUTHORIZED_RECIPIENT}'...")
        log_c1 = CommunicationService.send_email(
            event_type='SECURITY_AUDIT_TEST',
            recipient=UNAUTHORIZED_RECIPIENT,
            subject='Unauthorized Test Attempt',
            template_base='security_alert',
            context={'change_description': 'Attempting unauthorized send in test mode'},
            idempotency_key=f'UNAUTH_TEST_{uuid.uuid4().hex[:6]}',
        )
        is_suppressed = (log_c1 and log_c1.status == CommunicationStatus.SUPPRESSED)
        self.stdout.write(f"   Test mode policy result: status={log_c1.status if log_c1 else 'BLOCKED'}")
        results.append({
            "test_name": "C1: Unauthorized Recipient Suppression",
            "recipient": UNAUTHORIZED_RECIPIENT,
            "status": log_c1.status if log_c1 else "BLOCKED",
            "provider_message_id": "BLOCKED (Never sent to Brevo API)",
            "provider_status": "Suppressed by Policy",
        })

        # =====================================================================
        # SUITE D: OUTBOX WORKER VERIFICATION
        # =====================================================================
        self.stdout.write(self.style.MIGRATE_HEADING("\n--- [SUITE D] OUTBOX QUEUE WORKER DISPATCH ---"))
        self.stdout.write("Executing D1: Queueing email into database outbox and dispatching via worker...")

        # Create a queued record directly in MySQL outbox
        queued_log = CommunicationLog.objects.create(
            event_type='OUTBOX_TEST_EVENT',
            channel='email',
            recipient=RECIPIENT_1,
            subject='Outbox Worker Live Verification - Vee Power Electricals',
            html_body='<h3>Outbox Worker Verification</h3><p>This message was transactionally queued in MySQL and processed by the worker.</p>',
            text_body='Outbox Worker Verification: Processed asynchronously from MySQL queue.',
            status=CommunicationStatus.QUEUED,
            idempotency_key=f"OUTBOX_LIVE_{uuid.uuid4().hex[:6]}",
        )
        # Process outbox
        processed_count = CommunicationService.process_outbox(batch_size=10)
        queued_log.refresh_from_db()
        self.stdout.write(f"   Worker processed {processed_count} job(s). Outbox status: {queued_log.status}, msgId: {queued_log.provider_message_id}")
        self._record_result(results, "D1: Outbox Worker Dispatch", RECIPIENT_1, queued_log)

        # =====================================================================
        # SUMMARY REPORT
        # =====================================================================
        self.stdout.write(self.style.NOTICE("\n======================================================================"))
        self.stdout.write(self.style.NOTICE("END-TO-END BREVO VERIFICATION RESULTS SUMMARY"))
        self.stdout.write(self.style.NOTICE("======================================================================"))
        
        headers = f"{'Test Case':<36} | {'Recipient':<28} | {'Status':<10} | {'Brevo Message ID'}"
        self.stdout.write(headers)
        self.stdout.write("-" * 115)

        pass_count = 0
        total_count = len(results)

        for res in results:
            msg_id = res['provider_message_id']
            self.stdout.write(f"{res['test_name']:<36} | {res['recipient']:<28} | {res['status']:<10} | {msg_id}")
            if str(res['status']).upper() in ('SENT', 'SKIPPED_DUPLICATE', 'SUPPRESSED'):
                pass_count += 1

        self.stdout.write("-" * 115)
        self.stdout.write(self.style.SUCCESS(f"TOTAL COMPLETED: {pass_count}/{total_count} PASSED"))
        self.stdout.write(self.style.NOTICE("======================================================================\n"))

    def _record_result(self, results_list, test_name, recipient, log_obj):
        if not log_obj:
            results_list.append({
                "test_name": test_name,
                "recipient": recipient,
                "status": "FAILED_NONE",
                "provider_message_id": "None",
                "provider_status": "Error",
            })
            return

        results_list.append({
            "test_name": test_name,
            "recipient": recipient,
            "status": log_obj.status,
            "provider_message_id": log_obj.provider_message_id or "N/A",
            "provider_status": str(log_obj.provider_status or "N/A"),
        })
