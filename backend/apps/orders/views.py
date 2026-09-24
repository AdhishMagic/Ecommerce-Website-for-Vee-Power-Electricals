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


class CheckoutView(APIView):
    """
    POST /api/v1/orders/checkout/
    Customer retail order placement foundation with atomic stock reservations and immutable snapshots.
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

        # 1. Validate Shipping Address belongs to user
        shipping_address_obj = CustomerAddress.objects.filter(id=shipping_address_id, user=user).first()
        if not shipping_address_obj:
            return Response(
                {"detail": "Invalid shipping address. Address does not exist or does not belong to you."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shipping_address_snapshot = {
            'id': shipping_address_obj.id,
            'recipient_name': shipping_address_obj.recipient_name,
            'phone': shipping_address_obj.phone,
            'address_line1': shipping_address_obj.address_line1,
            'address_line2': shipping_address_obj.address_line2,
            'landmark': shipping_address_obj.landmark,
            'city': shipping_address_obj.city,
            'state': shipping_address_obj.state,
            'pincode': shipping_address_obj.pincode,
            'address_type': shipping_address_obj.address_type,
        }

        billing_address_snapshot = None
        if billing_address_id:
            billing_obj = CustomerAddress.objects.filter(id=billing_address_id, user=user).first()
            if billing_obj:
                billing_address_snapshot = {
                    'id': billing_obj.id,
                    'recipient_name': billing_obj.recipient_name,
                    'phone': billing_obj.phone,
                    'address_line1': billing_obj.address_line1,
                    'address_line2': billing_obj.address_line2,
                    'city': billing_obj.city,
                    'state': billing_obj.state,
                    'pincode': billing_obj.pincode,
                }
        if not billing_address_snapshot:
            billing_address_snapshot = shipping_address_snapshot

        # 2. Validate Items and Lock Products for Stock Check
        product_ids = [item['product_id'] for item in items_data]
        products_qs = Product.objects.select_for_update().filter(id__in=product_ids)
        product_map = {p.id: p for p in products_qs}

        subtotal = Decimal('0.00')
        order_items_prepared = []

        for item in items_data:
            pid = item['product_id']
            qty = item['quantity']
            product = product_map.get(pid)

            if not product:
                return Response(
                    {"detail": f"Product with ID {pid} was not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not product.active:
                return Response(
                    {"detail": f"Product '{product.name}' is currently unavailable."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if product.stock < qty:
                return Response(
                    {"detail": f"Insufficient stock for '{product.name}'. Available: {product.stock}, requested: {qty}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            line_subtotal = (product.price * qty).quantize(Decimal('0.01'))
            subtotal += line_subtotal

            order_items_prepared.append({
                'product': product,
                'product_name': product.name,
                'sku': product.sku,
                'image_url': product.primary_image,
                'mrp': product.mrp,
                'unit_price': product.price,
                'quantity': qty,
                'line_discount': Decimal('0.00'),
                'taxable_amount': line_subtotal,
                'tax_rate': Decimal('18.00'),
                'tax_amount': (line_subtotal * Decimal('0.18')).quantize(Decimal('0.01')),
                'subtotal': line_subtotal,
                'total_amount': line_subtotal,
            })

        # 3. Calculate GST split (Intra-state Tamil Nadu vs Inter-state IGST)
        is_intra_state = shipping_address_obj.state.strip().lower() == 'tamil nadu'
        if is_intra_state:
            cgst_amount = (subtotal * Decimal('0.09')).quantize(Decimal('0.01'))
            sgst_amount = (subtotal * Decimal('0.09')).quantize(Decimal('0.01'))
            igst_amount = Decimal('0.00')
            tax_amount = cgst_amount + sgst_amount
        else:
            cgst_amount = Decimal('0.00')
            sgst_amount = Decimal('0.00')
            igst_amount = (subtotal * Decimal('0.18')).quantize(Decimal('0.01'))
            tax_amount = igst_amount

        # 4. Calculate Delivery Fee
        delivery_cfg = DeliveryConfiguration.objects.filter(is_active=True).first()
        free_thresh = delivery_cfg.free_delivery_threshold if delivery_cfg else Decimal('999.00')
        base_del_charge = delivery_cfg.base_delivery_charge if delivery_cfg else Decimal('100.00')

        if subtotal >= free_thresh:
            shipping_fee = Decimal('0.00')
            shipping_discount = base_del_charge
        else:
            shipping_fee = base_del_charge
            shipping_discount = Decimal('0.00')

        total_amount = (subtotal + shipping_fee).quantize(Decimal('0.01'))

        # 5. Generate unique order number
        order_number = f"ORD-{timezone.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        # 6. Create Order
        customer_full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        order = Order.objects.create(
            order_number=order_number,
            user=user,
            customer_name=customer_full_name,
            customer_email=user.email,
            customer_phone=shipping_address_obj.phone or getattr(user, 'phone', '') or '',
            shipping_address=shipping_address_snapshot,
            billing_address=billing_address_snapshot,
            subtotal=subtotal,
            taxable_amount=subtotal,
            cgst_amount=cgst_amount,
            sgst_amount=sgst_amount,
            igst_amount=igst_amount,
            tax_amount=tax_amount,
            shipping_fee=shipping_fee,
            shipping_discount=shipping_discount,
            total_amount=total_amount,
            status=OrderStatus.PENDING,
            payment_status=PaymentStatus.PENDING,
            payment_method=payment_method,
            notes=notes,
            calculation_snapshot={
                'subtotal': str(subtotal),
                'tax_amount': str(tax_amount),
                'cgst': str(cgst_amount),
                'sgst': str(sgst_amount),
                'igst': str(igst_amount),
                'shipping_fee': str(shipping_fee),
                'total_amount': str(total_amount),
                'is_intra_state': is_intra_state,
            }
        )

        # 7. Create Line Items and Record Stock Deduction
        for item_data in order_items_prepared:
            product = item_data['product']
            qty = item_data['quantity']

            # Deduct stock
            product.stock -= qty
            product.save()

            # Record stock ledger transaction
            StockTransaction.objects.create(
                product=product,
                change_amount=-qty,
                transaction_type=StockTransactionType.SALE,
                order=order,
                performed_by=user,
                notes=f"Order #{order.order_number} checkout deduction"
            )

            OrderItem.objects.create(
                order=order,
                product=product,
                product_name=item_data['product_name'],
                sku=item_data['sku'],
                image_url=item_data['image_url'],
                mrp=item_data['mrp'],
                unit_price=item_data['unit_price'],
                quantity=qty,
                line_discount=item_data['line_discount'],
                taxable_amount=item_data['taxable_amount'],
                tax_rate=item_data['tax_rate'],
                tax_amount=item_data['tax_amount'],
                subtotal=item_data['subtotal'],
                total_amount=item_data['total_amount'],
            )

        # 8. Record initial OrderStatusHistory
        OrderStatusHistory.objects.create(
            order=order,
            previous_status=None,
            new_status=OrderStatus.PENDING,
            changed_by=user,
            reason="Customer placed order at checkout"
        )

        return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)


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
    """
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def patch(self, request, pk):
        try:
            order = Order.objects.select_for_update().get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = OrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_status = order.status
        new_status = serializer.validated_data['status']
        reason = serializer.validated_data.get('reason', '')

        # Canonical 10-state FSM transition rules
        valid_transitions = {
            OrderStatus.PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
            OrderStatus.CONFIRMED: [OrderStatus.PACKED, OrderStatus.CANCELLED],
            OrderStatus.PACKED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
            OrderStatus.SHIPPED: [OrderStatus.DELIVERED],
            OrderStatus.DELIVERED: [OrderStatus.RETURN_REQUESTED],
            OrderStatus.RETURN_REQUESTED: [OrderStatus.RETURN_APPROVED, OrderStatus.RETURN_REJECTED],
            OrderStatus.RETURN_APPROVED: [OrderStatus.RETURN_COMPLETED],
            OrderStatus.CANCELLED: [],
            OrderStatus.RETURN_REJECTED: [],
            OrderStatus.RETURN_COMPLETED: [],
        }

        allowed_next = [s.value for s in valid_transitions.get(old_status, [])]
        if new_status != old_status and new_status not in allowed_next:
            return Response(
                {
                    "detail": f"Invalid status transition from '{old_status}' to '{new_status}'. Allowed transitions: {allowed_next}."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = new_status
        order.save()

        # Append immutable audit entry
        OrderStatusHistory.objects.create(
            order=order,
            previous_status=old_status,
            new_status=new_status,
            changed_by=request.user,
            reason=reason or f"Status updated by {request.user.email}"
        )

        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)


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
