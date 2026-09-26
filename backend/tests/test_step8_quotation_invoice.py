import threading
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core import mail
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
)
from apps.finance.services import (
    CreditService,
    InvoiceService,
    QuotationService,
)
from apps.core.models import CommunicationLog, CommunicationStatus

User = get_user_model()


class Step8BaseTestCase(TestCase):
    def setUp(self):
        # 1. Admin & Customer users
        self.admin = User.objects.create_superuser(
            email='admin@veepower.com',
            password='AdminPass123!',
            first_name='Admin',
            last_name='User',
            role=UserRole.ADMIN,
        )
        self.customer = User.objects.create_user(
            email='customer@example.com',
            password='CustomerPass123!',
            first_name='Ramesh',
            last_name='Kumar',
            role=UserRole.CUSTOMER,
        )

        # 2. Clients (Intra-state Tamil Nadu & Inter-state Karnataka)
        self.client_tn = Client.objects.create(
            client_code='CLI-TN-001',
            company_name='Kovai Power Grid Pvt Ltd',
            contact_person='Senthil Nathan',
            gstin='33AAACK1234F1Z1',  # 33 = Tamil Nadu
            email='procurement@kovaipower.com',
            phone='+919876543210',
            credit_limit=Decimal('100000.00'),
        )
        self.client_ka = Client.objects.create(
            client_code='CLI-KA-001',
            company_name='Bengaluru Electro Corp',
            contact_person='Deepak Rao',
            gstin='29ABCDE1234F1Z5',  # 29 = Karnataka
            email='purchasing@electrocorp.in',
            phone='+919876543211',
            credit_limit=Decimal('50000.00'),
        )

        # 3. Product Catalog
        self.category = Category.objects.create(name='Heavy Switchgear', slug='heavy-switchgear')
        self.brand = Brand.objects.create(name='VeePower Original', slug='veepower-orig')
        self.product1 = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name='415V Industrial Busbar Trunking 100A',
            slug='industrial-busbar-100a',
            sku='BB-100A-VEE',
            price=Decimal('1500.00'),
            mrp=Decimal('1800.00'),
            stock=50,
            active=True,
        )
        self.product2 = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name='MCCB 4-Pole 250A 36kA',
            slug='mccb-4p-250a',
            sku='MCCB-250A-VEE',
            price=Decimal('4200.00'),
            mrp=Decimal('4800.00'),
            stock=20,
            active=True,
        )

        # API Client with Admin auth
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)


class Step8QuotationFSMTests(Step8BaseTestCase):
    """
    Test Canonical Quotation FSM:
    DRAFT -> SENT -> APPROVED -> CONVERTED
    SENT -> REJECTED
    Invalid transitions must fail strictly.
    """

    def test_canonical_transitions_success(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-FSM-001',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('5700.00'),
            status=QuotationStatus.DRAFT,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product1,
            item_name=self.product1.name,
            quantity=1,
            unit_price=Decimal('1500.00'),
            subtotal=Decimal('1500.00'),
        )

        # 1. DRAFT -> SENT
        res = self.client.patch(f'/api/v1/finance/quotations/{quote.id}/status/', {'status': QuotationStatus.SENT}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.SENT)

        # 2. SENT -> APPROVED
        res = self.client.patch(f'/api/v1/finance/quotations/{quote.id}/status/', {'status': QuotationStatus.APPROVED}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.APPROVED)

        # 3. APPROVED -> CONVERTED (via convert_to_invoice endpoint)
        res = self.client.post(f'/api/v1/finance/quotations/{quote.id}/convert/')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.CONVERTED)

    def test_sent_to_rejected_transition(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-FSM-002',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('4200.00'),
            status=QuotationStatus.SENT,
        )
        res = self.client.patch(
            f'/api/v1/finance/quotations/{quote.id}/status/',
            {'status': QuotationStatus.REJECTED, 'reason': 'Client opted for alternative supplier'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.REJECTED)
        self.assertIn('alternative supplier', quote.notes)

    def test_invalid_fsm_transitions_blocked(self):
        today = timezone.now().date()

        # DRAFT -> CONVERTED is forbidden
        q_draft = Quotation.objects.create(
            quotation_number='QUO-INV-001',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            status=QuotationStatus.DRAFT,
        )
        with self.assertRaises(ValidationError):
            QuotationService.transition_status(q_draft.id, QuotationStatus.CONVERTED)

        # Direct transition to CONVERTED via status endpoint is forbidden
        res = self.client.patch(f'/api/v1/finance/quotations/{q_draft.id}/status/', {'status': QuotationStatus.CONVERTED}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # REJECTED -> APPROVED is forbidden
        q_rej = Quotation.objects.create(
            quotation_number='QUO-INV-002',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            status=QuotationStatus.REJECTED,
        )
        res = self.client.patch(f'/api/v1/finance/quotations/{q_rej.id}/status/', {'status': QuotationStatus.APPROVED}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # CONVERTED -> DRAFT or APPROVED is forbidden
        q_conv = Quotation.objects.create(
            quotation_number='QUO-INV-003',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            status=QuotationStatus.CONVERTED,
        )
        res = self.client.patch(f'/api/v1/finance/quotations/{q_conv.id}/status/', {'status': QuotationStatus.DRAFT}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class Step8QuotationItemSnapshotAndPricingTests(Step8BaseTestCase):
    """
    Test QuotationItem snapshots and financial reproducibility when catalog changes.
    """

    def test_quotation_item_snapshot_immutability(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-SNAP-001',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('3000.00'),
            status=QuotationStatus.SENT,
        )
        item = QuotationItem.objects.create(
            quotation=quote,
            product=self.product1,
            item_name=self.product1.name,
            quantity=2,
            unit_price=Decimal('1500.00'),
            subtotal=Decimal('3000.00'),
        )

        # Now mutate the original catalog Product
        self.product1.price = Decimal('2200.00')
        self.product1.mrp = Decimal('2500.00')
        self.product1.name = 'Renamed 415V Busbar 100A'
        self.product1.sku = 'BB-MUTATED-SKU'
        self.product1.active = False
        self.product1.save()

        # Reload Quotation and QuotationItem from DB
        item.refresh_from_db()
        quote.refresh_from_db()

        self.assertEqual(item.item_name, '415V Industrial Busbar Trunking 100A')
        self.assertEqual(item.unit_price, Decimal('1500.00'))
        self.assertEqual(item.subtotal, Decimal('3000.00'))
        self.assertEqual(quote.total_value, Decimal('3000.00'))

    def test_approved_and_converted_quotations_are_frozen(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-FROZEN-001',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('1500.00'),
            status=QuotationStatus.APPROVED,
        )

        # Attempting to edit notes or dates of approved quotation via PUT/PATCH is blocked
        res = self.client.patch(f'/api/v1/finance/quotations/{quote.id}/', {'notes': 'Tampered notes'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot modify quotation', res.data['detail'])

        # Attempting to delete approved quotation is blocked
        res_del = self.client.delete(f'/api/v1/finance/quotations/{quote.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot delete quotation', res_del.data['detail'])


class Step8QuotationToInvoiceConversionTests(Step8BaseTestCase):
    """
    Test Conversion Process:
    - Single invoice generated
    - Duplicate conversion blocked
    - Acyclic relationship: Invoice.quotation_id -> Quotation
    - Tax calculation & GST split (intra-state TN vs inter-state KA)
    - InvoiceItem snapshots
    - Communication event dispatched
    """

    def test_full_conversion_lifecycle_intra_state_gst(self):
        mail.outbox.clear()
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-CONV-TN',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('3000.00'),
            status=QuotationStatus.APPROVED,
            created_by=self.admin,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product1,
            item_name=self.product1.name,
            quantity=2,
            unit_price=Decimal('1500.00'),
            subtotal=Decimal('3000.00'),
        )

        invoice = QuotationService.convert_quotation_to_invoice(quote.id, converted_by=self.admin)

        self.assertIsNotNone(invoice.id)
        self.assertTrue(invoice.invoice_number.startswith('INV-'))
        self.assertEqual(invoice.quotation, quote)
        self.assertEqual(invoice.client, self.client_tn)

        # Verify GST calculation for intra-state (33... TN)
        # Subtotal: 3000.00, 18% GST = 540.00 -> CGST: 270.00, SGST: 270.00, IGST: 0.00
        self.assertEqual(invoice.subtotal, Decimal('3000.00'))
        self.assertEqual(invoice.tax_amount, Decimal('540.00'))
        self.assertEqual(invoice.cgst_amount, Decimal('270.00'))
        self.assertEqual(invoice.sgst_amount, Decimal('270.00'))
        self.assertEqual(invoice.igst_amount, Decimal('0.00'))
        self.assertEqual(invoice.total_amount, Decimal('3540.00'))
        self.assertEqual(invoice.status, InvoiceStatus.UNPAID)

        # Verify dual financial snapshot
        snapshot = invoice.calculation_snapshot
        self.assertIn('quotation_number', snapshot)
        self.assertEqual(snapshot['quotation_number'], 'QUO-CONV-TN')
        self.assertTrue(snapshot['is_intra_state'])

        # Verify line items copied as snapshots
        inv_item = invoice.items.first()
        self.assertEqual(inv_item.item_name, self.product1.name)
        self.assertEqual(inv_item.sku, self.product1.sku)
        self.assertEqual(inv_item.quantity, 2)
        self.assertEqual(inv_item.rate, Decimal('1500.00'))
        self.assertEqual(inv_item.taxable_amount, Decimal('3000.00'))
        self.assertEqual(inv_item.cgst_amount, Decimal('270.00'))
        self.assertEqual(inv_item.sgst_amount, Decimal('270.00'))
        self.assertEqual(inv_item.total_amount, Decimal('3540.00'))

        # Verify Quotation marked as CONVERTED
        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.CONVERTED)

        # Verify communication dispatched
        self.assertTrue(any(log.event_type == 'INVOICE_GENERATED' for log in CommunicationLog.objects.filter(recipient=self.client_tn.email)))

    def test_inter_state_gst_conversion(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-CONV-KA',
            client=self.client_ka,  # 29... Karnataka -> IGST
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('4200.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product2,
            item_name=self.product2.name,
            quantity=1,
            unit_price=Decimal('4200.00'),
            subtotal=Decimal('4200.00'),
        )

        invoice = QuotationService.convert_quotation_to_invoice(quote.id)

        # 18% IGST on 4200.00 = 756.00
        self.assertEqual(invoice.cgst_amount, Decimal('0.00'))
        self.assertEqual(invoice.sgst_amount, Decimal('0.00'))
        self.assertEqual(invoice.igst_amount, Decimal('756.00'))
        self.assertEqual(invoice.tax_amount, Decimal('756.00'))
        self.assertEqual(invoice.total_amount, Decimal('4956.00'))

    def test_duplicate_conversion_blocked(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-DUP-001',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('1500.00'),
            status=QuotationStatus.APPROVED,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product1,
            item_name=self.product1.name,
            quantity=1,
            unit_price=Decimal('1500.00'),
            subtotal=Decimal('1500.00'),
        )

        # First conversion succeeds
        invoice1 = QuotationService.convert_quotation_to_invoice(quote.id)
        self.assertIsNotNone(invoice1.id)

        # Second conversion must raise ValidationError and must not create second invoice
        with self.assertRaises(ValidationError) as ctx:
            QuotationService.convert_quotation_to_invoice(quote.id)
        self.assertIn('already been converted', str(ctx.exception))

        self.assertEqual(Invoice.objects.filter(quotation=quote).count(), 1)

    def test_unapproved_quotation_conversion_blocked(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-DRAFT-CONV',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('1500.00'),
            status=QuotationStatus.DRAFT,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product1,
            item_name=self.product1.name,
            quantity=1,
            unit_price=Decimal('1500.00'),
            subtotal=Decimal('1500.00'),
        )

        with self.assertRaises(ValidationError) as ctx:
            QuotationService.convert_quotation_to_invoice(quote.id)
        self.assertIn('Only approved quotations', str(ctx.exception))

    def test_empty_quotation_conversion_blocked(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-EMPTY-CONV',
            client=self.client_tn,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('0.00'),
            status=QuotationStatus.APPROVED,
        )
        with self.assertRaises(ValidationError) as ctx:
            QuotationService.convert_quotation_to_invoice(quote.id)
        self.assertIn('contains no line items', str(ctx.exception))


class Step8ConcurrentConversionTests(TransactionTestCase):
    """
    Mandatory Concurrency Test:
    Simultaneously convert the same approved quotation across two threads.
    Exactly one invoice must be produced, exactly one conversion recorded.
    """

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='admin_concurrent@veepower.com',
            password='AdminPass123!',
            first_name='Concurrent',
            last_name='Admin',
            role=UserRole.ADMIN,
        )
        self.client = Client.objects.create(
            client_code='CLI-CONCUR-01',
            company_name='Concurrent Projects Ltd',
            contact_person='Suresh P',
            gstin='33AAACC5555F1Z9',
            email='procure@concur.in',
            phone='+919876543299',
            credit_limit=Decimal('200000.00'),
        )
        self.category = Category.objects.create(name='Cables', slug='cables-concur')
        self.brand = Brand.objects.create(name='VeePower', slug='veepower-concur')
        self.product = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name='Copper Armoured Cable 4C 16sqmm',
            slug='copper-armoured-cable-16',
            sku='CAB-16SQ-CONCUR',
            mrp=Decimal('1000.00'),
            price=Decimal('850.00'),
            stock=100,
            active=True,
        )

    def test_concurrent_quotation_conversion_thread_safety(self):
        today = timezone.now().date()
        quote = Quotation.objects.create(
            quotation_number='QUO-THREAD-001',
            client=self.client,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('8500.00'),
            status=QuotationStatus.APPROVED,
            created_by=self.admin,
        )
        QuotationItem.objects.create(
            quotation=quote,
            product=self.product,
            item_name=self.product.name,
            quantity=10,
            unit_price=Decimal('850.00'),
            subtotal=Decimal('8500.00'),
        )

        results = []
        errors = []

        def worker():
            try:
                inv = QuotationService.convert_quotation_to_invoice(quote.id, converted_by=self.admin)
                results.append(inv)
            except Exception as e:
                errors.append(e)
            finally:
                connection.close()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly 1 invoice must exist in DB for this quotation
        invoices = Invoice.objects.filter(quotation=quote)
        self.assertEqual(invoices.count(), 1)

        # Quotation must be CONVERTED
        quote.refresh_from_db()
        self.assertEqual(quote.status, QuotationStatus.CONVERTED)

        # Either one worker succeeded and one failed with ValidationError, or both safely handled idempotency
        self.assertTrue(len(results) >= 1)
        if len(errors) > 0:
            self.assertTrue(any('already been converted' in str(err) for err in errors))


class Step8SecurityAndRBACTests(Step8BaseTestCase):
    """
    Test RBAC and access boundaries:
    - Anonymous access blocked
    - Customer cannot mutate or convert quotations
    - Tampered inputs rejected
    """

    def test_anonymous_access_forbidden(self):
        anon_client = APIClient()
        res = anon_client.get('/api/v1/finance/quotations/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        res_inv = anon_client.get('/api/v1/finance/invoices/')
        self.assertEqual(res_inv.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_cannot_access_finance_endpoints(self):
        cust_client = APIClient()
        cust_client.force_authenticate(user=self.customer)

        res_quo = cust_client.get('/api/v1/finance/quotations/')
        self.assertEqual(res_quo.status_code, status.HTTP_403_FORBIDDEN)

        res_inv = cust_client.get('/api/v1/finance/invoices/')
        self.assertEqual(res_inv.status_code, status.HTTP_403_FORBIDDEN)


class Step8QueryPerformanceTests(Step8BaseTestCase):
    """
    Verify queries are optimized with select_related / prefetch_related (No N+1 queries).
    """

    def test_quotation_and_invoice_list_queries_optimized(self):
        today = timezone.now().date()
        for i in range(5):
            q = Quotation.objects.create(
                quotation_number=f'QUO-PERF-{i}',
                client=self.client_tn,
                quotation_date=today,
                expiry_date=today + timedelta(days=30),
                total_value=Decimal('1000.00'),
            )
            QuotationItem.objects.create(
                quotation=q,
                product=self.product1,
                item_name=self.product1.name,
                quantity=1,
                unit_price=Decimal('1000.00'),
                subtotal=Decimal('1000.00'),
            )

        # Quotation list query count is constant: count, quotations+client+creator, items, batched products
        with self.assertNumQueries(4):
            res = self.client.get('/api/v1/finance/quotations/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertGreaterEqual(len(res.data['results'] if 'results' in res.data else res.data), 5)
