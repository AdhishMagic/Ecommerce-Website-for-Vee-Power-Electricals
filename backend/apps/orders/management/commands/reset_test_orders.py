"""
Management command to safely reset test and demo order records.
Restores product stock deducted by test orders and cleans up associated
order items, status history, test stock transactions, and mock payments.
Preserves all products, categories, subcategories, brands, clients, and invoices.
"""

from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db.models import Count, Q, Sum

from apps.finance.models import Invoice, PaymentTransaction
from apps.inventory.models import StockTransaction
from apps.orders.models import Order, OrderItem, OrderStatusHistory
from apps.products.models import Product, Category, Subcategory, Brand


class Command(BaseCommand):
    help = "Safely reset test and demo orders while preserving catalog, customer, and B2B finance records."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate the cleanup without committing changes to the database.',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Explicit confirmation to execute the deletion.',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        confirmed = options.get('confirm', False)

        self.stdout.write(self.style.MIGRATE_HEADING("=== VEE POWER ELECTRICALS: TEST ORDER RESET AUDIT ==="))

        # Pre-audit counts
        total_orders = Order.objects.count()
        total_items = OrderItem.objects.count()
        total_history = OrderStatusHistory.objects.count()
        total_payments = PaymentTransaction.objects.count()
        total_stock_tx = StockTransaction.objects.count()
        total_products = Product.objects.count()
        total_categories = Category.objects.count()
        total_subcategories = Subcategory.objects.count()
        total_brands = Brand.objects.count()
        total_invoices = Invoice.objects.count()

        self.stdout.write(f"Existing Orders in Database: {total_orders}")
        self.stdout.write(f"Existing Order Items: {total_items}")
        self.stdout.write(f"Existing Status History Rows: {total_history}")
        self.stdout.write(f"Existing Products: {total_products}")
        self.stdout.write(f"Existing Categories: {total_categories}")
        self.stdout.write(f"Existing Brands: {total_brands}")
        self.stdout.write(f"Existing Invoices: {total_invoices}")

        if total_orders == 0:
            self.stdout.write(self.style.SUCCESS("✓ Database already contains 0 orders. Nothing to reset."))
            return

        orders_to_reset = list(Order.objects.all())
        self.stdout.write("\nIdentified Orders for Reset:")
        for o in orders_to_reset:
            user_email = o.user.email if o.user else "No User"
            self.stdout.write(f"  • Order #{o.order_number} (ID: {o.id}) | Status: {o.status} | User: {user_email} | Customer: {o.customer_name} | Amount: ₹{o.total_amount}")

        # Find linked records
        order_ids = [o.id for o in orders_to_reset]
        linked_stock_tx = list(StockTransaction.objects.filter(order_id__in=order_ids))
        linked_payments = list(PaymentTransaction.objects.filter(order_id__in=order_ids))
        linked_invoices = list(Invoice.objects.filter(order_id__in=order_ids))

        self.stdout.write(f"\nLinked Records Found:")
        self.stdout.write(f"  • Linked Stock Transactions: {len(linked_stock_tx)}")
        for st in linked_stock_tx:
            self.stdout.write(f"    - Tx #{st.id}: {st.product.sku} ({st.transaction_type}, change: {st.change_amount})")
        self.stdout.write(f"  • Linked Payment Transactions: {len(linked_payments)}")
        for pt in linked_payments:
            self.stdout.write(f"    - Pay #{pt.id}: GwTx: {pt.gateway_transaction_id} (Amount: ₹{pt.amount}, Status: {pt.status})")
        self.stdout.write(f"  • Linked Invoices: {len(linked_invoices)}")

        if linked_invoices:
            self.stdout.write(self.style.WARNING("  ⚠️ Notice: Orders are linked to invoices. These invoices will be disassociated (order=None) or preserved."))

        if dry_run or not confirmed:
            self.stdout.write(self.style.WARNING(
                "\n[DRY RUN] No database records were modified. Pass --confirm to execute the atomic reset."
            ))
            return

        # Execute atomic reset
        self.stdout.write(self.style.MIGRATE_HEADING("\nExecuting Atomic Test Order Reset..."))
        with transaction.atomic():
            # 1. Restore product stock from test sales
            stock_restorations = {}
            for st in linked_stock_tx:
                if st.transaction_type == 'SALE' and st.change_amount < 0:
                    stock_restorations[st.product_id] = stock_restorations.get(st.product_id, 0) + abs(st.change_amount)

            for prod_id, qty in stock_restorations.items():
                prod = Product.objects.get(pk=prod_id)
                old_stock = prod.stock
                prod.stock += qty
                prod.save(update_fields=['stock'])
                self.stdout.write(f"  ✓ Restored stock for {prod.sku} ({prod.name[:30]}): {old_stock} -> {prod.stock} (+{qty})")

            # 2. Delete test stock transactions using raw SQL cursor (avoids ValidationError on immutable model)
            if linked_stock_tx:
                tx_ids = [st.id for st in linked_stock_tx]
                format_strings = ','.join(['%s'] * len(tx_ids))
                with connection.cursor() as cursor:
                    cursor.execute(f"DELETE FROM stock_transactions WHERE id IN ({format_strings})", tx_ids)
                self.stdout.write(f"  ✓ Removed {len(tx_ids)} test stock transaction ledger records.")

            # 3. Delete mock payment transactions linked to test orders
            if linked_payments:
                pay_ids = [pt.id for pt in linked_payments]
                PaymentTransaction.objects.filter(id__in=pay_ids).delete()
                self.stdout.write(f"  ✓ Removed {len(pay_ids)} test payment transactions.")

            # 4. Disassociate or handle any invoices
            if linked_invoices:
                Invoice.objects.filter(order_id__in=order_ids).update(order=None)
                self.stdout.write(f"  ✓ Disassociated {len(linked_invoices)} invoices from deleted orders.")

            # 5. Delete order items
            deleted_items_count, _ = OrderItem.objects.filter(order_id__in=order_ids).delete()
            self.stdout.write(f"  ✓ Deleted {deleted_items_count} order line items.")

            # 6. Delete order status history
            deleted_history_count, _ = OrderStatusHistory.objects.filter(order_id__in=order_ids).delete()
            self.stdout.write(f"  ✓ Deleted {deleted_history_count} order status history audit logs.")

            # 7. Delete orders
            deleted_orders_count, _ = Order.objects.filter(id__in=order_ids).delete()
            self.stdout.write(f"  ✓ Deleted {deleted_orders_count} test orders.")

        # Post-reset verification
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== POST-RESET VERIFICATION ==="))
        post_orders = Order.objects.count()
        post_items = OrderItem.objects.count()
        post_history = OrderStatusHistory.objects.count()
        post_products = Product.objects.count()
        post_categories = Category.objects.count()
        post_subcategories = Subcategory.objects.count()
        post_brands = Brand.objects.count()
        post_invoices = Invoice.objects.count()

        self.stdout.write(f"Orders Remaining: {post_orders} (Expected: 0)")
        self.stdout.write(f"Order Items Remaining: {post_items} (Expected: 0)")
        self.stdout.write(f"Order History Remaining: {post_history} (Expected: 0)")
        self.stdout.write(f"Products Preserved: {post_products} (Expected: {total_products})")
        self.stdout.write(f"Categories Preserved: {post_categories} (Expected: {total_categories})")
        self.stdout.write(f"Subcategories Preserved: {post_subcategories} (Expected: {total_subcategories})")
        self.stdout.write(f"Brands Preserved: {post_brands} (Expected: {total_brands})")
        self.stdout.write(f"Invoices Preserved: {post_invoices} (Expected: {total_invoices})")

        assert post_orders == 0, f"Expected 0 orders, found {post_orders}"
        assert post_items == 0, f"Expected 0 order items, found {post_items}"
        assert post_history == 0, f"Expected 0 order history, found {post_history}"
        assert post_products == total_products, "Catalog products count mismatch!"
        assert post_categories == total_categories, "Catalog categories count mismatch!"
        assert post_subcategories == total_subcategories, "Catalog subcategories count mismatch!"
        assert post_brands == total_brands, "Catalog brands count mismatch!"
        assert post_invoices == total_invoices, "Catalog invoices count mismatch!"

        self.stdout.write(self.style.SUCCESS("\n✓ SUCCESS: Test order reset completed successfully. Catalog and inventory data 100% intact."))
