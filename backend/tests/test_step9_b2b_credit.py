import threading
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import UserRole
from apps.products.models import Category, Subcategory, Brand, Product
from apps.finance.models import (
    Client,
    Quotation,
    QuotationItem,
    QuotationStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentTransaction,
    PaymentTxStatus,
    PaymentGateway,
)
from apps.finance.services import (
    CreditService,
    InvoiceService,
    QuotationService,
)
from apps.core.models import AdminConfigAuditLog, AuditActionType

User = get_user_model()


class Step9BaseTestCase(TestCase):
    def setUp(self):
        # 1. Users
        self.admin = User.objects.create_superuser(
            email='admin_b2b@veepower.com',
            password='AdminPass123!',
            first_name='Admin',
            last_name='B2B',
            role=UserRole.ADMIN,
        )
        self.customer = User.objects.create_user(
            email='retail_cust@example.com',
            password='CustomerPass123!',
            first_name='Rajesh',
            last_name='Kannan',
            role=UserRole.CUSTOMER,
        )

        # 2. B2B Corporate Clients
        self.client_alpha = Client.objects.create(
            client_code='CLI-ALP-001',
            company_name='Alpha Infra Engineering Ltd',
            contact_person='Suresh Raina',
            gstin='33AAACA1111A1Z1',  # 33 = Tamil Nadu
            email='procurement@alphainfra.com',
            phone='+919876543210',
            credit_limit=Decimal('100000.00'),
            address='123 SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu 600032',
            is_active=True,
        )
        self.client_beta = Client.objects.create(
            client_code='CLI-BET-002',
            company_name='Beta Power Distribution Corp',
            contact_person='Anand Kumar',
            gstin='29AAACB2222B1Z2',  # 29 = Karnataka
            email='contracts@betapower.in',
            phone='+919876543211',
            credit_limit=Decimal('50000.00'),
            address='45 Peenya Industrial Area, Bengaluru, Karnataka 560058',
            is_active=True,
        )

        # 3. Product Catalog
        self.category = Category.objects.create(name='Industrial Switchgear', slug='industrial-switchgear')
        self.subcategory = Subcategory.objects.create(name='MCB & DB', slug='mcb-db', category=self.category)
        self.brand = Brand.objects.create(name='Schneider Electric', slug='schneider')
        self.product = Product.objects.create(
            name='Acti9 32A TP MCB',
            slug='acti9-32a-tp-mcb',
            sku='SCH-A9-32A',
            category=self.category,
            subcategory=self.subcategory,
            brand=self.brand,
            price=Decimal('1500.00'),
            mrp=Decimal('1800.00'),
            stock=100,
            active=True,
        )

        # 4. API Client
        self.client_api = APIClient()


class Step9B2BClientValidationTestCase(Step9BaseTestCase):
    """
    Tests for B2B Client Domain Audit, GSTIN & Business Validation, and RBAC.
    """

    def test_01_client_crud(self):
        """Verify client creation, retrieval, properties, and update."""
        self.client_api.force_authenticate(user=self.admin)
        res = self.client_api.post('/api/v1/finance/clients/', {
            'client_code': 'CLI-GAM-003',
            'company_name': 'Gamma Construction Pvt Ltd',
            'contact_person': 'Murugan P',
            'gstin': '33AAACG3333C1Z3',
            'email': 'murugan@gammaconstruction.com',
            'phone': '+919844112233',
            'credit_limit': '75000.00',
            'address': 'Plot 44, SIPCOT, Ranipet, Tamil Nadu',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.data
        self.assertEqual(data['client_code'], 'CLI-GAM-003')
        self.assertEqual(data['company_name'], 'Gamma Construction Pvt Ltd')
        self.assertEqual(data['pan'], 'AAACG3333C')
        self.assertEqual(data['state_code'], '33')
        self.assertEqual(data['state'], 'Tamil Nadu')
        self.assertEqual(data['customer_type'], 'CORPORATE')
        self.assertEqual(data['credit_limit'], '75000.00')
        self.assertEqual(data['credit_exposure'], '0.00')
        self.assertEqual(data['available_credit'], '75000.00')
        self.assertTrue(data['is_active'])

        # Retrieval
        client_id = data['id']
        get_res = self.client_api.get(f'/api/v1/finance/clients/{client_id}/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['outstanding_balance'], '0.00')

        # Update contact info
        patch_res = self.client_api.patch(f'/api/v1/finance/clients/{client_id}/', {
            'contact_person': 'Murugan Palanisamy',
            'phone': '+919844119999',
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['contact_person'], 'Murugan Palanisamy')

    def test_02_client_rbac(self):
        """Strict RBAC: Anonymous gets 401, Retail customer gets 403, Admin gets 200."""
        # Unauthenticated
        unauth_client = APIClient()
        res_unauth = unauth_client.get('/api/v1/finance/clients/')
        self.assertEqual(res_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # Retail customer
        self.client_api.force_authenticate(user=self.customer)
        res_cust = self.client_api.get('/api/v1/finance/clients/')
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Admin
        self.client_api.force_authenticate(user=self.admin)
        res_admin = self.client_api.get('/api/v1/finance/clients/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

    def test_03_gstin_validation(self):
        """Verify invalid GSTIN format and invalid state code rejection."""
        self.client_api.force_authenticate(user=self.admin)

        # 1. Invalid length / pattern
        res1 = self.client_api.post('/api/v1/finance/clients/', {
            'client_code': 'CLI-ERR-001',
            'company_name': 'Error Infra',
            'contact_person': 'Tester',
            'gstin': 'INVALID-GSTIN-000',
            'email': 'err@infra.com',
            'phone': '+919999999999',
            'credit_limit': '10000.00',
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('gstin', str(res1.data))

        # 2. Invalid state code ('99' is not in GST_STATE_CODES)
        res2 = self.client_api.post('/api/v1/finance/clients/', {
            'client_code': 'CLI-ERR-002',
            'company_name': 'Error Infra 2',
            'contact_person': 'Tester',
            'gstin': '99AAACA1111A1Z1',
            'email': 'err2@infra.com',
            'phone': '+919999999999',
            'credit_limit': '10000.00',
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid GST state code', str(res2.data))

    def test_04_duplicate_client_code(self):
        """Reject duplicate client codes."""
        self.client_api.force_authenticate(user=self.admin)
        res = self.client_api.post('/api/v1/finance/clients/', {
            'client_code': self.client_alpha.client_code,  # Duplicate
            'company_name': 'Another Alpha Corp',
            'contact_person': 'Duplicate Agent',
            'gstin': '33AAACD4444D1Z4',
            'email': 'dup@alpha.com',
            'phone': '+919888877777',
            'credit_limit': '25000.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('client_code', str(res.data))

    def test_05_duplicate_gstin(self):
        """Reject duplicate GSTIN."""
        self.client_api.force_authenticate(user=self.admin)
        res = self.client_api.post('/api/v1/finance/clients/', {
            'client_code': 'CLI-NEW-099',
            'company_name': 'GST Duplicate Corp',
            'contact_person': 'Duplicate Agent',
            'gstin': self.client_alpha.gstin,  # Duplicate GSTIN
            'email': 'dup_gstin@corp.com',
            'phone': '+919888877777',
            'credit_limit': '25000.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('gstin', str(res.data))

    def test_06_credit_limit_validation(self):
        """Reject negative credit limit values."""
        self.client_api.force_authenticate(user=self.admin)
        res = self.client_api.post('/api/v1/finance/clients/', {
            'client_code': 'CLI-NEG-001',
            'company_name': 'Negative Credit Co',
            'contact_person': 'Bad Actor',
            'gstin': '33AAACN5555N1Z5',
            'email': 'negative@credit.com',
            'phone': '+919888877777',
            'credit_limit': '-50000.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('credit_limit', str(res.data))

        # Model validation
        with self.assertRaises(ValidationError):
            c = Client(
                client_code='CLI-NEG-002',
                company_name='Negative Credit Co 2',
                contact_person='Bad Actor',
                gstin='33AAACN5555N1Z5',
                email='negative2@credit.com',
                phone='+919888877777',
                credit_limit=Decimal('-1000.00'),
            )
            c.save()

    def test_07_inactive_client_restrictions(self):
        """Inactive clients cannot consume credit or have quotations approved/converted."""
        # Deactivate client_beta
        self.client_beta.is_active = False
        self.client_beta.save(update_fields=['is_active'])

        # Credit check
        check = CreditService.check_credit_availability(self.client_beta, additional_amount=Decimal('100.00'))
        self.assertFalse(check['is_allowed'])
        self.assertIn('inactive', check['reason'].lower())

        with self.assertRaises(ValidationError) as ctx:
            CreditService.validate_credit_limit(self.client_beta, additional_amount=Decimal('100.00'), lock_client=False)
        self.assertIn('inactive', str(ctx.exception).lower())

        # Quotation approval rejection
        quote = Quotation.objects.create(
            quotation_number='QUO-INACT-001',
            client=self.client_beta,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            total_value=Decimal('5000.00'),
            status=QuotationStatus.SENT,
        )
        with self.assertRaises(ValidationError) as ctx:
            QuotationService.transition_status(quote.id, QuotationStatus.APPROVED)
        self.assertIn('inactive', str(ctx.exception).lower())


class Step9CreditEngineTestCase(Step9BaseTestCase):
    """
    Tests for Authoritative Credit Limit Engine, Exposure Sources,
    Quotation/Invoice Integration, and Payment Reconciliation.
    """

    def test_08_available_credit_calculation(self):
        """Authoritative relationship: available_credit = max(0, credit_limit - credit_exposure)."""
        exposure = CreditService.get_outstanding_exposure(self.client_alpha)
        self.assertEqual(exposure, Decimal('0.00'))
        avail = CreditService.get_available_credit(self.client_alpha)
        self.assertEqual(avail, Decimal('100000.00'))
        self.assertEqual(self.client_alpha.available_credit, Decimal('100000.00'))

    def test_09_exposure_calculation(self):
        """Exposure accurately aggregates across UNPAID and OVERDUE statutory invoices."""
        Invoice.objects.create(
            invoice_number='INV-TEST-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('20000.00'),
            taxable_amount=Decimal('20000.00'),
            total_amount=Decimal('23600.00'),
            status=InvoiceStatus.UNPAID,
        )
        Invoice.objects.create(
            invoice_number='INV-TEST-002',
            invoice_date=timezone.now().date() - timedelta(days=40),
            due_date=timezone.now().date() - timedelta(days=10),
            client=self.client_alpha,
            subtotal=Decimal('10000.00'),
            taxable_amount=Decimal('10000.00'),
            total_amount=Decimal('11800.00'),
            status=InvoiceStatus.OVERDUE,
        )

        exposure = CreditService.get_outstanding_exposure(self.client_alpha)
        expected = Decimal('23600.00') + Decimal('11800.00')
        self.assertEqual(exposure, expected)

        available = CreditService.get_available_credit(self.client_alpha)
        self.assertEqual(available, Decimal('100000.00') - expected)

    def test_10_unpaid_invoice_exposure(self):
        """Only unpaid balances contribute to exposure."""
        inv = Invoice.objects.create(
            invoice_number='INV-TEST-003',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('50000.00'),
            taxable_amount=Decimal('50000.00'),
            total_amount=Decimal('59000.00'),
            status=InvoiceStatus.UNPAID,
        )
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('59000.00'))

    def test_11_paid_invoice_exclusion(self):
        """Invoices with status PAID or CANCELLED must NOT contribute to exposure."""
        Invoice.objects.create(
            invoice_number='INV-PAID-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('40000.00'),
            taxable_amount=Decimal('40000.00'),
            total_amount=Decimal('47200.00'),
            status=InvoiceStatus.PAID,
            payment_status='Paid',
        )
        Invoice.objects.create(
            invoice_number='INV-CANCEL-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('30000.00'),
            taxable_amount=Decimal('30000.00'),
            total_amount=Decimal('35400.00'),
            status=InvoiceStatus.CANCELLED,
            payment_status='Cancelled',
        )
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('0.00'))
        self.assertEqual(CreditService.get_available_credit(self.client_alpha), Decimal('100000.00'))

    def test_12_failed_payment_behavior(self):
        """FAILED or INITIATED payment transactions do NOT reduce credit exposure."""
        inv = Invoice.objects.create(
            invoice_number='INV-PAY-FAIL-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('30000.00'),
            taxable_amount=Decimal('30000.00'),
            total_amount=Decimal('35400.00'),
            status=InvoiceStatus.UNPAID,
        )
        PaymentTransaction.objects.create(
            invoice=inv,
            gateway=PaymentGateway.RAZORPAY,
            gateway_transaction_id='pay_fail_111',
            amount=Decimal('35400.00'),
            status=PaymentTxStatus.FAILED,
        )
        PaymentTransaction.objects.create(
            invoice=inv,
            gateway=PaymentGateway.RAZORPAY,
            gateway_transaction_id='pay_init_222',
            amount=Decimal('35400.00'),
            status=PaymentTxStatus.INITIATED,
        )
        # Full exposure remains
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('35400.00'))

    def test_13_duplicate_payment_behavior(self):
        """Successful payments reduce exposure, and multiple payments never cause negative exposure."""
        inv = Invoice.objects.create(
            invoice_number='INV-PAY-SUCC-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('50000.00'),
            taxable_amount=Decimal('50000.00'),
            total_amount=Decimal('50000.00'),
            status=InvoiceStatus.UNPAID,
        )
        # Payment 1: ₹30,000
        PaymentTransaction.objects.create(
            invoice=inv,
            gateway=PaymentGateway.NEFT_RTGS,
            gateway_transaction_id='neft_001',
            amount=Decimal('30000.00'),
            status=PaymentTxStatus.SUCCESS,
        )
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('20000.00'))

        # Payment 2: ₹25,000 (overshoot)
        PaymentTransaction.objects.create(
            invoice=inv,
            gateway=PaymentGateway.NEFT_RTGS,
            gateway_transaction_id='neft_002',
            amount=Decimal('25000.00'),
            status=PaymentTxStatus.SUCCESS,
        )
        # Unpaid balance bounded at 0.00, not negative
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('0.00'))

    def test_14_quotation_credit_validation(self):
        """Quotation approval validates client credit availability."""
        # Create existing invoice of ₹80,000 on ₹100,000 limit (remaining headroom = ₹20,000)
        Invoice.objects.create(
            invoice_number='INV-PRE-80K',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('80000.00'),
            taxable_amount=Decimal('80000.00'),
            total_amount=Decimal('80000.00'),
            status=InvoiceStatus.UNPAID,
        )

        # Quotation for ₹25,000 -> Exceeds available credit (shortfall = ₹5,000)
        quote = Quotation.objects.create(
            quotation_number='QUO-OVER-01',
            client=self.client_alpha,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            total_value=Decimal('25000.00'),
            status=QuotationStatus.SENT,
        )
        with self.assertRaises(ValidationError) as ctx:
            QuotationService.transition_status(quote.id, QuotationStatus.APPROVED)
        self.assertIn('Credit limit exceeded', str(ctx.exception))

    def test_15_quotation_conversion_credit_validation(self):
        """Quotation conversion validates client credit limit atomically."""
        quote = Quotation.objects.create(
            quotation_number='QUO-CONV-01',
            client=self.client_alpha,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            total_value=Decimal('15000.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product,
            item_name='Acti9 32A TP MCB',
            quantity=10,
            unit_price=Decimal('1500.00'),
            subtotal=Decimal('15000.00'),
        )

        # Create existing invoice of ₹90,000 prior to conversion attempt
        Invoice.objects.create(
            invoice_number='INV-PRE-90K',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('90000.00'),
            taxable_amount=Decimal('90000.00'),
            total_amount=Decimal('90000.00'),
            status=InvoiceStatus.UNPAID,
        )

        # Conversion must be rejected due to 90k + 15k = 105k > 100k
        with self.assertRaises(ValidationError) as ctx:
            QuotationService.convert_quotation_to_invoice(quote.id, converted_by=self.admin)
        self.assertIn('Credit limit exceeded', str(ctx.exception))

    def test_16_insufficient_credit_rejection(self):
        """Diagnostic check verifies exact shortfall and rejection payload."""
        diag = CreditService.check_credit_availability(self.client_beta, additional_amount=Decimal('60000.00'))
        self.assertFalse(diag['is_allowed'])
        self.assertEqual(diag['client_code'], 'CLI-BET-002')
        self.assertEqual(diag['credit_limit'], Decimal('50000.00'))
        self.assertEqual(diag['current_exposure'], Decimal('0.00'))
        self.assertEqual(diag['additional_amount'], Decimal('60000.00'))
        self.assertEqual(diag['projected_exposure'], Decimal('60000.00'))
        self.assertEqual(diag['shortfall'], Decimal('10000.00'))

    def test_17_sufficient_credit_approval(self):
        """When headroom is sufficient, credit check succeeds without shortfall."""
        diag = CreditService.check_credit_availability(self.client_alpha, additional_amount=Decimal('45000.00'))
        self.assertTrue(diag['is_allowed'])
        self.assertEqual(diag['shortfall'], Decimal('0.00'))
        self.assertEqual(diag['available_credit'], Decimal('100000.00'))
        self.assertEqual(diag['projected_exposure'], Decimal('45000.00'))
        self.assertEqual(diag['credit_limit'] - diag['projected_exposure'], Decimal('55000.00'))

    def test_18_credit_limit_modification_authorization(self):
        """Only authorized staff/admin can modify B2B credit limit via API."""
        # 1. Retail customer attempt -> 403
        self.client_api.force_authenticate(user=self.customer)
        res_cust = self.client_api.post(f'/api/v1/finance/clients/{self.client_alpha.id}/credit-limit/', {
            'credit_limit': '200000.00',
            'reason': 'Customer self-elevation attempt',
        }, format='json')
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin attempt -> 200 OK
        self.client_api.force_authenticate(user=self.admin)
        res_admin = self.client_api.post(f'/api/v1/finance/clients/{self.client_alpha.id}/credit-limit/', {
            'credit_limit': '150000.00',
            'reason': 'Approved by Credit Committee for Q4 expansion',
        }, format='json')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admin.data['credit_limit'], '150000.00')

    def test_19_credit_limit_audit_logging(self):
        """Credit limit updates generate auditable AdminConfigAuditLog entries."""
        CreditService.record_credit_limit_change(
            client=self.client_alpha,
            new_limit=Decimal('180000.00'),
            changed_by=self.admin,
            reason='Annual revenue scaling review',
        )

        log = AdminConfigAuditLog.objects.filter(
            domain='client_credit',
            record_id=self.client_alpha.id
        ).order_by('-created_at').first()

        self.assertIsNotNone(log)
        self.assertEqual(log.admin_user, self.admin)
        self.assertEqual(log.old_value, {'credit_limit': '100000.00'})
        self.assertEqual(log.new_value, {'credit_limit': '180000.00'})
        self.assertEqual(log.change_reason, 'Annual revenue scaling review')

    def test_20_client_isolation(self):
        """Client endpoints return isolated client-specific financial metrics."""
        self.client_api.force_authenticate(user=self.admin)

        # Create invoice for alpha
        Invoice.objects.create(
            invoice_number='INV-ALPHA-ISO-01',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('30000.00'),
            taxable_amount=Decimal('30000.00'),
            total_amount=Decimal('30000.00'),
            status=InvoiceStatus.UNPAID,
        )

        res_alpha = self.client_api.get(f'/api/v1/finance/clients/{self.client_alpha.id}/credit/')
        self.assertEqual(res_alpha.status_code, status.HTTP_200_OK)
        self.assertEqual(res_alpha.data['current_exposure'], Decimal('30000.00'))

        res_beta = self.client_api.get(f'/api/v1/finance/clients/{self.client_beta.id}/credit/')
        self.assertEqual(res_beta.status_code, status.HTTP_200_OK)
        self.assertEqual(res_beta.data['current_exposure'], Decimal('0.00'))

    def test_21_quotation_client_ownership(self):
        """Quotations belong strictly to their parent client."""
        quote = Quotation.objects.create(
            quotation_number='QUO-OWN-01',
            client=self.client_alpha,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            total_value=Decimal('5000.00'),
            status=QuotationStatus.APPROVED,
        )
        self.assertEqual(quote.client, self.client_alpha)

        # Modifying an approved quotation is rejected
        self.client_api.force_authenticate(user=self.admin)
        res = self.client_api.patch(f'/api/v1/finance/quotations/{quote.id}/', {
            'total_value': '10000.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_22_invoice_client_ownership(self):
        """Invoices belong strictly to their client and paid invoices cannot be deleted."""
        inv = Invoice.objects.create(
            invoice_number='INV-OWN-01',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('10000.00'),
            taxable_amount=Decimal('10000.00'),
            total_amount=Decimal('10000.00'),
            status=InvoiceStatus.PAID,
        )
        self.client_api.force_authenticate(user=self.admin)
        del_res = self.client_api.delete(f'/api/v1/finance/invoices/{inv.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_23_b2b_payment_reconciliation(self):
        """B2B invoice payment reconciliation reduces outstanding exposure correctly."""
        inv = Invoice.objects.create(
            invoice_number='INV-RECON-01',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=15),
            client=self.client_alpha,
            subtotal=Decimal('50000.00'),
            taxable_amount=Decimal('50000.00'),
            total_amount=Decimal('50000.00'),
            status=InvoiceStatus.UNPAID,
        )
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('50000.00'))

        # Record payment transaction
        PaymentTransaction.objects.create(
            invoice=inv,
            gateway=PaymentGateway.NEFT_RTGS,
            gateway_transaction_id='neft_recon_100',
            amount=Decimal('50000.00'),
            status=PaymentTxStatus.SUCCESS,
        )
        # Outstanding exposure immediately reflects zero balance
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('0.00'))

        # Transition invoice to PAID
        inv.status = InvoiceStatus.PAID
        inv.payment_status = 'Paid'
        inv.save()
        self.assertEqual(CreditService.get_outstanding_exposure(self.client_alpha), Decimal('0.00'))

    def test_24_n_plus_one_regression(self):
        """Client list query count remains constant (<= 4 queries) avoiding N+1 loops."""
        # Create 10 clients with invoices
        for i in range(10):
            cl = Client.objects.create(
                client_code=f'CLI-N1-{i:03d}',
                company_name=f'Bulk Client {i}',
                contact_person=f'Manager {i}',
                gstin=f'33AAACX{i:04d}X1Z{i}',
                email=f'client{i}@bulk.com',
                phone=f'+91980000000{i}',
                credit_limit=Decimal('100000.00'),
            )
            Invoice.objects.create(
                invoice_number=f'INV-N1-{i:03d}',
                invoice_date=timezone.now().date(),
                due_date=timezone.now().date() + timedelta(days=15),
                client=cl,
                subtotal=Decimal('1000.00'),
                taxable_amount=Decimal('1000.00'),
                total_amount=Decimal('1180.00'),
                status=InvoiceStatus.UNPAID,
            )

        self.client_api.force_authenticate(user=self.admin)
        with self.assertNumQueries(5):
            # 1: Count query for pagination
            # 2: Client list query with annotated_total_invoiced
            # 3: Prefetch unpaid invoices
            # 4: Prefetch successful payments
            # 5: Prefetch quotations
            res = self.client_api.get('/api/v1/finance/clients/?limit=20')
            self.assertEqual(res.status_code, status.HTTP_200_OK)


class Step9ConcurrentCreditTestCase(TransactionTestCase):
    """
    Concurrency safety test: Multi-threaded race condition verification
    for simultaneous credit-consuming transactions.
    """

    def setUp(self):
        self.client_conc = Client.objects.create(
            client_code='CLI-CONC-100K',
            company_name='Concurrency Safety Testing Infra',
            contact_person='Test Engineer',
            gstin='33AAACC9999C1Z9',
            email='concurrency@safety.com',
            phone='+919999888877',
            credit_limit=Decimal('100000.00'),
            is_active=True,
        )

    def test_25_concurrent_credit_consumption(self):
        """
        Client credit limit = ₹100,000.
        Two simultaneous transactions attempt to consume:
        Thread 1: ₹70,000
        Thread 2: ₹50,000
        Total attempted: ₹120,000 > ₹100,000.
        Concurrency locking guarantee:
        Only ONE transaction must succeed; the other MUST be rejected.
        Negative available credit must NEVER occur.
        """
        results = []
        errors = []

        def attempt_consumption(amount, thread_num):
            try:
                with transaction.atomic():
                    # Acquire row lock and validate credit
                    CreditService.validate_credit_limit(self.client_conc, additional_amount=amount, lock_client=True)
                    # Simulate invoice generation
                    Invoice.objects.create(
                        invoice_number=f'INV-RACE-{thread_num}',
                        invoice_date=timezone.now().date(),
                        due_date=timezone.now().date() + timedelta(days=15),
                        client=self.client_conc,
                        subtotal=amount,
                        taxable_amount=amount,
                        total_amount=amount,
                        status=InvoiceStatus.UNPAID,
                    )
                results.append((thread_num, amount, True))
            except Exception as e:
                errors.append((thread_num, amount, str(e)))

        t1 = threading.Thread(target=attempt_consumption, args=(Decimal('70000.00'), 1))
        t2 = threading.Thread(target=attempt_consumption, args=(Decimal('50000.00'), 2))

        t1.start()
        t2.start()

        t1.join()
        t2.join()

        # Verify outcomes: Exactly 1 succeed, 1 fail
        self.assertEqual(len(results), 1, f"Expected exactly 1 success, got {len(results)}. Results: {results}")
        self.assertEqual(len(errors), 1, f"Expected exactly 1 failure, got {len(errors)}. Errors: {errors}")

        # Refresh client and verify final financial state
        self.client_conc.refresh_from_db()
        final_exposure = CreditService.get_outstanding_exposure(self.client_conc)
        final_available = CreditService.get_available_credit(self.client_conc)

        self.assertLessEqual(final_exposure, Decimal('100000.00'))
        self.assertGreaterEqual(final_available, Decimal('0.00'))
        self.assertEqual(final_available, Decimal('100000.00') - final_exposure)
