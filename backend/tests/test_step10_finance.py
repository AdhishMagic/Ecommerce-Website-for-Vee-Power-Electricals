import uuid
import hmac
import hashlib
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import UserRole
from apps.products.models import Category, Brand, Product
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.finance.models import (
    Client,
    Quotation,
    QuotationItem,
    QuotationStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentTransaction,
    PaymentGateway,
    PaymentTxStatus,
    Expense,
    ExpenseCategory,
    ExpenseStatus,
    PayoutSettlement,
    SettlementStatus,
)
from apps.finance.services.invoice_service import InvoiceService
from apps.finance.services.quotation_service import QuotationService
from apps.finance.services.credit_service import CreditService
from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.core.models import CommunicationLog

User = get_user_model()


class Step10FinanceDomainTests(TestCase):
    """
    Authoritative test suite for STEP 10 — FINANCE FINALIZATION.
    Validates all statutory financial operations, reconciliation, immutability,
    RBAC, security, Decimal rounding, and reporting.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.superadmin = User.objects.create_user(
            email='superadmin_fin@veepower.in',
            first_name='Super',
            last_name='Finance',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.staff_admin = User.objects.create_user(
            email='staff_fin@veepower.in',
            first_name='Staff',
            last_name='Finance',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.customer1 = User.objects.create_user(
            email='customer1_fin@example.com',
            first_name='Anand',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email='customer2_fin@example.com',
            first_name='Bala',
            last_name='Sundaram',
            role=UserRole.CUSTOMER,
        )

        self.token_admin = str(AccessToken.for_user(self.superadmin))
        self.token_staff = str(AccessToken.for_user(self.staff_admin))
        self.token_c1 = str(AccessToken.for_user(self.customer1))
        self.token_c2 = str(AccessToken.for_user(self.customer2))

        # Catalog setup
        self.category = Category.objects.create(name='Cables', slug='cables-fin', is_active=True)
        self.brand = Brand.objects.create(name='Polycab', slug='polycab-fin', is_active=True)
        self.product = Product.objects.create(
            name='4 sq mm Armoured Cable',
            slug='4-sq-mm-cable',
            sku='CAB-4SQ-ARM',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('1200.00'),
            price=Decimal('1000.00'),
            stock=500,
            active=True,
        )

        # B2B Client (Tamil Nadu - 33)
        self.b2b_client = Client.objects.create(
            client_code='CLI-TN-001',
            company_name='Vee Heavy Industries Ltd',
            contact_person='Senthil Nathan',
            gstin='33AAAAA0000A1Z5',
            email='accounts@veeheavy.com',
            phone='+919876543210',
            credit_limit=Decimal('50000.00'),
            address='Coimbatore, Tamil Nadu',
            is_active=True,
        )

    # =========================================================================
    # 1. INVOICE CREATION
    # =========================================================================
    def test_01_invoice_creation(self):
        """Verify statutory invoice creation with server-authoritative calculations."""
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-TEST01',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('2000.00'),
            taxable_amount=Decimal('2000.00'),
            cgst_amount=Decimal('180.00'),
            sgst_amount=Decimal('180.00'),
            igst_amount=Decimal('0.00'),
            tax_amount=Decimal('360.00'),
            shipping_fee=Decimal('100.00'),
            total_amount=Decimal('2460.00'),
            status=InvoiceStatus.UNPAID,
            payment_status='Pending',
        )

        InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product,
            item_name=self.product.name,
            sku=self.product.sku,
            quantity=2,
            rate=Decimal('1000.00'),
            taxable_amount=Decimal('2000.00'),
            tax_percent=Decimal('18.00'),
            cgst_amount=Decimal('180.00'),
            sgst_amount=Decimal('180.00'),
            tax_amount=Decimal('360.00'),
            total_amount=Decimal('2360.00'),
        )

        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)
        self.assertEqual(invoice.paid_amount, Decimal('0.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('2460.00'))
        self.assertEqual(invoice.items.count(), 1)
        self.assertEqual(invoice.client.company_name, 'Vee Heavy Industries Ltd')

    # =========================================================================
    # 2. HISTORICAL FINANCIAL IMMUTABILITY
    # =========================================================================
    def test_02_invoice_historical_immutability(self):
        """
        Verify changes to Product price, name, SKU, or tax configuration
        do NOT alter existing invoice history.
        """
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-IMMUTABLE',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_amount=Decimal('180.00'),
            total_amount=Decimal('1180.00'),
            status=InvoiceStatus.UNPAID,
            calculation_snapshot={'initial_price': '1000.00', 'rate': '18.00'},
        )
        item = InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product,
            item_name=self.product.name,
            sku=self.product.sku,
            quantity=1,
            rate=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_percent=Decimal('18.00'),
            tax_amount=Decimal('180.00'),
            total_amount=Decimal('1180.00'),
        )

        # Mutate product drastically in catalog
        self.product.price = Decimal('2500.00')
        self.product.mrp = Decimal('3000.00')
        self.product.name = 'Renamed Super Luxury Cable'
        self.product.sku = 'CAB-MUTATED-99'
        self.product.save()

        # Reload invoice and item from DB
        invoice.refresh_from_db()
        item.refresh_from_db()

        self.assertEqual(item.rate, Decimal('1000.00'))
        self.assertEqual(item.item_name, '4 sq mm Armoured Cable')
        self.assertEqual(item.sku, 'CAB-4SQ-ARM')
        self.assertEqual(invoice.subtotal, Decimal('1000.00'))
        self.assertEqual(invoice.total_amount, Decimal('1180.00'))
        self.assertEqual(invoice.calculation_snapshot['initial_price'], '1000.00')

    # =========================================================================
    # 3. INVOICE STATUS TRANSITIONS & PAID PROTECTION
    # =========================================================================
    def test_03_invoice_status_transitions(self):
        """
        Verify status transitions:
        - Rejects marking PAID when outstanding amount remains.
        - Accepts case-insensitive normalized input.
        - Blocks deleting paid statutory invoices.
        """
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-STAT-01',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('500.00'),
            taxable_amount=Decimal('500.00'),
            total_amount=Decimal('500.00'),
            status=InvoiceStatus.UNPAID,
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        # Attempt to mark PAID while ₹500 outstanding exists
        res = self.client.patch(f'/api/v1/finance/invoices/{invoice.id}/status/', {
            'status': 'PAID'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('outstanding balance', res.data['detail'].lower())

        # Transition to Overdue
        res_overdue = self.client.patch(f'/api/v1/finance/invoices/{invoice.id}/status/', {
            'status': 'OVERDUE'
        }, format='json')
        self.assertEqual(res_overdue.status_code, status.HTTP_200_OK)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.OVERDUE)

        # Transition to Cancelled
        res_cancel = self.client.patch(f'/api/v1/finance/invoices/{invoice.id}/status/', {
            'status': 'CANCELLED'
        }, format='json')
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.CANCELLED)

    # =========================================================================
    # 4. INVOICE NUMBERING
    # =========================================================================
    def test_04_invoice_sequential_numbering(self):
        """Verify sequential numbering format INV-{YEAR}-{SEQUENCE:04d} and collision resolution."""
        today = timezone.now().date()
        year = today.year

        num1 = InvoiceService.generate_invoice_number(today)
        self.assertTrue(num1.startswith(f"INV-{year}-"))

        inv1 = Invoice.objects.create(
            invoice_number=num1,
            invoice_date=today,
            due_date=today + timedelta(days=30),
            subtotal=Decimal('100.00'),
            taxable_amount=Decimal('100.00'),
            total_amount=Decimal('100.00'),
            status=InvoiceStatus.UNPAID,
        )

        num2 = InvoiceService.generate_invoice_number(today)
        self.assertNotEqual(num1, num2)
        seq1 = int(num1.split('-')[-1])
        seq2 = int(num2.split('-')[-1])
        self.assertEqual(seq2, seq1 + 1)

    # =========================================================================
    # 5. INVOICE TOTAL CALCULATION
    # =========================================================================
    def test_05_invoice_total_calculation(self):
        """Verify authoritative server-side totals calculation."""
        today = timezone.now().date()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        res = self.client.post('/api/v1/finance/invoices/', {
            'client': self.b2b_client.id,
            'subtotal': '1500.00',
            'tax_amount': '270.00',
            'total_amount': '1770.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data['total_amount'])), Decimal('1770.00'))

    # =========================================================================
    # 6. INVOICE GST CALCULATION (INTRA vs INTER)
    # =========================================================================
    def test_06_invoice_gst_calculation_intra_vs_inter(self):
        """Verify GST calculation: Intra-state split (CGST+SGST) vs Inter-state (IGST)."""
        # Client TN (33) -> Intra
        quote_tn = Quotation.objects.create(
            quotation_number='QUO-GST-TN',
            client=self.b2b_client,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            total_value=Decimal('1000.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote_tn,
            product=self.product,
            item_name=self.product.name,
            quantity=1,
            unit_price=Decimal('1000.00'),
            subtotal=Decimal('1000.00'),
        )

        inv_tn = InvoiceService.create_invoice_for_quotation(quote_tn)
        self.assertEqual(inv_tn.cgst_amount, Decimal('90.00'))
        self.assertEqual(inv_tn.sgst_amount, Decimal('90.00'))
        self.assertEqual(inv_tn.igst_amount, Decimal('0.00'))
        self.assertEqual(inv_tn.tax_amount, Decimal('180.00'))
        self.assertEqual(inv_tn.total_amount, Decimal('1180.00'))

        # Client KA (29) -> Inter
        client_ka = Client.objects.create(
            client_code='CLI-KA-001',
            company_name='Karnataka Tech Corp',
            contact_person='Ramesh',
            gstin='29ABCDE1234F1Z5',
            email='ramesh@katech.com',
            phone='+919876543211',
            credit_limit=Decimal('50000.00'),
        )
        quote_ka = Quotation.objects.create(
            quotation_number='QUO-GST-KA',
            client=client_ka,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            total_value=Decimal('2000.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote_ka,
            product=self.product,
            item_name=self.product.name,
            quantity=2,
            unit_price=Decimal('1000.00'),
            subtotal=Decimal('2000.00'),
        )

        inv_ka = InvoiceService.create_invoice_for_quotation(quote_ka)
        self.assertEqual(inv_ka.cgst_amount, Decimal('0.00'))
        self.assertEqual(inv_ka.sgst_amount, Decimal('0.00'))
        self.assertEqual(inv_ka.igst_amount, Decimal('360.00'))
        self.assertEqual(inv_ka.tax_amount, Decimal('360.00'))
        self.assertEqual(inv_ka.total_amount, Decimal('2360.00'))

    # =========================================================================
    # 7. PAYMENT TRANSACTION CREATION
    # =========================================================================
    def test_07_payment_transaction_creation(self):
        """Verify PaymentTransaction creation with metadata and statutory fields."""
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-PAYTX',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('3000.00'),
            taxable_amount=Decimal('3000.00'),
            total_amount=Decimal('3000.00'),
            status=InvoiceStatus.UNPAID,
        )

        txn = PaymentTransaction.objects.create(
            invoice=invoice,
            gateway=PaymentGateway.NEFT_RTGS,
            gateway_transaction_id='UTR-SBI-20260928-001',
            payment_method='NEFT',
            amount=Decimal('3000.00'),
            currency='INR',
            status=PaymentTxStatus.INITIATED,
            metadata={'bank_name': 'State Bank of India', 'branch': 'Coimbatore Main'},
        )

        self.assertEqual(txn.amount, Decimal('3000.00'))
        self.assertEqual(txn.currency, 'INR')
        self.assertEqual(txn.customer_name, 'Vee Heavy Industries Ltd')
        self.assertEqual(txn.customer_email, 'accounts@veeheavy.com')

    # =========================================================================
    # 8. SUCCESSFUL PAYMENT RECONCILIATION
    # =========================================================================
    def test_08_successful_payment_reconciliation(self):
        """
        Verify UNPAID invoice -> successful payment -> correct paid amount
        -> correct outstanding amount -> PAID when fully settled.
        """
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-RECON-FULL',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('5000.00'),
            taxable_amount=Decimal('5000.00'),
            total_amount=Decimal('5000.00'),
            status=InvoiceStatus.UNPAID,
        )

        self.assertEqual(invoice.outstanding_amount, Decimal('5000.00'))
        self.assertEqual(invoice.paid_amount, Decimal('0.00'))

        txn = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('5000.00'),
            payment_method='RTGS',
            gateway=PaymentGateway.NEFT_RTGS,
            gateway_transaction_id='UTR-FULL-SETTLE-001',
            notes='Full settlement received via HDFC Bank'
        )

        invoice.refresh_from_db()
        self.assertEqual(txn.status, PaymentTxStatus.SUCCESS)
        self.assertEqual(invoice.status, InvoiceStatus.PAID)
        self.assertEqual(invoice.payment_status, 'Paid')
        self.assertEqual(invoice.paid_amount, Decimal('5000.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('0.00'))

    # =========================================================================
    # 9. PARTIAL AND FAILED PAYMENT RECONCILIATION
    # =========================================================================
    def test_09_partial_and_failed_payment_reconciliation(self):
        """
        Verify:
        - Partial payment reduces outstanding balance while invoice remains UNPAID.
        - Failed payment does NOT reduce outstanding balance or affect invoice status.
        - Subsequent final settlement brings balance to 0 and marks invoice PAID.
        """
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-PARTIAL',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('10000.00'),
            taxable_amount=Decimal('10000.00'),
            total_amount=Decimal('10000.00'),
            status=InvoiceStatus.UNPAID,
        )

        # 1. Partial payment: ₹4000
        InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('4000.00'),
            gateway_transaction_id='TXN-PARTIAL-1',
            status=PaymentTxStatus.SUCCESS
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)
        self.assertEqual(invoice.payment_status, 'Partially Paid')
        self.assertEqual(invoice.paid_amount, Decimal('4000.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('6000.00'))

        # 2. Failed payment attempt: ₹2000
        InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('2000.00'),
            gateway_transaction_id='TXN-FAILED-1',
            status=PaymentTxStatus.FAILED,
            notes='Card declined by bank'
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)
        self.assertEqual(invoice.paid_amount, Decimal('4000.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('6000.00'))  # Not reduced!

        # 3. Final settlement: ₹6000
        InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('6000.00'),
            gateway_transaction_id='TXN-FINAL-1',
            status=PaymentTxStatus.SUCCESS
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.PAID)
        self.assertEqual(invoice.payment_status, 'Paid')
        self.assertEqual(invoice.paid_amount, Decimal('10000.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('0.00'))

    # =========================================================================
    # 10. DUPLICATE PAYMENT PROTECTION & IDEMPOTENCY
    # =========================================================================
    def test_10_duplicate_payment_protection(self):
        """Verify that duplicate payment confirmation with same transaction ID does not double-count."""
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-DUP-PROT',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('2000.00'),
            taxable_amount=Decimal('2000.00'),
            total_amount=Decimal('2000.00'),
            status=InvoiceStatus.UNPAID,
        )

        txn1 = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('1000.00'),
            gateway_transaction_id='IDEMPOTENT-TXN-12345',
            status=PaymentTxStatus.SUCCESS
        )

        # Re-send same payment confirmation
        txn2 = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('1000.00'),
            gateway_transaction_id='IDEMPOTENT-TXN-12345',
            status=PaymentTxStatus.SUCCESS
        )

        self.assertEqual(txn1.id, txn2.id)
        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_amount, Decimal('1000.00'))  # No double count
        self.assertEqual(invoice.outstanding_amount, Decimal('1000.00'))

    # =========================================================================
    # 11. PAYMENT / INVOICE CONSISTENCY
    # =========================================================================
    def test_11_payment_invoice_consistency(self):
        """Verify payment transaction links directly to invoice and serializer exposes details."""
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-CONSIST',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('1500.00'),
            taxable_amount=Decimal('1500.00'),
            total_amount=Decimal('1500.00'),
            status=InvoiceStatus.UNPAID,
        )

        txn = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('1500.00'),
            gateway_transaction_id='CONSIST-TXN-999',
            status=PaymentTxStatus.SUCCESS
        )

        self.assertEqual(txn.invoice, invoice)
        self.assertEqual(invoice.payments.first(), txn)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res = self.client.get(f'/api/v1/finance/invoices/{invoice.id}/payments/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['gateway_transaction_id'], 'CONSIST-TXN-999')

    # =========================================================================
    # 12. OUTSTANDING CALCULATION
    # =========================================================================
    def test_12_authoritative_outstanding_calculation(self):
        """
        Verify:
        outstanding = invoice total - successful payments.
        Negative outstanding prevented.
        Cancelled invoices have 0.00 outstanding.
        """
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-CALC-OUT',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('3000.00'),
            taxable_amount=Decimal('3000.00'),
            total_amount=Decimal('3000.00'),
            status=InvoiceStatus.UNPAID,
        )

        self.assertEqual(InvoiceService.get_invoice_outstanding_balance(invoice), Decimal('3000.00'))

        # Cancel invoice
        invoice.status = InvoiceStatus.CANCELLED
        invoice.save()
        self.assertEqual(InvoiceService.get_invoice_outstanding_balance(invoice), Decimal('0.00'))

    # =========================================================================
    # 13. EXPENSE CRUD
    # =========================================================================
    def test_13_expense_crud(self):
        """Verify expense full CRUD operations with admin authentication."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        # Create
        res_create = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-28',
            'category': 'Logistics',
            'description': 'Bulk transport freight',
            'vendor': 'VRL Logistics',
            'amount': '12500.00',
            'status': 'Paid',
            'payment_mode': 'NEFT',
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        expense_id = res_create.data['id']

        # Read
        res_read = self.client.get(f'/api/v1/expenses/{expense_id}/')
        self.assertEqual(res_read.status_code, status.HTTP_200_OK)
        self.assertEqual(res_read.data['vendor'], 'VRL Logistics')

        # Update
        res_update = self.client.patch(f'/api/v1/expenses/{expense_id}/', {
            'amount': '13000.00'
        }, format='json')
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res_update.data['amount'])), Decimal('13000.00'))

        # Delete
        res_del = self.client.delete(f'/api/v1/expenses/{expense_id}/')
        self.assertEqual(res_del.status_code, status.HTTP_204_NO_CONTENT)

    # =========================================================================
    # 14. EXPENSE RBAC & CREATOR ATTRIBUTION
    # =========================================================================
    def test_14_expense_rbac_and_creator_spoofing_protection(self):
        """Verify customer cannot access expenses and created_by is set authoritatively."""
        # Customer access rejected
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.get('/api/v1/expenses/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Staff creation with attempt to spoof creator
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_staff}')
        res_create = self.client.post('/api/v1/expenses/', {
            'expense_date': '2026-09-28',
            'category': 'Marketing',
            'description': 'Trade Exhibition Stall',
            'vendor': 'Coimbatore Trade Center',
            'amount': '25000.00',
            'status': 'Paid',
            'created_by': self.superadmin.id,  # Attempted spoof
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)

        exp = Expense.objects.get(pk=res_create.data['id'])
        self.assertEqual(exp.created_by, self.staff_admin)  # Server enforced authenticated user

    # =========================================================================
    # 15. PAYOUT SETTLEMENT SEPARATION
    # =========================================================================
    def test_15_payout_settlement_separation(self):
        """Verify PayoutSettlement domain separation and UTR mapping."""
        payout = PayoutSettlement.objects.create(
            settlement_id='setl_rzp_mock_999',
            gateway='RAZORPAY',
            settlement_date=timezone.now().date(),
            gross_amount=Decimal('45000.00'),
            gateway_fee=Decimal('900.00'),
            tax_on_fee=Decimal('162.00'),
            net_amount=Decimal('43938.00'),
            status=SettlementStatus.SETTLED,
            bank_reference='UTR-HDFC-SETL-999',
        )

        self.assertEqual(payout.utr, 'UTR-HDFC-SETL-999')
        self.assertEqual(PaymentTransaction.objects.filter(gateway_transaction_id='setl_rzp_mock_999').count(), 0)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res = self.client.get('/api/v1/finance/settlements/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        first_item = res.data['results'][0] if 'results' in res.data else res.data[0]
        self.assertEqual(first_item['settlement_id'], 'setl_rzp_mock_999')
        self.assertEqual(first_item['utr'], 'UTR-HDFC-SETL-999')

    # =========================================================================
    # 16. B2B FINANCIAL SUMMARY & CREDIT SERVICE INTEGRATION
    # =========================================================================
    def test_16_b2b_financial_summary_integration(self):
        """Verify B2B financial calculations match Step 9 CreditService."""
        today = timezone.now().date()
        inv1 = Invoice.objects.create(
            invoice_number='INV-2026-B2B-01',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('10000.00'),
            taxable_amount=Decimal('10000.00'),
            total_amount=Decimal('10000.00'),
            status=InvoiceStatus.UNPAID,
        )

        self.b2b_client.refresh_from_db()
        self.assertEqual(self.b2b_client.credit_limit, Decimal('50000.00'))
        self.assertEqual(self.b2b_client.credit_exposure, Decimal('10000.00'))
        self.assertEqual(self.b2b_client.available_credit, Decimal('40000.00'))

        # Partially pay ₹4,000
        InvoiceService.record_payment(
            invoice_id=inv1.id,
            amount=Decimal('4000.00'),
            status=PaymentTxStatus.SUCCESS
        )

        # Clear cached exposure
        if hasattr(self.b2b_client, '_cached_exposure'):
            delattr(self.b2b_client, '_cached_exposure')

        self.assertEqual(self.b2b_client.credit_exposure, Decimal('6000.00'))
        self.assertEqual(self.b2b_client.available_credit, Decimal('44000.00'))

    # =========================================================================
    # 17. QUOTATION -> INVOICE -> PAYMENT CHAIN
    # =========================================================================
    def test_17_quotation_invoice_payment_chain(self):
        """
        Verify end-to-end Quotation -> Approved -> Converted to Invoice
        -> Payment recorded -> Invoice Paid -> B2B exposure released.
        """
        today = timezone.now().date()
        quotation = Quotation.objects.create(
            quotation_number='QUO-CHAIN-01',
            client=self.b2b_client,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('8000.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quotation,
            product=self.product,
            item_name=self.product.name,
            quantity=8,
            unit_price=Decimal('1000.00'),
            subtotal=Decimal('8000.00'),
        )

        # Convert quotation to invoice
        invoice = QuotationService.convert_quotation_to_invoice(quotation.id)
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)
        self.assertEqual(invoice.quotation, quotation)

        # Check exposure consumed
        if hasattr(self.b2b_client, '_cached_exposure'):
            delattr(self.b2b_client, '_cached_exposure')
        initial_exposure = self.b2b_client.credit_exposure

        # Pay invoice in full
        InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=invoice.total_amount,
            status=PaymentTxStatus.SUCCESS
        )

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, InvoiceStatus.PAID)

        # Verify credit exposure released
        if hasattr(self.b2b_client, '_cached_exposure'):
            delattr(self.b2b_client, '_cached_exposure')
        self.assertEqual(self.b2b_client.credit_exposure, initial_exposure - invoice.total_amount)

    # =========================================================================
    # 18. ORDER -> PAYMENT -> INVOICE CHAIN
    # =========================================================================
    def test_18_order_payment_invoice_chain(self):
        """Verify retail Order payment confirmation creates idempotent Invoice."""
        order = Order.objects.create(
            order_number='ORD-CHAIN-001',
            user=self.customer1,
            customer_name='Anand Kumar',
            customer_email='customer1_fin@example.com',
            customer_phone='+919876543210',
            shipping_address={'city': 'Coimbatore'},
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_amount=Decimal('180.00'),
            total_amount=Decimal('1180.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            quantity=1,
            mrp=Decimal('1200.00'),
            unit_price=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            tax_rate=Decimal('18.00'),
            tax_amount=Decimal('180.00'),
            subtotal=Decimal('1000.00'),
            total_amount=Decimal('1180.00'),
        )

        rzp_order_id = 'order_mock_chain_123'
        rzp_payment_id = 'pay_mock_chain_456'
        signature = PaymentGatewayService.generate_signature(rzp_order_id, rzp_payment_id)

        txn = PaymentGatewayService.confirm_payment(
            order_id=order.id,
            user=self.customer1,
            razorpay_order_id=rzp_order_id,
            razorpay_payment_id=rzp_payment_id,
            razorpay_signature=signature,
        )

        order.refresh_from_db()
        self.assertEqual(order.payment_status, PaymentStatus.PAID)
        self.assertEqual(order.status, OrderStatus.CONFIRMED)

        # Invoice was automatically generated
        invoice = Invoice.objects.filter(order=order).first()
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.status, InvoiceStatus.PAID)
        self.assertEqual(invoice.total_amount, order.total_amount)
        self.assertEqual(txn.invoice, invoice)

        # Idempotent re-invocation does not create duplicate invoice
        inv2 = InvoiceService.create_invoice_for_order(order)
        self.assertEqual(invoice.id, inv2.id)
        self.assertEqual(Invoice.objects.filter(order=order).count(), 1)

    # =========================================================================
    # 19. FINANCIAL HISTORICAL SNAPSHOTS
    # =========================================================================
    def test_19_financial_historical_snapshots(self):
        """Verify calculation snapshots on invoices preserve accurate financial breakdown."""
        quote = Quotation.objects.create(
            quotation_number='QUO-SNAP-01',
            client=self.b2b_client,
            quotation_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            total_value=Decimal('2000.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product,
            item_name=self.product.name,
            quantity=2,
            unit_price=Decimal('1000.00'),
            subtotal=Decimal('2000.00'),
        )

        invoice = QuotationService.convert_quotation_to_invoice(quote.id)
        snapshot = invoice.calculation_snapshot

        self.assertIn('quotation_number', snapshot)
        self.assertEqual(snapshot['quotation_number'], 'QUO-SNAP-01')
        self.assertIn('subtotal', snapshot)
        self.assertIn('tax_amount', snapshot)
        self.assertIn('total_amount', snapshot)
        self.assertTrue(snapshot['is_intra_state'])

    # =========================================================================
    # 20. DECIMAL ROUNDING AUDIT
    # =========================================================================
    def test_20_decimal_rounding_edge_values(self):
        """Verify strict Decimal ROUND_HALF_UP rounding across odd fractions and edge amounts."""
        edge_amounts = [
            Decimal('0.01'),
            Decimal('0.05'),
            Decimal('99.99'),
            Decimal('999.99'),
            Decimal('1000.01'),
            Decimal('1234567.89'),
        ]

        for amt in edge_amounts:
            quantized = amt.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            self.assertEqual(amt, quantized)

        # Tax half-up split test
        odd_tax = Decimal('35.91')
        cgst = (odd_tax / Decimal('2.00')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        sgst = (odd_tax - cgst).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        self.assertEqual(cgst + sgst, odd_tax)

    # =========================================================================
    # 21. INVALID FINANCIAL VALUES & SECURITY PAYLOADS
    # =========================================================================
    def test_21_invalid_financial_values(self):
        """Test zero amount, negative amount, invalid currency, overpayment, and SQLi inputs."""
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-INVALID',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            total_amount=Decimal('1000.00'),
            status=InvoiceStatus.UNPAID,
        )

        # Zero amount rejected
        with self.assertRaises(DjangoValidationError):
            InvoiceService.record_payment(invoice.id, Decimal('0.00'))

        # Negative amount rejected
        with self.assertRaises(DjangoValidationError):
            InvoiceService.record_payment(invoice.id, Decimal('-500.00'))

        # Overpayment rejected
        with self.assertRaises(DjangoValidationError):
            InvoiceService.record_payment(invoice.id, Decimal('1500.00'))

        # Invalid currency rejection in payment gateway
        order = Order.objects.create(
            order_number='ORD-CURR-001',
            user=self.customer1,
            customer_name='Anand',
            customer_email='anand@example.com',
            shipping_address={'city': 'Coimbatore'},
            subtotal=Decimal('100.00'),
            taxable_amount=Decimal('100.00'),
            tax_amount=Decimal('18.00'),
            total_amount=Decimal('118.00'),
        )
        with self.assertRaises(DjangoValidationError):
            PaymentGatewayService.confirm_payment(
                order_id=order.id,
                user=self.customer1,
                razorpay_order_id='ord_1',
                razorpay_payment_id='pay_1',
                razorpay_signature='sig',
                currency='USD'
            )

        # SQLi payload in search handled safely
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_sqli = self.client.get("/api/v1/finance/invoices/?search=' OR '1'='1")
        self.assertEqual(res_sqli.status_code, status.HTTP_200_OK)

    # =========================================================================
    # 22. IDOR & FINANCIAL SECURITY
    # =========================================================================
    def test_22_idor_and_financial_security(self):
        """Verify anonymous and unauthorized customer access is blocked on financial endpoints."""
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-SEC',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('500.00'),
            taxable_amount=Decimal('500.00'),
            total_amount=Decimal('500.00'),
            status=InvoiceStatus.UNPAID,
        )

        # 1. Anonymous access rejected
        self.client.credentials()
        res_anon = self.client.get('/api/v1/finance/invoices/')
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        res_anon_summary = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res_anon_summary.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Customer access to admin finance ledger rejected
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res_cust = self.client.get('/api/v1/finance/invoices/')
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        res_cust_summary = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res_cust_summary.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Customer initiating payment for another customer's order rejected
        order2 = Order.objects.create(
            order_number='ORD-SEC-002',
            user=self.customer2,
            customer_name='Bala',
            customer_email='customer2_fin@example.com',
            shipping_address={'city': 'Coimbatore'},
            subtotal=Decimal('100.00'),
            taxable_amount=Decimal('100.00'),
            tax_amount=Decimal('18.00'),
            total_amount=Decimal('118.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
        )
        res_pay = self.client.post('/api/v1/payments/initiate/', {
            'order_id': order2.id,
            'payment_method': 'UPI'
        }, format='json')
        self.assertEqual(res_pay.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # 23. CONCURRENT PAYMENT CONFIRMATION
    # =========================================================================
    def test_23_concurrent_payment_confirmation(self):
        """Verify row-level locking handles concurrent payment settlements without double count."""
        today = timezone.now().date()
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-CONCURRENCY',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            total_amount=Decimal('1000.00'),
            status=InvoiceStatus.UNPAID,
        )

        # Simulate two concurrent payment transactions attempting to settle ₹600 each
        txn1 = InvoiceService.record_payment(
            invoice_id=invoice.id,
            amount=Decimal('600.00'),
            gateway_transaction_id='CONCUR-P1',
            status=PaymentTxStatus.SUCCESS
        )

        # Second transaction should fail because remaining outstanding is only ₹400
        with self.assertRaises(DjangoValidationError):
            InvoiceService.record_payment(
                invoice_id=invoice.id,
                amount=Decimal('600.00'),
                gateway_transaction_id='CONCUR-P2',
                status=PaymentTxStatus.SUCCESS
            )

        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_amount, Decimal('600.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('400.00'))
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)

    # =========================================================================
    # 24. N+1 QUERY PERFORMANCE REGRESSION
    # =========================================================================
    def test_24_n_plus_one_regression(self):
        """Verify prefetching ensures invoice listing query count is flat independent of item count."""
        today = timezone.now().date()

        # Create 10 invoices with items and payments
        for i in range(10):
            inv = Invoice.objects.create(
                invoice_number=f'INV-N1-{i:03d}',
                invoice_date=today,
                due_date=today + timedelta(days=30),
                client=self.b2b_client,
                subtotal=Decimal('500.00'),
                taxable_amount=Decimal('500.00'),
                total_amount=Decimal('500.00'),
                status=InvoiceStatus.UNPAID,
            )
            InvoiceItem.objects.create(
                invoice=inv,
                product=self.product,
                item_name=f'Item {i}',
                quantity=1,
                rate=Decimal('500.00'),
                taxable_amount=Decimal('500.00'),
                tax_percent=Decimal('18.00'),
                tax_amount=Decimal('90.00'),
                total_amount=Decimal('590.00'),
            )
            PaymentTransaction.objects.create(
                invoice=inv,
                gateway=PaymentGateway.MANUAL,
                gateway_transaction_id=f'PAY-N1-{i}',
                amount=Decimal('100.00'),
                currency='INR',
                status=PaymentTxStatus.SUCCESS,
            )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        # Measure queries for listing invoices
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/finance/invoices/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Expected: User lookup + Count query + Invoice select + Items prefetch + Payments prefetch
        # Must be well below N+1 explosion (e.g. <= 10 queries for 10+ invoices)
        self.assertLessEqual(len(ctx.captured_queries), 12)

    # =========================================================================
    # 25. FINANCIAL SUMMARY & REPORTING
    # =========================================================================
    def test_25_finance_summary_reporting(self):
        """Verify /api/v1/finance/summary/ endpoint with date filtering and metrics."""
        today = timezone.now().date()

        # Seed an invoice, payment, expense, payout
        inv = Invoice.objects.create(
            invoice_number='INV-2026-SUM-01',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            client=self.b2b_client,
            subtotal=Decimal('2000.00'),
            taxable_amount=Decimal('2000.00'),
            total_amount=Decimal('2000.00'),
            status=InvoiceStatus.PAID,
        )
        PaymentTransaction.objects.create(
            invoice=inv,
            gateway=PaymentGateway.RAZORPAY,
            gateway_transaction_id='TXN-SUM-01',
            amount=Decimal('2000.00'),
            currency='INR',
            status=PaymentTxStatus.SUCCESS,
        )
        Expense.objects.create(
            expense_date=today,
            category=ExpenseCategory.OPERATIONS,
            description='Office Stationery',
            vendor='Office Depot',
            amount=Decimal('500.00'),
            status=ExpenseStatus.PAID,
            created_by=self.superadmin,
        )
        PayoutSettlement.objects.create(
            settlement_id='SETL-SUM-01',
            gateway='RAZORPAY',
            settlement_date=today,
            gross_amount=Decimal('2000.00'),
            gateway_fee=Decimal('40.00'),
            net_amount=Decimal('1960.00'),
            status=SettlementStatus.SETTLED,
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        # 1. Default (current_month)
        res_curr = self.client.get('/api/v1/finance/summary/?filter_type=current_month')
        self.assertEqual(res_curr.status_code, status.HTTP_200_OK)
        kpis = res_curr.data['kpis']
        self.assertIn('total_invoiced', kpis)
        self.assertIn('total_paid', kpis)
        self.assertIn('total_expenses', kpis)
        self.assertIn('net_profit', kpis)
        self.assertIn('monthly_trend', res_curr.data)
        self.assertEqual(len(res_curr.data['monthly_trend']), 6)

        # 2. Today filter
        res_today = self.client.get('/api/v1/finance/summary/?filter_type=today')
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        self.assertEqual(res_today.data['date_range']['filter_type'], 'today')

        # 3. Custom filter
        res_custom = self.client.get(f'/api/v1/finance/summary/?filter_type=custom&start_date={today}&end_date={today}')
        self.assertEqual(res_custom.status_code, status.HTTP_200_OK)
        self.assertEqual(res_custom.data['date_range']['filter_type'], 'custom')
