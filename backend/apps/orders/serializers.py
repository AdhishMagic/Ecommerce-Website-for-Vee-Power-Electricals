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


def _get_cancellation_history(obj):
    if hasattr(obj, '_cancellation_history_cache'):
        return obj._cancellation_history_cache
    if hasattr(obj, '_prefetched_objects_cache') and 'status_history' in obj._prefetched_objects_cache:
        events = [h for h in obj.status_history.all() if h.new_status == OrderStatus.CANCELLED]
        obj._cancellation_history_cache = events[-1] if events else None
        return obj._cancellation_history_cache
    hist = obj.status_history.filter(new_status=OrderStatus.CANCELLED).order_by('-created_at').first()
    obj._cancellation_history_cache = hist
    return hist


class OrderListSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()
    razorpay_order_id = serializers.CharField(read_only=True)
    razorpay_payment_id = serializers.CharField(read_only=True)
    payment_verification_status = serializers.CharField(read_only=True)
    cancellation_reason = serializers.SerializerMethodField()
    cancelled_at = serializers.SerializerMethodField()
    refund_status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'customer_name', 'customer_email',
            'customer_phone', 'subtotal', 'tax_amount', 'shipping_fee',
            'total_amount', 'amount_paid', 'outstanding_balance',
            'is_cod', 'cod_advance_amount', 'cod_balance_amount',
            'cod_balance_collected', 'cod_collected_at',
            'status', 'payment_status', 'payment_method',
            'razorpay_order_id', 'razorpay_payment_id', 'payment_verification_status',
            'cancellation_reason', 'cancelled_at', 'refund_status',
            'items_count', 'created_at'
        ]
        read_only_fields = fields

    def get_items_count(self, obj) -> int:
        if hasattr(obj, 'annotated_items_count'):
            return obj.annotated_items_count
        return obj.items.count()

    def get_cancellation_reason(self, obj) -> str:
        if obj.status != OrderStatus.CANCELLED:
            return None
        hist = _get_cancellation_history(obj)
        if hist and hist.reason:
            return hist.reason
        return "Order cancelled by customer"

    def get_cancelled_at(self, obj):
        if obj.status != OrderStatus.CANCELLED:
            return None
        hist = _get_cancellation_history(obj)
        if hist and hist.created_at:
            return hist.created_at.isoformat()
        return obj.updated_at.isoformat() if obj.updated_at else None

    def get_refund_status(self, obj) -> str:
        if obj.status != OrderStatus.CANCELLED:
            return None
        amount_paid = Decimal(str(obj.amount_paid or '0.00'))
        is_paid = obj.payment_status in [PaymentStatus.PAID, 'Paid'] or amount_paid > 0
        if not is_paid:
            return "NOT_APPLICABLE"
        if obj.payment_status in [PaymentStatus.REFUNDED, 'Refunded']:
            return "REFUNDED"
        return "REFUND_PENDING"


class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    razorpay_order_id = serializers.CharField(read_only=True)
    razorpay_payment_id = serializers.CharField(read_only=True)
    payment_verification_status = serializers.CharField(read_only=True)
    cancellation_reason = serializers.SerializerMethodField()
    cancelled_at = serializers.SerializerMethodField()
    refund_status = serializers.SerializerMethodField()
    refund_amount = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'customer_name', 'customer_email',
            'customer_phone', 'shipping_address', 'billing_address',
            'is_business_order', 'company_name', 'gstin',
            'subtotal', 'product_discount', 'order_discount', 'total_discount',
            'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount',
            'shipping_fee', 'shipping_discount', 'total_amount',
            'amount_paid', 'outstanding_balance',
            'is_cod', 'cod_advance_amount', 'cod_balance_amount',
            'cod_balance_collected', 'cod_collected_at',
            'status', 'payment_status', 'payment_method', 'tracking_number',
            'razorpay_order_id', 'razorpay_payment_id', 'payment_verification_status',
            'cancellation_reason', 'cancelled_at', 'refund_status', 'refund_amount',
            'notes', 'items', 'status_history', 'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_cancellation_reason(self, obj) -> str:
        if obj.status != OrderStatus.CANCELLED:
            return None
        hist = _get_cancellation_history(obj)
        if hist and hist.reason:
            return hist.reason
        return "Order cancelled by customer"

    def get_cancelled_at(self, obj):
        if obj.status != OrderStatus.CANCELLED:
            return None
        hist = _get_cancellation_history(obj)
        if hist and hist.created_at:
            return hist.created_at.isoformat()
        return obj.updated_at.isoformat() if obj.updated_at else None

    def get_refund_status(self, obj) -> str:
        if obj.status != OrderStatus.CANCELLED:
            return None
        amount_paid = Decimal(str(obj.amount_paid or '0.00'))
        is_paid = obj.payment_status in [PaymentStatus.PAID, 'Paid'] or amount_paid > 0
        if not is_paid:
            return "NOT_APPLICABLE"
        if obj.payment_status in [PaymentStatus.REFUNDED, 'Refunded']:
            return "REFUNDED"
        return "REFUND_PENDING"

    def get_refund_amount(self, obj) -> str:
        if obj.status != OrderStatus.CANCELLED:
            return "0.00"
        amount_paid = Decimal(str(obj.amount_paid or '0.00'))
        if amount_paid > 0:
            return str(amount_paid)
        if obj.payment_status in [PaymentStatus.PAID, 'Paid']:
            return str(obj.total_amount)
        return "0.00"


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
    reason_code = serializers.CharField(required=False, allow_blank=True, default='')
    reason_notes = serializers.CharField(required=False, allow_blank=True, default='')

    REASON_MAP = {
        'ordered_by_mistake': 'Ordered by mistake',
        'better_price': 'Found a better price elsewhere',
        'delivery_delay': 'Delivery taking too long',
        'incorrect_products': 'Ordered incorrect products',
        'changed_mind': 'Changed my mind',
        'other': 'Other',
    }

    def validate(self, attrs):
        reason = (attrs.get('reason') or '').strip()
        reason_code = (attrs.get('reason_code') or '').strip().lower()
        reason_notes = (attrs.get('reason_notes') or '').strip()

        if reason_code:
            if reason_code not in self.REASON_MAP:
                raise serializers.ValidationError({
                    'reason_code': f"Invalid cancellation reason code '{reason_code}'. Allowed codes: {list(self.REASON_MAP.keys())}"
                })
            base_label = self.REASON_MAP[reason_code]
            if reason_code == 'other':
                final_reason = f"Other: {reason_notes}" if reason_notes else "Other"
            elif reason_notes:
                final_reason = f"{base_label} ({reason_notes})"
            else:
                final_reason = base_label
        elif reason:
            final_reason = reason
        else:
            final_reason = "Order cancelled by customer"

        attrs['final_reason'] = final_reason[:500]
        return attrs


class OrderReturnRequestInputSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, min_length=3, max_length=1000)

