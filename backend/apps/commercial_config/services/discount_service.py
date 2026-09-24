from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from django.utils import timezone

from apps.commercial_config.models import OrderDiscount, DiscountType


@dataclass(frozen=True)
class DiscountCalculationResult:
    is_valid: bool
    code: str
    discount_type: str
    discount_value: Decimal
    calculated_discount: Decimal
    description: str
    error_message: Optional[str] = None


class DiscountService:
    """
    Promotional coupon and cart discount calculation engine.
    Applies qualification thresholds, percentage ceilings, and non-negative floor constraints.
    """

    MAX_ORDER_DISCOUNT_RATIO = Decimal('0.50')  # 50% maximum combined discount cap (DEC-1.5-04)

    @classmethod
    def evaluate_order_discount(
        cls,
        code: str,
        order_amount: Decimal,
        existing_product_discounts: Decimal = Decimal('0.00'),
    ) -> DiscountCalculationResult:
        """
        Validate and compute discount against an order subtotal.
        """
        if not isinstance(order_amount, Decimal):
            order_amount = Decimal(str(order_amount))

        if not code or not code.strip():
            return DiscountCalculationResult(
                is_valid=False,
                code='',
                discount_type='',
                discount_value=Decimal('0.00'),
                calculated_discount=Decimal('0.00'),
                description='',
                error_message='Coupon code is required.'
            )

        clean_code = code.strip().upper()
        now = timezone.now()

        coupon = OrderDiscount.objects.filter(code__iexact=clean_code).first()
        if not coupon:
            return DiscountCalculationResult(
                is_valid=False,
                code=clean_code,
                discount_type='',
                discount_value=Decimal('0.00'),
                calculated_discount=Decimal('0.00'),
                description='',
                error_message=f"Coupon code '{clean_code}' does not exist."
            )

        if not coupon.is_active:
            return DiscountCalculationResult(
                is_valid=False,
                code=clean_code,
                discount_type=coupon.discount_type,
                discount_value=coupon.discount_value,
                calculated_discount=Decimal('0.00'),
                description=coupon.description,
                error_message=f"Coupon code '{clean_code}' is currently inactive."
            )

        if coupon.valid_from and coupon.valid_from > now:
            return DiscountCalculationResult(
                is_valid=False,
                code=clean_code,
                discount_type=coupon.discount_type,
                discount_value=coupon.discount_value,
                calculated_discount=Decimal('0.00'),
                description=coupon.description,
                error_message=f"Coupon code '{clean_code}' is not yet valid."
            )

        if coupon.valid_until and coupon.valid_until < now:
            return DiscountCalculationResult(
                is_valid=False,
                code=clean_code,
                discount_type=coupon.discount_type,
                discount_value=coupon.discount_value,
                calculated_discount=Decimal('0.00'),
                description=coupon.description,
                error_message=f"Coupon code '{clean_code}' has expired."
            )

        if order_amount < coupon.min_order_value:
            return DiscountCalculationResult(
                is_valid=False,
                code=clean_code,
                discount_type=coupon.discount_type,
                discount_value=coupon.discount_value,
                calculated_discount=Decimal('0.00'),
                description=coupon.description,
                error_message=f"Minimum order amount of ₹{coupon.min_order_value} required to apply coupon '{clean_code}'."
            )

        # Compute discount
        if coupon.discount_type == DiscountType.PERCENTAGE:
            calc = (order_amount * (coupon.discount_value / Decimal('100.00'))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if coupon.max_discount_cap and calc > coupon.max_discount_cap:
                calc = coupon.max_discount_cap
        else:
            calc = min(coupon.discount_value, order_amount)

        # Stacking protection: combined product + order discounts cannot exceed max ratio (50%)
        max_combined = (order_amount * cls.MAX_ORDER_DISCOUNT_RATIO).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        max_allowed = max(Decimal('0.00'), max_combined - existing_product_discounts)
        calc = min(calc, max_allowed, order_amount)

        return DiscountCalculationResult(
            is_valid=True,
            code=coupon.code,
            discount_type=coupon.discount_type,
            discount_value=coupon.discount_value,
            calculated_discount=calc,
            description=coupon.description,
        )
