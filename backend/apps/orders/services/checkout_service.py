import uuid
from decimal import Decimal
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.users.models import CustomerAddress
from apps.products.models import Product
from apps.inventory.services import InventoryService
from apps.commercial_config.services import BillingService, BillingPipelineResult
from apps.orders.models import Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusHistory


class CheckoutService:
    """
    Atomic retail e-commerce checkout workflow engine.
    Orchestrates address validation, stock verification, deterministic billing calculation,
    order creation, stock reservation, and initial audit trail logging.
    """

    @classmethod
    @transaction.atomic
    def process_checkout(
        cls,
        user,
        shipping_address_id: int,
        items_data: List[Dict[str, Any]],
        billing_address_id: Optional[int] = None,
        payment_method: str = 'UPI',
        coupon_code: Optional[str] = None,
        notes: str = '',
    ) -> Order:
        """
        Execute atomic customer checkout.
        """
        # 1. Validate Shipping Address belongs to user
        shipping_address_obj = CustomerAddress.objects.filter(
            id=shipping_address_id,
            user=user,
        ).first()

        if not shipping_address_obj:
            raise ValidationError("Invalid shipping address. Address does not exist or does not belong to you.")

        shipping_snapshot = {
            'id': shipping_address_obj.id,
            'recipient_name': shipping_address_obj.recipient_name,
            'phone': shipping_address_obj.phone,
            'address_line1': shipping_address_obj.address_line1,
            'address_line2': shipping_address_obj.address_line2,
            'landmark': shipping_address_obj.landmark,
            'city': shipping_address_obj.city,
            'state': shipping_address_obj.state,
            'pincode': shipping_address_obj.pincode,
            'address_type': shipping_address_obj.address_type,
        }

        billing_snapshot = None
        if billing_address_id:
            billing_obj = CustomerAddress.objects.filter(
                id=billing_address_id,
                user=user,
            ).first()
            if billing_obj:
                billing_snapshot = {
                    'id': billing_obj.id,
                    'recipient_name': billing_obj.recipient_name,
                    'phone': billing_obj.phone,
                    'address_line1': billing_obj.address_line1,
                    'address_line2': billing_obj.address_line2,
                    'city': billing_obj.city,
                    'state': billing_obj.state,
                    'pincode': billing_obj.pincode,
                }
        if not billing_snapshot:
            billing_snapshot = shipping_snapshot

        # 2. Lock Product Rows to Guarantee Atomicity
        product_ids = [item['product_id'] for item in items_data]
        products_qs = Product.objects.select_for_update().filter(id__in=product_ids)
        product_map = {p.id: p for p in products_qs}

        prepared_items_data = []
        for item in items_data:
            pid = item['product_id']
            qty = int(item['quantity'])
            product = product_map.get(pid)

            if not product:
                raise ValidationError(f"Product with ID {pid} was not found.")
            if not product.active:
                raise ValidationError(f"Product '{product.name}' is currently unavailable.")
            if product.stock < qty:
                raise ValidationError(
                    f"Insufficient stock for '{product.name}'. Available: {product.stock}, requested: {qty}."
                )

            prepared_items_data.append({
                'product': product,
                'quantity': qty,
            })

        # 3. Calculate Deterministic Pricing Pipeline
        billing_result: BillingPipelineResult = BillingService.calculate_order(
            items_data=prepared_items_data,
            destination_state=shipping_address_obj.state,
            destination_pincode=shipping_address_obj.pincode,
            coupon_code=coupon_code,
        )

        # 4. Generate Unique Order Number
        order_number = f"ORD-{timezone.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        customer_name = f"{user.first_name} {user.last_name}".strip() or getattr(user, 'username', '')

        # 5. Create Order
        order = Order.objects.create(
            order_number=order_number,
            user=user,
            customer_name=customer_name,
            customer_email=user.email,
            customer_phone=shipping_address_obj.phone or getattr(user, 'phone', '') or '',
            shipping_address=shipping_snapshot,
            billing_address=billing_snapshot,
            subtotal=billing_result.net_subtotal,
            product_discount=billing_result.product_discounts_total,
            order_discount=billing_result.order_discount_amount,
            total_discount=billing_result.total_discount,
            taxable_amount=billing_result.taxable_amount,
            cgst_amount=billing_result.tax_result.cgst_amount,
            sgst_amount=billing_result.tax_result.sgst_amount,
            igst_amount=billing_result.tax_result.igst_amount,
            tax_amount=billing_result.tax_result.total_tax_amount,
            shipping_fee=billing_result.delivery_result.final_shipping_fee,
            shipping_discount=(billing_result.delivery_result.calculated_fee if billing_result.delivery_result.is_free_delivery else Decimal('0.00')),
            total_amount=billing_result.final_payable_amount,
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method=payment_method,
            notes=notes,
            calculation_snapshot=billing_result.calculation_snapshot,
        )

        # 6. Create Order Items and Execute Concurrency-Safe Stock Deductions
        for calc_item in billing_result.items:
            OrderItem.objects.create(
                order=order,
                product=calc_item.product,
                product_name=calc_item.product_name,
                sku=calc_item.sku,
                image_url=calc_item.primary_image,
                mrp=calc_item.mrp,
                unit_price=calc_item.unit_price,
                quantity=calc_item.quantity,
                line_discount=calc_item.product_discount,
                taxable_amount=calc_item.taxable_amount,
                tax_rate=calc_item.tax_rate,
                tax_amount=calc_item.tax_amount,
                subtotal=calc_item.net_subtotal,
                total_amount=calc_item.total_amount,
            )

            # Deduct stock via InventoryService
            InventoryService.sale_deduct_stock(
                product=calc_item.product,
                quantity=calc_item.quantity,
                order=order,
                performed_by=user,
                notes=f"Order #{order.order_number} checkout deduction",
            )

        # 7. Record Initial Status History
        OrderStatusHistory.objects.create(
            order=order,
            previous_status=None,
            new_status=OrderStatus.PENDING,
            changed_by=user,
            reason="Customer placed order at checkout",
        )

        return order
