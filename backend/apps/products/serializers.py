from rest_framework import serializers
from .models import Category, Brand, Product

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

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
