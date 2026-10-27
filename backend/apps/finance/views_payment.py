import hmac
import hashlib
import uuid
import logging

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from apps.finance.services.payment_gateway_service import PaymentGatewayService
from apps.finance.serializers_payment import PaymentInitiateSerializer, PaymentVerifySerializer
from apps.finance.models import PaymentTransaction, PaymentGateway, PaymentTxStatus
from apps.finance.serializers import PaymentTransactionSerializer
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.orders.services.order_workflow_service import OrderWorkflowService

logger = logging.getLogger('apps.finance.payments')


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


from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator


@method_decorator(csrf_exempt, name='dispatch')
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
            return Response({
                "order_id": order.id,
                "order_number": order.order_number,
                "order_status": order.status,
                "order_payment_status": order.payment_status,
                "detail": "No payment transactions found for this order.",
            }, status=status.HTTP_200_OK)

        data = PaymentTransactionSerializer(txn).data
        data['order_status'] = order.status
        data['order_payment_status'] = order.payment_status
        return Response(data, status=status.HTTP_200_OK)


class PaymentConfigView(APIView):
    """
    GET /api/v1/payments/config/
    GET /api/payments-config
    Public server-controlled payment destination and gateway configuration.
    Exposes only public configuration (key_id, payment_handle, gateway_enabled).
    Secrets are NEVER returned.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        is_configured = PaymentGatewayService.is_gateway_configured()
        return Response({
            "key_id": PaymentGatewayService.get_key_id() if is_configured else "",
            "payment_handle": PaymentGatewayService.get_payment_handle(),
            "is_live": PaymentGatewayService.is_live(),
            "gateway_enabled": is_configured,
            "currency": "INR",
        }, status=status.HTTP_200_OK)


class StandardCreateOrderView(APIView):
    """
    POST /api/create-order
    POST /api/v1/payments/create-order/
    Razorpay Standard Web Checkout - Create Order
    Calls Razorpay API: POST https://api.razorpay.com/v1/orders
    Request: { amount (paise), currency, receipt }
    Return: { order_id, amount, currency, key_id }
    Minimum amount: 100 paise
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        data = request.data
        raw_amount = data.get('amount')
        currency = data.get('currency', 'INR') or 'INR'
        receipt = data.get('receipt')

        if raw_amount is None:
            return Response(
                {"error": "Missing required field: amount (in paise) is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount_in_paise = int(raw_amount)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid amount: must be an integer amount in paise."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate amount >= 100 paise
        if amount_in_paise < 100:
            return Response(
                {"error": "Amount must be at least 100 paise (1 INR)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        key_id = PaymentGatewayService.get_key_id()
        key_secret = PaymentGatewayService.get_key_secret()

        if not receipt:
            receipt = f"rcpt_{uuid.uuid4().hex[:10]}"

        notes = data.get('notes', {})
        if not isinstance(notes, dict):
            notes = {}

        internal_order_id = data.get('order_id')
        if internal_order_id:
            notes['order_id'] = str(internal_order_id)

        # In mock mode or when real live credentials are not set, return simulated order for test harness/dev
        if PaymentGatewayService.is_mock() or not (key_id and key_secret):
            mock_order_id = f"order_mock_{uuid.uuid4().hex[:14]}"
            if internal_order_id:
                try:
                    order = Order.objects.filter(pk=internal_order_id).first()
                    if order:
                        PaymentTransaction.objects.create(
                            order=order,
                            gateway=PaymentGateway.RAZORPAY,
                            gateway_order_id=mock_order_id,
                            payment_method=data.get('payment_method', 'UPI'),
                            amount=order.total_amount,
                            currency=currency,
                            status=PaymentTxStatus.INITIATED,
                        )
                except Exception as log_err:
                    logger.warning("Could not associate transaction with order %s: %s", internal_order_id, log_err)

            return Response({
                "order_id": mock_order_id,
                "amount": amount_in_paise,
                "currency": currency,
                "key_id": key_id or "rzp_test_mock",
                "receipt": str(receipt),
            }, status=status.HTTP_200_OK)

        try:
            import razorpay
            from razorpay.errors import BadRequestError
            client = razorpay.Client(auth=(key_id, key_secret))
            rzp_order = client.order.create(data={
                "amount": amount_in_paise,
                "currency": currency,
                "receipt": str(receipt),
                "notes": notes,
            })
            order_id = rzp_order.get('id')

            # If an internal order ID is provided, record or update transaction
            if internal_order_id:
                try:
                    order = Order.objects.filter(pk=internal_order_id).first()
                    if order:
                        PaymentTransaction.objects.create(
                            order=order,
                            gateway=PaymentGateway.RAZORPAY,
                            gateway_order_id=order_id,
                            payment_method=data.get('payment_method', 'UPI'),
                            amount=order.total_amount,
                            currency=currency,
                            status=PaymentTxStatus.INITIATED,
                        )
                except Exception as log_err:
                    logger.warning("Could not associate transaction with order %s: %s", internal_order_id, log_err)

            return Response({
                "order_id": order_id,
                "amount": rzp_order.get('amount', amount_in_paise),
                "currency": rzp_order.get('currency', currency),
                "key_id": key_id,
                "receipt": receipt,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            err_msg = str(e)
            logger.error("Razorpay order creation error: %s", err_msg)
            # Handle auth failures (return 401)
            if 'auth' in err_msg.lower() or '401' in err_msg:
                return Response(
                    {"error": "Razorpay authentication failed. Invalid API credentials."},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            # Handle Razorpay API errors (return 500)
            return Response(
                {"error": f"Razorpay API error: {err_msg}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class StandardVerifyPaymentView(APIView):
    """
    POST /api/verify-payment
    POST /api/v1/payments/verify-payment/
    Razorpay Standard Web Checkout - Verify Payment Signature
    Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    Compare generated signature with razorpay_signature
    Return success only if signatures match.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        data = request.data
        razorpay_order_id = data.get('razorpay_order_id') or data.get('order_id')
        razorpay_payment_id = data.get('razorpay_payment_id') or data.get('payment_id')
        razorpay_signature = data.get('razorpay_signature') or data.get('signature')

        # Missing fields validation
        if not razorpay_order_id or not razorpay_payment_id or not razorpay_signature:
            return Response(
                {"error": "Missing required fields: order_id, payment_id, and signature are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        key_secret = PaymentGatewayService.get_key_secret()
        if not key_secret:
            return Response(
                {"error": "Payment gateway secret not configured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
        msg = f"{razorpay_order_id}|{razorpay_payment_id}".encode('utf-8')
        generated_signature = hmac.new(key_secret.encode('utf-8'), msg, hashlib.sha256).hexdigest()

        # Compare generated signature with razorpay_signature
        if not hmac.compare_digest(generated_signature, str(razorpay_signature)):
            # Signature mismatch: return 400, do NOT mark as paid
            logger.warning("Signature mismatch: received %s, expected %s", razorpay_signature, generated_signature)
            return Response(
                {
                    "error": "Payment signature verification failed. Signature mismatch.",
                    "status": "failed",
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Signatures match: update order/transaction status if exists
        txn = PaymentTransaction.objects.filter(gateway_order_id=razorpay_order_id).first()
        if txn and txn.order:
            with transaction.atomic():
                order = Order.objects.select_for_update().get(pk=txn.order.id)
                txn.gateway_transaction_id = razorpay_payment_id
                txn.gateway_signature = razorpay_signature
                txn.status = PaymentTxStatus.SUCCESS
                txn.save()

                order.payment_status = PaymentStatus.PAID
                order.save(update_fields=['payment_status', 'updated_at'])

                if order.status == OrderStatus.PENDING:
                    OrderWorkflowService.transition_order_status(
                        order_id=order.id,
                        target_status=OrderStatus.CONFIRMED,
                        changed_by=order.user,
                        reason="Payment verified and confirmed via Razorpay Standard Checkout"
                    )

        return Response({
            "status": "success",
            "message": "Payment verified successfully.",
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
        }, status=status.HTTP_200_OK)
