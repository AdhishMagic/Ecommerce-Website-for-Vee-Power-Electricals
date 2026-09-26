import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.commercial_config.models import DeliveryConfiguration, TaxConfiguration
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.inventory.services import InventoryService
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from apps.orders.services import CheckoutService, OrderWorkflowService
from apps.finance.models import PaymentTransaction, PaymentGateway, PaymentTxStatus
from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.products.models import Brand, Category, Product
from apps.users.models import CustomerAddress, UserRole

User = get_user_model()


class Step6InventoryDomainTests(TestCase):
    """
    Focused functional, security, RBAC, ledger immutability, and boundary tests
    for Step 6 Inventory Finalization.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = User.objects.create_user(
            email='inv_admin@veepower.in',
            password='AdminPassword123!',
            first_name='Inv',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.staff = User.objects.create_user(
            email='inv_staff@veepower.in',
            password='StaffPassword123!',
            first_name='Inv',
            last_name='Staff',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            email='inv_customer@veepower.in',
            password='CustomerPassword123!',
            first_name='Inv',
            last_name='Customer',
            role=UserRole.CUSTOMER,
        )
        self.customer2 = User.objects.create_user(
            email='inv_customer2@veepower.in',
            password='CustomerPassword123!',
            first_name='Inv2',
            last_name='Customer2',
            role=UserRole.CUSTOMER,
        )

        # Catalog setup
        self.category = Category.objects.create(name='Cables & Wires', slug='cables-wires', is_active=True)
        self.brand = Brand.objects.create(name='Polycab', slug='polycab', is_active=True)
        self.product = Product.objects.create(
            name='Polycab 2.5sqmm Industrial Cable',
            slug='polycab-25sqmm-industrial-cable',
            sku='POLY-25-IND',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('1500.00'),
            price=Decimal('1200.00'),
            stock=50,
            low_stock_threshold=10,
            active=True,
        )

        # Address for checkout
        self.address = CustomerAddress.objects.create(
            user=self.customer,
            recipient_name='Inv Customer',
            phone='9876543210',
            address_line1='42 Industrial Estate',
            city='Coimbatore',
            state='Tamil Nadu',
            pincode='641001',
            is_default=True,
        )

        # Configurations
        TaxConfiguration.objects.create(
            business_state='Tamil Nadu',
            default_tax_rate=Decimal('18.00'),
            is_active=True,
        )
        DeliveryConfiguration.objects.create(
            origin_name='Main Depot',
            origin_address='Depot St',
            origin_city='Coimbatore',
            origin_state='Tamil Nadu',
            origin_pincode='641001',
            base_delivery_charge=Decimal('50.00'),
            free_delivery_threshold=Decimal('2000.00'),
            is_active=True,
        )

    # -------------------------------------------------------------------------
    # 1. Ledger Immutability & Model Integrity
    # -------------------------------------------------------------------------
    def test_stock_transaction_is_immutable(self):
        """Historical StockTransaction records cannot be modified or deleted."""
        tx = StockTransaction.objects.create(
            product=self.product,
            change_amount=25,
            transaction_type=StockTransactionType.RESTOCK,
            performed_by=self.admin,
            notes='Initial receipt',
        )
        self.assertIsNotNone(tx.pk)

        # Direct instance update blocked
        tx.notes = "Tampered notes"
        with self.assertRaises(DjangoValidationError):
            tx.save()

        # Direct instance deletion blocked
        with self.assertRaises(DjangoValidationError):
            tx.delete()

        # Refresh from database and verify notes are intact
        tx.refresh_from_db()
        self.assertEqual(tx.notes, 'Initial receipt')

    def test_stock_transaction_string_representation(self):
        """String representation shows SKU, sign, amount, and transaction type."""
        tx_pos = StockTransaction.objects.create(
            product=self.product,
            change_amount=15,
            transaction_type=StockTransactionType.RESTOCK,
        )
        self.assertIn('+15', str(tx_pos))
        self.assertIn('RESTOCK', str(tx_pos))

        tx_neg = StockTransaction.objects.create(
            product=self.product,
            change_amount=-5,
            transaction_type=StockTransactionType.SALE,
        )
        self.assertIn('-5', str(tx_neg))
        self.assertIn('SALE', str(tx_neg))

    # -------------------------------------------------------------------------
    # 2. Restock Workflow
    # -------------------------------------------------------------------------
    def test_restock_success_and_ledger_summary(self):
        """Admin can restock, updating stock and creating an immutable ledger transaction."""
        self.client.force_authenticate(user=self.admin)
        initial_stock = self.product.stock

        res = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 30, 'notes': 'PO-8899 Receipt'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['current_stock'], initial_stock + 30)
        self.assertEqual(res.data['stock'], initial_stock + 30)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock + 30)

        # Check ledger summary API
        res_summary = self.client.get(f'/api/v1/inventory/summary/{self.product.id}/')
        self.assertEqual(res_summary.status_code, status.HTTP_200_OK)
        self.assertEqual(res_summary.data['total_restocked'], 30)
        self.assertEqual(res_summary.data['current_stock'], initial_stock + 30)

    def test_restock_boundary_quantities(self):
        """Restock validates quantity=1, zero, negative, and excessive amounts."""
        self.client.force_authenticate(user=self.admin)

        # Quantity = 1 (valid minimum)
        res_one = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 1},
            format='json',
        )
        self.assertEqual(res_one.status_code, status.HTTP_201_CREATED)

        # Zero quantity rejected
        res_zero = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 0},
            format='json',
        )
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        # Negative quantity rejected
        res_neg = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': -10},
            format='json',
        )
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

        # Excessively large quantity rejected
        res_huge = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 99_999_999},
            format='json',
        )
        self.assertEqual(res_huge.status_code, status.HTTP_400_BAD_REQUEST)

        # Non-existent product ID rejected
        res_bad_prod = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': 999999, 'quantity': 10},
            format='json',
        )
        self.assertEqual(res_bad_prod.status_code, status.HTTP_400_BAD_REQUEST)

    def test_restock_rbac(self):
        """Customers and anonymous users cannot restock inventory."""
        # Anonymous
        res_anon = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 10},
            format='json',
        )
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # Customer
        self.client.force_authenticate(user=self.customer)
        res_cust = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 10},
            format='json',
        )
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Staff (allowed)
        self.client.force_authenticate(user=self.staff)
        res_staff = self.client.post(
            '/api/v1/inventory/restock/',
            {'product_id': self.product.id, 'quantity': 5},
            format='json',
        )
        self.assertEqual(res_staff.status_code, status.HTTP_201_CREATED)

    # -------------------------------------------------------------------------
    # 3. Stock Adjustment Workflow
    # -------------------------------------------------------------------------
    def test_stock_adjustment_positive_and_negative(self):
        """Staff/Admin can adjust stock positively and negatively within available bounds."""
        self.client.force_authenticate(user=self.staff)
        initial_stock = self.product.stock

        # Positive adjustment
        res_pos = self.client.post(
            '/api/v1/inventory/adjust/',
            {'product_id': self.product.id, 'change_amount': 15, 'notes': 'Audit surplus'},
            format='json',
        )
        self.assertEqual(res_pos.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_pos.data['current_stock'], initial_stock + 15)

        # Negative adjustment within balance
        res_neg = self.client.post(
            '/api/v1/inventory/adjust/',
            {'product_id': self.product.id, 'change_amount': -10, 'notes': 'Damaged insulation'},
            format='json',
        )
        self.assertEqual(res_neg.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_neg.data['current_stock'], initial_stock + 5)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock + 5)

    def test_stock_adjustment_negative_stock_rejection(self):
        """Adjustment that would result in negative stock is rejected."""
        self.client.force_authenticate(user=self.admin)
        self.product.stock = 5
        self.product.save()

        res = self.client.post(
            '/api/v1/inventory/adjust/',
            {'product_id': self.product.id, 'change_amount': -10, 'notes': 'Excess write-off'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)

    def test_stock_adjustment_zero_and_excessive_rejection(self):
        """Adjustment rejects zero amount and excessive limits."""
        self.client.force_authenticate(user=self.admin)

        res_zero = self.client.post(
            '/api/v1/inventory/adjust/',
            {'product_id': self.product.id, 'change_amount': 0},
            format='json',
        )
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        res_excess = self.client.post(
            '/api/v1/inventory/adjust/',
            {'product_id': self.product.id, 'change_amount': 99_999_999},
            format='json',
        )
        self.assertEqual(res_excess.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------------------
    # 4. Inventory List, Filtering, and Pagination
    # -------------------------------------------------------------------------
    def test_inventory_overview_filtering(self):
        """Inventory overview filters by low_stock, active, brand, category, search."""
        self.client.force_authenticate(user=self.admin)

        # Low stock filter
        res_low = self.client.get('/api/v1/inventory/?low_stock=true')
        self.assertEqual(res_low.status_code, status.HTTP_200_OK)

        # Search filter
        res_search = self.client.get('/api/v1/inventory/?search=Polycab')
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res_search.data['count'], 1)

        # Malformed search query param does not crash
        res_bad_search = self.client.get('/api/v1/inventory/?category=invalid_id')
        self.assertEqual(res_bad_search.status_code, status.HTTP_200_OK)
        self.assertEqual(res_bad_search.data['count'], 0)

    def test_transaction_ledger_filtering(self):
        """Transaction ledger filters by product, type, order, user, date range."""
        self.client.force_authenticate(user=self.admin)

        # Create sample transactions
        InventoryService.restock_product(self.product.id, 10, performed_by=self.admin)
        InventoryService.adjust_stock(self.product.id, -2, performed_by=self.staff)

        # Filter by product
        res_p = self.client.get(f'/api/v1/inventory/transactions/?product={self.product.id}')
        self.assertEqual(res_p.status_code, status.HTTP_200_OK)
        self.assertEqual(res_p.data['count'], 2)

        # Filter by transaction type
        res_t = self.client.get(f'/api/v1/inventory/transactions/?type=RESTOCK')
        self.assertEqual(res_t.status_code, status.HTTP_200_OK)
        self.assertTrue(all(t['transaction_type'] == 'RESTOCK' for t in res_t.data['results']))

        # Filter by invalid type returns empty
        res_inv_t = self.client.get(f'/api/v1/inventory/transactions/?type=HACK')
        self.assertEqual(res_inv_t.status_code, status.HTTP_200_OK)
        self.assertEqual(res_inv_t.data['count'], 0)

        # Filter by invalid product param handled safely
        res_inv_p = self.client.get(f'/api/v1/inventory/transactions/?product=invalid')
        self.assertEqual(res_inv_p.status_code, status.HTTP_200_OK)
        self.assertEqual(res_inv_p.data['count'], 0)

    # -------------------------------------------------------------------------
    # 5. Customer Stock Visibility vs Admin Stock Visibility
    # -------------------------------------------------------------------------
    def test_customer_stock_visibility_is_qualitative_only(self):
        """Customer only sees in_stock boolean; exact warehouse quantities are hidden."""
        # Unauthenticated request
        res_anon = self.client.get(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res_anon.status_code, status.HTTP_200_OK)
        self.assertIn('in_stock', res_anon.data)
        self.assertNotIn('stock', res_anon.data)
        self.assertNotIn('low_stock_threshold', res_anon.data)

        # Customer request
        self.client.force_authenticate(user=self.customer)
        res_cust = self.client.get(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res_cust.status_code, status.HTTP_200_OK)
        self.assertTrue(res_cust.data['in_stock'])
        self.assertNotIn('stock', res_cust.data)
        self.assertNotIn('low_stock_threshold', res_cust.data)

        # Admin request (full quantities visible)
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertIn('stock', res_admin.data)
        self.assertEqual(res_admin.data['stock'], self.product.stock)

    # -------------------------------------------------------------------------
    # 6. Order -> Inventory Consistency
    # -------------------------------------------------------------------------
    def test_checkout_deducts_stock_exactly_once(self):
        """Customer checkout creates an order and decrements inventory exactly once."""
        initial_stock = self.product.stock
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            billing_address_id=self.address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 4}],
            payment_method='UPI',
        )

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock - 4)

        sales_txs = StockTransaction.objects.filter(
            order=order,
            product=self.product,
            transaction_type=StockTransactionType.SALE,
        )
        self.assertEqual(sales_txs.count(), 1)
        self.assertEqual(sales_txs.first().change_amount, -4)

    def test_payment_confirmation_does_not_double_deduct(self):
        """Payment confirmation transitions order to CONFIRMED without second stock deduction."""
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            billing_address_id=self.address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 2}],
            payment_method='UPI',
        )
        stock_after_checkout = self.product.stock - 2
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_after_checkout)

        # Initiate payment
        init_data = PaymentGatewayService.initiate_order_payment(order.id, self.customer)
        gw_order_id = init_data['gateway_order_id']
        pay_id = 'pay_step6_confirm_1'
        sig = PaymentGatewayService.generate_signature(gw_order_id, pay_id)

        # Confirm payment
        PaymentGatewayService.confirm_payment(
            order_id=order.id,
            user=self.customer,
            razorpay_order_id=gw_order_id,
            razorpay_payment_id=pay_id,
            razorpay_signature=sig,
        )

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CONFIRMED)
        self.assertEqual(order.payment_status, PaymentStatus.PAID)

        # Stock must remain unchanged after confirmation
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_after_checkout)

        # Duplicate payment confirmation is idempotent and does not touch inventory
        PaymentGatewayService.confirm_payment(
            order_id=order.id,
            user=self.customer,
            razorpay_order_id=gw_order_id,
            razorpay_payment_id=pay_id,
            razorpay_signature=sig,
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_after_checkout)

    # -------------------------------------------------------------------------
    # 7. Cancellation -> Inventory Restoration
    # -------------------------------------------------------------------------
    def test_cancellation_restores_stock_exactly_once(self):
        """Cancelling an order restores inventory exactly once; duplicate cancellation does not double-restore."""
        initial_stock = self.product.stock
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            billing_address_id=self.address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 3}],
            payment_method='UPI',
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock - 3)

        # First cancellation
        OrderWorkflowService.cancel_order(order.id, requested_by=self.customer, reason="Customer cancelled")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock)

        return_txs = StockTransaction.objects.filter(
            order=order,
            product=self.product,
            transaction_type=StockTransactionType.RETURN,
        )
        self.assertEqual(return_txs.count(), 1)
        self.assertEqual(return_txs.first().change_amount, 3)

        # Duplicate direct call to restore_order_stock
        second_restoration = InventoryService.restore_order_stock(order)
        self.assertEqual(second_restoration, [])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock)

    def test_cancelled_order_payment_webhook_does_not_resurrect_or_deduct(self):
        """Late webhook for a cancelled order records transaction warning without resurrecting or deducting inventory."""
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            billing_address_id=self.address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 2}],
            payment_method='UPI',
        )
        # Customer initiates payment
        init_data = PaymentGatewayService.initiate_order_payment(order.id, self.customer)
        gw_order_id = init_data['gateway_order_id']

        # Then cancels order before payment captures
        OrderWorkflowService.cancel_order(order.id, requested_by=self.customer, reason="Changed mind")
        self.product.refresh_from_db()
        stock_restored = self.product.stock

        # Late payment webhook arrives
        import hmac, hashlib, json
        webhook_body = json.dumps({
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_late_webhook_99",
                        "order_id": gw_order_id,
                        "amount": int(order.total_amount * 100),
                        "currency": "INR",
                        "method": "UPI",
                    }
                }
            }
        }).encode('utf-8')
        secret = PaymentGatewayService.get_webhook_secret()
        sig = hmac.new(secret.encode('utf-8'), webhook_body, hashlib.sha256).hexdigest()

        res = PaymentGatewayService.process_webhook(webhook_body, sig)
        self.assertEqual(res['status'], 'cancelled_order_payment')

        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.CANCELLED)

        # Inventory must not be modified
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_restored)

    # -------------------------------------------------------------------------
    # 8. Return Inventory Boundary
    # -------------------------------------------------------------------------
    def test_return_lifecycle_inventory_boundary(self):
        """
        RETURN_REQUESTED, RETURN_APPROVED, RETURN_REJECTED do not affect stock.
        RETURN_COMPLETED restores stock exactly once upon physical receipt.
        """
        initial_stock = self.product.stock
        order = CheckoutService.process_checkout(
            user=self.customer,
            shipping_address_id=self.address.id,
            billing_address_id=self.address.id,
            items_data=[{'product_id': self.product.id, 'quantity': 2}],
            payment_method='UPI',
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock - 2)

        # Progress order to DELIVERED
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.CONFIRMED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.PACKED, changed_by=self.admin)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.SHIPPED, changed_by=self.admin, tracking_number="TRK-12345")
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.DELIVERED, changed_by=self.admin)

        # Stock is still deducted
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock - 2)

        # 1. RETURN_REQUESTED: No inventory effect
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.RETURN_REQUESTED, changed_by=self.customer)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock - 2)

        # 2. RETURN_APPROVED: No inventory effect (goods in transit)
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.RETURN_APPROVED, changed_by=self.admin)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock - 2)

        # 3. RETURN_COMPLETED: Physical goods inspected -> inventory restored
        OrderWorkflowService.transition_order_status(order.id, OrderStatus.RETURN_COMPLETED, changed_by=self.admin)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, initial_stock)

        # Verify RETURN transaction logged
        return_tx = StockTransaction.objects.filter(
            order=order,
            product=self.product,
            transaction_type=StockTransactionType.RETURN,
        ).first()
        self.assertIsNotNone(return_tx)
        self.assertEqual(return_tx.change_amount, 2)

    # -------------------------------------------------------------------------
    # 9. Product Deactivation Boundary
    # -------------------------------------------------------------------------
    def test_product_deactivation_protects_historical_records(self):
        """
        Deactivated product cannot be purchased, but historical orders,
        transactions, and audit records remain fully accessible.
        """
        # Create a transaction
        InventoryService.restock_product(self.product.id, 10, performed_by=self.admin)

        # Deactivate product
        self.product.active = False
        self.product.save()

        # New purchase attempt must fail
        with self.assertRaises(DjangoValidationError):
            InventoryService.sale_deduct_stock(product=self.product, quantity=1)

        # Deletion attempt soft-deactivates instead of corrupting historical records
        self.client.force_authenticate(user=self.admin)
        del_res = self.client.delete(f'/api/v1/catalog/products/{self.product.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertTrue(del_res.data.get('deactivated'))

        # Historical stock transaction still exists
        self.assertTrue(StockTransaction.objects.filter(product=self.product).exists())


class Step6ConcurrencyTestCase(TransactionTestCase):
    """
    Multi-threaded Concurrency and Race Condition validation for Step 6.
    Uses TransactionTestCase to execute with true multi-connection MySQL transaction isolation.
    """

    def setUp(self):
        self.category = Category.objects.create(name='Concur Sw Cat', slug='concur-sw-cat', is_active=True)
        self.brand = Brand.objects.create(name='Concur Sw Brand', slug='concur-sw-brand', is_active=True)
        self.product = Product.objects.create(
            name='Precision Current Breaker 32A',
            slug='precision-current-breaker-32a',
            sku='MCB-32A-001',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('500.00'),
            price=Decimal('400.00'),
            stock=5,  # Exactly 5 units
            active=True,
        )

        self.admin = User.objects.create_user(
            email='concur_admin_step6@veepower.in',
            password='AdminPassword123!',
            first_name='Admin',
            last_name='Concur',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            email='concur_cust_step6@veepower.in',
            password='CustomerPassword123!',
            first_name='Cust',
            last_name='Concur',
            role=UserRole.CUSTOMER,
        )

    def tearDown(self):
        connection.close()

    def test_ten_concurrent_checkouts_with_five_stock(self):
        """
        MANDATORY VALIDATION:
        Available stock = 5.
        10 simultaneous checkout threads attempt to purchase 1 unit each.
        Expected:
        - Exactly 5 succeed
        - Exactly 5 fail
        - Final stock = 0
        - No negative stock
        - Exactly 5 SALE transactions recorded
        """
        results = {'success': 0, 'failure': 0, 'exceptions': []}
        lock = threading.Lock()

        def checkout_attempt(thread_idx):
            connection.close()
            try:
                InventoryService.sale_deduct_stock(
                    product_id=self.product.id,
                    quantity=1,
                    performed_by=self.customer,
                    notes=f"Concurrent checkout attempt thread #{thread_idx}",
                )
                with lock:
                    results['success'] += 1
            except DjangoValidationError as e:
                with lock:
                    results['failure'] += 1
                    results['exceptions'].append(str(e))
            finally:
                connection.close()

        threads = [threading.Thread(target=checkout_attempt, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.product.refresh_from_db()

        self.assertEqual(results['success'], 5, "Exactly 5 checkout attempts must succeed")
        self.assertEqual(results['failure'], 5, "Exactly 5 checkout attempts must fail due to stock depletion")
        self.assertEqual(self.product.stock, 0, "Final stock must be exactly 0")
        self.assertGreaterEqual(self.product.stock, 0, "Stock must never become negative")

        sales_txs = StockTransaction.objects.filter(
            product=self.product,
            transaction_type=StockTransactionType.SALE,
        )
        self.assertEqual(sales_txs.count(), 5, "Exactly 5 SALE ledger transactions must be recorded")

    def test_concurrent_restock_and_multiple_purchases(self):
        """
        Initial stock = 2.
        Concurrent restock of 10 units while 6 threads each attempt to purchase 2 units (total request = 12).
        Net stock must be 2 + 10 - (successful_sales * 2).
        Stock must never become negative.
        """
        self.product.stock = 2
        self.product.save()

        success_sales = [0]
        failed_sales = [0]
        lock = threading.Lock()

        def do_purchase(i):
            connection.close()
            try:
                InventoryService.sale_deduct_stock(
                    product_id=self.product.id,
                    quantity=2,
                    performed_by=self.customer,
                )
                with lock:
                    success_sales[0] += 1
            except DjangoValidationError:
                with lock:
                    failed_sales[0] += 1
            finally:
                connection.close()

        def do_restock():
            connection.close()
            try:
                InventoryService.restock_product(
                    product_id=self.product.id,
                    quantity=10,
                    performed_by=self.admin,
                )
            finally:
                connection.close()

        # Launch restock and purchases simultaneously
        purchase_threads = [threading.Thread(target=do_purchase, args=(i,)) for i in range(6)]
        restock_thread = threading.Thread(target=do_restock)

        for t in purchase_threads[:3]:
            t.start()
        restock_thread.start()
        for t in purchase_threads[3:]:
            t.start()

        restock_thread.join()
        for t in purchase_threads:
            t.join()

        self.product.refresh_from_db()
        expected_stock = 2 + 10 - (success_sales[0] * 2)
        self.assertEqual(self.product.stock, expected_stock)
        self.assertGreaterEqual(self.product.stock, 0)

    def test_concurrent_order_cancellations_serialized_restoration(self):
        """
        Simultaneous cancellation requests on the same order.
        Stock must be restored exactly once (idempotent row-locking).
        """
        order = Order.objects.create(
            order_number='ORD-STEP6-CONCUR-01',
            user=self.customer,
            customer_name='Cust Concur',
            customer_email='cust_concur@veepower.in',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Cust Concur', 'city': 'Coimbatore'},
            status=OrderStatus.CONFIRMED,
            payment_status=PaymentStatus.PAID,
            subtotal=Decimal('400.00'),
            taxable_amount=Decimal('400.00'),
            total_amount=Decimal('472.00'),
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            quantity=3,
            mrp=Decimal('500.00'),
            unit_price=Decimal('400.00'),
            taxable_amount=Decimal('400.00'),
            subtotal=Decimal('400.00'),
            total_amount=Decimal('472.00'),
        )
        # Deduct initial stock: 5 - 3 = 2
        self.product.stock = 2
        self.product.save()

        def do_cancel():
            connection.close()
            try:
                InventoryService.restore_order_stock(order=order, performed_by=self.admin)
            finally:
                connection.close()

        threads = [threading.Thread(target=do_cancel) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.product.refresh_from_db()
        # Must be restored exactly once: 2 + 3 = 5 (never 2 + 3*5 = 17)
        self.assertEqual(self.product.stock, 5, "Product stock must be restored exactly once")

        returns_count = StockTransaction.objects.filter(
            order=order,
            transaction_type=StockTransactionType.RETURN,
        ).count()
        self.assertEqual(returns_count, 1, "Exactly one RETURN transaction must be recorded")
