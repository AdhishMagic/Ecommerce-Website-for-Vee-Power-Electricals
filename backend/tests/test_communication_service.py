import json
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.core import mail
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import CommunicationLog, CommunicationStatus, ContactInquiry
from apps.core.services.communication_service import CommunicationService
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.orders.services.order_workflow_service import OrderWorkflowService
from apps.finance.models import Client, Quotation, QuotationItem, QuotationStatus, PaymentTransaction, PaymentGateway, PaymentTxStatus, Invoice
from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.finance.services.invoice_service import InvoiceService
from apps.products.models import Product, Category, Brand

User = get_user_model()


class CustomerCommunicationTestCase(TestCase):
    """
    Focused test matrix for Step 4 Customer Communication.
    Validates end-to-end event dispatching, template rendering, idempotency,
    fail-safe transaction isolation, cross-customer isolation, and sensitive data protection.
    """

    def setUp(self):
        mail.outbox = []
        CommunicationLog.objects.all().delete()

        # Seed test catalog
        self.category = Category.objects.create(name="Switchgear", slug="switchgear-comm-test")
        self.brand = Brand.objects.create(name="Schneider Electric", slug="schneider-comm-test")
        self.product = Product.objects.create(
            name="MCB 32A C-Curve Single Pole",
            slug=f"mcb-32a-comm-{uuid.uuid4().hex[:6]}",
            sku=f"SKU-COMM-{uuid.uuid4().hex[:6].upper()}",
            category=self.category,
            brand=self.brand,
            price=Decimal("450.00"),
            mrp=Decimal("550.00"),
            stock=100,
            active=True
        )

        # Seed customer users
        self.user_a = User.objects.create_user(
            username="customer_a",
            email="customer.a@example.com",
            first_name="Ramesh",
            last_name="Kumar",
            password="StrongPassword123!",
            role="customer",
            phone="9876543210"
        )
        self.user_b = User.objects.create_user(
            username="customer_b",
            email="customer.b@example.com",
            first_name="Suresh",
            last_name="Rajan",
            password="StrongPassword123!",
            role="customer",
            phone="9876543211"
        )
        self.admin = User.objects.create_superuser(
            username="admin_comm",
            email="admin@veepower.in",
            password="AdminPassword123!",
            role="admin"
        )

        # Seed customer order
        self.order_a = Order.objects.create(
            order_number=f"ORD-COMM-{uuid.uuid4().hex[:6].upper()}",
            user=self.user_a,
            customer_name="Ramesh Kumar",
            customer_email="customer.a@example.com",
            customer_phone="9876543210",
            shipping_address={
                "recipient_name": "Ramesh Kumar",
                "phone": "9876543210",
                "address_line1": "123 Power House Road",
                "city": "Coimbatore",
                "state": "Tamil Nadu",
                "pincode": "641001",
            },
            subtotal=Decimal("900.00"),
            taxable_amount=Decimal("900.00"),
            cgst_amount=Decimal("81.00"),
            sgst_amount=Decimal("81.00"),
            tax_amount=Decimal("162.00"),
            shipping_fee=Decimal("50.00"),
            total_amount=Decimal("1112.00"),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method="UPI"
        )
        OrderItem.objects.create(
            order=self.order_a,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=Decimal("450.00"),
            quantity=2,
            taxable_amount=Decimal("900.00"),
            tax_amount=Decimal("162.00"),
            subtotal=Decimal("900.00"),
            total_amount=Decimal("1062.00")
        )

        # Seed B2B Client & Quotation
        self.client_corp = Client.objects.create(
            client_code="CORP-COMM-1",
            company_name="Apex Infrastructure Ltd",
            contact_person="Murugan V",
            gstin="33ABCDE1234F1Z5",
            email="procurement@apexinfra.com",
            phone="9840011223",
            credit_limit=Decimal("500000.00")
        )
        self.quotation = Quotation.objects.create(
            quotation_number=f"QT-COMM-{uuid.uuid4().hex[:6].upper()}",
            client=self.client_corp,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timezone.timedelta(days=30),
            total_value=Decimal("4500.00"),
            status=QuotationStatus.DRAFT,
            created_by=self.admin
        )
        QuotationItem.objects.create(
            quotation=self.quotation,
            product=self.product,
            item_name=self.product.name,
            quantity=10,
            unit_price=Decimal("450.00"),
            subtotal=Decimal("4500.00")
        )

    # 1. Customer Registration Email
    def test_01_registration_welcome_email(self):
        client = APIClient()
        payload = {
            "email": "new.member@example.com",
            "password": "SecurePassword123!",
            "first_name": "Karthik",
            "last_name": "S",
            "phone": "9876500000"
        }
        res = client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(res.status_code, 201)

        # Verify email dispatched
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Welcome to Vee Power Electricals", sent.subject)
        self.assertEqual(sent.to, ["new.member@example.com"])
        self.assertIn("Karthik", sent.body)

        # Verify CommunicationLog
        log = CommunicationLog.objects.filter(event_type="CUSTOMER_REGISTRATION", recipient="new.member@example.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    # 2. Password Reset Email
    def test_02_password_reset_email(self):
        client = APIClient()
        res = client.post("/api/v1/auth/password-reset/", {"email": "customer.a@example.com"}, format="json")
        self.assertEqual(res.status_code, 200)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Password Reset Request", sent.subject)
        self.assertEqual(sent.to, ["customer.a@example.com"])
        self.assertIn("reset-password?uid=", sent.body)
        self.assertIn("UID:", sent.body)
        self.assertIn("Token:", sent.body)

        # Token must NOT be stored in CommunicationLog context_snapshot
        log = CommunicationLog.objects.filter(event_type="PASSWORD_RESET", recipient="customer.a@example.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertEqual(log.context_snapshot.get("token"), "[REDACTED]")

    # 3. Successful Order Confirmation
    def test_03_order_confirmation_communication(self):
        OrderWorkflowService.transition_order_status(
            order_id=self.order_a.id,
            target_status=OrderStatus.CONFIRMED,
            changed_by=self.admin,
            reason="Order payment verified"
        )
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn(f"Order Confirmed: #{self.order_a.order_number}", sent.subject)
        self.assertEqual(sent.to, ["customer.a@example.com"])
        self.assertIn(self.product.name, sent.body)
        self.assertIn("1112.00", sent.body)

        log = CommunicationLog.objects.filter(event_type="ORDER_CONFIRMED", recipient="customer.a@example.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    # 4. Successful Payment Confirmation
    def test_04_payment_confirmation_communication(self):
        init_res = PaymentGatewayService.initiate_order_payment(self.order_a.id, self.user_a)
        razorpay_order_id = init_res['gateway_order_id']
        razorpay_payment_id = "pay_test_succ_123"
        signature = PaymentGatewayService.generate_signature(razorpay_order_id, razorpay_payment_id)

        mail.outbox = []
        PaymentGatewayService.confirm_payment(
            order_id=self.order_a.id,
            user=self.user_a,
            razorpay_order_id=razorpay_order_id,
            razorpay_payment_id=razorpay_payment_id,
            razorpay_signature=signature
        )

        # Verify payment confirmation email sent
        payment_emails = [m for m in mail.outbox if "Payment Received" in m.subject]
        self.assertEqual(len(payment_emails), 1)
        self.assertEqual(payment_emails[0].to, ["customer.a@example.com"])
        self.assertIn(razorpay_payment_id, payment_emails[0].body)

        log = CommunicationLog.objects.filter(event_type="PAYMENT_CONFIRMED", recipient="customer.a@example.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    # 5. Failed Payment Communication
    def test_05_failed_payment_communication(self):
        init_res = PaymentGatewayService.initiate_order_payment(self.order_a.id, self.user_a)
        razorpay_order_id = init_res['gateway_order_id']

        mail.outbox = []
        with self.assertRaises(Exception):
            PaymentGatewayService.confirm_payment(
                order_id=self.order_a.id,
                user=self.user_a,
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id="pay_test_bad_999",
                razorpay_signature="invalid_signature_mock"
            )

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Payment Failed", sent.subject)
        self.assertEqual(sent.to, ["customer.a@example.com"])
        self.assertIn(self.order_a.order_number, sent.body)

        log = CommunicationLog.objects.filter(event_type="PAYMENT_FAILED", recipient="customer.a@example.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    # 6. Invoice Communication
    def test_06_invoice_communication(self):
        invoice = InvoiceService.create_invoice_for_order(self.order_a)
        self.assertIsNotNone(invoice)

        inv_emails = [m for m in mail.outbox if "Tax Invoice" in m.subject]
        self.assertEqual(len(inv_emails), 1)
        sent = inv_emails[0]
        self.assertEqual(sent.to, ["customer.a@example.com"])
        self.assertIn(invoice.invoice_number, sent.body)
        self.assertIn("1112.00", sent.body)

        log = CommunicationLog.objects.filter(event_type="INVOICE_GENERATED", recipient="customer.a@example.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    # 7. Quotation Communication
    def test_07_quotation_communication(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        res = client.patch(
            f"/api/v1/finance/quotations/{self.quotation.id}/status/",
            {"status": QuotationStatus.SENT},
            format="json"
        )
        self.assertEqual(res.status_code, 200)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn(self.quotation.quotation_number, sent.subject)
        self.assertEqual(sent.to, ["procurement@apexinfra.com"])
        self.assertIn("4500.00", sent.body)

        log = CommunicationLog.objects.filter(event_type="QUOTATION_UPDATE", recipient="procurement@apexinfra.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)

    # 8. Cancellation Communication
    def test_08_cancellation_communication(self):
        OrderWorkflowService.transition_order_status(
            order_id=self.order_a.id,
            target_status=OrderStatus.CANCELLED,
            changed_by=self.admin,
            reason="Customer requested cancellation before shipment"
        )
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Cancelled", sent.subject)
        self.assertEqual(sent.to, ["customer.a@example.com"])
        self.assertIn("Customer requested cancellation", sent.body)

        log = CommunicationLog.objects.filter(event_type="ORDER_CANCELLED", recipient="customer.a@example.com").first()
        self.assertIsNotNone(log)

    # 9. Shipping Communication
    def test_09_shipping_communication(self):
        # Progress: PENDING -> CONFIRMED -> PACKED -> SHIPPED
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.CONFIRMED)
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.PACKED)
        mail.outbox = []

        OrderWorkflowService.transition_order_status(
            self.order_a.id,
            OrderStatus.SHIPPED,
            tracking_number="BLUEDART-99887766"
        )
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Shipped", sent.subject)
        self.assertEqual(sent.to, ["customer.a@example.com"])
        self.assertIn("BLUEDART-99887766", sent.body)

    # 10. Delivery Communication
    def test_10_delivery_communication(self):
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.CONFIRMED)
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.PACKED)
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.SHIPPED)
        mail.outbox = []

        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.DELIVERED)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Delivered", sent.subject)
        self.assertEqual(sent.to, ["customer.a@example.com"])

    # 11. Return Communication Lifecycle
    def test_11_return_communication_lifecycle(self):
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.CONFIRMED)
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.PACKED)
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.SHIPPED)
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.DELIVERED)

        # 11a: RETURN_REQUESTED
        mail.outbox = []
        OrderWorkflowService.transition_order_status(
            self.order_a.id,
            OrderStatus.RETURN_REQUESTED,
            reason="Wrong amperage rating ordered"
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Return Requested", mail.outbox[0].subject)

        # 11b: RETURN_APPROVED
        mail.outbox = []
        OrderWorkflowService.transition_order_status(
            self.order_a.id,
            OrderStatus.RETURN_APPROVED,
            reason="RMA approved by warehouse"
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Return Approved", mail.outbox[0].subject)

        # 11c: RETURN_COMPLETED
        mail.outbox = []
        OrderWorkflowService.transition_order_status(
            self.order_a.id,
            OrderStatus.RETURN_COMPLETED,
            reason="Goods inspected and stock restored"
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Return Completed", mail.outbox[0].subject)

    # 12. Wrong Recipient Blocked
    def test_12_wrong_recipient_blocked(self):
        log = CommunicationService.send_email(
            event_type="TEST_INVALID",
            recipient="not-an-email-address",
            subject="Test Invalid Recipient",
            template_base="welcome",
            context={"customer_name": "Test"},
            idempotency_key="TEST_INVALID_1"
        )
        # Email transmission must not occur
        self.assertEqual(len(mail.outbox), 0)
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.FAILED)
        self.assertIn("Invalid or missing recipient", log.error_message)

    # 13. Duplicate Event Does Not Duplicate Communication (Idempotency)
    def test_13_duplicate_event_does_not_duplicate_communication(self):
        # First confirmation
        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.CONFIRMED)
        self.assertEqual(len(mail.outbox), 1)

        # Transitioning again or resending with same key
        CommunicationService.send_order_confirmation(self.order_a)
        # Outbox length must remain 1
        self.assertEqual(len(mail.outbox), 1)

        # Invoice idempotency
        InvoiceService.create_invoice_for_order(self.order_a)
        count_after_first = len(mail.outbox)
        # Calling create_invoice_for_order again returns existing invoice without sending another email
        InvoiceService.create_invoice_for_order(self.order_a)
        self.assertEqual(len(mail.outbox), count_after_first)

    # 14. Email Failure Does Not Roll Back Business Transaction
    def test_14_email_failure_does_not_rollback_business_transaction(self):
        with patch('django.core.mail.EmailMultiAlternatives.send') as mock_send:
            mock_send.side_effect = ConnectionError("SMTP Connection Refused: localhost:587")

            # Execute Order Confirmation transition
            updated_order = OrderWorkflowService.transition_order_status(
                order_id=self.order_a.id,
                target_status=OrderStatus.CONFIRMED,
                reason="Testing fail-safe communication"
            )

            # Order status must STILL be CONFIRMED despite email failure!
            self.assertEqual(updated_order.status, OrderStatus.CONFIRMED)
            self.order_a.refresh_from_db()
            self.assertEqual(self.order_a.status, OrderStatus.CONFIRMED)

            # Failed communication must be logged
            log = CommunicationLog.objects.filter(event_type="ORDER_CONFIRMED", recipient="customer.a@example.com").first()
            self.assertIsNotNone(log)
            self.assertEqual(log.status, CommunicationStatus.FAILED)
            self.assertIn("SMTP Connection Refused", log.error_message)

    # 15. Sensitive Data Not Exposed
    def test_15_sensitive_data_not_exposed(self):
        log = CommunicationService.send_email(
            event_type="TEST_SECURITY",
            recipient="test.sec@example.com",
            subject="Security Context Test",
            template_base="welcome",
            context={
                "customer_name": "Security Test",
                "password": "SuperSecretPassword123!",
                "token": "sensitive_jwt_token_payload",
                "signature": "hmac_sha256_signature_secret",
            },
            idempotency_key="TEST_SEC_1"
        )
        self.assertIsNotNone(log)
        self.assertEqual(log.context_snapshot.get("password"), "[REDACTED]")
        self.assertEqual(log.context_snapshot.get("token"), "[REDACTED]")
        self.assertEqual(log.context_snapshot.get("signature"), "[REDACTED]")

    # 16. Cross-Customer Isolation
    def test_16_cross_customer_isolation(self):
        # Order A belongs strictly to customer A
        self.assertEqual(self.order_a.customer_email, self.user_a.email)
        self.assertNotEqual(self.order_a.customer_email, self.user_b.email)

        OrderWorkflowService.transition_order_status(self.order_a.id, OrderStatus.CONFIRMED)
        sent = mail.outbox[0]

        # Recipient must ONLY be customer A
        self.assertIn("customer.a@example.com", sent.to)
        self.assertNotIn("customer.b@example.com", sent.to)

    # 17. Contact Inquiry Acknowledgement
    def test_17_contact_inquiry_acknowledgement(self):
        client = APIClient()
        payload = {
            "name": "Anand Mohan",
            "email": "anand.mohan@example.com",
            "phone": "9811223344",
            "subject": "Bulk MCB Quotation for Commercial Complex",
            "message": "We need 200 units of 32A three-phase switchgear."
        }
        res = client.post("/api/v1/inquiries/", payload, format="json")
        self.assertEqual(res.status_code, 201)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("Inquiry Received: Ticket #", sent.subject)
        self.assertEqual(sent.to, ["anand.mohan@example.com"])
        self.assertIn("Anand Mohan", sent.body)
        self.assertIn("Bulk MCB Quotation", sent.body)

        log = CommunicationLog.objects.filter(event_type="INQUIRY_ACKNOWLEDGED", recipient="anand.mohan@example.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, CommunicationStatus.SENT)
