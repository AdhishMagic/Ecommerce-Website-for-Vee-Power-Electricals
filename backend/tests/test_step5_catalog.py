from decimal import Decimal
from django.test import TestCase
from django.db import IntegrityError
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User, UserRole, CustomerAddress
from apps.products.models import (
    Category,
    Subcategory,
    Brand,
    Product,
    ProductImage,
    ProductSpecification,
    CategoryDiscountType,
)
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.orders.services import CheckoutService
from apps.finance.models import Client, Quotation, QuotationItem, Invoice, InvoiceItem


class CatalogDomainComprehensiveTests(TestCase):
    """
    Step 5 — Complete Catalog Domain Test Suite.
    Enforces Category, Subcategory, Brand, Product, ProductImage, ProductSpecification,
    search, filtering, sorting, pagination, security, RBAC, historical price protection,
    and checkout compatibility.
    """

    def setUp(self):
        self.client = APIClient()

        # Admin User
        self.admin = User.objects.create_user(
            username='admin_catalog',
            email='admin_catalog@veepower.com',
            password='AdminPassword123!',
            role=UserRole.ADMIN,
            is_staff=True,
        )

        # Customer User
        self.customer = User.objects.create_user(
            username='customer_catalog',
            email='customer_catalog@veepower.com',
            password='CustomerPassword123!',
            role=UserRole.CUSTOMER,
        )

        # Staff User
        self.staff = User.objects.create_user(
            username='staff_catalog',
            email='staff_catalog@veepower.com',
            password='StaffPassword123!',
            is_staff=True,
        )

        # Base Taxonomy
        self.category = Category.objects.create(
            name='Switchgear & Control',
            slug='switchgear-control',
            icon='⚡',
            show_in_hero=True,
            hero_order=1,
            is_active=True,
        )
        self.other_category = Category.objects.create(
            name='Wires & Cables',
            slug='wires-cables',
            icon='🔌',
            is_active=True,
        )

        self.subcategory = Subcategory.objects.create(
            category=self.category,
            name='Air Circuit Breakers',
            slug='air-circuit-breakers',
            display_order=1,
            is_active=True,
        )
        self.other_subcategory = Subcategory.objects.create(
            category=self.other_category,
            name='Armoured Cables',
            slug='armoured-cables',
            display_order=1,
            is_active=True,
        )

        self.brand = Brand.objects.create(
            name='Schneider Electric',
            slug='schneider-electric',
            is_active=True,
        )
        self.other_brand = Brand.objects.create(
            name='Polycab India',
            slug='polycab-india',
            is_active=True,
        )

        # Base Product
        self.product = Product.objects.create(
            category=self.category,
            subcategory=self.subcategory,
            brand=self.brand,
            name='MasterPact MTZ ACB 1600A',
            slug='masterpact-mtz-acb-1600a',
            sku='SCH-MTZ-1600',
            mrp=Decimal('45000.00'),
            price=Decimal('38500.00'),
            stock=15,
            low_stock_threshold=3,
            description='High performance air circuit breaker for industrial panels.',
            active=True,
            featured=True,
        )

    # =========================================================================
    # 1. CATEGORY CRUD & VALIDATION
    # =========================================================================

    def test_category_creation_and_slug_routing(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/categories/', {
            'name': 'LED Luminaires',
            'icon': '💡',
            'discount_enabled': True,
            'discount_type': 'percentage',
            'discount_value': '15.00',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['slug'], 'led-luminaires')

        # Retrieve by slug
        self.client.force_authenticate(user=None)
        res_slug = self.client.get('/api/v1/catalog/categories/led-luminaires/')
        self.assertEqual(res_slug.status_code, status.HTTP_200_OK)
        self.assertEqual(res_slug.data['name'], 'LED Luminaires')

    def test_category_negative_discount_rejected(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/categories/', {
            'name': 'Bad Discount Category',
            'discount_value': '-5.00',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('discount_value', res.data)

    def test_category_percentage_exceeding_100_rejected(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/categories/', {
            'name': 'Too High Discount',
            'discount_type': 'percentage',
            'discount_value': '120.00',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('discount_value', res.data)

    def test_category_delete_with_products_soft_deactivates(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/v1/catalog/categories/{self.category.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('deactivated'))
        self.category.refresh_from_db()
        self.assertFalse(self.category.is_active)

    # =========================================================================
    # 2. SUBCATEGORY VALIDATION & RELATIONSHIP
    # =========================================================================

    def test_subcategory_creation_and_slug_lookup(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/subcategories/', {
            'category': self.category.id,
            'name': 'Molded Case Breakers',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['slug'], 'molded-case-breakers')

        # Retrieve by slug
        self.client.force_authenticate(user=None)
        res_slug = self.client.get('/api/v1/catalog/subcategories/molded-case-breakers/')
        self.assertEqual(res_slug.status_code, status.HTTP_200_OK)
        self.assertEqual(res_slug.data['name'], 'Molded Case Breakers')

    def test_subcategory_blank_name_rejected(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/subcategories/', {
            'category': self.category.id,
            'name': '   ',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_incompatible_subcategory_rejected(self):
        """A product assigned to Category A must not accept a subcategory belonging to Category B."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/products/', {
            'name': 'Invalid Subcat Product',
            'sku': 'SKU-INCOMPAT-1',
            'category': self.category.id,  # Category A
            'subcategory': self.other_subcategory.id,  # Belongs to Category B
            'brand': self.brand.id,
            'mrp': '500.00',
            'price': '450.00',
            'stock': 10,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('subcategory', res.data)

    def test_product_model_save_incompatible_subcategory_raises_validation_error(self):
        """Authoritative model layer rejects incompatible subcategory on direct ORM save."""
        incompat_product = Product(
            category=self.category,
            subcategory=self.other_subcategory,  # Belongs to other_category
            brand=self.brand,
            name='Model Incompat Product',
            sku='SKU-MODEL-INCOMPAT',
            mrp=Decimal('100.00'),
            price=Decimal('90.00'),
            stock=5,
        )
        with self.assertRaises(ValidationError):
            incompat_product.save()

    # =========================================================================
    # 3. BRAND CRUD & VALIDATION
    # =========================================================================

    def test_brand_slug_routing_and_delete_protection(self):
        self.client.force_authenticate(user=self.admin)
        # Retrieve by slug
        res = self.client.get(f'/api/v1/catalog/brands/{self.brand.slug}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['name'], 'Schneider Electric')

        # Deleting brand with products soft deactivates
        res_del = self.client.delete(f'/api/v1/catalog/brands/{self.brand.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)
        self.assertTrue(res_del.data.get('deactivated'))
        self.brand.refresh_from_db()
        self.assertFalse(self.brand.is_active)

    # =========================================================================
    # 4. PRODUCT PRICE & STOCK INTEGRITY
    # =========================================================================

    def test_product_price_exceeding_mrp_rejected(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/products/', {
            'name': 'Overpriced Item',
            'sku': 'SKU-OVERPRICE',
            'category': self.category.id,
            'brand': self.brand.id,
            'mrp': '1000.00',
            'price': '1200.00',
            'stock': 10,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('price', res.data)

    def test_product_negative_price_or_stock_rejected(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/products/', {
            'name': 'Negative Price Item',
            'sku': 'SKU-NEGPRICE',
            'category': self.category.id,
            'brand': self.brand.id,
            'mrp': '1000.00',
            'price': '-50.00',
            'stock': 10,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res_stock = self.client.post('/api/v1/catalog/products/', {
            'name': 'Negative Stock Item',
            'sku': 'SKU-NEGSTOCK',
            'category': self.category.id,
            'brand': self.brand.id,
            'mrp': '1000.00',
            'price': '500.00',
            'stock': -10,
        })
        self.assertEqual(res_stock.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_customer_does_not_see_exact_stock_count(self):
        """Public catalog masks exact warehouse stock into boolean in_stock."""
        self.client.force_authenticate(user=None)
        res = self.client.get(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('stock', res.data)
        self.assertNotIn('low_stock_threshold', res.data)
        self.assertTrue(res.data['in_stock'])

        # Admin user sees exact stock and low_stock_threshold
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admin.data['stock'], 15)
        self.assertEqual(res_admin.data['low_stock_threshold'], 3)

    # =========================================================================
    # 5. PRODUCT IMAGES (DETERMINISTIC PRIMARY & VISIBILITY)
    # =========================================================================

    def test_product_image_deterministic_primary_promotion_and_delete(self):
        self.client.force_authenticate(user=self.admin)
        # 1. Add first image -> automatically becomes primary
        img1 = ProductImage.objects.create(
            product=self.product,
            image_url='https://example.com/img1.jpg',
            sort_order=1,
            is_primary=False,
        )
        self.product.refresh_from_db()
        img1.refresh_from_db()
        self.assertTrue(img1.is_primary)
        self.assertEqual(self.product.primary_image, 'https://example.com/img1.jpg')

        # 2. Add second image with is_primary=True -> becomes primary, unsets img1
        img2 = ProductImage.objects.create(
            product=self.product,
            image_url='https://example.com/img2.jpg',
            sort_order=2,
            is_primary=True,
        )
        img1.refresh_from_db()
        self.product.refresh_from_db()
        self.assertFalse(img1.is_primary)
        self.assertTrue(img2.is_primary)
        self.assertEqual(self.product.primary_image, 'https://example.com/img2.jpg')

        # 3. Delete img2 -> img1 automatically promoted to primary
        img2.delete()
        img1.refresh_from_db()
        self.product.refresh_from_db()
        self.assertTrue(img1.is_primary)
        self.assertEqual(self.product.primary_image, 'https://example.com/img1.jpg')

        # 4. Delete img1 -> product.primary_image cleared
        img1.delete()
        self.product.refresh_from_db()
        self.assertEqual(self.product.primary_image, '')

    def test_inactive_product_images_not_exposed_publicly(self):
        self.product.active = False
        self.product.save()
        img = ProductImage.objects.create(
            product=self.product,
            image_url='https://example.com/secret_img.jpg',
        )

        self.client.force_authenticate(user=None)
        res = self.client.get(f'/api/v1/catalog/images/?product={self.product.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Results empty because product is inactive
        self.assertEqual(len(res.data.get('results', [])), 0)

        # Admin can view
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get(f'/api/v1/catalog/images/?product={self.product.id}')
        self.assertEqual(len(res_admin.data.get('results', [])), 1)

    # =========================================================================
    # 6. PRODUCT SPECIFICATIONS
    # =========================================================================

    def test_product_specifications_crud_and_validation(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/specifications/', {
            'product': self.product.id,
            'spec_key': 'Rated Current',
            'spec_value': '1600 Amperes',
            'sort_order': 1,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Duplicate spec key for same product rejected
        res_dup = self.client.post('/api/v1/catalog/specifications/', {
            'product': self.product.id,
            'spec_key': 'Rated Current',
            'spec_value': '2000 A',
        })
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)

        # Blank key rejected
        res_blank = self.client.post('/api/v1/catalog/specifications/', {
            'product': self.product.id,
            'spec_key': '   ',
            'spec_value': 'Value',
        })
        self.assertEqual(res_blank.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # 7. SEARCH, FILTERING, SORTING, PAGINATION
    # =========================================================================

    def test_search_by_name_sku_brand_category_and_subcategory(self):
        self.client.force_authenticate(user=None)

        # Search by product name
        res = self.client.get('/api/v1/catalog/products/?q=MasterPact')
        self.assertGreaterEqual(res.data['count'], 1)

        # Search by SKU
        res_sku = self.client.get('/api/v1/catalog/products/?q=MTZ-1600')
        self.assertGreaterEqual(res_sku.data['count'], 1)

        # Search by Brand name
        res_brand = self.client.get('/api/v1/catalog/products/?q=Schneider')
        self.assertGreaterEqual(res_brand.data['count'], 1)

        # Search by Category name
        res_cat = self.client.get('/api/v1/catalog/products/?q=Switchgear')
        self.assertGreaterEqual(res_cat.data['count'], 1)

        # Search by Subcategory name
        res_sub = self.client.get('/api/v1/catalog/products/?q=Circuit+Breakers')
        self.assertGreaterEqual(res_sub.data['count'], 1)

        # SQL injection style query string handled safely
        res_sqli = self.client.get("/api/v1/catalog/products/?q=' OR 1=1 --")
        self.assertEqual(res_sqli.status_code, status.HTTP_200_OK)

    def test_filtering_combinations(self):
        self.client.force_authenticate(user=None)

        # Category + Brand filter
        res = self.client.get(f'/api/v1/catalog/products/?category={self.category.slug}&brand={self.brand.slug}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.data['count'], 1)

        # Category + Price range filter
        res_price = self.client.get(f'/api/v1/catalog/products/?category={self.category.id}&min_price=30000&max_price=40000')
        self.assertEqual(res_price.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res_price.data['count'], 1)

        # Stock availability filter
        res_stock = self.client.get('/api/v1/catalog/products/?in_stock=true')
        self.assertEqual(res_stock.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res_stock.data['count'], 1)

        # Non-matching subcategory returns 0
        res_other = self.client.get(f'/api/v1/catalog/products/?subcategory={self.other_subcategory.slug}')
        self.assertEqual(res_other.data['count'], 0)

    def test_sorting_and_malicious_ordering_safety(self):
        self.client.force_authenticate(user=None)

        # Valid sortings
        for order_param in ['price', '-price', 'name', '-name', 'created_at', '-created_at']:
            res = self.client.get(f'/api/v1/catalog/products/?ordering={order_param}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Malicious / invalid ordering param falls back safely to default ordering
        res_mal = self.client.get('/api/v1/catalog/products/?ordering=user__password')
        self.assertEqual(res_mal.status_code, status.HTTP_200_OK)

    def test_pagination_bounds_and_page_size(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/v1/catalog/products/?page=1&page_size=5')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('count', res.data)
        self.assertIn('results', res.data)

        # Page out of range returns 404 cleanly
        res_404 = self.client.get('/api/v1/catalog/products/?page=99999')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # 8. SAFE PRODUCT DELETION & HISTORICAL AUDIT HARDENING
    # =========================================================================

    def test_product_with_stock_transactions_soft_deactivates_on_delete(self):
        StockTransaction.objects.create(
            product=self.product,
            change_amount=15,
            transaction_type=StockTransactionType.RESTOCK,
            notes='Initial warehouse stock',
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('deactivated'))

        self.product.refresh_from_db()
        self.assertFalse(self.product.active)

    def test_product_with_historical_orders_soft_deactivates_on_delete(self):
        order = Order.objects.create(
            order_number='ORD-TEST-HIST-001',
            user=self.customer,
            customer_name='Test Customer',
            customer_email='customer@example.com',
            customer_phone='9876543210',
            subtotal=Decimal('38500.00'),
            taxable_amount=Decimal('38500.00'),
            total_amount=Decimal('45430.00'),
            status=OrderStatus.CONFIRMED,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=self.product.price,
            quantity=1,
            taxable_amount=self.product.price,
            subtotal=self.product.price,
            total_amount=Decimal('45430.00'),
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('deactivated'))

        self.product.refresh_from_db()
        self.assertFalse(self.product.active)

    # =========================================================================
    # 9. HISTORICAL PRICE PROTECTION & FINANCIAL SNAPSHOT REGRESSION
    # =========================================================================

    def test_product_price_update_does_not_change_historical_order_item_price(self):
        """Updating a product's price in the catalog MUST NOT alter existing OrderItem records."""
        order = Order.objects.create(
            order_number='ORD-HIST-PRICE-001',
            user=self.customer,
            customer_name='Test Customer',
            customer_email='customer@example.com',
            customer_phone='9876543210',
            subtotal=Decimal('38500.00'),
            taxable_amount=Decimal('38500.00'),
            total_amount=Decimal('45430.00'),
            status=OrderStatus.CONFIRMED,
        )
        item = OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            mrp=self.product.mrp,
            unit_price=Decimal('38500.00'),
            quantity=1,
            taxable_amount=Decimal('38500.00'),
            subtotal=Decimal('38500.00'),
            total_amount=Decimal('45430.00'),
        )

        # Update product price in catalog
        self.product.price = Decimal('52000.00')
        self.product.mrp = Decimal('60000.00')
        self.product.save()

        # Historical order item price MUST remain unchanged
        item.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(item.unit_price, Decimal('38500.00'))
        self.assertEqual(item.total_amount, Decimal('45430.00'))
        self.assertEqual(order.total_amount, Decimal('45430.00'))

    def test_product_price_update_does_not_change_historical_invoice_item_rate(self):
        """Updating a product price MUST NOT alter existing InvoiceItem rates."""
        invoice = Invoice.objects.create(
            invoice_number='INV-2026-00099',
            invoice_date='2026-09-26',
            due_date='2026-10-26',
            subtotal=Decimal('38500.00'),
            taxable_amount=Decimal('38500.00'),
            total_amount=Decimal('45430.00'),
        )
        inv_item = InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product,
            item_name=self.product.name,
            sku=self.product.sku,
            quantity=1,
            rate=Decimal('38500.00'),
            taxable_amount=Decimal('38500.00'),
            total_amount=Decimal('45430.00'),
        )

        # Change catalog price
        self.product.price = Decimal('99999.00')
        self.product.mrp = Decimal('110000.00')
        self.product.save()

        inv_item.refresh_from_db()
        invoice.refresh_from_db()
        self.assertEqual(inv_item.rate, Decimal('38500.00'))
        self.assertEqual(invoice.total_amount, Decimal('45430.00'))

    # =========================================================================
    # 10. CHECKOUT COMPATIBILITY & RE-READ PRODUCT STATE
    # =========================================================================

    def test_checkout_re_reads_price_authoritatively_ignoring_stale_client_value(self):
        """Checkout service always re-reads authoritative DB price, rejecting client-side price tampering."""
        addr = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Test Cust',
            phone='9876543210',
            address_line1='123 Test Road',
            city='Chennai',
            state='Tamil Nadu',
            pincode='600001',
        )

        # Attempt to checkout sending a tampered price
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=addr.id,
            items_data=[{
                'product_id': self.product.id,
                'quantity': 1,
                'client_tampered_price': 1.00,  # Should be ignored
            }],
        )

        # Order must be calculated using authoritative database price
        self.assertEqual(order.subtotal, Decimal('38500.00'))

    def test_checkout_rejects_inactive_product(self):
        addr = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Test Cust',
            phone='9876543210',
            address_line1='123 Test Road',
            city='Chennai',
            state='Tamil Nadu',
            pincode='600001',
        )
        self.product.active = False
        self.product.save()

        with self.assertRaises(ValidationError) as ctx:
            CheckoutService.process_checkout(
                user=self.customer,
                shipping_address_id=addr.id,
                items_data=[{
                    'product_id': self.product.id,
                    'quantity': 1,
                }],
            )
        self.assertIn('unavailable', str(ctx.exception).lower())

    def test_checkout_rejects_insufficient_stock(self):
        addr = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Test Cust',
            phone='9876543210',
            address_line1='123 Test Road',
            city='Chennai',
            state='Tamil Nadu',
            pincode='600001',
        )
        self.product.stock = 2
        self.product.save()

        with self.assertRaises(ValidationError) as ctx:
            CheckoutService.process_checkout(
                user=self.customer,
                shipping_address_id=addr.id,
                items_data=[{
                    'product_id': self.product.id,
                    'quantity': 5,
                }],
            )
        self.assertIn('insufficient stock', str(ctx.exception).lower())

    # =========================================================================
    # 11. SECURITY & RBAC PRIVILEGE ESCALATION
    # =========================================================================

    def test_unauthenticated_cannot_mutate_catalog(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/v1/catalog/products/', {'name': 'Hacked Prod'})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        res_cat = self.client.post('/api/v1/catalog/categories/', {'name': 'Hacked Cat'})
        self.assertEqual(res_cat.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_cannot_mutate_catalog(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/v1/catalog/products/', {'name': 'Customer Prod'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res_patch = self.client.patch(f'/api/v1/catalog/products/{self.product.id}/', {'price': '10.00'})
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        res_del = self.client.delete(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_403_FORBIDDEN)
