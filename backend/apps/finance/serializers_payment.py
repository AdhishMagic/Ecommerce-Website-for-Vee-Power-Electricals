from rest_framework import serializers


class PaymentInitiateSerializer(serializers.Serializer):
    """
    Input serializer for initiating payment on an existing order.
    The payable amount is authoritatively calculated from the database record;
    no client-side amount tampering is accepted.
    """
    order_id = serializers.IntegerField(required=True)
    payment_method = serializers.CharField(required=False, default='UPI', max_length=50)


class PaymentVerifySerializer(serializers.Serializer):
    """
    Input serializer for client-side Razorpay payment callback verification.
    """
    order_id = serializers.IntegerField(required=True)
    razorpay_order_id = serializers.CharField(required=True, max_length=100)
    razorpay_payment_id = serializers.CharField(required=True, max_length=100)
    razorpay_signature = serializers.CharField(required=True, max_length=255)
    payment_method = serializers.CharField(required=False, default='UPI', max_length=50)
    currency = serializers.CharField(required=False, default='INR', max_length=10)
