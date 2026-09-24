from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any, Optional
from django.utils import timezone

from apps.products.models import Product
from .tax_service import TaxService, TaxCalculationResult
from .discount_service import DiscountService, DiscountCalculationResult
from .delivery_service import DeliveryService, DeliveryCalculationResult


@dataclass(frozen=True)
class LineItemCalculation:
    product: Product
    product_name: str
    sku: str
    primary_image: str
    mrp: Decimal
    unit_price: Decimal
    quantity: int
    gross_amount: Decimal
    product_discount: Decimal
    net_subtotal: Decimal
    taxable_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal


@dataclass(frozen=True)
class BillingPipelineResult:
    items: List[LineItemCalculation]
    subtotal_mrp: Decimal
    product_discounts_total: Decimal
    net_subtotal: Decimal
    order_discount_amount: Decimal
    total_discount: Decimal
    taxable_amount: Decimal
    tax_result: TaxCalculationResult
    delivery_result: DeliveryCalculationResult
    gross_total: Decimal
    final_payable_amount: Decimal
    calculation_snapshot: Dict[str, Any]

    @property
    def subtotal(self) -> Decimal:
        return self.net_subtotal

    @property
    def order_discount(self) -> Decimal:
        return self.order_discount_amount

    @property
    def total_amount(self) -> Decimal:
        return self.final_payable_amount

    @property
    def tax_amount(self) -> Decimal:
        return self.tax_result.tax_amount

    @property
    def cgst_amount(self) -> Decimal:
        return self.tax_result.cgst_amount

    @property
    def sgst_amount(self) -> Decimal:
        return self.tax_result.sgst_amount

    @property
    def igst_amount(self) -> Decimal:
        return self.tax_result.igst_amount

    @property
    def shipping_fee(self) -> Decimal:
        return self.delivery_result.final_shipping_fee


class BillingService:
    """
    Deterministic 14-step billing pipeline engine for Vee Power Electricals.
    Executes end-to-end pricing, discount, tax, delivery, and snapshot compilations.
    """

    @classmethod
    def calculate_order(
        cls,
        items_data: List[Dict[str, Any]],
        destination_state: str,
        destination_pincode: str = '',
        distance_km: Optional[Decimal] = None,
        coupon_code: Optional[str] = None,
        override_tax_mode: Optional[str] = None,
    ) -> BillingPipelineResult:
        """
        Execute the canonical 14-step billing pipeline.
        """
        if not items_data:
            raise ValueError("Cart items list cannot be empty.")

        calculated_items: List[LineItemCalculation] = []
        subtotal_mrp = Decimal('0.00')
        net_subtotal = Decimal('0.00')
        product_discounts_total = Decimal('0.00')

        # 1-5. Validate Items & Compile Line Subtotals
        for item in items_data:
            product = item.get('product')
            product_id = item.get('product_id')
            qty = int(item.get('quantity', 1))

            if qty <= 0:
                raise ValueError(f"Quantity must be a positive integer, got {qty}.")

            if not product:
                if not product_id:
                    raise ValueError("Product reference or product_id is required.")
                product = Product.objects.get(id=product_id)

            if not product.active:
                raise ValueError(f"Product '{product.name}' is inactive/discontinued.")

            mrp = product.mrp.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            price = product.price.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            gross = (mrp * qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            net_line = (price * qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            prod_discount = (gross - net_line).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            subtotal_mrp += gross
            net_subtotal += net_line
            product_discounts_total += prod_discount

            calculated_items.append(
                LineItemCalculation(
                    product=product,
                    product_name=product.name,
                    sku=product.sku,
                    primary_image=product.primary_image,
                    mrp=mrp,
                    unit_price=price,
                    quantity=qty,
                    gross_amount=gross,
                    product_discount=prod_discount,
                    net_subtotal=net_line,
                    taxable_amount=net_line,
                    tax_rate=Decimal('18.00'),
                    tax_amount=Decimal('0.00'),  # Populated after tax allocation
                    total_amount=net_line,
                )
            )

        # 6-7. Order-Level Coupon Discount Evaluation
        order_discount_amount = Decimal('0.00')
        coupon_snapshot: Dict[str, Any] = {}
        if coupon_code and coupon_code.strip():
            disc_res: DiscountCalculationResult = DiscountService.evaluate_order_discount(
                code=coupon_code,
                order_amount=net_subtotal,
                existing_product_discounts=product_discounts_total,
            )
            if disc_res.is_valid:
                order_discount_amount = disc_res.calculated_discount
                coupon_snapshot = {
                    'code': disc_res.code,
                    'type': disc_res.discount_type,
                    'value': str(disc_res.discount_value),
                    'calculated_discount': str(disc_res.calculated_discount),
                    'description': disc_res.description,
                }
            else:
                raise ValueError(disc_res.error_message or "Invalid coupon code.")

        total_discount = product_discounts_total + order_discount_amount

        # 8. Taxable Amount Determination
        taxable_amount = max(Decimal('0.00'), net_subtotal - order_discount_amount)

        # 9. Statutory Tax Calculation
        tax_result: TaxCalculationResult = TaxService.calculate_tax(
            amount=taxable_amount,
            destination_state=destination_state,
            override_tax_mode=override_tax_mode,
        )

        # 10-11. Delivery Tariff & Free Shipping Qualification
        delivery_result: DeliveryCalculationResult = DeliveryService.calculate_delivery(
            destination_state=destination_state,
            taxable_amount=taxable_amount,
            distance_km=distance_km,
        )

        # 12. Gross Payable Total Compilation
        gross_total = (
            tax_result.taxable_amount
            + tax_result.total_tax_amount
            + delivery_result.final_shipping_fee
        ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # 13. Floor Guarantee
        final_payable = max(Decimal('0.00'), gross_total)

        # 14. Historical Snapshot Assembly
        calculation_snapshot = {
            'snapshot_version': '1.0',
            'calculated_at': timezone.now().isoformat(),
            'currency': 'INR',
            'pricing_mode': tax_result.tax_mode,
            'destination': {
                'state': destination_state,
                'pincode': destination_pincode,
                'distance_km': str(distance_km) if distance_km is not None else None,
            },
            'subtotal_mrp': str(subtotal_mrp),
            'product_discounts_total': str(product_discounts_total),
            'subtotal': str(net_subtotal),
            'net_subtotal': str(net_subtotal),
            'order_discount': coupon_snapshot,
            'applied_coupon': coupon_snapshot,
            'total_discount': str(total_discount),
            'taxable_amount': str(tax_result.taxable_amount),
            'tax_breakdown': {
                'tax_type': tax_result.tax_type,
                'is_intra_state': tax_result.is_intra_state,
                'total_rate_percent': str(tax_result.total_tax_rate),
                'cgst_rate_percent': str(tax_result.cgst_rate),
                'cgst_amount': str(tax_result.cgst_amount),
                'sgst_rate_percent': str(tax_result.sgst_rate),
                'sgst_amount': str(tax_result.sgst_amount),
                'igst_rate_percent': str(tax_result.igst_rate),
                'igst_amount': str(tax_result.igst_amount),
                'total_tax_amount': str(tax_result.total_tax_amount),
            },
            'delivery': {
                'rule_applied': delivery_result.rule_applied,
                'distance_km': str(delivery_result.distance_km) if delivery_result.distance_km is not None else None,
                'calculated_fee': str(delivery_result.calculated_fee),
                'free_delivery_threshold': str(delivery_result.free_delivery_threshold),
                'is_free_delivery': delivery_result.is_free_delivery,
                'final_shipping_fee': str(delivery_result.final_shipping_fee),
            },
            'gross_total': str(gross_total),
            'final_payable_amount': str(final_payable),
        }

        return BillingPipelineResult(
            items=calculated_items,
            subtotal_mrp=subtotal_mrp,
            product_discounts_total=product_discounts_total,
            net_subtotal=net_subtotal,
            order_discount_amount=order_discount_amount,
            total_discount=total_discount,
            taxable_amount=tax_result.taxable_amount,
            tax_result=tax_result,
            delivery_result=delivery_result,
            gross_total=gross_total,
            final_payable_amount=final_payable,
            calculation_snapshot=calculation_snapshot,
        )
