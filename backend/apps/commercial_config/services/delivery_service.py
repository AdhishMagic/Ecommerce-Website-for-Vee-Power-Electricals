from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
import math
from typing import Optional

from apps.commercial_config.models import (
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
)


@dataclass(frozen=True)
class DeliveryCalculationResult:
    rule_applied: str
    distance_km: Optional[Decimal]
    calculated_fee: Decimal
    free_delivery_threshold: Decimal
    is_free_delivery: bool
    final_shipping_fee: Decimal

    @property
    def shipping_fee(self) -> Decimal:
        return self.final_shipping_fee

    @property
    def shipping_discount(self) -> Decimal:
        return self.calculated_fee if self.is_free_delivery else Decimal('0.00')


class DeliveryService:
    """
    Logistics delivery tariff and distance slab calculation engine.
    Computes road/radial tariffs from Coimbatore hub, regional fallback rules,
    and statutory free delivery qualifications.
    """

    DEFAULT_BASE_FEE = Decimal('100.00')
    DEFAULT_FREE_THRESHOLD = Decimal('999.00')

    @classmethod
    def get_active_delivery_configuration(cls) -> Optional[DeliveryConfiguration]:
        return DeliveryConfiguration.objects.filter(is_active=True).order_by('-version_number').first()

    @classmethod
    def calculate_delivery(
        cls,
        destination_state: Optional[str] = None,
        taxable_amount: Optional[Decimal] = None,
        distance_km: Optional[Decimal] = None,
        delivery_config: Optional[DeliveryConfiguration] = None,
        subtotal: Optional[Decimal] = None,
        state: Optional[str] = None,
    ) -> DeliveryCalculationResult:
        """
        Compute delivery tariff based on Distance Slabs, State Rules, or Base Charge.
        """
        dest_state = destination_state or state or "Tamil Nadu"
        amount = taxable_amount if taxable_amount is not None else (subtotal if subtotal is not None else Decimal('0.00'))
        if not isinstance(amount, Decimal):
            amount = Decimal(str(amount))
        taxable_amount = amount

        if distance_km is not None and not isinstance(distance_km, Decimal):
            distance_km = Decimal(str(distance_km))

        if delivery_config is None:
            delivery_config = cls.get_active_delivery_configuration()

        base_charge = delivery_config.base_delivery_charge if delivery_config else cls.DEFAULT_BASE_FEE
        free_threshold = delivery_config.free_delivery_threshold if delivery_config else cls.DEFAULT_FREE_THRESHOLD
        free_enabled = delivery_config.free_delivery_enabled if delivery_config else True

        rule_applied = "BASE_CHARGE"
        raw_fee = base_charge

        # 1. Distance Slab Precedence (Authoritative Phase 2.1)
        if distance_km is not None and distance_km >= Decimal('0.00'):
            # Query active slabs with half-open interval [min, max)
            matching_slab = (
                DistanceSlab.objects.filter(
                    delivery_config=delivery_config,
                    is_active=True,
                    min_distance_km__lte=distance_km,
                    max_distance_km__gt=distance_km,
                )
                .order_by('sort_order')
                .first()
            )

            if matching_slab:
                raw_fee = matching_slab.rate
                rule_applied = f"DISTANCE_SLAB_{matching_slab.min_distance_km}_{matching_slab.max_distance_km}KM"
            elif delivery_config and delivery_config.distance_slab_km > 0:
                # Step-based mathematical calculation beyond discrete slabs
                slab_step = delivery_config.distance_slab_km
                charge_per_slab = delivery_config.charge_per_slab
                slabs_count = max(0, math.ceil(distance_km / slab_step) - 1)
                raw_fee = base_charge + (Decimal(slabs_count) * charge_per_slab)
                rule_applied = "DISTANCE_SLAB_DYNAMIC"
        else:
            # 2. State-Specific Regional Shipping Rule Fallback
            shipping_rule = (
                ShippingRule.objects.filter(
                    state__iexact=dest_state.strip(),
                    is_active=True,
                ).first()
            )
            if shipping_rule:
                raw_fee = shipping_rule.cost
                rule_applied = f"STATE_SHIPPING_RULE_{shipping_rule.state.upper()}"
            elif delivery_config and delivery_config.fallback_regional_rate:
                raw_fee = delivery_config.fallback_regional_rate
                rule_applied = "REGIONAL_FALLBACK_RATE"

        raw_fee = raw_fee.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # 3. Free Delivery Evaluation
        is_free_delivery = free_enabled and (taxable_amount >= free_threshold)
        final_fee = Decimal('0.00') if is_free_delivery else raw_fee

        return DeliveryCalculationResult(
            rule_applied=rule_applied,
            distance_km=distance_km,
            calculated_fee=raw_fee,
            free_delivery_threshold=free_threshold,
            is_free_delivery=is_free_delivery,
            final_shipping_fee=final_fee,
        )
