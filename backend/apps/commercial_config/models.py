from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.common.models import TimeStampedModel


class TaxMode(models.TextChoices):
    TAX_EXCLUSIVE = 'TAX_EXCLUSIVE', 'Tax Exclusive (Added at checkout)'
    TAX_INCLUSIVE = 'TAX_INCLUSIVE', 'Tax Inclusive (Extracted backwards)'


class DiscountType(models.TextChoices):
    PERCENTAGE = 'percentage', 'Percentage'
    FIXED = 'fixed', 'Fixed Rupee Amount'


class RoundingMode(models.TextChoices):
    ROUND_HALF_UP = 'ROUND_HALF_UP', 'Round Half Up'
    NO_ROUNDING = 'NO_ROUNDING', 'No Rounding'


class TaxConfiguration(TimeStampedModel):
    """
    Versioned statutory GST tax configuration governing rates and intra/inter-state split.
    """
    tax_name = models.CharField(max_length=100, default='Indian Standard GST')
    default_tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
    cgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('9.00'))
    sgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('9.00'))
    igst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
    tax_calculation_mode = models.CharField(
        max_length=20,
        choices=TaxMode.choices,
        default=TaxMode.TAX_EXCLUSIVE
    )
    business_state = models.CharField(max_length=100, default='Tamil Nadu')
    effective_from = models.DateTimeField(default=timezone.now)
    effective_until = models.DateTimeField(null=True, blank=True)
    version_number = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        db_table = 'tax_configurations'
        verbose_name = 'Tax Configuration'
        verbose_name_plural = 'Tax Configurations'
        constraints = [
            models.CheckConstraint(
                check=models.Q(tax_calculation_mode__in=['TAX_EXCLUSIVE', 'TAX_INCLUSIVE']),
                name='chk_tax_mode'
            ),
            models.CheckConstraint(
                check=(
                    models.Q(default_tax_rate__gte=0) &
                    models.Q(cgst_rate__gte=0) &
                    models.Q(sgst_rate__gte=0) &
                    models.Q(igst_rate__gte=0)
                ),
                name='chk_tax_rates'
            ),
        ]
        indexes = [
            models.Index(fields=['is_active', 'effective_from', 'effective_until'], name='idx_tax_lookup'),
        ]

    def __str__(self):
        return f"{self.tax_name} v{self.version_number} ({self.default_tax_rate}% - {self.tax_calculation_mode})"


class DeliveryConfiguration(TimeStampedModel):
    """
    Dispatch origin hub coordinates and delivery tariff parameters.
    """
    origin_name = models.CharField(max_length=150, default='Vee Power Coimbatore Hub')
    origin_address = models.CharField(max_length=255, default='No 28/1, 2nd floor, MTP Road, NSN palayam')
    origin_city = models.CharField(max_length=100, default='Coimbatore')
    origin_state = models.CharField(max_length=100, default='Tamil Nadu')
    origin_pincode = models.CharField(max_length=10, default='641031')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, default=Decimal('11.084800'), null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, default=Decimal('76.941600'), null=True, blank=True)
    base_delivery_charge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('100.00'))
    distance_slab_km = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('10.00'))
    charge_per_slab = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('100.00'))
    free_delivery_threshold = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('999.00'))
    fallback_regional_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('100.00'))
    free_delivery_enabled = models.BooleanField(default=True)
    effective_from = models.DateTimeField(default=timezone.now)
    effective_until = models.DateTimeField(null=True, blank=True)
    version_number = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        db_table = 'delivery_configurations'
        verbose_name = 'Delivery Configuration'
        verbose_name_plural = 'Delivery Configurations'
        constraints = [
            models.CheckConstraint(
                check=models.Q(base_delivery_charge__gte=0) & models.Q(distance_slab_km__gt=0),
                name='chk_del_params'
            ),
            models.CheckConstraint(
                check=models.Q(charge_per_slab__gte=0) & models.Q(free_delivery_threshold__gte=0) & models.Q(fallback_regional_rate__gte=0),
                name='chk_del_aux_params'
            ),
        ]
        indexes = [
            models.Index(fields=['is_active', 'effective_from', 'effective_until'], name='idx_del_lookup'),
        ]

    def __str__(self):
        return f"{self.origin_name} v{self.version_number} (Origin: {self.origin_city}, Free > ₹{self.free_delivery_threshold})"


class DistanceSlab(TimeStampedModel):
    """
    Granular distance tariff slabs following continuous half-open intervals [min_distance_km, max_distance_km).
    """
    delivery_config = models.ForeignKey(
        DeliveryConfiguration,
        on_delete=models.CASCADE,
        related_name='slabs'
    )
    min_distance_km = models.DecimalField(max_digits=6, decimal_places=2)
    max_distance_km = models.DecimalField(max_digits=6, decimal_places=2)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'distance_slabs'
        verbose_name = 'Distance Slab'
        verbose_name_plural = 'Distance Slabs'
        ordering = ['sort_order', 'min_distance_km']
        constraints = [
            models.CheckConstraint(
                check=models.Q(max_distance_km__gt=models.F('min_distance_km')) & models.Q(min_distance_km__gte=0),
                name='chk_slab_range'
            ),
            models.CheckConstraint(
                check=models.Q(rate__gte=0),
                name='chk_slab_rate'
            ),
        ]
        indexes = [
            models.Index(fields=['delivery_config', 'min_distance_km', 'max_distance_km'], name='idx_slabs_config_range'),
        ]

    def __str__(self):
        return f"[{self.min_distance_km} - {self.max_distance_km} km) -> ₹{self.rate}"


class ShippingRule(TimeStampedModel):
    """
    Regional state flat rates used as Tier 5 fallback when destination distance cannot be geocoded.
    """
    state = models.CharField(max_length=100, unique=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    estimated_days_min = models.PositiveIntegerField(default=2)
    estimated_days_max = models.PositiveIntegerField(default=5)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'shipping_rules'
        verbose_name = 'Shipping Rule'
        verbose_name_plural = 'Shipping Rules'
        constraints = [
            models.CheckConstraint(
                check=models.Q(cost__gte=0),
                name='chk_ship_cost'
            ),
        ]

    def __str__(self):
        return f"{self.state}: ₹{self.cost} ({self.estimated_days_min}-{self.estimated_days_max} days)"


class OrderDiscount(TimeStampedModel):
    """
    Cart-level promotional coupon codes and order discounts.
    """
    code = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, blank=True, default='')
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.PERCENTAGE
    )
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    max_discount_cap = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    usage_limit_total = models.PositiveIntegerField(null=True, blank=True)
    usage_limit_per_user = models.PositiveIntegerField(default=1)
    allow_stacking = models.BooleanField(default=False)
    valid_from = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        db_table = 'order_discounts'
        verbose_name = 'Order Discount'
        verbose_name_plural = 'Order Discounts'
        constraints = [
            models.CheckConstraint(
                check=models.Q(discount_type__in=['percentage', 'fixed']),
                name='chk_coupon_type'
            ),
            models.CheckConstraint(
                check=models.Q(discount_value__gt=0),
                name='chk_coupon_value_pos'
            ),
            models.CheckConstraint(
                check=models.Q(min_order_value__gte=0),
                name='chk_coupon_min_order'
            ),
        ]

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.upper().strip()

    def save(self, *args, **kwargs):
        if self.code:
            self.code = self.code.upper().strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} ({self.discount_value} {self.discount_type})"


class CompanyStoreConfiguration(models.Model):
    """
    Consolidated master profile of Vee Power Electricals: legal profile, bank coordinates, fulfillment policies & toggles.
    Single-row singleton pattern.
    """
    legal_company_name = models.CharField(max_length=200, default='Vee Power Electricals')
    brand_name = models.CharField(max_length=150, default='Vee Power Electricals')
    gstin = models.CharField(max_length=15, default='33AABFV1234A1ZX')
    pan = models.CharField(max_length=10, default='AABFV1234A')
    registered_address = models.TextField(
        default='No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031'
    )
    warehouse_address = models.TextField(
        default='No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031'
    )
    support_email = models.EmailField(max_length=255, default='support@veepower.in')
    support_phone = models.CharField(max_length=20, default='+91 98765 43210')
    bank_name = models.CharField(max_length=150, default='State Bank of India')
    bank_account_number = models.CharField(max_length=50, default='38492019482')
    bank_ifsc = models.CharField(max_length=20, default='SBIN0001234')
    bank_branch = models.CharField(max_length=100, default='Coimbatore Main Branch')
    currency_code = models.CharField(max_length=10, default='INR')
    currency_symbol = models.CharField(max_length=10, default='₹')
    rounding_mode = models.CharField(
        max_length=20,
        choices=RoundingMode.choices,
        default=RoundingMode.ROUND_HALF_UP
    )
    auto_cancel_unpaid_minutes = models.PositiveIntegerField(default=30)
    cancellation_allowed_until = models.CharField(max_length=30, default='CONFIRMED')
    return_window_days = models.PositiveIntegerField(default=7)
    require_shipping_awb = models.BooleanField(default=True)
    upi_enabled = models.BooleanField(default=True)
    cards_enabled = models.BooleanField(default=True)
    netbanking_enabled = models.BooleanField(default=True)
    cod_enabled = models.BooleanField(default=True)
    cod_max_limit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('10000.00'))
    guest_checkout_enabled = models.BooleanField(default=False)
    is_maintenance_mode = models.BooleanField(default=False)
    maintenance_notice = models.TextField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'company_store_configurations'
        verbose_name = 'Company & Store Configuration'
        verbose_name_plural = 'Company & Store Configurations'
        constraints = [
            models.CheckConstraint(
                check=models.Q(rounding_mode__in=['ROUND_HALF_UP', 'NO_ROUNDING']),
                name='chk_store_rounding'
            ),
            models.CheckConstraint(
                check=models.Q(cod_max_limit__gte=0),
                name='chk_cod_limit'
            ),
        ]

    def __str__(self):
        return f"{self.legal_company_name} Configuration (GSTIN: {self.gstin})"
