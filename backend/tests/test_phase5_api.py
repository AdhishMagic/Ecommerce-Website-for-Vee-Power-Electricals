from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
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
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory
from apps.finance.models import (
    Client,
    Quotation,
    QuotationItem,
    QuotationStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    PaymentTransaction,
    PaymentGateway,
    PaymentTxStatus,
)
from apps.core.models import ContactInquiry, InquiryStatus
from apps.commercial_config.models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
)

User = get_user_model()


class Phase5BaseTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Create Users
        self.customer1 = User.objects.create_user(
            email='customer1@example.com',
            password='CustomerPass123!',
            first_name='Anand',
            last_name='Kumar',
            phone='+919876543210',
            role=UserRole.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email='customer2@example.com',
            password='CustomerPass123!',
            first_name='Bala',
            last_name='Murugan',
            phone='+919876543211',
            role=UserRole.CUSTOMER,
        )
        self.admin = User.objects.create_user(
            email='admin@veepower.in',
            password='AdminPass123!',
            first_name='Vee',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.token_c1 = str(AccessToken.for_user(self.customer1))
        self.token_c2 = str(AccessToken.for_user(self.customer2))
        self.token_admin = str(AccessToken.for_user(self.admin))

        # 2. Base Catalog Entities
        self.category = Category.objects.create(
            name='Industrial Cables',
            slug='industrial-cables',
            icon='⚡',
            show_in_hero=True,
            hero_order=1,
            is_active=True,
        )
        self.subcategory = Subcategory.objects.create(
            category=self.category,
            name='Armoured Cables',
            slug='armoured-cables',
            is_active=True,
        )
        self.brand = Brand.objects.create(
            name='Polycab',
            slug='polycab',
            is_active=True,
        )

        # Active Product
        self.product1 = Product.objects.create(
            name='Polycab 4 Sqmm 4 Core Copper Armoured Cable',
            slug='polycab-4-sqmm-4-core',
            sku='POL-ARM-001',
            category=self.category,
            subcategory=self.subcategory,
            brand=self.brand,
            mrp=Decimal('450.00'),
            price=Decimal('380.00'),
            stock=100,
            low_stock_threshold=10,
            featured=True,
            active=True,
            primary_image='https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c',
        )

        # Inactive Product
        self.product_inactive = Product.objects.create(
            name='Discontinued Cable',
            slug='discontinued-cable',
            sku='DIS-001',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('200.00'),
            price=Decimal('150.00'),
            stock=0,
            active=False,
        )

        # 3. Base Commercial Config
        self.delivery_config = DeliveryConfiguration.objects.create(
            origin_name='Coimbatore Hub',
            base_delivery_charge=Decimal('100.00'),
            free_delivery_threshold=Decimal('999.00'),
            is_active=True,
        )
        self.distance_slab = DistanceSlab.objects.create(
            delivery_config=self.delivery_config,
            min_distance_km=Decimal('0.00'),
            max_distance_km=Decimal('10.00'),
            rate=Decimal('100.00'),
            is_active=True,
        )
        self.shipping_rule = ShippingRule.objects.create(
            state='Tamil Nadu',
            cost=Decimal('100.00'),
            is_active=True,
        )
        self.coupon = OrderDiscount.objects.create(
            code='WELCOME10',
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal('10.00'),
            min_order_value=Decimal('500.00'),
            is_active=True,
        )
        self.store_config = CompanyStoreConfiguration.objects.create(
            id=1,
            legal_company_name='Vee Power Electricals',
            gstin='33AABFV1234A1ZX',
        )

        # 4. Customer Addresses
        self.addr_c1 = CustomerAddress.objects.create(
            user=self.customer1,
            recipient_name='Anand Kumar',
            phone='+919876543210',
            address_line1='123 Cross Cut Road',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641012',
            address_type=AddressType.HOME,
            is_default=True,
        )
        self.addr_c2 = CustomerAddress.objects.create(
            user=self.customer2,
            recipient_name='Bala Murugan',
            phone='+919876543211',
            address_line1='456 Gandhi Road',
            city='Madurai',
            state='Tamil Nadu',
            pincode='625001',
            address_type=AddressType.WORK,
            is_default=True,
        )


class Phase5CatalogAPITests(Phase5BaseTestCase):
    """
    Catalog Domain Tests: Categories, Subcategories, Brands, Products, Filtering & Admin Operations
    """
    def test_public_product_list_returns_active_products_only(self):
        response = self.client.get('/api/v1/catalog/products/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertIn('count', response.data)
        skus = [p['sku'] for p in response.data['results']]
        self.assertIn('POL-ARM-001', skus)
        self.assertNotIn('DIS-001', skus)

    def test_public_product_detail(self):
        response = self.client.get(f'/api/v1/catalog/products/{self.product1.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sku'], 'POL-ARM-001')
        self.assertTrue(response.data['in_stock'])
        # Public users should NOT see internal raw stock number
        self.assertNotIn('stock', response.data)

    def test_admin_sees_internal_stock_in_product_detail(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        response = self.client.get(f'/api/v1/catalog/products/{self.product1.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['stock'], 100)

    def test_product_filtering_by_category_and_brand(self):
        # By category slug
        res1 = self.client.get('/api/v1/catalog/products/?category=industrial-cables')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res1.data['results']), 1)

        # By non-matching category
        res2 = self.client.get('/api/v1/catalog/products/?category=non-existent')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res2.data['results']), 0)

        # By price range
        res3 = self.client.get('/api/v1/catalog/products/?min_price=300&max_price=400')
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res3.data['results']), 1)

        # Search keyword
        res4 = self.client.get('/api/v1/catalog/products/?q=Polycab')
        self.assertEqual(res4.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res4.data['results']), 1)

    def test_invalid_query_parameters_handled_gracefully(self):
        # Invalid min_price and max_price strings should be safely ignored rather than crashing
        res = self.client.get('/api/v1/catalog/products/?min_price=invalid&max_price=abc')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('results', res.data)

    def test_pagination_envelope(self):
        response = self.client.get('/api/v1/catalog/products/?page=1&page_size=10')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('count', response.data)
        self.assertIn('next', response.data)
        self.assertIn('previous', response.data)
        self.assertIn('results', response.data)
        self.assertIn('total_pages', response.data)

    def test_customer_cannot_create_or_mutate_product(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        payload = {
            'name': 'Hacker Product',
            'sku': 'HAK-001',
            'category': self.category.id,
            'brand': self.brand.id,
            'mrp': 100,
            'price': 80,
        }
        response = self.client.post('/api/v1/catalog/products/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_and_update_product(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        payload = {
            'name': 'Schneider MCB 16A Single Pole',
            'sku': 'SCH-MCB-16A',
            'category': self.category.id,
            'brand': self.brand.id,
            'mrp': '320.00',
            'price': '260.00',
            'stock': 50,
            'low_stock_threshold': 5,
        }
        res_create = self.client.post('/api/v1/catalog/products/', payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        new_id = res_create.data['id']

        # Update price
        res_update = self.client.patch(f'/api/v1/catalog/products/{new_id}/', {'price': '270.00'}, format='json')
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(res_update.data['price']), Decimal('270.00'))

    def test_admin_product_delete_safe_with_stock_transactions(self):
        # Create a stock transaction referencing product1
        StockTransaction.objects.create(
            product=self.product1,
            change_amount=100,
            transaction_type=StockTransactionType.RESTOCK,
            performed_by=self.admin,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        response = self.client.delete(f'/api/v1/catalog/products/{self.product1.id}/')
        # ProtectedError caught and product safely deactivated
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.product1.refresh_from_db()
        self.assertFalse(self.product1.active)


class Phase5CustomerAddressAPITests(Phase5BaseTestCase):
    """
    Customer Address Domain Tests: CRUD, Default Address, Data Isolation
    """
    def test_customer_can_list_own_addresses(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        response = self.client.get('/api/v1/addresses/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['recipient_name'], 'Anand Kumar')

    def test_cross_customer_address_isolation(self):
        # Customer 1 attempts to retrieve Customer 2's address
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        response = self.client.get(f'/api/v1/addresses/{self.addr_c2.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        # Customer 1 attempts to update Customer 2's address
        res_put = self.client.patch(f'/api/v1/addresses/{self.addr_c2.id}/', {'recipient_name': 'Hacked'}, format='json')
        self.assertEqual(res_put.status_code, status.HTTP_404_NOT_FOUND)

        # Customer 1 attempts to delete Customer 2's address
        res_del = self.client.delete(f'/api/v1/addresses/{self.addr_c2.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_address_creation_and_set_default(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        payload = {
            'recipient_name': 'Anand Office',
            'phone': '+919876543210',
            'address_line1': '45 Tech Park',
            'city': 'Coimbatore',
            'state': 'Tamil Nadu',
            'pincode': '641014',
            'address_type': 'work',
            'is_default': False,
        }
        res_create = self.client.post('/api/v1/addresses/', payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        new_addr_id = res_create.data['id']

        # Set as default
        res_default = self.client.post(f'/api/v1/addresses/{new_addr_id}/set-default/')
        self.assertEqual(res_default.status_code, status.HTTP_200_OK)
        self.assertTrue(res_default.data['address']['is_default'])

        # Verify previous default address is no longer default
        self.addr_c1.refresh_from_db()
        self.assertFalse(self.addr_c1.is_default)


class Phase5InventoryAPITests(Phase5BaseTestCase):
    """
    Inventory Domain Tests: Overview, Ledger Transactions, Restock, Adjustments & Access Control
    """
    def test_customer_cannot_access_inventory_apis(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res1 = self.client.get('/api/v1/inventory/')
        self.assertEqual(res1.status_code, status.HTTP_403_FORBIDDEN)
        res2 = self.client.post('/api/v1/inventory/restock/', {'product_id': self.product1.id, 'quantity': 10}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_inventory_overview_and_transactions_list(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        response = self.client.get('/api/v1/inventory/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

        # Transactions
        res_tx = self.client.get('/api/v1/inventory/transactions/')
        self.assertEqual(res_tx.status_code, status.HTTP_200_OK)

    def test_admin_restock_creates_ledger_transaction(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        initial_stock = self.product1.stock
        payload = {
            'product_id': self.product1.id,
            'quantity': 25,
            'notes': 'Factory shipment receipt batch #99',
        }
        response = self.client.post('/api/v1/inventory/restock/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['current_stock'], initial_stock + 25)

        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock + 25)

        # Verify StockTransaction created
        tx = StockTransaction.objects.filter(product=self.product1, transaction_type='RESTOCK').latest('created_at')
        self.assertEqual(tx.change_amount, 25)

    def test_admin_adjustment_rejects_negative_stock(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        payload = {
            'product_id': self.product1.id,
            'change_amount': -150,  # stock is 100
            'notes': 'Over-reduction attempt',
        }
        response = self.client.post('/api/v1/inventory/adjust/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class Phase5OrderAndCheckoutAPITests(Phase5BaseTestCase):
    """
    Order & Checkout Domain Tests: Checkout, Stock Deductions, Ownership Scoping, FSM Transitions
    """
    def test_checkout_creates_order_and_deducts_stock(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        initial_stock = self.product1.stock
        payload = {
            'shipping_address_id': self.addr_c1.id,
            'items': [
                {'product_id': self.product1.id, 'quantity': 2}
            ],
            'payment_method': 'UPI',
            'notes': 'Deliver before 5 PM',
        }
        response = self.client.post('/api/v1/orders/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('order_number', response.data)
        self.assertEqual(response.data['status'], OrderStatus.PENDING)

        # Stock deducted
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.stock, initial_stock - 2)

        # Order items created
        order_id = response.data['id']
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().quantity, 2)

        # Status history logged
        self.assertEqual(order.status_history.count(), 1)
        self.assertEqual(order.status_history.first().new_status, OrderStatus.PENDING)

    def test_checkout_fails_on_insufficient_stock(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        payload = {
            'shipping_address_id': self.addr_c1.id,
            'items': [
                {'product_id': self.product1.id, 'quantity': 500}  # Available is 100
            ],
        }
        response = self.client.post('/api/v1/orders/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Insufficient stock', str(response.data))

    def test_checkout_fails_on_unowned_shipping_address(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        # Customer 1 attempts to use Customer 2's address ID
        payload = {
            'shipping_address_id': self.addr_c2.id,
            'items': [
                {'product_id': self.product1.id, 'quantity': 1}
            ],
        }
        response = self.client.post('/api/v1/orders/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid shipping address', str(response.data))

    def test_customer_order_ownership_isolation(self):
        # Create order for Customer 2
        order_c2 = Order.objects.create(
            order_number='ORD-TEST-002',
            user=self.customer2,
            customer_name='Bala Murugan',
            customer_email='customer2@example.com',
            customer_phone='+919876543211',
            shipping_address={},
            subtotal=Decimal('380.00'),
            taxable_amount=Decimal('380.00'),
            total_amount=Decimal('380.00'),
            status=OrderStatus.PENDING,
        )
        # Customer 1 queries my-orders
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res_list = self.client.get('/api/v1/orders/my-orders/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        order_numbers = [o['order_number'] for o in res_list.data['results']]
        self.assertNotIn('ORD-TEST-002', order_numbers)

        # Customer 1 attempts direct access to Customer 2's order
        res_detail = self.client.get(f'/api/v1/orders/{order_c2.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_order_status_update_and_history(self):
        order = Order.objects.create(
            order_number='ORD-TEST-FSM-01',
            user=self.customer1,
            customer_name='Anand Kumar',
            customer_email='customer1@example.com',
            customer_phone='+919876543210',
            shipping_address={},
            subtotal=Decimal('380.00'),
            taxable_amount=Decimal('380.00'),
            total_amount=Decimal('380.00'),
            status=OrderStatus.PENDING,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        payload = {
            'status': OrderStatus.CONFIRMED,
            'reason': 'Payment received via NEFT',
        }
        response = self.client.patch(f'/api/v1/orders/{order.id}/status/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], OrderStatus.CONFIRMED)

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CONFIRMED)
        self.assertEqual(order.status_history.count(), 1)
        self.assertEqual(order.status_history.first().new_status, OrderStatus.CONFIRMED)

    def test_invalid_order_status_transition_rejected(self):
        order = Order.objects.create(
            order_number='ORD-TEST-FSM-INVALID',
            user=self.customer1,
            customer_name='Anand Kumar',
            customer_email='customer1@example.com',
            customer_phone='+919876543210',
            shipping_address={},
            subtotal=Decimal('380.00'),
            taxable_amount=Decimal('380.00'),
            total_amount=Decimal('380.00'),
            status=OrderStatus.PENDING,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        # Invalid direct transition: PENDING -> DELIVERED (bypassing CONFIRMED, PACKED, SHIPPED)
        payload = {'status': OrderStatus.DELIVERED}
        response = self.client.patch(f'/api/v1/orders/{order.id}/status/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid status transition', response.data['detail'])

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.PENDING)


class Phase5FinanceAPITests(Phase5BaseTestCase):
    """
    B2B Finance Domain Tests: Clients, Quotations, Invoices, Payments & RBAC Controls
    """
    def test_customer_forbidden_from_finance_apis(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res1 = self.client.get('/api/v1/finance/clients/')
        self.assertEqual(res1.status_code, status.HTTP_403_FORBIDDEN)
        res2 = self.client.get('/api/v1/finance/quotations/')
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)
        res3 = self.client.get('/api/v1/finance/invoices/')
        self.assertEqual(res3.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_b2b_client_crud(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        payload = {
            'client_code': 'CL-LNT-01',
            'company_name': 'Larsen & Toubro Ltd',
            'contact_person': 'Rajan Verma',
            'gstin': '33AABCL1234A1ZX',
            'email': 'procurement@lnt.com',
            'phone': '+919876543299',
            'credit_limit': '500000.00',
        }
        res_create = self.client.post('/api/v1/finance/clients/', payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        client_id = res_create.data['id']

        # List
        res_list = self.client.get('/api/v1/finance/clients/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res_list.data['count'], 1)

    def test_admin_quotation_and_invoice_endpoints(self):
        client = Client.objects.create(
            client_code='CL-TEST-02',
            company_name='Tata Projects',
            contact_person='S. Kumar',
            gstin='33AABCT1234A1ZX',
            email='procure@tata.com',
            phone='+919876543288',
        )
        today = timezone.now().date()
        quotation = Quotation.objects.create(
            quotation_number='QUO-TEST-001',
            client=client,
            quotation_date=today,
            expiry_date=today + timedelta(days=30),
            total_value=Decimal('11800.00'),
            status=QuotationStatus.DRAFT,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_quo = self.client.get(f'/api/v1/finance/quotations/{quotation.id}/')
        self.assertEqual(res_quo.status_code, status.HTTP_200_OK)
        self.assertEqual(res_quo.data['quotation_number'], 'QUO-TEST-001')

        # Status update
        res_patch = self.client.patch(f'/api/v1/finance/quotations/{quotation.id}/status/', {'status': QuotationStatus.SENT}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(res_patch.data['status'], QuotationStatus.SENT)

        # Invoice retrieval
        invoice = Invoice.objects.create(
            invoice_number='INV-TEST-001',
            invoice_date=today,
            due_date=today + timedelta(days=15),
            client=client,
            quotation=quotation,
            subtotal=Decimal('10000.00'),
            taxable_amount=Decimal('10000.00'),
            total_amount=Decimal('11800.00'),
            status=InvoiceStatus.UNPAID,
        )
        res_inv = self.client.get(f'/api/v1/finance/invoices/{invoice.id}/')
        self.assertEqual(res_inv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_inv.data['invoice_number'], 'INV-TEST-001')

    def test_payment_and_settlement_access_control(self):
        # Admin can view payment transactions and settlements
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_pay = self.client.get('/api/v1/finance/payments/')
        self.assertEqual(res_pay.status_code, status.HTTP_200_OK)

        res_settle = self.client.get('/api/v1/finance/settlements/')
        self.assertEqual(res_settle.status_code, status.HTTP_200_OK)

        # Customer forbidden
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res_pay_c = self.client.get('/api/v1/finance/payments/')
        self.assertEqual(res_pay_c.status_code, status.HTTP_403_FORBIDDEN)
        res_settle_c = self.client.get('/api/v1/finance/settlements/')
        self.assertEqual(res_settle_c.status_code, status.HTTP_403_FORBIDDEN)


class Phase5InquiryAPITests(Phase5BaseTestCase):
    """
    Contact Inquiries Domain Tests: Public Submission, Admin Listing & Status Updates
    """
    def test_public_can_submit_inquiry(self):
        payload = {
            'name': 'Praveen Chandran',
            'email': 'praveen@example.com',
            'phone': '+919876543222',
            'subject': 'Bulk Order for 500m Armoured Cable',
            'message': 'Please provide discount estimate for commercial construction project.',
        }
        response = self.client.post('/api/v1/inquiries/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['subject'], payload['subject'])

        inquiry = ContactInquiry.objects.get(subject=payload['subject'])
        self.assertEqual(inquiry.status, InquiryStatus.NEW)

    def test_admin_can_manage_inquiries(self):
        inquiry = ContactInquiry.objects.create(
            name='Test Inquirer',
            phone='+919876543222',
            subject='Testing Status Update',
            message='Test inquiry body',
            status=InquiryStatus.NEW,
        )
        # Customer cannot view or update
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res_cust = self.client.get('/api/v1/inquiries/admin/')
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Admin can view and update
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_admin}')
        res_admin = self.client.get('/api/v1/inquiries/admin/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

        res_update = self.client.patch(
            f'/api/v1/inquiries/admin/{inquiry.id}/',
            {'status': InquiryStatus.RESOLVED, 'admin_notes': 'Called client and provided quote'},
            format='json'
        )
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        self.assertEqual(res_update.data['status'], InquiryStatus.RESOLVED)


class Phase5CommercialConfigAPITests(Phase5BaseTestCase):
    """
    Commercial Configuration Domain Tests: Store Profile, Slabs, Shipping Rules, Coupon Validation
    """
    def test_public_can_read_store_and_delivery_config(self):
        res_store = self.client.get('/api/v1/config/store/')
        self.assertEqual(res_store.status_code, status.HTTP_200_OK)
        self.assertEqual(res_store.data['legal_company_name'], 'Vee Power Electricals')

        res_del = self.client.get('/api/v1/config/delivery/')
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)

        res_slabs = self.client.get('/api/v1/config/slabs/')
        self.assertEqual(res_slabs.status_code, status.HTTP_200_OK)

    def test_coupon_validation_endpoint(self):
        # Valid coupon
        payload_valid = {'code': 'WELCOME10', 'order_amount': '1000.00'}
        res1 = self.client.post('/api/v1/config/coupons/validate/', payload_valid, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertTrue(res1.data['valid'])
        self.assertEqual(Decimal(res1.data['calculated_discount']), Decimal('100.00'))

        # Below minimum order value
        payload_low = {'code': 'WELCOME10', 'order_amount': '300.00'}
        res2 = self.client.post('/api/v1/config/coupons/validate/', payload_low, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res2.data['valid'])

        # Non-existent coupon
        payload_bad = {'code': 'BOGUS99', 'order_amount': '1000.00'}
        res3 = self.client.post('/api/v1/config/coupons/validate/', payload_bad, format='json')
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res3.data['valid'])

    def test_customer_cannot_modify_config(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_c1}')
        res = self.client.patch('/api/v1/config/store/', {'legal_company_name': 'Hacked Co'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
