import datetime
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import (
    Category,
    Subcategory,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
)
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus

User = get_user_model()


class Phase7PerformanceBaselineTestCase(TestCase):
    """
    Performance Baseline, Query Profiling (N+1 avoidance), and Pagination Execution tests (Phase 7).
    """

    def setUp(self):
        self.client = APIClient()

        self.customer = User.objects.create_user(
            email='c_perf@example.com',
            password='Password123!',
            first_name='Perf',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )
        self.token_customer = str(AccessToken.for_user(self.customer))

        self.category = Category.objects.create(name='Perf Cables', slug='perf-cables', is_active=True)
        self.subcategory = Subcategory.objects.create(category=self.category, name='Perf Sub', slug='perf-sub', is_active=True)
        self.brand = Brand.objects.create(name='Perf Brand', slug='perf-brand', is_active=True)

        # Create 15 products with images and specifications to test N+1 avoidance
        self.products = []
        for i in range(15):
            p = Product.objects.create(
                name=f'Performance Cable #{i+1}',
                slug=f'perf-cable-{i+1}',
                sku=f'PERF-SKU-{i+1:03d}',
                category=self.category,
                subcategory=self.subcategory,
                brand=self.brand,
                mrp=Decimal('500.00'),
                price=Decimal('420.00'),
                stock=50,
                active=True,
            )
            ProductImage.objects.create(
                product=p,
                image_url=f'https://example.com/img_{i+1}.jpg',
                is_primary=True,
                sort_order=1,
            )
            ProductSpecification.objects.create(
                product=p,
                spec_key='Voltage',
                spec_value='1100V',
                sort_order=1,
            )
            self.products.append(p)

        # Create 5 orders for the customer
        for i in range(5):
            Order.objects.create(
                order_number=f'ORD-PERF-{i+1:03d}',
                user=self.customer,
                customer_name='Perf Customer',
                customer_email='c_perf@example.com',
                customer_phone='+919876543210',
                shipping_address={'recipient_name': 'Perf Customer', 'city': 'Coimbatore'},
                status=OrderStatus.PENDING,
                payment_status=PaymentStatus.PENDING,
                subtotal=Decimal('420.00'),
                taxable_amount=Decimal('420.00'),
                total_amount=Decimal('495.60'),
            )

    # -------------------------------------------------------------
    # 1. Product Catalog Query Profiling (N+1 Prevention)
    # -------------------------------------------------------------
    def test_product_list_query_count_is_bounded(self):
        """
        Listing 15 products with categories, brands, images, and specs executes <= 6 queries.
        Demonstrates select_related and prefetch_related efficiency (no N+1 queries).
        """
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/catalog/products/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Expected queries:
        # 1. COUNT(*) for pagination
        # 2. SELECT products with JOIN category, subcategory, brand (select_related)
        # 3. SELECT images for products (prefetch_related)
        # 4. SELECT specifications for products (prefetch_related)
        # Bounded at <= 6 queries total for all 15 products
        self.assertLessEqual(
            len(ctx.captured_queries),
            6,
            f"Expected <= 6 queries for product listing, but executed {len(ctx.captured_queries)} queries.",
        )

    def test_product_detail_query_count_is_bounded(self):
        """
        Retrieving single product detail with images and specifications executes <= 5 queries.
        """
        product_id = self.products[0].id
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(f'/api/v1/catalog/products/{product_id}/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertLessEqual(
            len(ctx.captured_queries),
            5,
            f"Expected <= 5 queries for product detail, but executed {len(ctx.captured_queries)} queries.",
        )

    def test_category_list_query_count(self):
        """Category listing endpoint executes minimal queries (<= 3)."""
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/catalog/categories/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertLessEqual(
            len(ctx.captured_queries),
            3,
            f"Expected <= 3 queries for category listing, but executed {len(ctx.captured_queries)} queries.",
        )

    # -------------------------------------------------------------
    # 2. Customer Orders Query Profiling
    # -------------------------------------------------------------
    def test_customer_my_orders_query_count_is_bounded(self):
        """Listing customer orders executes <= 4 queries for pagination and records."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/orders/my-orders/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Expected queries in Phase 5 baseline:
        # 1. User auth lookup
        # 2. COUNT(*) pagination
        # 3. SELECT orders (LIMIT)
        # 4..N. SELECT COUNT(*) on order_items per order (source='items.count')
        # Bounded at <= 10 queries for 5 orders
        self.assertLessEqual(
            len(ctx.captured_queries),
            10,
            f"Expected <= 10 queries for my-orders, but executed {len(ctx.captured_queries)} queries.",
        )

    def test_order_list_items_count_n_plus_one_avoidance(self):
        """
        Phase 9 Optimization: Order listing annotates items_count in single query,
        preventing N+1 queries when serializing order items count.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/orders/my-orders/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 3 queries total: user auth, count(*), select orders with annotated items_count
        self.assertLessEqual(len(ctx.captured_queries), 4)
        for order_data in res.data['results']:
            self.assertIn('items_count', order_data)
            self.assertIsInstance(order_data['items_count'], int)

    # -------------------------------------------------------------
    # 3. Pagination SQL Verification
    # -------------------------------------------------------------
    def test_pagination_executes_limit_offset(self):
        """Pagination generates LIMIT/OFFSET queries rather than unconstrained scans."""
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/catalog/products/?page=1&page_size=5')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        queries_sql = " ".join([q['sql'].upper() for q in ctx.captured_queries])
        self.assertIn('LIMIT', queries_sql)


class Step17PerformanceOptimizationTestCase(TestCase):
    """
    STEP 17 — query-count regression guards for the endpoints optimized in the
    production performance pass. Each endpoint is asserted to execute a bounded
    (constant) number of queries regardless of how many related rows exist, so
    an N+1 regression fails the suite instead of silently reappearing.
    """

    def setUp(self):
        from apps.finance.models import (
            Client,
            Invoice,
            InvoiceItem,
            PaymentTransaction,
            PaymentTxStatus,
        )

        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='step17_admin@example.com',
            password='Password123!',
            first_name='Step17',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.token_admin = str(AccessToken.for_user(self.admin))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        self.b2b = Client.objects.create(
            client_code='B2B17',
            company_name='Step17 Industries',
            contact_person='Perf Contact',
            gstin='33ABCDE1234F1Z5',
            email='b2b17@example.com',
            phone='+919000000000',
            credit_limit=Decimal('100000.00'),
        )

        # 12 invoices, each with a line item and a successful payment.
        # Without select_related/prefetch_related the serializers issue one
        # extra query per row for the client name and for the paid amount.
        self.invoice_count = 12
        for i in range(self.invoice_count):
            inv = Invoice.objects.create(
                invoice_number=f'INV-17-{i:04d}',
                invoice_date=datetime.date(2026, 1, 1),
                due_date=datetime.date(2026, 1, 31),
                client=self.b2b,
                subtotal=Decimal('1000.00'),
                taxable_amount=Decimal('1000.00'),
                total_amount=Decimal('1000.00'),
            )
            InvoiceItem.objects.create(
                invoice=inv,
                item_name='Step17 Item',
                quantity=1,
                rate=Decimal('1000.00'),
                taxable_amount=Decimal('1000.00'),
                total_amount=Decimal('1000.00'),
            )
            PaymentTransaction.objects.create(
                invoice=inv,
                gateway='MANUAL',
                amount=Decimal('100.00'),
                status=PaymentTxStatus.SUCCESS,
            )

    def test_client_invoices_query_count_is_bounded(self):
        """
        The per-client invoice drill-down must not issue one query per invoice
        for the client name or the outstanding balance.
        """
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(f'/api/v1/finance/clients/{self.b2b.id}/invoices/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertLessEqual(
            len(ctx.captured_queries),
            12,
            f"Expected a bounded query count for {self.invoice_count} invoices, "
            f"executed {len(ctx.captured_queries)}.",
        )

    def test_client_invoices_query_count_is_constant_as_rows_grow(self):
        """
        Doubling the invoice count must not double the query count — the
        strongest possible guard against an N+1 regression on this endpoint.
        """
        from apps.finance.models import Invoice

        def measure():
            with CaptureQueriesContext(connection) as ctx:
                res = self.client.get(f'/api/v1/finance/clients/{self.b2b.id}/invoices/')
                self.assertEqual(res.status_code, status.HTTP_200_OK)
                return len(ctx.captured_queries)

        baseline = measure()
        for i in range(self.invoice_count, self.invoice_count * 2):
            Invoice.objects.create(
                invoice_number=f'INV-17-{i:04d}',
                invoice_date=datetime.date(2026, 1, 1),
                due_date=datetime.date(2026, 1, 31),
                client=self.b2b,
                subtotal=Decimal('1000.00'),
                taxable_amount=Decimal('1000.00'),
                total_amount=Decimal('1000.00'),
            )
        grown = measure()

        self.assertLessEqual(
            grown,
            baseline + 2,
            f"Query count grew from {baseline} to {grown} when invoices doubled — N+1 regression.",
        )

    def test_config_audit_logs_endpoint_is_available(self):
        """
        The configuration audit log endpoint previously failed with a 500
        because the serializer declared read_only_fields as a string. It must
        now serialize successfully with a bounded query count.
        """
        from apps.core.models import AdminConfigAuditLog, AuditActionType

        for i in range(8):
            AdminConfigAuditLog.objects.create(
                admin_user=self.admin,
                domain='client',
                record_id=i + 1,
                action_type=AuditActionType.UPDATE,
                old_value={'v': i},
                new_value={'v': i + 1},
                change_reason=f'step17 audit {i}',
            )

        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/config/audit-logs/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertLessEqual(len(ctx.captured_queries), 8)

    def test_finance_summary_is_available_and_bounded(self):
        """Finance summary keeps returning its authoritative payload."""
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get('/api/v1/finance/summary/')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.assertIn('kpis', res.data)
        self.assertIn('total_outstanding', res.data['kpis'])
        self.assertIn('b2b_outstanding', res.data['kpis'])
        self.assertIn('monthly_trend', res.data)
        self.assertLessEqual(len(ctx.captured_queries), 32)
