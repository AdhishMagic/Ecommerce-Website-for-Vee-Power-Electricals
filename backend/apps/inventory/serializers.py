from rest_framework import serializers
from apps.products.models import Product
from .models import StockTransaction, StockTransactionType


class InventoryProductOverviewSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source='brand.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'name', 'brand_name', 'category_name',
            'stock', 'low_stock_threshold', 'is_low_stock', 'active', 'updated_at'
        ]

    def get_is_low_stock(self, obj):
        return obj.stock <= obj.low_stock_threshold


class StockTransactionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    performed_by_email = serializers.CharField(source='performed_by.email', read_only=True, default='')

    class Meta:
        model = StockTransaction
        fields = [
            'id', 'product', 'product_name', 'product_sku',
            'change_amount', 'transaction_type', 'order',
            'performed_by', 'performed_by_email', 'notes', 'created_at'
        ]
        read_only_fields = fields


class StockRestockSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)
    quantity = serializers.IntegerField(required=True, min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_product_id(self, value):
        if not Product.objects.filter(id=value).exists():
            raise serializers.ValidationError("Product does not exist.")
        return value


class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)
    change_amount = serializers.IntegerField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_product_id(self, value):
        if not Product.objects.filter(id=value).exists():
            raise serializers.ValidationError("Product does not exist.")
        return value

    def validate(self, data):
        if data['change_amount'] == 0:
            raise serializers.ValidationError({"change_amount": "Adjustment amount cannot be zero."})
        product = Product.objects.get(id=data['product_id'])
        if product.stock + data['change_amount'] < 0:
            raise serializers.ValidationError({
                "change_amount": f"Insufficient stock. Current stock is {product.stock}, cannot reduce by {abs(data['change_amount'])}."
            })
        return data
