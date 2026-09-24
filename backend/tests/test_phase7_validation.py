from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import Category, Brand, Product
from apps.commercial_config.models import CompanyStoreConfiguration, TaxConfiguration, DeliveryConfiguration

User = get_user_model()


class Phase7ValidationHardeningTestCase(TestCase):
    """
    Input Validation Hardening, Malicious Payloads, and Boundary Tests (Phase 7).
    """

    def setUp(self):
        self.client = APIClient()

        self.customer = User.objects.create_user(
            email='c_val@example.com',
            password='Password123!',
            first_name='Valid',
            last_name='User',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='admin_val@example.com',
            password='Password123!',
            first_name='Admin',
            last_name='User',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_customer = str(AccessToken.for_user(self.customer))
        self.token_admin = str(AccessToken.for_user(self.admin))

        # Basic catalog setup
        self.category = Category.objects.create(name='Valid Category', slug='valid-cat', is_active=True)
        self.brand = Brand.objects.create(name='Valid Brand', slug='valid-brand', is_active=True)
        self.product = Product.objects.create(
            name='Test Product Validation',
            slug='test-product-val',
            sku='VAL-SKU-001',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('200.00'),
            price=Decimal('150.00'),
            stock=100,
            active=True,
        )

        self.address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Valid User',
            phone='+919876543210',
            address_line1='123 Test St',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641001',
            address_type=AddressType.HOME,
            is_default=True,
        )

    # -------------------------------------------------------------
    # 1. Missing Required Fields & Empty Payloads
    # -------------------------------------------------------------
    def test_address_creation_missing_required_fields(self):
        """Address creation without mandatory fields returns 400 Bad Request."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

        # Missing city, state, pincode
        payload = {
            'recipient_name': 'Incomplete User',
            'phone': '+919876543210',
            'address_line1': 'Somewhere',
        }
        res = self.client.post('/api/v1/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('city', res.data)
        self.assertIn('state', res.data)
        self.assertIn('pincode', res.data)

    def test_checkout_missing_items_or_address(self):
        """Checkout payload missing items or address returns 400 Bad Request."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

        # Missing items
        res1 = self.client.post('/api/v1/orders/checkout/', {'shipping_address_id': self.address.id}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        # Empty items list
        res2 = self.client.post('/api/v1/orders/checkout/', {'shipping_address_id': self.address.id, 'items': []}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

        # Missing shipping_address_id
        res3 = self.client.post('/api/v1/orders/checkout/', {'items': [{'product_id': self.product.id, 'quantity': 1}]}, format='json')
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 2. Negative & Boundary Numerical Inputs
    # -------------------------------------------------------------
    def test_checkout_negative_or_zero_quantity_rejected(self):
        """Order checkout rejects zero or negative item quantities."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

        # Zero quantity
        payload_zero = {
            'shipping_address_id': self.address.id,
            'items': [{'product_id': self.product.id, 'quantity': 0}],
        }
        res_zero = self.client.post('/api/v1/orders/checkout/', payload_zero, format='json')
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        # Negative quantity
        payload_neg = {
            'shipping_address_id': self.address.id,
            'items': [{'product_id': self.product.id, 'quantity': -5}],
        }
        res_neg = self.client.post('/api/v1/orders/checkout/', payload_neg, format='json')
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_restock_negative_or_zero_quantity_rejected(self):
        """Inventory restock endpoint rejects zero and negative quantities."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        res_zero = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 0, 'reason': 'Test'},
            format='json',
        )
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        res_neg = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': -10, 'reason': 'Test'},
            format='json',
        )
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

    def test_coupon_validation_negative_order_amount_rejected(self):
        """Coupon validation rejects negative order amount."""
        res = self.client.post(
            '/api/v1/config/coupons/validate/',
            {'code': 'SUMMER10', 'order_amount': '-500.00'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 3. Format & Semantic Validations
    # -------------------------------------------------------------
    def test_invalid_email_in_inquiry_submission_rejected(self):
        """Contact inquiry rejects malformed email address."""
        payload = {
            'name': 'Enquirer',
            'email': 'not-a-valid-email',
            'phone': '+919876543210',
            'subject': 'Inquiry Subject',
            'message': 'This is a test message.',
        }
        res = self.client.post('/api/v1/inquiries/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', res.data)

    def test_invalid_enum_address_type_rejected(self):
        """Address creation with invalid address_type enum is rejected."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')
        payload = {
            'recipient_name': 'Valid User',
            'phone': '+919876543210',
            'address_line1': '123 Test St',
            'city': 'Coimbatore',
            'state': 'Tamil Nadu',
            'pincode': '641001',
            'address_type': 'INVALID_TYPE',
        }
        res = self.client.post('/api/v1/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 4. Oversized & Malformed Inputs
    # -------------------------------------------------------------
    def test_oversized_string_input_rejected_or_handled(self):
        """Oversized string beyond field limits returns 400 Bad Request."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')
        payload = {
            'recipient_name': 'A' * 500,  # charfield limit is 150
            'phone': '+919876543210',
            'address_line1': '123 Test St',
            'city': 'Coimbatore',
            'state': 'Tamil Nadu',
            'pincode': '641001',
        }
        res = self.client.post('/api/v1/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 5. Pagination & Query Limits Defense
    # -------------------------------------------------------------
    def test_extremely_large_page_size_handled_safely(self):
        """Passing an absurdly large page_size query param does not crash the server."""
        res = self.client.get('/api/v1/catalog/products/?page_size=1000000')
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST])
        if res.status_code == status.HTTP_200_OK:
            # If accepted, verify response results count is bounded by max_page_size
            results = res.data.get('results', res.data)
            self.assertLessEqual(len(results), 100)

    def test_invalid_ordering_param_handled_safely(self):
        """Passing non-existent ordering field returns 200 or 400, never 500."""
        res = self.client.get('/api/v1/catalog/products/?ordering=non_existent_column_injection')
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST])
        self.assertNotEqual(res.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
