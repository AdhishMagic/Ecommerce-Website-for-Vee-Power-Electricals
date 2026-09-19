from rest_framework import serializers
from .models import Category, Brand, Product

class CategorySerializer(serializers.ModelSerializer):
    isActive = serializers.BooleanField(source='is_active', required=False)
    showInHero = serializers.BooleanField(source='show_in_hero', required=False)
    heroOrder = serializers.IntegerField(source='hero_order', required=False)
    heroBadge = serializers.CharField(source='hero_badge', required=False, allow_blank=True)
    discountEnabled = serializers.BooleanField(source='discount_enabled', required=False)
    discountType = serializers.CharField(source='discount_type', required=False)
    discountValue = serializers.DecimalField(source='discount_value', max_digits=10, decimal_places=2, required=False)
    discountLabel = serializers.CharField(source='discount_label', required=False, allow_blank=True)

    class Meta:
        model = Category
        fields = '__all__'

    def validate(self, data):
        discount_type = data.get('discount_type', getattr(self.instance, 'discount_type', 'percentage'))
        discount_value = data.get('discount_value', getattr(self.instance, 'discount_value', 0))
        discount_enabled = data.get('discount_enabled', getattr(self.instance, 'discount_enabled', False))

        if discount_enabled:
            if discount_value is not None and discount_value < 0:
                raise serializers.ValidationError({"discountValue": "Discount value must be a positive number."})
            if discount_type == 'percentage' and discount_value is not None and discount_value > 100:
                raise serializers.ValidationError({"discountValue": "Percentage discount cannot exceed 100%."})

        return data

class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = '__all__'

class ProductSerializer(serializers.ModelSerializer):
    lowStockThreshold = serializers.IntegerField(source='low_stock_threshold', required=False)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'sku', 'brand', 'category', 'subcategory',
            'mrp', 'price', 'stock', 'lowStockThreshold', 'low_stock_threshold',
            'images', 'description', 'specifications', 'tags', 'featured', 'active'
        ]
