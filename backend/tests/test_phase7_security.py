from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import Category, Subcategory, Brand, Product
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.finance.models import Client, Quotation, Invoice
from apps.commercial_config.models import CompanyStoreConfiguration, TaxConfiguration, DeliveryConfiguration

User = get_user_model()


class Phase7SecurityHardeningTestCase(TestCase):
    """
    Security Hardening, Authorization, and Cross-Customer Isolation tests (Phase 7).
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer1 = User.objects.create_user(
            email='c1_sec@example.com',
            password='Password123!',
            first_name='Customer',
            last_name='One',
            role=UserRole.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email='c2_sec@example.com',
            password='Password123!',
            first_name='Customer',
            last_name='Two',
            role=UserRole.CUSTOMER,
        )
        self.staff_user = User.objects.create_user(
            email='staff_sec@example.com',
            password='Password123!',
            first_name='Staff',
            last_name='Member',
            role=UserRole.CUSTOMER,
            is_staff=True,
        )
        self.admin = User.objects.create_user(
            email='admin_sec@example.com',
            password='Password123!',
            first_name='Admin',
            last_name='Super',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_c1 = str(AccessToken.for_user(self.customer1))
        self.token_c2 = str(AccessToken.for_user(self.customer2))
        self.token_staff = str(AccessToken.for_user(self.staff_user))
        self.token_admin = str(AccessToken.for_user(self.admin))

        # Catalog setup
        self.category = Category.objects.create(name='Security Cables', slug='sec-cables', is_active=True)
        self.brand = Brand.objects.create(name='SecBrand', slug='sec-brand', is_active=True)
        self.product = Product.objects.create(
            name='Industrial Cable 10m',
            slug='industrial-cable-10m',
            sku='SEC-SKU-001',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('500.00'),
            price=Decimal('400.00'),
            stock=50,
            active=True,
        )

        # Addresses
        self.addr_c1 = CustomerAddress.objects.create(
            user=self.customer1,
            recipient_name='Customer One',
            phone='+919876543210',
            address_line1='101 North Street',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641001',
            address_type=AddressType.HOME,
            is_default=True,
        )
        self.addr_c2 = CustomerAddress.objects.create(
            user=self.customer2,
            recipient_name='Customer Two',
            phone='+919876543211',
            address_line1='202 South Street',
            city='Chennai',
            state='Tamil Nadu',
            pincode='600001',
            address_type=AddressType.HOME,
            is_default=True,
        )

        # Order for Customer 2
        self.order_c2 = Order.objects.create(
            order_number='ORD-SEC-002',
            user=self.customer2,
            customer_name='Customer Two',
            customer_email='c2_sec@example.com',
            customer_phone='+919876543211',
            shipping_address={'recipient_name': 'Customer Two', 'city': 'Chennai'},
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            subtotal=Decimal('400.00'),
            taxable_amount=Decimal('400.00'),
            total_amount=Decimal('472.00'),
        )

    # -------------------------------------------------------------
    # 1. Unauthenticated Access Tests
    # -------------------------------------------------------------
    def test_unauthenticated_protected_endpoints_rejected(self):
        """Unauthenticated requests to protected endpoints return 401 Unauthorized."""
        endpoints = [
            ('get', '/api/v1/addresses/'),
            ('post', '/api/v1/addresses/'),
            ('get', '/api/v1/orders/my-orders/'),
            ('get', '/api/v1/orders/'),
            ('post', '/api/v1/orders/checkout/'),
            ('post', '/api/v1/inventory/restock/'),
            ('get', '/api/v1/finance/invoices/'),
            ('get', '/api/v1/finance/quotations/'),
            ('get', '/api/v1/inquiries/admin/'),
        ]
        for method, url in endpoints:
            handler = getattr(self.client, method)
            res = handler(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_401_UNAUTHORIZED,
                f"Endpoint {url} via {method.upper()} did not reject unauthenticated access",
            )

    # -------------------------------------------------------------
    # 2. JWT Integrity & Expiration Tests
    # -------------------------------------------------------------
    def test_malformed_jwt_token_rejected(self):
        """Malformed or garbage JWT tokens return 401 Unauthorized."""
        self.client.credentials(HTTP_AUTHORIZATION='Bearer garbage.token.value')
        res = self.client.get('/api/v1/orders/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_tampered_jwt_signature_rejected(self):
        """JWT token with tampered payload/signature returns 401 Unauthorized."""
        tampered = self.token_c1[:-6] + 'abcdef'
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tampered}')
        res = self.client.get('/api/v1/orders/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_expired_jwt_token_rejected(self):
        """Expired JWT access token returns 401 Unauthorized."""
        token = AccessToken.for_user(self.customer1)
        token.set_exp(lifetime=-timedelta(minutes=10))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(token)}')
        res = self.client.get('/api/v1/orders/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_blacklisted_refresh_token_cannot_refresh(self):
        """Blacklisted refresh token cannot be used to obtain new access tokens."""
        refresh = RefreshToken.for_user(self.customer1)
        refresh.blacklist()

        res = self.client.post('/api/v1/auth/token/refresh/', {'refresh': str(refresh)})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    # -------------------------------------------------------------
    # 3. RBAC & Privilege Escalation Tests
    # -------------------------------------------------------------
    def test_customer_cannot_access_admin_endpoints(self):
        """Customer role attempting to access admin/staff endpoints returns 403 Forbidden."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')

        restricted = [
            ('post', '/api/v1/inventory/restock/', {'product_id': self.product.id, 'quantity': 10, 'reason': 'Test'}),
            ('post', '/api/v1/inventory/adjust/', {'product_id': self.product.id, 'quantity': 1, 'reason': 'Test'}),
            ('patch', f'/api/v1/orders/{self.order_c2.id}/status/', {'status': 'CONFIRMED'}),
            ('get', '/api/v1/finance/invoices/', None),
            ('get', '/api/v1/finance/quotations/', None),
            ('get', '/api/v1/inquiries/admin/', None),
        ]

        for method, url, payload in restricted:
            handler = getattr(self.client, method)
            res = handler(url, data=payload, format='json') if payload else handler(url)
            self.assertEqual(
                res.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Customer was not forbidden from accessing {url}",
            )

    def test_customer_cannot_escalate_role_via_payload(self):
        """Writable serializers reject or ignore role escalation parameters."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.patch(
            f'/api/v1/addresses/{self.addr_c1.id}/',
            {'role': UserRole.ADMIN, 'is_staff': True, 'is_superuser': True},
            format='json',
        )
        self.customer1.refresh_from_db()
        self.assertEqual(self.customer1.role, UserRole.CUSTOMER)
        self.assertFalse(self.customer1.is_staff)
        self.assertFalse(self.customer1.is_superuser)

    # -------------------------------------------------------------
    # 4. Ownership & Cross-Customer Data Isolation Tests
    # -------------------------------------------------------------
    def test_customer_cannot_view_other_customer_address(self):
        """Customer 1 cannot view Customer 2's address detail."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.get(f'/api/v1/addresses/{self.addr_c2.id}/')
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_customer_cannot_modify_other_customer_address(self):
        """Customer 1 cannot modify Customer 2's address."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.patch(
            f'/api/v1/addresses/{self.addr_c2.id}/',
            {'address_line1': '999 Hacked Street'},
            format='json',
        )
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.addr_c2.refresh_from_db()
        self.assertEqual(self.addr_c2.address_line1, '202 South Street')

    def test_customer_cannot_delete_other_customer_address(self):
        """Customer 1 cannot delete Customer 2's address."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.delete(f'/api/v1/addresses/{self.addr_c2.id}/')
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.assertTrue(CustomerAddress.objects.filter(id=self.addr_c2.id).exists())

    def test_customer_cannot_view_other_customer_order(self):
        """Customer 1 cannot view Customer 2's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.get(f'/api/v1/orders/{self.order_c2.id}/')
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_customer_cannot_cancel_other_customer_order(self):
        """Customer 1 cannot change status or cancel Customer 2's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.patch(
            f'/api/v1/orders/{self.order_c2.id}/status/',
            {'status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.order_c2.refresh_from_db()
        self.assertEqual(self.order_c2.status, OrderStatus.PENDING)

    def test_customer_cannot_checkout_with_other_customer_address(self):
        """Customer 1 cannot place an order using Customer 2's address ID."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        payload = {
            'shipping_address_id': self.addr_c2.id,
            'items': [{'product_id': self.product.id, 'quantity': 1}],
        }
        res = self.client.post('/api/v1/orders/checkout/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('address', str(res.data).lower())

    # -------------------------------------------------------------
    # 5. Sensitive Data & Error Envelope Exposure Tests
    # -------------------------------------------------------------
    def test_error_responses_never_leak_sql_or_tracebacks(self):
        """Error responses for non-existent or malformed requests never leak raw SQL or stack traces."""
        res = self.client.get('/api/v1/catalog/products/non-existent-slug-xyz/')
        content = str(res.content)
        self.assertNotIn('SELECT', content)
        self.assertNotIn('Traceback', content)
        self.assertNotIn('django.db', content)
        self.assertNotIn('SECRET_KEY', content)
        self.assertNotIn('C:\\', content)
        self.assertNotIn('/app/backend', content)
