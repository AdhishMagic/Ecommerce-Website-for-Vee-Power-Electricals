from decimal import Decimal
from rest_framework import serializers
from .models import Order, OrderItem, OrderStatusHistory, OrderStatus, PaymentStatus


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_name', 'sku', 'image_url',
            'mrp', 'unit_price', 'quantity', 'line_discount',
            'taxable_amount', 'tax_rate', 'tax_amount', 'subtotal',
            'total_amount', 'created_at'
        ]
        read_only_fields = fields


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_email = serializers.CharField(source='changed_by.email', read_only=True, default='')

    class Meta:
        model = OrderStatusHistory
        fields = [
            'id', 'previous_status', 'new_status',
            'changed_by_email', 'reason', 'created_at'
        ]
        read_only_fields = fields


class OrderListSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'customer_name', 'customer_email',
            'customer_phone', 'subtotal', 'tax_amount', 'shipping_fee',
            'total_amount', 'status', 'payment_status', 'payment_method',
            'items_count', 'created_at'
        ]
        read_only_fields = fields

    def get_items_count(self, obj) -> int:
        if hasattr(obj, 'annotated_items_count'):
            return obj.annotated_items_count
        return obj.items.count()


class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'customer_name', 'customer_email',
            'customer_phone', 'shipping_address', 'billing_address',
            'is_business_order', 'company_name', 'gstin',
            'subtotal', 'product_discount', 'order_discount', 'total_discount',
            'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount',
            'shipping_fee', 'shipping_discount', 'total_amount',
            'status', 'payment_status', 'payment_method', 'tracking_number',
            'notes', 'items', 'status_history', 'created_at', 'updated_at'
        ]
        read_only_fields = fields


class CheckoutItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)
    quantity = serializers.IntegerField(required=True, min_value=1)


class CheckoutInputSerializer(serializers.Serializer):
    shipping_address_id = serializers.IntegerField(required=True)
    billing_address_id = serializers.IntegerField(required=False, allow_null=True)
    items = CheckoutItemInputSerializer(many=True, required=True, allow_empty=False)
    payment_method = serializers.CharField(required=False, default='UPI')
    coupon_code = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[s.value for s in OrderStatus], required=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    tracking_number = serializers.CharField(required=False, allow_blank=True, default='')


class OrderCancelInputSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class OrderReturnRequestInputSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, min_length=3, max_length=1000)

