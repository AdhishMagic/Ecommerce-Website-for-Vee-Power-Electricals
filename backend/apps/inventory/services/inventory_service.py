from decimal import Decimal
from typing import Tuple, List, Optional, Union
from django.db import transaction
from django.core.exceptions import ValidationError

from apps.products.models import Product
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.orders.models import Order


class InventoryService:
    """
    Transaction-safe inventory workflow engine for Vee Power Electricals.
    Enforces row-level concurrency locking (select_for_update), non-negative stock invariants,
    and immutable append-only ledger transaction logging.
    """

    @classmethod
    @transaction.atomic
    def restock_product(
        cls,
        product_id: int,
        quantity: int,
        performed_by=None,
        notes: str = "",
    ) -> Tuple[Product, StockTransaction]:
        """
        Warehouse restocking: increments product physical inventory and logs an immutable RESTOCK ledger entry.
        """
        if quantity <= 0:
            raise ValidationError(f"Restock quantity must be a positive integer, got {quantity}.")

        product = Product.objects.select_for_update().get(id=product_id)
        product.stock += quantity
        product.save(update_fields=['stock', 'updated_at'])

        tx = StockTransaction.objects.create(
            product=product,
            change_amount=quantity,
            transaction_type=StockTransactionType.RESTOCK,
            performed_by=performed_by,
            notes=notes or f"Restocked {quantity} units",
        )

        return product, tx

    @classmethod
    @transaction.atomic
    def sale_deduct_stock(
        cls,
        product: Optional[Product] = None,
        quantity: int = 1,
        order: Optional[Order] = None,
        performed_by=None,
        notes: str = "",
        product_id: Optional[int] = None,
    ) -> Tuple[Product, StockTransaction]:
        """
        Retail/B2B checkout allocation: decrements inventory and logs a SALE transaction.
        Supports passing product instance or product_id.
        """
        if quantity <= 0:
            raise ValidationError(f"Sale deduction quantity must be positive, got {quantity}.")

        target_id = product_id if product_id is not None else (product.id if product else None)
        if not target_id:
            raise ValidationError("Product or product_id must be provided for stock deduction.")

        locked_product = Product.objects.select_for_update().get(id=target_id)

        if not locked_product.active:
            raise ValidationError(f"Product '{locked_product.name}' is inactive/discontinued.")

        if locked_product.stock < quantity:
            raise ValidationError(
                f"Insufficient stock for '{locked_product.name}'. Available: {locked_product.stock}, requested: {quantity}."
            )

        locked_product.stock -= quantity
        locked_product.save(update_fields=['stock', 'updated_at'])

        order_ref = f"Order #{order.order_number} checkout deduction" if order else "Retail sale allocation"
        tx = StockTransaction.objects.create(
            product=locked_product,
            change_amount=-quantity,
            transaction_type=StockTransactionType.SALE,
            order=order,
            performed_by=performed_by,
            notes=notes or order_ref,
        )

        return locked_product, tx

    @classmethod
    @transaction.atomic
    def adjust_stock(
        cls,
        product_id: int,
        change_amount: int,
        performed_by=None,
        notes: str = "",
    ) -> Tuple[Product, StockTransaction]:
        """
        Audit stock adjustment: modifies inventory by change_amount (positive or negative)
        and enforces non-negative physical stock check constraint.
        """
        if change_amount == 0:
            raise ValidationError("Adjustment amount cannot be zero.")

        product = Product.objects.select_for_update().get(id=product_id)
        new_stock = product.stock + change_amount

        if new_stock < 0:
            raise ValidationError(
                f"Insufficient stock for adjustment. Current stock: {product.stock}, cannot reduce by {abs(change_amount)}."
            )

        product.stock = new_stock
        product.save(update_fields=['stock', 'updated_at'])

        tx = StockTransaction.objects.create(
            product=product,
            change_amount=change_amount,
            transaction_type=StockTransactionType.ADJUSTMENT,
            performed_by=performed_by,
            notes=notes or f"Inventory audit adjustment: {change_amount:+d}",
        )

        return product, tx

    @classmethod
    @transaction.atomic
    def restore_order_stock(
        cls,
        order: Order,
        performed_by=None,
        reason: str = "",
    ) -> List[StockTransaction]:
        """
        Restores deducted inventory upon order cancellation or return completion.
        Idempotent: verifies prior SALE transactions or existing items, and prevents duplicate RESTORATION.
        """
        # 1. Duplicate Restoration Guard: check if RETURN transactions already logged for this order
        prior_returns = StockTransaction.objects.filter(
            order=order,
            transaction_type=StockTransactionType.RETURN,
        )
        if prior_returns.exists():
            # Stock has already been restored for this order
            return []

        # 2. Check if order has items to restore
        if not order.items.exists():
            return []

        restored_txs: List[StockTransaction] = []

        # 3. For each order item, increment stock and append RETURN transaction
        for item in order.items.select_related('product').all():
            if not item.product:
                continue

            product = Product.objects.select_for_update().get(id=item.product.id)
            product.stock += item.quantity
            product.save(update_fields=['stock', 'updated_at'])

            tx = StockTransaction.objects.create(
                product=product,
                change_amount=item.quantity,
                transaction_type=StockTransactionType.RETURN,
                order=order,
                performed_by=performed_by,
                notes=reason or f"Restored {item.quantity} units from cancelled/returned Order #{order.order_number}",
            )
            restored_txs.append(tx)

        return restored_txs
