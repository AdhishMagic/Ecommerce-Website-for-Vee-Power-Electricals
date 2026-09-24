import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminUser
from apps.users.models import CustomerAddress
from apps.products.models import Product
from apps.inventory.models import StockTransaction, StockTransactionType
from apps.commercial_config.models import DeliveryConfiguration, TaxConfiguration
from .models import Order, OrderItem, OrderStatusHistory, OrderStatus, PaymentStatus
from .serializers import (
    OrderListSerializer,
    OrderDetailSerializer,
    CheckoutInputSerializer,
    OrderStatusUpdateSerializer,
    OrderStatusHistorySerializer,
)


from django.core.exceptions import ValidationError as DjangoValidationError
from apps.orders.services import CheckoutService, OrderWorkflowService


class CheckoutView(APIView):
    """
    POST /api/v1/orders/checkout/
    Customer retail order placement foundation with atomic stock reservations and immutable snapshots.
    Delegates domain orchestration to CheckoutService.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = CheckoutInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        shipping_address_id = serializer.validated_data['shipping_address_id']
        billing_address_id = serializer.validated_data.get('billing_address_id')
        items_data = serializer.validated_data['items']
        payment_method = serializer.validated_data.get('payment_method', 'UPI')
        notes = serializer.validated_data.get('notes', '')
        coupon_code = serializer.validated_data.get('coupon_code')

        try:
            order = CheckoutService.process_checkout(
                user=user,
                shipping_address_id=shipping_address_id,
                billing_address_id=billing_address_id,
                items_data=items_data,
                payment_method=payment_method,
                notes=notes,
                coupon_code=coupon_code
            )
            return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)
        except (DjangoValidationError, ValueError) as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class CustomerMyOrdersView(generics.ListAPIView):
    """
    GET /api/v1/orders/my-orders/
    Customer's own order history strictly isolated to request.user.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OrderListSerializer

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).order_by('-created_at')


class OrderDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/orders/{id}/
    Order detail: customers can only view their own orders; admins can view any.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OrderDetailSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or getattr(user, 'role', '') == 'admin':
            return Order.objects.prefetch_related('items', 'status_history').all()
        return Order.objects.filter(user=user).prefetch_related('items', 'status_history')


class AdminOrderListView(generics.ListAPIView):
    """
    GET /api/v1/orders/
    Administrative order management list with status and search filters.
    """
    permission_classes = [IsAdminUser]
    serializer_class = OrderListSerializer

    def get_queryset(self):
        qs = Order.objects.all().order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())

        pay_status = self.request.query_params.get('payment_status')
        if pay_status:
            qs = qs.filter(payment_status=pay_status)

        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            qs = qs.filter(
                Q(order_number__icontains=search) |
                Q(customer_name__icontains=search) |
                Q(customer_email__icontains=search)
            )
        return qs


class AdminOrderStatusUpdateView(APIView):
    """
    PATCH /api/v1/orders/{id}/status/
    Admin/staff order state machine transition and history audit logging.
    Delegates domain orchestration and business side effects to OrderWorkflowService.
    """
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def patch(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = OrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        reason = serializer.validated_data.get('reason', '')

        try:
            updated_order = OrderWorkflowService.transition_order_status(
                order_id=order.id,
                target_status=new_status,
                changed_by=request.user,
                reason=reason or f"Status updated by {request.user.email}"
            )
            return Response(OrderDetailSerializer(updated_order).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class OrderStatusHistoryListView(generics.ListAPIView):
    """
    GET /api/v1/orders/{id}/history/
    Audit trail of status transitions for an order.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OrderStatusHistorySerializer

    def get_queryset(self):
        order_id = self.kwargs['pk']
        user = self.request.user
        if user.is_staff or getattr(user, 'role', '') == 'admin':
            return OrderStatusHistory.objects.filter(order_id=order_id).order_by('created_at')
        return OrderStatusHistory.objects.filter(order_id=order_id, order__user=user).order_by('created_at')
