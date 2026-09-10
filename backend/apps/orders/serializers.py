from rest_framework import serializers
from .models import Order, OrderItem

class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'price', 'quantity', 'subtotal']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    orderNumber = serializers.CharField(source='order_number', required=False)
    customerName = serializers.CharField(source='customer_name')
    customerEmail = serializers.CharField(source='customer_email')
    customerPhone = serializers.CharField(source='customer_phone')
    shippingAddress = serializers.JSONField(source='shipping_address')
    totalAmount = serializers.DecimalField(source='total_amount', max_digits=10, decimal_places=2)
    taxAmount = serializers.DecimalField(source='tax_amount', max_digits=10, decimal_places=2, required=False)
    shippingFee = serializers.DecimalField(source='shipping_fee', max_digits=10, decimal_places=2, required=False)
    paymentStatus = serializers.CharField(source='payment_status', required=False)
    paymentMethod = serializers.CharField(source='payment_method', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'orderNumber', 'order_number', 'customerName', 'customerEmail', 'customerPhone',
            'shippingAddress', 'totalAmount', 'taxAmount', 'shippingFee', 'status',
            'paymentStatus', 'paymentMethod', 'items', 'createdAt'
        ]
