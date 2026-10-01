import re
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers

from apps.core.models import AdminConfigAuditLog
from .models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
)


class CompanyStoreConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyStoreConfiguration
        fields = '__all__'

    def validate_gstin(self, value):
        if value:
            clean_gstin = value.strip().upper()
            if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', clean_gstin):
                raise serializers.ValidationError("Invalid statutory Indian GSTIN format (15 alphanumeric characters).")
            return clean_gstin
        return value

    def validate_pan(self, value):
        if value:
            clean_pan = value.strip().upper()
            if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$', clean_pan):
                raise serializers.ValidationError("Invalid Indian PAN format (10 alphanumeric characters).")
            return clean_pan
        return value

    def validate_cod_max_limit(self, value):
        if value is not None and value < Decimal('0.00'):
            raise serializers.ValidationError("COD maximum limit cannot be negative.")
        return value

    def validate(self, data):
        gstin = data.get('gstin', getattr(self.instance, 'gstin', None))
        pan = data.get('pan', getattr(self.instance, 'pan', None))
        if gstin and pan:
            clean_gstin = gstin.strip().upper()
            clean_pan = pan.strip().upper()
            if len(clean_gstin) == 15 and clean_gstin[2:12] != clean_pan:
                raise serializers.ValidationError({"gstin": "GSTIN PAN segment (chars 3-12) must match the registered PAN."})
        return data


class TaxConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxConfiguration
        fields = [
            'id', 'tax_name', 'default_tax_rate', 'cgst_rate', 'sgst_rate',
            'igst_rate', 'tax_calculation_mode', 'business_state',
            'effective_from', 'effective_until', 'version_number',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        eff_from = data.get('effective_from', getattr(self.instance, 'effective_from', None))
        eff_until = data.get('effective_until', getattr(self.instance, 'effective_until', None))
        if eff_from and eff_until and eff_until <= eff_from:
            raise serializers.ValidationError({"effective_until": "effective_until must be strictly after effective_from."})

        for r in ['default_tax_rate', 'cgst_rate', 'sgst_rate', 'igst_rate']:
            val = data.get(r, getattr(self.instance, r, None))
            if val is not None and val < Decimal('0.00'):
                raise serializers.ValidationError({r: f"{r} cannot be negative."})

        is_active = data.get('is_active', getattr(self.instance, 'is_active', True))
        b_state = data.get('business_state', getattr(self.instance, 'business_state', 'Tamil Nadu'))
        if is_active and eff_from:
            qs = TaxConfiguration.objects.filter(is_active=True)
            if b_state:
                qs = qs.filter(business_state__iexact=b_state.strip())
            if self.instance and self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)

            for other in qs:
                starts_before_other_ends = (other.effective_until is None) or (eff_from < other.effective_until)
                ends_after_other_starts = (eff_until is None) or (eff_until > other.effective_from)
                if starts_before_other_ends and ends_after_other_starts:
                    raise serializers.ValidationError({
                        "effective_from": f"Active TaxConfiguration effective period overlaps with version {other.version_number}."
                    })

        return data


class DistanceSlabSerializer(serializers.ModelSerializer):
    class Meta:
        model = DistanceSlab
        fields = [
            'id', 'delivery_config', 'min_distance_km', 'max_distance_km',
            'rate', 'sort_order', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def validate(self, data):
        min_d = data.get('min_distance_km', getattr(self.instance, 'min_distance_km', None))
        max_d = data.get('max_distance_km', getattr(self.instance, 'max_distance_km', None))
        if min_d is not None and min_d < Decimal('0.00'):
            raise serializers.ValidationError({"min_distance_km": "Minimum distance cannot be negative."})
        if min_d is not None and max_d is not None and max_d <= min_d:
            raise serializers.ValidationError({"max_distance_km": "Maximum distance must be strictly greater than minimum distance."})

        rate = data.get('rate', getattr(self.instance, 'rate', None))
        if rate is not None and rate < Decimal('0.00'):
            raise serializers.ValidationError({"rate": "Rate cannot be negative."})

        del_config = data.get('delivery_config', getattr(self.instance, 'delivery_config', None))
        is_active = data.get('is_active', getattr(self.instance, 'is_active', True))

        if del_config and is_active and min_d is not None and max_d is not None:
            del_config_id = getattr(del_config, 'id', del_config)
            qs = DistanceSlab.objects.filter(delivery_config_id=del_config_id, is_active=True)
            if self.instance and self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            for other in qs:
                if min_d < other.max_distance_km and max_d > other.min_distance_km:
                    raise serializers.ValidationError({
                        "min_distance_km": f"Distance slab [{min_d}, {max_d}) overlaps with existing slab [{other.min_distance_km}, {other.max_distance_km})."
                    })

        return data


class DeliveryConfigurationSerializer(serializers.ModelSerializer):
    slabs = DistanceSlabSerializer(many=True, read_only=True)

    class Meta:
        model = DeliveryConfiguration
        fields = [
            'id', 'origin_name', 'origin_address', 'origin_city', 'origin_state',
            'origin_pincode', 'latitude', 'longitude', 'base_delivery_charge',
            'distance_slab_km', 'charge_per_slab', 'free_delivery_threshold',
            'fallback_regional_rate', 'free_delivery_enabled', 'effective_from',
            'effective_until', 'version_number', 'is_active', 'slabs',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        eff_from = data.get('effective_from', getattr(self.instance, 'effective_from', None))
        eff_until = data.get('effective_until', getattr(self.instance, 'effective_until', None))
        if eff_from and eff_until and eff_until <= eff_from:
            raise serializers.ValidationError({"effective_until": "effective_until must be strictly after effective_from."})

        for f in ['base_delivery_charge', 'charge_per_slab', 'free_delivery_threshold', 'fallback_regional_rate']:
            val = data.get(f, getattr(self.instance, f, None))
            if val is not None and val < Decimal('0.00'):
                raise serializers.ValidationError({f: f"{f} cannot be negative."})

        slab_km = data.get('distance_slab_km', getattr(self.instance, 'distance_slab_km', None))
        if slab_km is not None and slab_km <= Decimal('0.00'):
            raise serializers.ValidationError({"distance_slab_km": "distance_slab_km must be greater than zero."})

        return data


class ShippingRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingRule
        fields = [
            'id', 'state', 'cost', 'estimated_days_min', 'estimated_days_max',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_cost(self, value):
        if value < Decimal('0.00'):
            raise serializers.ValidationError("Shipping cost cannot be negative.")
        return value

    def validate(self, data):
        min_days = data.get('estimated_days_min', getattr(self.instance, 'estimated_days_min', 2))
        max_days = data.get('estimated_days_max', getattr(self.instance, 'estimated_days_max', 5))
        if min_days is not None and max_days is not None and max_days < min_days:
            raise serializers.ValidationError({"estimated_days_max": "Maximum estimated days must be greater than or equal to minimum days."})
        return data


class OrderDiscountSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderDiscount
        fields = [
            'id', 'code', 'description', 'discount_type', 'discount_value',
            'min_order_value', 'max_discount_cap', 'usage_limit_total',
            'usage_limit_per_user', 'allow_stacking', 'valid_from',
            'valid_until', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_code(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Coupon code cannot be blank.")
        return value.strip().upper()

    def validate_discount_value(self, value):
        if value <= Decimal('0.00'):
            raise serializers.ValidationError("Discount value must be greater than zero.")
        return value

    def validate(self, data):
        disc_type = data.get('discount_type', getattr(self.instance, 'discount_type', DiscountType.PERCENTAGE))
        val = data.get('discount_value', getattr(self.instance, 'discount_value', None))
        if disc_type == DiscountType.PERCENTAGE and val is not None and val > Decimal('100.00'):
            raise serializers.ValidationError({"discount_value": "Percentage discount cannot exceed 100%."})

        v_from = data.get('valid_from', getattr(self.instance, 'valid_from', None))
        v_until = data.get('valid_until', getattr(self.instance, 'valid_until', None))
        if v_from and v_until and v_until <= v_from:
            raise serializers.ValidationError({"valid_until": "valid_until must be strictly after valid_from."})

        min_val = data.get('min_order_value', getattr(self.instance, 'min_order_value', None))
        if min_val is not None and min_val < Decimal('0.00'):
            raise serializers.ValidationError({"min_order_value": "Minimum order value cannot be negative."})

        max_cap = data.get('max_discount_cap', getattr(self.instance, 'max_discount_cap', None))
        if max_cap is not None and max_cap < Decimal('0.00'):
            raise serializers.ValidationError({"max_discount_cap": "Maximum discount cap cannot be negative."})

        return data


class CouponValidationInputSerializer(serializers.Serializer):
    code = serializers.CharField(required=True)
    order_amount = serializers.DecimalField(required=True, max_digits=12, decimal_places=2, min_value=0)


class AdminConfigAuditLogSerializer(serializers.ModelSerializer):
    admin_email = serializers.CharField(source='admin_user.email', read_only=True)

    class Meta:
        model = AdminConfigAuditLog
        fields = [
            'id', 'admin_user', 'admin_email', 'domain', 'record_id',
            'action_type', 'old_value', 'new_value', 'change_reason',
            'ip_address', 'created_at'
        ]
        # DRF requires read_only_fields to be a list/tuple; the sentinel string
        # '__all__' raises TypeError while building the serializer fields.
        read_only_fields = fields
