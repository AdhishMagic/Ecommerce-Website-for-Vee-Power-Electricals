import io
from decimal import Decimal
from PIL import Image
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User, UserRole
from apps.products.models import Category, Brand, Product, ProductImage
from apps.orders.models import Order, OrderItem
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.products.services_bulk_import import BulkProductImportService


class ProductCrudAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username='admin_audit',
            email='admin_audit@veepower.com',
            password='AdminPassword123!',
            role=UserRole.ADMIN,
            is_staff=True,
        )

        self.customer = User.objects.create_user(
            username='cust_audit',
            email='cust_audit@veepower.com',
            password='CustPassword123!',
            role=UserRole.CUSTOMER,
        )

        self.category = Category.objects.create(
            name='Wires & Cables',
            slug='wires-cables',
            icon='⚡',
            is_active=True,
        )

        self.brand = Brand.objects.create(
            name='Polycab',
            slug='polycab',
            is_active=True,
        )

    def test_01_create_product_status_and_is_active_sync(self):
        """Verify Create product sets status='ACTIVE', active=True, is_active=True by default."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/products/', data={
            'name': 'Polycab 4.0 sq mm Wire',
            'sku': 'POLY-4.0-RED',
            'category': self.category.id,
            'brand': self.brand.id,
            'price': '3500.00',
            'mrp': '3800.00',
            'stock': 25,
            'status': 'ACTIVE',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data['status'], 'ACTIVE')
        self.assertTrue(data['active'])
        self.assertTrue(data['is_active'])

        prod = Product.objects.get(sku='POLY-4.0-RED')
        self.assertEqual(prod.status, 'ACTIVE')
        self.assertTrue(prod.active)
        self.assertTrue(prod.is_active)

    def test_02_patch_product_does_not_reset_active_to_draft(self):
        """Verify partial update (PATCH) of price/stock does NOT reset status back to DRAFT."""
        prod = Product.objects.create(
            name='Polycab 1.5 sq mm Wire',
            sku='POLY-1.5-RED',
            category=self.category,
            brand=self.brand,
            price=Decimal('1500.00'),
            mrp=Decimal('1700.00'),
            stock=50,
            active=True,
            status='ACTIVE',
        )

        self.client.force_authenticate(user=self.admin)
        # Patch only price
        res = self.client.patch(f'/api/v1/catalog/products/{prod.id}/', data={
            'price': '1600.00',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data['status'], 'ACTIVE')
        self.assertTrue(data['active'])
        self.assertTrue(data['is_active'])

        prod.refresh_from_db()
        self.assertEqual(prod.status, 'ACTIVE')
        self.assertTrue(prod.active)
        self.assertEqual(prod.price, Decimal('1600.00'))

    def test_03_explicit_status_toggle_via_patch(self):
        """Verify toggling status to DRAFT via PATCH sets active=False and status='DRAFT'."""
        prod = Product.objects.create(
            name='Polycab 6.0 sq mm Wire',
            sku='POLY-6.0-RED',
            category=self.category,
            brand=self.brand,
            price=Decimal('5000.00'),
            mrp=Decimal('5500.00'),
            stock=10,
            active=True,
            status='ACTIVE',
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'/api/v1/catalog/products/{prod.id}/', data={
            'status': 'DRAFT',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        prod.refresh_from_db()
        self.assertEqual(prod.status, 'DRAFT')
        self.assertFalse(prod.active)
        self.assertFalse(prod.is_active)

    def test_04_bulk_import_status_and_is_active_sync(self):
        """Verify Bulk Import sets is_active=True and status='ACTIVE' when Is_Active is TRUE or omitted."""
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Products_Import"
        headers = [col[0] for col in BulkProductImportService.TEMPLATE_COLUMNS]
        ws.append(headers)

        # Row 1: Explicit TRUE
        ws.append([
            "AUDIT-SKU-01", "Audit MCB 1P 16A", "Wires & Cables", "Polycab",
            200.0, 180.0, 20, 18, "Piece", "Audit desc 1", "", "", "", "TRUE"
        ])
        # Row 2: Empty/None Is_Active cell
        ws.append([
            "AUDIT-SKU-02", "Audit MCB 2P 32A", "Wires & Cables", "Polycab",
            400.0, 380.0, 15, 18, "Piece", "Audit desc 2", "", "", "", ""
        ])
        # Row 3: Explicit FALSE (Draft)
        ws.append([
            "AUDIT-SKU-03", "Audit Draft Product", "Wires & Cables", "Polycab",
            100.0, 90.0, 5, 18, "Piece", "Audit desc 3", "", "", "", "FALSE"
        ])

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/catalog/products/bulk-import/', data={
            'excel_file': SimpleUploadedFile('audit_import.xlsx', buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['created_count'], 3)

        p1 = Product.objects.get(sku="AUDIT-SKU-01")
        self.assertEqual(p1.status, 'ACTIVE')
        self.assertTrue(p1.active)

        p2 = Product.objects.get(sku="AUDIT-SKU-02")
        self.assertEqual(p2.status, 'ACTIVE')
        self.assertTrue(p2.active)

        p3 = Product.objects.get(sku="AUDIT-SKU-03")
        self.assertEqual(p3.status, 'DRAFT')
        self.assertFalse(p3.active)

    def test_05_product_ordering_and_no_store_cache(self):
        """Verify default ordering is -updated_at, -id and admin receives Cache-Control: no-store."""
        prod1 = Product.objects.create(
            name='First Product', sku='SKU-FIRST',
            category=self.category, brand=self.brand,
            price=Decimal('100.00'), mrp=Decimal('100.00'),
        )
        prod2 = Product.objects.create(
            name='Second Product', sku='SKU-SECOND',
            category=self.category, brand=self.brand,
            price=Decimal('200.00'), mrp=Decimal('200.00'),
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/catalog/products/?include_all=true')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('no-store', res.headers.get('Cache-Control', ''))

        results = res.json().get('results', [])
        # Most recently updated/created should appear first
        self.assertEqual(results[0]['sku'], 'SKU-SECOND')

    def test_06_retrieve_draft_product_for_preview(self):
        """Verify retrieve endpoint allows viewing a DRAFT product cleanly by ID and slug."""
        draft_prod = Product.objects.create(
            name='Unpublished Draft Switch', sku='SKU-DRAFT-SW',
            category=self.category, brand=self.brand,
            price=Decimal('50.00'), mrp=Decimal('60.00'),
            active=False, status='DRAFT',
        )

        # Unauthenticated customer / preview view
        self.client.force_authenticate(user=None)
        res_id = self.client.get(f'/api/v1/catalog/products/{draft_prod.id}/')
        self.assertEqual(res_id.status_code, status.HTTP_200_OK)
        self.assertEqual(res_id.json()['sku'], 'SKU-DRAFT-SW')

        res_slug = self.client.get(f'/api/v1/catalog/products/{draft_prod.slug}/')
        self.assertEqual(res_slug.status_code, status.HTTP_200_OK)
        self.assertEqual(res_slug.json()['name'], 'Unpublished Draft Switch')

    def test_07_delete_with_foreign_key_protection_soft_deactivates(self):
        """Verify deleting a product linked to an OrderItem soft-deactivates it with HTTP 200."""
        prod = Product.objects.create(
            name='Ordered Product', sku='SKU-ORDERED-01',
            category=self.category, brand=self.brand,
            price=Decimal('999.00'), mrp=Decimal('1099.00'),
            active=True, status='ACTIVE',
        )

        order = Order.objects.create(
            user=self.customer,
            order_number='VP-TEST-999',
            customer_name='Test Cust',
            customer_email='cust@test.com',
            customer_phone='9876543210',
            subtotal=Decimal('999.00'),
            taxable_amount=Decimal('846.61'),
            total_amount=Decimal('999.00'),
            amount_paid=Decimal('999.00'),
            shipping_address={'city': 'Coimbatore'},
            billing_address={'city': 'Coimbatore'},
        )

        OrderItem.objects.create(
            order=order,
            product=prod,
            product_name=prod.name,
            sku=prod.sku,
            mrp=prod.mrp,
            unit_price=prod.price,
            quantity=1,
            subtotal=Decimal('999.00'),
            taxable_amount=Decimal('846.61'),
            tax_rate=Decimal('18.00'),
            tax_amount=Decimal('152.39'),
            total_amount=Decimal('999.00'),
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/v1/catalog/products/{prod.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data.get('deactivated'))
        self.assertEqual(data.get('status'), 'DRAFT')

        prod.refresh_from_db()
        self.assertFalse(prod.active)
        self.assertEqual(prod.status, 'DRAFT')
