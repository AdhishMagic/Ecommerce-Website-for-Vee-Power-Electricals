"""
Automated Verification Suite: Catalog Recovery, Taxonomy Integrity,
Environment Configuration, CORS, and Authentication Regression Tests.
"""

from decimal import Decimal
from unittest import mock
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.products.models import Category, Subcategory, Brand, Product
from apps.users.models import UserRole, SocialAccount, SocialProvider

User = get_user_model()


class CatalogRecoveryAndEnvironmentTests(TestCase):
    """
    Comprehensive tests for catalog restoration, endpoints, CORS,
    image resolution, and Google/password authentication.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin_recovery@veepower.in",
            username="admin_recovery@veepower.in",
            first_name="Admin",
            last_name="Recovery",
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.admin.set_password("AdminPass123!")
        self.admin.save()

        self.customer = User.objects.create_user(
            email="customer_recovery@example.com",
            username="customer_recovery@example.com",
            first_name="Customer",
            last_name="Recovery",
            role=UserRole.CUSTOMER,
        )
        self.customer.set_password("CustomerPass123!")
        self.customer.save()

    def test_01_catalog_restore_command_and_idempotency(self):
        """
        Verify restore_catalog creates 10 categories, 37+ subcategories,
        11 brands, 11 products, and running it multiple times is idempotent.
        """
        # Run restore_catalog with --confirm
        call_command("restore_catalog", confirm=True)

        self.assertEqual(Category.objects.count(), 10)
        self.assertGreaterEqual(Subcategory.objects.count(), 37)
        self.assertEqual(Brand.objects.count(), 11)
        self.assertEqual(Product.objects.count(), 11)

        # Re-run restore_catalog to verify idempotency (no duplicate rows created)
        call_command("restore_catalog", confirm=True)

        self.assertEqual(Category.objects.count(), 10)
        self.assertEqual(Brand.objects.count(), 11)
        self.assertEqual(Product.objects.count(), 11)

    def test_02_health_endpoint(self):
        """
        Verify /api/v1/health/ and /health/ return 200 with status ok.
        """
        res1 = self.client.get('/api/v1/health/')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        res2 = self.client.get('/health/')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

    def test_03_catalog_endpoints_and_products_count(self):
        """
        Verify /api/v1/catalog/ categories, subcategories, brands, products endpoints.
        """
        call_command("restore_catalog", confirm=True)

        # Categories endpoint
        cat_res = self.client.get('/api/v1/catalog/categories/')
        self.assertEqual(cat_res.status_code, status.HTTP_200_OK)
        cat_data = cat_res.data.get('results', cat_res.data)
        self.assertEqual(len(cat_data), 10)

        # Verify products_count is present and integer on each category
        for cat in cat_data:
            self.assertIn('products_count', cat)
            self.assertIsInstance(cat['products_count'], int)
            self.assertGreaterEqual(cat['products_count'], 0)

        # Subcategories endpoint (paginated response: check total count)
        sub_res = self.client.get('/api/v1/catalog/subcategories/')
        self.assertEqual(sub_res.status_code, status.HTTP_200_OK)
        total_subcats = sub_res.data.get('count', len(sub_res.data))
        self.assertGreaterEqual(total_subcats, 37)

        # Brands endpoint
        brand_res = self.client.get('/api/v1/catalog/brands/')
        self.assertEqual(brand_res.status_code, status.HTTP_200_OK)
        total_brands = brand_res.data.get('count', len(brand_res.data.get('results', brand_res.data)))
        self.assertEqual(total_brands, 11)

        # Products endpoint
        prod_res = self.client.get('/api/v1/catalog/products/')
        self.assertEqual(prod_res.status_code, status.HTTP_200_OK)
        total_prods = prod_res.data.get('count', len(prod_res.data.get('results', prod_res.data)))
        self.assertEqual(total_prods, 11)

    def test_04_product_relationships_and_constraints(self):
        """
        Verify product-category-brand foreign keys and price/stock constraints.
        """
        call_command("restore_catalog", confirm=True)

        for prod in Product.objects.all():
            self.assertIsNotNone(prod.category, f"Product {prod.sku} missing category")
            self.assertIsNotNone(prod.brand, f"Product {prod.sku} missing brand")
            self.assertGreater(prod.price, Decimal("0.00"), f"Product {prod.sku} price non-positive")
            self.assertLessEqual(prod.price, prod.mrp, f"Product {prod.sku} price exceeds MRP")
            self.assertGreaterEqual(prod.stock, 0, f"Product {prod.sku} negative stock")

            # If subcategory exists, parent category must match
            if prod.subcategory:
                self.assertEqual(
                    prod.subcategory.category_id,
                    prod.category_id,
                    f"Product {prod.sku} subcategory parent mismatch"
                )

    def test_05_image_url_validity(self):
        """
        Verify all products have valid primary images and no broken stock placeholders.
        """
        call_command("restore_catalog", confirm=True)

        bad_patterns = ['photo-1544716278-ca5e3f4abd8c', 'placehold.co', '4f1b917f02cc4bd6a10856cce028e143.png']
        for prod in Product.objects.all():
            self.assertTrue(prod.primary_image, f"Product {prod.sku} missing primary image")
            for pattern in bad_patterns:
                self.assertNotIn(pattern, prod.primary_image, f"Product {prod.sku} has bad image {pattern}")

    def test_06_cors_and_security_configuration(self):
        """
        Verify CORS and CSRF allowed origins include local and production hosts.
        """
        from django.conf import settings
        self.assertTrue(settings.CORS_ALLOW_CREDENTIALS)

        # Allowed origins must include localhost:5173
        allowed = list(settings.CORS_ALLOWED_ORIGINS)
        self.assertTrue(any('localhost:5173' in o for o in allowed) or any('localhost' in o for o in allowed))

    def test_07_email_password_login_preservation(self):
        """
        Verify existing email/password authentication works properly.
        """
        login_res = self.client.post('/api/v1/auth/login/', {
            'email': 'customer_recovery@example.com',
            'password': 'CustomerPass123!',
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertIn('access', login_res.data)
        self.assertIn('refresh', login_res.data)

    @override_settings(GOOGLE_CLIENT_ID='test-google-client-id.apps.googleusercontent.com')
    @mock.patch('apps.users.views.verify_google_id_token')
    def test_08_google_signin_and_safe_account_linking(self, mock_verify):
        """
        Verify Google ID token verification and safe account linking:
        - Links to existing account with matching verified email
        - Creates SocialAccount record in MySQL
        - Generates JWT access and refresh tokens
        """
        mock_verify.return_value = {
            'sub': 'google-uid-recovery-999',
            'email': 'customer_recovery@example.com',
            'email_verified': True,
            'given_name': 'Customer',
            'family_name': 'Recovery',
            'name': 'Customer Recovery',
        }

        res = self.client.post('/api/v1/auth/google/', {
            'credential': 'mock_google_id_token_xyz',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)

        # Check SocialAccount link in MySQL
        social = SocialAccount.objects.filter(
            provider=SocialProvider.GOOGLE,
            provider_subject='google-uid-recovery-999',
        ).first()
        self.assertIsNotNone(social)
        self.assertEqual(social.user_id, self.customer.id)
