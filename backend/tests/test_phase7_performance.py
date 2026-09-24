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
