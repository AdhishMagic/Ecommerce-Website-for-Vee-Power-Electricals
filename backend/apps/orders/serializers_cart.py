from decimal import Decimal
from rest_framework import serializers

from apps.products.models import Product
from apps.orders.models import Cart, CartItem


class CartItemProductSerializer(serializers.ModelSerializer):
    brand = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'sku', 'brand', 'category',
            'mrp', 'price', 'stock', 'in_stock', 'primary_image', 'active'
        ]

    def get_brand(self, obj):
        return obj.brand.name if obj.brand else ''

    def get_category(self, obj):
        return obj.category.name if obj.category else ''

    def get_in_stock(self, obj):
        return obj.stock > 0 and obj.active


class CartItemSerializer(serializers.ModelSerializer):
    product = CartItemProductSerializer(read_only=True)
    product_id = serializers.IntegerField(write_only=True, required=True)
    unit_price = serializers.DecimalField(
        source='product.price',
        max_digits=12,
        decimal_places=2,
        read_only=True
    )
    subtotal = serializers.SerializerMethodField()
    is_in_stock = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            'id', 'product', 'product_id', 'quantity',
            'unit_price', 'subtotal', 'is_in_stock', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'unit_price', 'subtotal', 'is_in_stock', 'created_at', 'updated_at']

    def get_subtotal(self, obj) -> str:
        if obj.product and obj.product.price:
            return str((Decimal(str(obj.product.price)) * obj.quantity).quantize(Decimal('0.01')))
        return "0.00"

    def get_is_in_stock(self, obj) -> bool:
        if not obj.product or not obj.product.active:
            return False
        return obj.product.stock >= obj.quantity


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_items = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'items', 'total_items', 'subtotal', 'is_active', 'updated_at']
        read_only_fields = fields

    def get_total_items(self, obj) -> int:
        return sum(item.quantity for item in obj.items.all())

    def get_subtotal(self, obj) -> str:
        total = Decimal('0.00')
        for item in obj.items.select_related('product').all():
            if item.product and item.product.price:
                total += Decimal(str(item.product.price)) * item.quantity
        return str(total.quantize(Decimal('0.01')))


class AddToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True, min_value=1)
    quantity = serializers.IntegerField(required=False, default=1, min_value=1)


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(required=True, min_value=0)


class MergeGuestCartSerializer(serializers.Serializer):
    guest_session_id = serializers.CharField(required=True, max_length=100)
