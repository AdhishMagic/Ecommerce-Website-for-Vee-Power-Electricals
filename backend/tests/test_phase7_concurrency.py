import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase

from apps.users.models import UserRole
from apps.products.models import Category, Brand, Product
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.inventory.services import InventoryService
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.orders.services import OrderWorkflowService

User = get_user_model()


class Phase7ConcurrencyTestCase(TransactionTestCase):
    """
    Multi-threaded Concurrency, Race Condition, and Ledger Integrity tests (Phase 7).
    Uses TransactionTestCase to enable true multi-connection database concurrency.
    """

    def setUp(self):
        self.category = Category.objects.create(name='Concur Cat', slug='concur-cat', is_active=True)
        self.brand = Brand.objects.create(name='Concur Brand', slug='concur-brand', is_active=True)

        self.product = Product.objects.create(
            name='Concurrency Armoured Cable',
            slug='concurrency-cable',
            sku='CONCUR-SKU-001',
            category=self.category,
            brand=self.brand,
            mrp=Decimal('300.00'),
            price=Decimal('250.00'),
            stock=5,
            active=True,
        )

        self.admin = User.objects.create_user(
            email='concur_admin@example.com',
            password='Password123!',
            first_name='Concur',
            last_name='Admin',
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            email='concur_cust@example.com',
            password='Password123!',
            first_name='Concur',
            last_name='Cust',
            role=UserRole.CUSTOMER,
        )

    def tearDown(self):
        connection.close()

    def test_concurrent_sales_stock_contention_no_oversell(self):
        """
        Two concurrent threads attempt to purchase 4 units when total stock is 5.
        Exactly one thread must succeed, the other must fail with InsufficientStockError.
        Stock must never become negative.
        """
        results = {'success': 0, 'failure': 0, 'exceptions': []}
        lock = threading.Lock()

        def attempt_sale():
            # Close stale connection in new thread
            connection.close()
            try:
                InventoryService.sale_deduct_stock(
                    product_id=self.product.id,
                    quantity=4,
                    performed_by=self.customer,
                )
                with lock:
                    results['success'] += 1
            except DjangoValidationError as e:
                with lock:
                    results['failure'] += 1
                    results['exceptions'].append(e)
            finally:
                connection.close()

        t1 = threading.Thread(target=attempt_sale)
        t2 = threading.Thread(target=attempt_sale)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Refresh product from DB
        self.product.refresh_from_db()

        self.assertEqual(results['success'], 1, "Exactly one concurrent sale should succeed")
        self.assertEqual(results['failure'], 1, "Exactly one concurrent sale should fail due to stock depletion")
        self.assertEqual(self.product.stock, 1, "Remaining stock must be exactly 5 - 4 = 1")
        self.assertGreaterEqual(self.product.stock, 0, "Stock must never become negative")

        # Verify stock transaction ledger
        sales_count = StockTransaction.objects.filter(
            product=self.product,
            transaction_type=StockTransactionType.SALE,
        ).count()
        self.assertEqual(sales_count, 1, "Exactly one SALE transaction should be recorded")

    def test_concurrent_sale_and_restock_net_consistency(self):
        """
        Concurrent sale of 3 units and restock of 10 units on stock=5.
        Both operations must succeed and net stock must be exactly 5 - 3 + 10 = 12.
        """
        errors = []

        def do_sale():
            connection.close()
            try:
                InventoryService.sale_deduct_stock(
                    product_id=self.product.id,
                    quantity=3,
                    performed_by=self.customer,
                )
            except Exception as e:
                errors.append(e)
            finally:
                connection.close()

        def do_restock():
            connection.close()
            try:
                InventoryService.restock_product(
                    product_id=self.product.id,
                    quantity=10,
                    notes='PO-2026-001',
                    performed_by=self.admin,
                )
            except Exception as e:
                errors.append(e)
            finally:
                connection.close()

        t1 = threading.Thread(target=do_sale)
        t2 = threading.Thread(target=do_restock)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(len(errors), 0, f"Expected 0 errors, got: {errors}")

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 12, "Final stock must be exactly 5 - 3 + 10 = 12")

        tx_types = list(StockTransaction.objects.filter(product=self.product).values_list('transaction_type', flat=True))
        self.assertIn(StockTransactionType.SALE, tx_types)
        self.assertIn(StockTransactionType.RESTOCK, tx_types)

    def test_concurrent_order_cancellation_idempotent_restock(self):
        """
        Multiple concurrent cancellation requests on the same order.
        Stock must be restored exactly once (no double-restocking).
        """
        order = Order.objects.create(
            order_number='ORD-CONCUR-001',
            user=self.customer,
            customer_name='Concur Cust',
            customer_email='concur_cust@example.com',
            customer_phone='+919876543210',
            shipping_address={'recipient_name': 'Concur Cust', 'city': 'Coimbatore'},
            status=OrderStatus.CONFIRMED,
            payment_status=PaymentStatus.PAID,
            subtotal=Decimal('750.00'),
            taxable_amount=Decimal('750.00'),
            total_amount=Decimal('885.00'),
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            sku=self.product.sku,
            quantity=3,
            mrp=Decimal('300.00'),
            unit_price=Decimal('250.00'),
            taxable_amount=Decimal('750.00'),
            subtotal=Decimal('750.00'),
            total_amount=Decimal('885.00'),
        )
        # Simulate stock deduction prior to test
        self.product.stock = 2
        self.product.save()

        success_count = [0]
        failure_count = [0]
        lock = threading.Lock()

        def cancel_order():
            connection.close()
            try:
                OrderWorkflowService.transition_order_status(
                    order_id=order.id,
                    target_status=OrderStatus.CANCELLED,
                    changed_by=self.customer,
                    reason='Customer concurrent cancel',
                )
                with lock:
                    success_count[0] += 1
            except DjangoValidationError:
                with lock:
                    failure_count[0] += 1
            finally:
                connection.close()

        t1 = threading.Thread(target=cancel_order)
        t2 = threading.Thread(target=cancel_order)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        order.refresh_from_db()
        self.product.refresh_from_db()

        self.assertEqual(order.status, OrderStatus.CANCELLED)
        # Crucial: Product stock restored from 2 + 3 = 5, NOT 2 + 3 + 3 = 8
        self.assertEqual(self.product.stock, 5, "Product stock must be restored exactly once to 5")

        returns_count = StockTransaction.objects.filter(
            product=self.product,
            transaction_type=StockTransactionType.RETURN,
        ).count()
        self.assertEqual(returns_count, 1, "Exactly one RETURN transaction must be recorded")
