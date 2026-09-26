import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Q, Count
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.http import Http404
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
    OrderCancelInputSerializer,
    OrderReturnRequestInputSerializer,
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
        return Order.objects.filter(user=self.request.user).annotate(
            annotated_items_count=Count('items')
        ).order_by('-created_at', '-id')


class OrderDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/orders/{id}/
    Order detail: customers can only view their own orders; admins can view any.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OrderDetailSerializer

    def get_queryset(self):
        user = self.request.user
        base_qs = Order.objects.prefetch_related('items', 'status_history__changed_by', 'items__product')
        if user.is_staff or getattr(user, 'role', '') == 'admin':
            return base_qs.all()
        return base_qs.filter(user=user)



class AdminOrderListView(generics.ListAPIView):
    """
    GET /api/v1/orders/
    Administrative order management list with status, payment status, customer, date, and search filters.
    """
    permission_classes = [IsAdminUser]
    serializer_class = OrderListSerializer

    def get_queryset(self):
        qs = Order.objects.annotate(
            annotated_items_count=Count('items')
        ).order_by('-created_at', '-id')

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() in [s.value for s in OrderStatus]:
            qs = qs.filter(status=status_param.upper())

        pay_status = self.request.query_params.get('payment_status')
        if pay_status and pay_status in ['Pending', 'Paid', 'Failed', 'Refunded']:
            qs = qs.filter(payment_status=pay_status)

        customer_id = self.request.query_params.get('customer') or self.request.query_params.get('customer_id')
        if customer_id and customer_id.isdigit():
            qs = qs.filter(user_id=int(customer_id))

        from_date = self.request.query_params.get('from_date') or self.request.query_params.get('start_date')
        if from_date:
            try:
                qs = qs.filter(created_at__date__gte=from_date)
            except Exception:
                pass

        to_date = self.request.query_params.get('to_date') or self.request.query_params.get('end_date')
        if to_date:
            try:
                qs = qs.filter(created_at__date__lte=to_date)
            except Exception:
                pass

        search = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(order_number__icontains=search) |
                Q(customer_name__icontains=search) |
                Q(customer_email__icontains=search) |
                Q(customer_phone__icontains=search)
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
        tracking_number = serializer.validated_data.get('tracking_number') or None

        try:
            updated_order = OrderWorkflowService.transition_order_status(
                order_id=order.id,
                target_status=new_status,
                changed_by=request.user,
                reason=reason or f"Status updated by {request.user.email}",
                tracking_number=tracking_number
            )
            return Response(OrderDetailSerializer(updated_order).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class OrderCancelView(APIView):
    """
    POST /api/v1/orders/{id}/cancel/
    Customer or admin cancellation of an eligible order (PENDING, CONFIRMED, PACKED).
    Customer can only cancel their own order; admin can cancel any order.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            order = Order.objects.select_for_update().get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_admin = user.is_staff or getattr(user, 'role', '') == 'admin'
        if not is_admin and order.user_id != user.id:
            return Response({"detail": "You do not have permission to cancel this order."}, status=status.HTTP_403_FORBIDDEN)

        if order.status == OrderStatus.CANCELLED:
            return Response({"detail": "Order is already cancelled."}, status=status.HTTP_400_BAD_REQUEST)

        if order.status not in [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PACKED]:
            return Response(
                {"detail": f"Cannot cancel order in status '{order.status}'. Orders that have been shipped or delivered cannot be cancelled."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = OrderCancelInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', '') or f"Order cancelled by {user.email}"

        try:
            updated_order = OrderWorkflowService.cancel_order(
                order_id=order.id,
                requested_by=user,
                reason=reason
            )
            return Response(OrderDetailSerializer(updated_order).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class OrderReturnRequestView(APIView):
    """
    POST /api/v1/orders/{id}/return/
    Customer RMA return request for a delivered order.
    Must be DELIVERED and owned by the requesting customer (or admin).
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            order = Order.objects.select_for_update().get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_admin = user.is_staff or getattr(user, 'role', '') == 'admin'
        if not is_admin and order.user_id != user.id:
            return Response({"detail": "You do not have permission to request return for this order."}, status=status.HTTP_403_FORBIDDEN)

        if order.status == OrderStatus.RETURN_REQUESTED:
            return Response({"detail": "A return request has already been submitted for this order."}, status=status.HTTP_400_BAD_REQUEST)

        if order.status in [OrderStatus.RETURN_APPROVED, OrderStatus.RETURN_COMPLETED]:
            return Response({"detail": f"Return is already {order.status.lower()} for this order."}, status=status.HTTP_400_BAD_REQUEST)

        if order.status == OrderStatus.RETURN_REJECTED:
            return Response({"detail": "Return request was previously rejected for this order."}, status=status.HTTP_400_BAD_REQUEST)

        if order.status == OrderStatus.CANCELLED:
            return Response({"detail": "Cancelled orders are not eligible for return."}, status=status.HTTP_400_BAD_REQUEST)

        if order.status != OrderStatus.DELIVERED:
            return Response(
                {"detail": f"Return can only be requested for orders in DELIVERED status. Current status: '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = OrderReturnRequestInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason'].strip()

        try:
            updated_order = OrderWorkflowService.transition_order_status(
                order_id=order.id,
                target_status=OrderStatus.RETURN_REQUESTED,
                changed_by=user,
                reason=reason
            )
            return Response(OrderDetailSerializer(updated_order).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class OrderStatusHistoryListView(generics.ListAPIView):
    """
    GET /api/v1/orders/{id}/history/
    Audit trail of status transitions for an order.
    Strictly isolated: Customer A cannot access Customer B's order history.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = OrderStatusHistorySerializer

    def get_queryset(self):
        order_id = self.kwargs['pk']
        user = self.request.user
        is_admin = user.is_staff or getattr(user, 'role', '') == 'admin'

        if not is_admin:
            if not Order.objects.filter(id=order_id, user=user).exists():
                raise Http404("Order not found.")

        return OrderStatusHistory.objects.filter(order_id=order_id).select_related('changed_by').order_by('created_at')

