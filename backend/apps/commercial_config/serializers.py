from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
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
        if min_d is not None and max_d is not None and max_d <= min_d:
            raise serializers.ValidationError({"max_distance_km": "Maximum distance must be strictly greater than minimum distance."})
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


class ShippingRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingRule
        fields = [
            'id', 'state', 'cost', 'estimated_days_min', 'estimated_days_max',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


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


class CouponValidationInputSerializer(serializers.Serializer):
    code = serializers.CharField(required=True)
    order_amount = serializers.DecimalField(required=True, max_digits=12, decimal_places=2, min_value=0)
