from decimal import Decimal
import uuid
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.core import mail
from django.contrib.auth import get_user_model
from django.db import transaction, IntegrityError

from apps.core.models import CommunicationLog, CommunicationStatus
from apps.core.services.communication_service import CommunicationService
from apps.core.services.email_policy import EmailNotificationPolicy, EmailPolicyClassification
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.orders.services.order_workflow_service import OrderWorkflowService
from apps.orders.services.checkout_service import CheckoutService
from apps.products.models import Category, Brand, Product
from apps.users.services.verification_service import VerificationService
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
from apps.finance.services.invoice_service import InvoiceService
from apps.finance.services.payment_gateway_service import PaymentGatewayService

User = get_user_model()


class OrderEmailReductionPolicyTestCase(TestCase):
    """
    Test suite verifying the minimal customer email policy:
    - Essential milestones are delivered (Placed, Shipped, Delivered, Cancelled, Return milestones).
    - Redundant confirmation and internal warehouse packing emails are suppressed.
    - Payment receipts, statutory invoices, and authentication emails are strictly preserved.
    - Idempotency, rollback safety, and test-mode gating remain airtight.
    """

    def setUp(self):
        mail.outbox = []

        self.user = User.objects.create_user(
            username='buyer.vee',
            email='buyer.vee@example.com',
            password='TestPassword123!',
            first_name='Vee',
            last_name='Buyer',
        )

        self.category, _ = Category.objects.get_or_create(name='Circuit Protection', defaults={'slug': 'circuit-protection'})
        self.brand, _ = Brand.objects.get_or_create(name='Schneider', defaults={'slug': 'schneider'})
        self.product, _ = Product.objects.get_or_create(
            sku='SCH-ACTI9-32A-4P',
            defaults={
                'name': 'Acti9 32A 4P MCB',
                'slug': 'acti9-32a-4p-mcb',
                'category': self.category,
                'brand': self.brand,
                'price': Decimal('1800.00'),
                'mrp': Decimal('2200.00'),
                'stock': 100,
                'active': True,
            }
        )

        self.order = Order.objects.create(
            order_number=f"ORD-TEST-{uuid.uuid4().hex[:6].upper()}",
            user=self.user,
            customer_name='Vee Buyer',
            customer_email='buyer.vee@example.com',
            customer_phone='+919876543210',
            shipping_address={'street': '10 Industrial Bypass', 'city': 'Coimbatore', 'pincode': '641001'},
            billing_address={'street': '10 Industrial Bypass', 'city': 'Coimbatore', 'pincode': '641001'},
            subtotal=Decimal('3600.00'),
            taxable_amount=Decimal('3600.00'),
            cgst_amount=Decimal('324.00'),
            sgst_amount=Decimal('324.00'),
            total_amount=Decimal('4248.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method='RAZORPAY',
        )

        self.order_item = OrderItem.objects.create(
            order=self.order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            quantity=2,
            mrp=Decimal('2200.00'),
            unit_price=Decimal('1800.00'),
            subtotal=Decimal('3600.00'),
            taxable_amount=Decimal('3600.00'),
            tax_rate=Decimal('18.00'),
            tax_amount=Decimal('648.00'),
            total_amount=Decimal('4248.00'),
        )

    # 1. Successful order placement sends exactly one order confirmation
    def test_01_order_placement_sends_exactly_one_confirmation(self):
        mail.outbox = []
        log = CommunicationService.send_order_placed(self.order)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn(f"Order Received: #{self.order.order_number}", sent.subject)
        self.assertEqual(sent.to, [self.order.customer_email])
        self.assertIn(self.product.name, sent.body)
        self.assertIn("4248.00", sent.body)
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    # 2. A subsequent routine confirmation transition does not send a duplicate
    def test_02_subsequent_confirmation_transition_does_not_send_duplicate(self):
        # Initial placement notification
        CommunicationService.send_order_placed(self.order)
        self.assertEqual(len(mail.outbox), 1)

        # Transition to CONFIRMED (e.g. after payment)
        mail.outbox = []
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED)

        # Separate routine confirmation must be SUPPRESSED by policy
        self.assertEqual(len(mail.outbox), 0)

        # Verification in CommunicationLog: marked as SKIPPED
        conf_log = CommunicationLog.objects.filter(
            event_type='ORDER_CONFIRMED',
            idempotency_key=f"ORDER_CONFIRMATION:{self.order.id}"
        ).first()
        self.assertIsNotNone(conf_log)
        self.assertEqual(conf_log.status, CommunicationStatus.SKIPPED)
        self.assertIn("already received initial order placed notification", conf_log.error_message)

    # 3. Packing does not send an unnecessary separate email
    def test_03_packing_does_not_send_unnecessary_separate_email(self):
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED)
        mail.outbox = []

        # Warehouse packaging state transition
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.PACKED)

        # Customer inbox must not receive packing email
        self.assertEqual(len(mail.outbox), 0)

        # Order status in database is updated
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.PACKED)

        # Even if send_order_status_update is explicitly invoked for PACKED, policy suppresses it
        explicit_log = CommunicationService.send_order_status_update(self.order, OrderStatus.PACKED)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(explicit_log.status, CommunicationStatus.SKIPPED)
        self.assertIn("suppressed by customer email policy", explicit_log.error_message)

    # 4. Shipment sends exactly one shipment/tracking notification
    def test_04_shipment_sends_exactly_one_shipment_tracking_notification(self):
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.PACKED)
        mail.outbox = []

        # Dispatch with carrier tracking code
        OrderWorkflowService.transition_order_status(
            self.order.id,
            OrderStatus.SHIPPED,
            tracking_number="BLUEDART-EXP-554433"
        )

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Shipped & In Transit", sent.subject)
        self.assertEqual(sent.to, [self.order.customer_email])
        self.assertIn("BLUEDART-EXP-554433", sent.body)

    # 5. Delivery sends exactly one delivery notification
    def test_05_delivery_sends_exactly_one_delivery_notification(self):
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.PACKED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.SHIPPED)
        mail.outbox = []

        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.DELIVERED)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Delivered", sent.subject)
        self.assertEqual(sent.to, [self.order.customer_email])

    # 6. Cancellation sends exactly one cancellation notification
    def test_06_cancellation_sends_exactly_one_cancellation_notification(self):
        mail.outbox = []
        OrderWorkflowService.cancel_order(
            order_id=self.order.id,
            requested_by=self.user,
            reason="Customer changed requirement to higher rating MCB"
        )

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Cancelled", sent.subject)
        self.assertEqual(sent.to, [self.order.customer_email])
        self.assertIn("Customer changed requirement", sent.body)

    # 7. Repeated status transitions do not duplicate messages
    def test_07_repeated_status_transitions_do_not_duplicate_messages(self):
        mail.outbox = []
        # Initial order placement email sent
        CommunicationService.send_order_placed(self.order)
        self.assertEqual(len(mail.outbox), 1)

        # Transition to CONFIRMED (suppressed by policy because placed email already dispatched)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED)
        self.assertEqual(len(mail.outbox), 1)

        # Transition to PACKED (suppressed by policy)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.PACKED)
        self.assertEqual(len(mail.outbox), 1)

        # Transition to SHIPPED (sent)
        OrderWorkflowService.transition_order_status(
            self.order.id, OrderStatus.SHIPPED, tracking_number="TRACK-111"
        )
        self.assertEqual(len(mail.outbox), 2)

        # Transition again to same status (idempotent no-op)
        OrderWorkflowService.transition_order_status(
            self.order.id, OrderStatus.SHIPPED, tracking_number="TRACK-111"
        )
        self.assertEqual(len(mail.outbox), 2)

        # Direct service call with same status (deduplicated by idempotency key)
        CommunicationService.send_order_status_update(self.order, OrderStatus.SHIPPED)
        self.assertEqual(len(mail.outbox), 2)

    # 8. Duplicate payment webhooks do not duplicate payment emails
    def test_08_duplicate_payment_webhooks_do_not_duplicate_payment_emails(self):
        init_res = PaymentGatewayService.initiate_order_payment(self.order.id, self.user)
        gateway_order_id = init_res['gateway_order_id']
        gateway_payment_id = "pay_webhook_uniq_777"
        sig = PaymentGatewayService.generate_signature(gateway_order_id, gateway_payment_id)

        mail.outbox = []
        # First confirmation (webhook 1)
        PaymentGatewayService.confirm_payment(
            order_id=self.order.id,
            user=self.user,
            razorpay_order_id=gateway_order_id,
            razorpay_payment_id=gateway_payment_id,
            razorpay_signature=sig,
        )
        payment_emails_1 = [m for m in mail.outbox if "Payment Received" in m.subject]
        self.assertEqual(len(payment_emails_1), 1)

        # Replayed webhook (webhook 2 with identical transaction ref)
        PaymentGatewayService.confirm_payment(
            order_id=self.order.id,
            user=self.user,
            razorpay_order_id=gateway_order_id,
            razorpay_payment_id=gateway_payment_id,
            razorpay_signature=sig,
        )
        payment_emails_2 = [m for m in mail.outbox if "Payment Received" in m.subject]
        self.assertEqual(len(payment_emails_2), 1)

    # 9. Successful payments and completed refunds retain their required notifications
    def test_09_successful_payments_and_completed_refunds_retain_required_notifications(self):
        txn = PaymentTransaction.objects.create(
            order=self.order,
            gateway=PaymentGateway.RAZORPAY,
            gateway_transaction_id="pay_receipt_9988",
            gateway_order_id="order_rzp_9988",
            amount=self.order.total_amount,
            status=PaymentTxStatus.SUCCESS,
            payment_method="UPI",
        )
        mail.outbox = []
        log_pay = CommunicationService.send_payment_confirmation(self.order, txn)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(log_pay.status, CommunicationStatus.SENT)

        # Completed refund milestone
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.CONFIRMED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.PACKED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.SHIPPED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.DELIVERED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.RETURN_REQUESTED)
        OrderWorkflowService.transition_order_status(self.order.id, OrderStatus.RETURN_APPROVED)

        mail.outbox = []
        log_ret = OrderWorkflowService.transition_order_status(
            self.order.id,
            OrderStatus.RETURN_COMPLETED,
            reason="Refund of ₹4248.00 processed to original source"
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Return Completed", mail.outbox[0].subject)

    # 10. Required GST invoices remain unaffected
    def test_10_required_gst_invoices_remain_unaffected(self):
        mail.outbox = []
        inv = InvoiceService.create_invoice_for_order(self.order)

        invoice_emails = [m for m in mail.outbox if "Tax Invoice" in m.subject]
        self.assertEqual(len(invoice_emails), 1)
        sent = invoice_emails[0]
        self.assertIn(inv.invoice_number, sent.subject)
        self.assertIn("4248.00", sent.body)

        inv_log = CommunicationLog.objects.filter(event_type="INVOICE_GENERATED", recipient=self.order.customer_email).first()
        self.assertIsNotNone(inv_log)
        self.assertEqual(inv_log.status, CommunicationStatus.SENT)

    # 11. OTP, password-reset, Google authentication, quotation, and support emails remain unaffected
    def test_11_auth_otp_password_quotation_support_unaffected(self):
        mail.outbox = []

        # 11a: Verification OTP
        tok = VerificationService.create_verification_token(self.user)
        CommunicationService.send_email_verification(self.user, tok.otp, tok.token, 15)
        self.assertTrue(any("Verify Your Email" in m.subject for m in mail.outbox))

        # 11b: Password Reset
        CommunicationService.send_password_reset(self.user, "uid123", "token123")
        self.assertTrue(any("Password Reset" in m.subject for m in mail.outbox))

        # 11c: Google Linked Alert
        CommunicationService.send_google_linked_alert(self.user, "google.user@gmail.com")
        self.assertTrue(any("Google Account Linked" in m.subject for m in mail.outbox))

        # 11d: Commercial Quotation
        client = Client.objects.create(
            company_name="Apex Power Corp",
            client_code="CLI-APEX-01",
            email="apex@example.com",
            credit_limit=Decimal('100000.00'),
        )
        quote = Quotation.objects.create(
            quotation_number=f"QUO-{uuid.uuid4().hex[:6].upper()}",
            client=client,
            quotation_date=date.today(),
            expiry_date=date.today() + timedelta(days=30),
            total_value=Decimal('50000.00'),
            status=QuotationStatus.SENT,
        )
        QuotationItem.objects.create(
            quotation=quote,
            item_name="Busbar Chamber 200A",
            quantity=1,
            unit_price=Decimal('50000.00'),
            subtotal=Decimal('50000.00'),
        )
        CommunicationService.send_quotation_notification(quote)
        self.assertTrue(any("Commercial Quotation" in m.subject for m in mail.outbox))

    # 12. Failed database transactions do not send emails
    def test_12_failed_database_transactions_do_not_send_emails(self):
        initial_mail_count = len(mail.outbox)

        try:
            with transaction.atomic():
                # Attempt an operation inside a transaction that is rolled back (outbox dispatch)
                CommunicationService.send_order_status_update(
                    self.order, OrderStatus.DELIVERED, async_send=True
                )
                # Force rollback via deliberate exception
                raise IntegrityError("Simulated database failure during order transaction")
        except IntegrityError:
            pass

        # Since transaction was rolled back, on_commit was not fired and outbox record was rolled back
        self.assertEqual(len(mail.outbox), initial_mail_count)
        self.assertFalse(
            CommunicationLog.objects.filter(
                idempotency_key=f"ORDER_STATUS:{self.order.id}:DELIVERED"
            ).exists()
        )

    # 13. Background worker retries preserve idempotency
    def test_13_background_worker_retries_preserve_idempotency(self):
        # Create queued record
        log = CommunicationLog.objects.create(
            event_type='ORDER_SHIPPED',
            channel='email',
            recipient=self.order.customer_email,
            subject='Order Shipped Test - Vee Power',
            text_body='Your order is shipped.',
            status=CommunicationStatus.QUEUED,
            idempotency_key=f"ORDER_STATUS:{self.order.id}:SHIPPED",
        )

        # Process outbox
        processed = CommunicationService.process_outbox(batch_size=10)
        self.assertGreaterEqual(processed, 1)

        log.refresh_from_db()
        self.assertEqual(log.status, CommunicationStatus.SENT)

        # Calling process_outbox again must not reprocess or resend
        mail.outbox = []
        processed_again = CommunicationService.process_outbox(batch_size=10)
        self.assertEqual(processed_again, 0)
        self.assertEqual(len(mail.outbox), 0)

    # 14. Unauthorized recipients remain blocked by test-mode allowlist
    @override_settings(
        EMAIL_TEST_MODE=True,
        EMAIL_TEST_ALLOWLIST=['balaadhish.cbe@gmail.com', 'balaadhish333@gmail.com'],
        FORCE_BREVO_DELIVERY=True,
    )
    def test_14_unauthorized_recipients_remain_blocked_by_test_mode(self):
        mail.outbox = []
        log = CommunicationService.send_email(
            event_type='ORDER_SHIPPED',
            recipient='unauthorized.external@strangerdomain.com',
            subject='Shipment Alert',
            template_base='order_status_update',
            context={'order_number': 'ORD-999', 'customer_name': 'Stranger'},
            idempotency_key=f"TEST_UNAUTH_{uuid.uuid4().hex[:6]}",
        )

        self.assertEqual(len(mail.outbox), 0)
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SUPPRESSED)
        self.assertIn("not in authorized allowlist", log.error_message)
