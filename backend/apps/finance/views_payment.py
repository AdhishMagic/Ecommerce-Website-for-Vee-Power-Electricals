from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.finance.serializers_payment import PaymentInitiateSerializer, PaymentVerifySerializer
from apps.finance.models import PaymentTransaction
from apps.finance.serializers import PaymentTransactionSerializer
from apps.orders.models import Order


class PaymentInitiateView(APIView):
    """
    POST /api/v1/payments/initiate/
    POST /api/v1/payments/create-intent/
    Initiate Razorpay order intent for an existing pending customer order.
    The order payable amount is enforced server-side from the database.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PaymentInitiateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order_id = serializer.validated_data['order_id']
        payment_method = serializer.validated_data.get('payment_method', 'UPI')

        try:
            intent_data = PaymentGatewayService.initiate_order_payment(
                order_id=order_id,
                user=request.user,
                payment_method=payment_method,
            )
            return Response(intent_data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class PaymentVerifyView(APIView):
    """
    POST /api/v1/payments/verify/
    Verifies Razorpay HMAC-SHA256 signature for client payment response.
    Transitions order to CONFIRMED and payment_status to PAID idempotently.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PaymentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        try:
            txn = PaymentGatewayService.confirm_payment(
                order_id=data['order_id'],
                user=request.user,
                razorpay_order_id=data['razorpay_order_id'],
                razorpay_payment_id=data['razorpay_payment_id'],
                razorpay_signature=data['razorpay_signature'],
                payment_method=data.get('payment_method', 'UPI'),
                currency=data.get('currency', 'INR'),
            )
            return Response({
                "status": "SUCCESS",
                "message": "Payment verified and order confirmed successfully.",
                "order_id": data['order_id'],
                "transaction_id": txn.id,
                "payment_status": txn.order.payment_status if txn.order else "Paid",
                "order_status": txn.order.status if txn.order else "CONFIRMED",
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class PaymentWebhookView(APIView):
    """
    POST /api/v1/payments/webhook/
    Public Razorpay webhook endpoint for asynchronous payment event processing.
    Signature is verified via X-Razorpay-Signature header against RAZORPAY_WEBHOOK_SECRET.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        signature = request.META.get('HTTP_X_RAZORPAY_SIGNATURE')
        if not signature:
            return Response({"detail": "Missing X-Razorpay-Signature header."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = PaymentGatewayService.process_webhook(
                raw_body=request.body,
                signature_header=signature,
            )
            return Response(result, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class PaymentOrderStatusView(APIView):
    """
    GET /api/v1/payments/order/<order_id>/
    Get latest payment transaction status for an order.
    Only authorized for order owner or staff/admin.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.user_id != request.user.id and not (request.user.is_staff or getattr(request.user, 'role', '') == 'admin'):
            return Response({"detail": "You do not have permission to view payment status for this order."}, status=status.HTTP_403_FORBIDDEN)

        txn = PaymentTransaction.objects.filter(order=order).order_by('-created_at').first()
        if not txn:
            return Response({"detail": "No payment transactions found for this order."}, status=status.HTTP_404_NOT_FOUND)

        return Response(PaymentTransactionSerializer(txn).data, status=status.HTTP_200_OK)
