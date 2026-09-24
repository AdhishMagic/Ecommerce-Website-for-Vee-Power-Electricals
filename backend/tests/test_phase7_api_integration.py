from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.models import UserRole, CustomerAddress, AddressType
from apps.products.models import Category, Subcategory, Brand, Product
from apps.inventory.models import StockTransaction
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.finance.models import Client, Quotation, QuotationItem, QuotationStatus, Invoice
from apps.core.models import ContactInquiry
from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    DeliveryConfiguration,
    OrderDiscount,
    DiscountType,
)

User = get_user_model()


class Phase7APIIntegrationTestCase(TestCase):
    """
    End-to-End REST API contract integration tests across all 7 operational domains (Phase 7).
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer = User.objects.create_user(
            email='c_e2e@example.com',
            password='Password123!',
            first_name='E2E',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='admin_e2e@example.com',
            password='Password123!',
            first_name='E2E',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_customer = str(AccessToken.for_user(self.customer))
        self.token_admin = str(AccessToken.for_user(self.admin))

        # Catalog
        self.category = Category.objects.create(name='E2E Industrial', slug='e2e-industrial', is_active=True)
        self.subcategory = Subcategory.objects.create(category=self.category, name='E2E Cables', slug='e2e-cables', is_active=True)
        self.brand = Brand.objects.create(name='E2E Havells', slug='e2e-havells', is_active=True)
        self.product = Product.objects.create(
            name='E2E 2.5 Sqmm Copper Wire',
            slug='e2e-25-sqmm-copper-wire',
            sku='E2E-COP-001',
            category=self.category,
            subcategory=self.subcategory,
            brand=self.brand,
            mrp=Decimal('350.00'),
            price=Decimal('280.00'),
            stock=100,
            active=True,
        )

        # Configurations
        CompanyStoreConfiguration.objects.create(
            legal_company_name='Vee Power Electricals',
            support_email='support@veepower.in',
            support_phone='+919876543210',
        )
        TaxConfiguration.objects.create(
            business_state='Tamil Nadu',
            default_tax_rate=Decimal('18.00'),
            is_active=True,
        )
        DeliveryConfiguration.objects.create(
            origin_name='Hub Coimbatore',
            origin_address='Avinashi Road',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641014',
            base_delivery_charge=Decimal('50.00'),
            free_delivery_threshold=Decimal('2000.00'),
            is_active=True,
        )

        # Default Address
        self.address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='E2E Recipient',
            phone='+919876543210',
            address_line1='77 Peelamedu',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641004',
            address_type=AddressType.HOME,
            is_default=True,
        )

    # -------------------------------------------------------------
    # 1. Catalog Endpoints
    # -------------------------------------------------------------
    def test_catalog_browsing_filtering_and_detail(self):
        """Catalog listing, category filtering, search, and detail endpoints work cleanly."""
        # 1. List categories
        res_cat = self.client.get('/api/v1/catalog/categories/')
        self.assertEqual(res_cat.status_code, status.HTTP_200_OK)

        # 2. List products with search
        res_prod = self.client.get('/api/v1/catalog/products/?search=Copper')
        self.assertEqual(res_prod.status_code, status.HTTP_200_OK)
        results = res_prod.data.get('results', res_prod.data)
        self.assertGreaterEqual(len(results), 1)

        # 3. Product detail by ID
        res_det = self.client.get(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res_det.status_code, status.HTTP_200_OK)
        self.assertEqual(res_det.data['sku'], 'E2E-COP-001')

    # -------------------------------------------------------------
    # 2. Address Book Lifecycle & Single Default Constraint
    # -------------------------------------------------------------
    def test_address_lifecycle_and_single_default_switching(self):
        """Creating a new default address automatically updates previous default to False."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

        # Add second address as default
        payload = {
            'recipient_name': 'E2E Office',
            'phone': '+919876543211',
            'address_line1': '88 RS Puram',
            'city': 'Coimbatore',
            'state': 'Tamil Nadu',
            'pincode': '641002',
            'address_type': 'work',
            'is_default': True,
        }
        res = self.client.post('/api/v1/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Verify old address is no longer default
        self.address.refresh_from_db()
        self.assertFalse(self.address.is_default)

        # Verify exactly 1 default address exists for customer
        default_count = CustomerAddress.objects.filter(user=self.customer, is_default=True).count()
        self.assertEqual(default_count, 1)

    # -------------------------------------------------------------
    # 3. Order Checkout, Stock Deduction & Status Transition
    # -------------------------------------------------------------
    def test_e2e_checkout_and_status_transition(self):
        """Customer checks out via API, stock decrements, and admin cancellation restores stock."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_customer}')

        payload = {
            'shipping_address_id': self.address.id,
            'items': [{'product_id': self.product.id, 'quantity': 5}],
        }
        res = self.client.post('/api/v1/orders/checkout/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order_id = res.data['id']

        # Verify stock was decremented
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 95)

        # Admin cancels the order
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_cancel = self.client.patch(
            f'/api/v1/orders/{order_id}/status/',
            {'status': 'CANCELLED', 'reason': 'Customer requested cancellation'},
            format='json',
        )
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)

        # Verify stock restored
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 100)

    # -------------------------------------------------------------
    # 4. Admin Inventory Restock & Adjustment
    # -------------------------------------------------------------
    def test_admin_inventory_mutation_and_ledger(self):
        """Admin restocks product, adjusts stock, and views stock ledger."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        # 1. Restock 20 units
        res_restock = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 20, 'notes': 'Batch restock'},
            format='json',
        )
        self.assertIn(res_restock.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 120)

        # 2. Adjust stock
        res_adj = self.client.post(
            '/api/v1/inventory/adjust/',
            {'product_id': self.product.id, 'change_amount': -5, 'notes': 'Audit discrepancy'},
            format='json',
        )
        self.assertIn(res_adj.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 115)

    # -------------------------------------------------------------
    # 5. Finance Quotation to Invoice Conversion API
    # -------------------------------------------------------------
    def test_admin_quotation_conversion_api(self):
        """Admin converts quotation to invoice via REST API endpoint."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')

        client = Client.objects.create(
            client_code='CLI-E2E-001',
            company_name='E2E Client',
            contact_person='Mr. E2E',
            email='client@example.com',
            phone='+919876543210',
            gstin='33CCCCC0000C1Z7',
            credit_limit=Decimal('50000.00'),
        )
        now_date = timezone.now().date()
        quotation = Quotation.objects.create(
            quotation_number='QT-E2E-001',
            client=client,
            quotation_date=now_date,
            expiry_date=now_date + timedelta(days=30),
            status=QuotationStatus.APPROVED,
            total_value=Decimal('3304.00'),
        )
        QuotationItem.objects.create(
            quotation=quotation,
            product=self.product,
            item_name=self.product.name,
            quantity=10,
            unit_price=Decimal('280.00'),
            subtotal=Decimal('2800.00'),
        )

        res = self.client.post(f'/api/v1/finance/quotations/{quotation.id}/convert/')
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertIn('invoice_number', res.data)

        quotation.refresh_from_db()
        self.assertEqual(quotation.status, QuotationStatus.CONVERTED)

    # -------------------------------------------------------------
    # 6. Contact Inquiries & Config Endpoints
    # -------------------------------------------------------------
    def test_public_inquiry_submission_and_admin_view(self):
        """Public user submits inquiry, admin views it."""
        payload = {
            'name': 'Inquirer Person',
            'email': 'person@example.com',
            'phone': '+919876543210',
            'subject': 'Bulk Order Query',
            'message': 'Looking for 500m copper wire quote.',
        }
        res = self.client.post('/api/v1/inquiries/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Admin lists inquiries
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_list = self.client.get('/api/v1/inquiries/admin/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
