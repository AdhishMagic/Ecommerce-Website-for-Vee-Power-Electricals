import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.orders.models import Order, OrderItem, OrderStatus, OrderStatusHistory, PaymentStatus
from apps.products.models import Brand, Category, Product, Subcategory
from apps.users.models import UserRole

User = get_user_model()
OPERATIONAL_SUMMARY_URL = '/api/v1/orders/operational-summary/'


class OrderLifecycleMetricsTests(TestCase):
    """
    Tests the authoritative operational metrics lifecycle on the Admin Dashboard:
    - Verifies zero initial baseline when no orders exist.
    - Verifies that new orders increment open and pending counts.
    - Verifies that order transitions (CONFIRMED, PACKED, SHIPPED, DELIVERED) update metrics.
    - Verifies that cancelled orders do not count as open or in transit.
    - Verifies that return statuses increment returns_count.
    - Verifies strict admin RBAC.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email='lifecycle_admin@veepower.in',
            first_name='Ops',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.customer = User.objects.create_user(
            email='lifecycle_customer@example.com',
            first_name='Ops',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )
        self.token_admin = str(AccessToken.for_user(self.admin))
        self.token_customer = str(AccessToken.for_user(self.customer))

        self.category = Category.objects.create(name='Wires', slug='wires-test')
        self.brand = Brand.objects.create(name='Polycab', slug='polycab-test')
        self.product = Product.objects.create(
            name='Test 2.5sqmm Wire',
            slug='test-wire',
            sku='TEST-WIR-001',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('1200.00'),
            price=Decimal('1000.00'),
            stock=50,
            active=True,
        )

    def auth_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

    def auth_customer(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

    def test_zero_baseline_when_no_orders_exist(self):
        self.auth_admin()
        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_orders_count'], 0)
        self.assertEqual(res.data['open_orders_count'], 0)
        self.assertEqual(res.data['confirmed_orders_count'], 0)
        self.assertEqual(res.data['out_for_delivery_count'], 0)
        self.assertEqual(res.data['returns_count'], 0)
        self.assertEqual(res.data['pending_orders_count'], 0)
        self.assertEqual(res.data['packed_orders_count'], 0)
        self.assertEqual(res.data['delivered_orders_count'], 0)
        self.assertEqual(res.data['cancelled_orders_count'], 0)

    def test_order_creation_and_status_progression(self):
        self.auth_admin()

        # Step 1: Create a PENDING order
        order = Order.objects.create(
            order_number='ORD-TEST-001',
            user=self.customer,
            customer_name='Ops Customer',
            customer_email=self.customer.email,
            customer_phone='+919876500000',
            subtotal=Decimal('1000.00'),
            taxable_amount=Decimal('1000.00'),
            total_amount=Decimal('1180.00'),
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=self.product.price,
            quantity=1,
            taxable_amount=Decimal('1000.00'),
            subtotal=Decimal('1000.00'),
            total_amount=Decimal('1180.00'),
        )

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['total_orders_count'], 1)
        self.assertEqual(res.data['open_orders_count'], 1)
        self.assertEqual(res.data['pending_orders_count'], 1)
        self.assertEqual(res.data['confirmed_orders_count'], 0)
        self.assertEqual(res.data['out_for_delivery_count'], 0)

        # Step 2: Transition to CONFIRMED
        order.status = OrderStatus.CONFIRMED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['total_orders_count'], 1)
        self.assertEqual(res.data['open_orders_count'], 1)
        self.assertEqual(res.data['pending_orders_count'], 0)
        self.assertEqual(res.data['confirmed_orders_count'], 1)
        self.assertEqual(res.data['out_for_delivery_count'], 0)

        # Step 3: Transition to PACKED
        order.status = OrderStatus.PACKED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['open_orders_count'], 1)
        self.assertEqual(res.data['confirmed_orders_count'], 0)
        self.assertEqual(res.data['packed_orders_count'], 1)
        self.assertEqual(res.data['out_for_delivery_count'], 0)

        # Step 4: Transition to SHIPPED (in transit with courier)
        order.status = OrderStatus.SHIPPED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['open_orders_count'], 0, "Shipped orders leave open orders pool")
        self.assertEqual(res.data['packed_orders_count'], 0)
        self.assertEqual(res.data['out_for_delivery_count'], 1, "Shipped order is out for delivery")

        # Step 5: Transition to DELIVERED
        order.status = OrderStatus.DELIVERED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['out_for_delivery_count'], 0, "Delivered orders leave out for delivery")
        self.assertEqual(res.data['delivered_orders_count'], 1)
        self.assertEqual(res.data['open_orders_count'], 0)

        # Step 6: Return Requested
        order.status = OrderStatus.RETURN_REQUESTED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['returns_count'], 1, "RETURN_REQUESTED increments returns_count")

        # Step 7: Return Approved
        order.status = OrderStatus.RETURN_APPROVED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['returns_count'], 1, "RETURN_APPROVED increments returns_count")

        # Step 8: Return Completed
        order.status = OrderStatus.RETURN_COMPLETED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['returns_count'], 1, "RETURN_COMPLETED increments returns_count")

        # Step 9: Return Rejected is excluded from active returns
        order.status = OrderStatus.RETURN_REJECTED
        order.save(update_fields=['status'])

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['returns_count'], 0, "RETURN_REJECTED excluded from active returns count")

    def test_cancellation_excludes_order_from_open_and_delivery_metrics(self):
        self.auth_admin()

        order = Order.objects.create(
            order_number='ORD-CANCEL-001',
            user=self.customer,
            customer_name='Cancel Buyer',
            customer_email=self.customer.email,
            customer_phone='+919876500000',
            subtotal=Decimal('500.00'),
            taxable_amount=Decimal('500.00'),
            total_amount=Decimal('590.00'),
            status=OrderStatus.CANCELLED,
            payment_status=PaymentStatus.REFUNDED,
        )

        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.data['total_orders_count'], 1)
        self.assertEqual(res.data['cancelled_orders_count'], 1)
        self.assertEqual(res.data['open_orders_count'], 0)
        self.assertEqual(res.data['out_for_delivery_count'], 0)
        self.assertEqual(res.data['returns_count'], 0)

    def test_permissions_enforced(self):
        # 1. Anonymous rejected
        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Customer rejected
        self.auth_customer()
        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin accepted
        self.auth_admin()
        res = self.client.get(OPERATIONAL_SUMMARY_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
