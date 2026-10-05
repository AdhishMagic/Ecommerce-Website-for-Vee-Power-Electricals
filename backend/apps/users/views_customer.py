import re
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db.models import Count, Sum, Q, Value, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import UserRole
from apps.users.permissions import IsAdminUser
from apps.orders.models import Order, OrderStatus, PaymentStatus
from apps.common.pagination import StandardResultsSetPagination
from .serializers_customer import (
    CustomerListSerializer,
    CustomerDetailSerializer,
    CustomerCreateSerializer,
    CustomerUpdateSerializer,
    CustomerStatusToggleSerializer,
)

User = get_user_model()


class AdminCustomerListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/customers/
      List customer accounts with server-side pagination, search, status/type filters,
      and sorting on spend, order volume, and registration date.
    POST /api/v1/customers/
      Create a new customer account with optional initial address.
    Strictly restricted to Admin and Staff via IsAdminUser.
    """
    permission_classes = [IsAdminUser]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CustomerCreateSerializer
        return CustomerListSerializer

    def get_queryset(self):
        qs = User.objects.filter(role=UserRole.CUSTOMER).annotate(
            annotated_orders_count=Count('orders', distinct=True),
            annotated_total_spent=Coalesce(
                Sum('orders__total_amount', filter=~Q(orders__status=OrderStatus.CANCELLED)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2)
            ),
            annotated_outstanding=Coalesce(
                Sum(
                    'orders__total_amount',
                    filter=Q(orders__payment_status=PaymentStatus.PENDING) & ~Q(orders__status=OrderStatus.CANCELLED)
                ),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2)
            ),
            has_business_orders=Count('orders', filter=Q(orders__is_business_order=True), distinct=True)
        )

        # Search parameter (supports name, email, phone, or customer ID)
        search = (self.request.query_params.get('search') or self.request.query_params.get('q') or '').strip()
        if search:
            search_filters = (
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search) |
                Q(username__icontains=search)
            )

            # Check if search term matches numeric customer ID or CUST-XXXXX format
            digits = re.sub(r'[^0-9]', '', search)
            if digits and digits.isdigit():
                search_filters |= Q(id=int(digits))

            qs = qs.filter(search_filters)

        # Status filter ('active' / 'inactive')
        status_param = (self.request.query_params.get('status') or '').strip().lower()
        if status_param == 'active':
            qs = qs.filter(is_active=True)
        elif status_param == 'inactive':
            qs = qs.filter(is_active=False)

        # Customer type filter ('b2b' / 'b2c')
        customer_type = (self.request.query_params.get('customer_type') or '').strip().lower()
        if customer_type in ['b2b', 'business', 'corporate']:
            qs = qs.filter(has_business_orders__gt=0)
        elif customer_type in ['b2c', 'retail']:
            qs = qs.filter(has_business_orders=0)

        # Date range filter
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

        # Server-side sorting
        ordering = (self.request.query_params.get('ordering') or '-created_at').strip()
        ordering_map = {
            'newest': ['-created_at', '-id'],
            '-created_at': ['-created_at', '-id'],
            'oldest': ['created_at', 'id'],
            'created_at': ['created_at', 'id'],
            'name_asc': ['first_name', 'last_name', 'id'],
            'name': ['first_name', 'last_name', 'id'],
            'name_desc': ['-first_name', '-last_name', '-id'],
            '-name': ['-first_name', '-last_name', '-id'],
            'spent_desc': ['-annotated_total_spent', '-id'],
            '-total_spent': ['-annotated_total_spent', '-id'],
            'spent_asc': ['annotated_total_spent', 'id'],
            'total_spent': ['annotated_total_spent', 'id'],
            'orders_desc': ['-annotated_orders_count', '-id'],
            '-orders_count': ['-annotated_orders_count', '-id'],
            'orders_asc': ['annotated_orders_count', 'id'],
            'orders_count': ['annotated_orders_count', 'id'],
            'outstanding_desc': ['-annotated_outstanding', '-id'],
            '-outstanding': ['-annotated_outstanding', '-id'],
            'outstanding_asc': ['annotated_outstanding', 'id'],
            'outstanding': ['annotated_outstanding', 'id'],
        }

        order_by_fields = ordering_map.get(ordering, ['-created_at', '-id'])
        return qs.order_by(*order_by_fields)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        detail_serializer = CustomerDetailSerializer(user)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)


class AdminCustomerSummaryView(APIView):
    """
    GET /api/v1/customers/summary/
    Returns database-wide customer KPIs computed through authoritative database aggregation.
    No paginated frontend estimation.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)

        customer_users = User.objects.filter(role=UserRole.CUSTOMER)
        total_customers = customer_users.count()
        active_customers = customer_users.filter(is_active=True).count()
        inactive_customers = customer_users.filter(is_active=False).count()
        new_customers_30d = customer_users.filter(created_at__gte=thirty_days_ago).count()
        b2b_customers = customer_users.filter(orders__is_business_order=True).distinct().count()

        # Database-wide financial metrics for customer accounts
        customer_orders = Order.objects.filter(user__role=UserRole.CUSTOMER)
        order_agg = customer_orders.exclude(status=OrderStatus.CANCELLED).aggregate(
            total_spent=Sum('total_amount'),
            total_outstanding=Sum('total_amount', filter=Q(payment_status=PaymentStatus.PENDING))
        )

        total_spent = order_agg['total_spent'] or Decimal('0.00')
        total_outstanding = order_agg['total_outstanding'] or Decimal('0.00')

        return Response({
            'total_customers': total_customers,
            'active_customers': active_customers,
            'inactive_customers': inactive_customers,
            'new_customers_30d': new_customers_30d,
            'b2b_customers': b2b_customers,
            'total_spent': str(total_spent.quantize(Decimal('0.01'))),
            'total_outstanding': str(total_outstanding.quantize(Decimal('0.01'))),
        }, status=status.HTTP_200_OK)


class AdminCustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/v1/customers/{id}/
      Returns deep profile, addresses, order summary, and financial breakdown.
    PATCH/PUT /api/v1/customers/{id}/
      Updates customer profile fields safely.
    DELETE /api/v1/customers/{id}/
      Safe deletion policy: soft-deactivates if customer has historical orders/invoices.
    """
    permission_classes = [IsAdminUser]
    queryset = User.objects.filter(role=UserRole.CUSTOMER).prefetch_related(
        'addresses',
        'orders__items'
    )
    lookup_field = 'pk'

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return CustomerUpdateSerializer
        return CustomerDetailSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated_instance = serializer.save()
        detail_serializer = CustomerDetailSerializer(updated_instance)
        return Response(detail_serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        has_orders = instance.orders.exists()
        from apps.finance.models import Invoice
        has_invoices = Invoice.objects.filter(order__user=instance).exists()

        if has_orders or has_invoices:
            instance.is_active = False
            instance.save()
            return Response({
                'action': 'deactivated',
                'message': 'Customer has historical orders. The account has been safely deactivated instead of deleted.',
                'customer_id': instance.id,
                'is_active': False
            }, status=status.HTTP_200_OK)

        customer_id = instance.id
        instance.delete()
        return Response({
            'action': 'deleted',
            'message': 'Customer account removed successfully.',
            'customer_id': customer_id
        }, status=status.HTTP_200_OK)


class AdminCustomerStatusToggleView(APIView):
    """
    POST /api/v1/customers/{id}/status/
    Explicit activate/deactivate status toggle.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            customer = User.objects.get(pk=pk, role=UserRole.CUSTOMER)
        except User.DoesNotExist:
            return Response({'detail': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = CustomerStatusToggleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if 'is_active' in serializer.validated_data:
            customer.is_active = serializer.validated_data['is_active']
        else:
            customer.is_active = not customer.is_active

        customer.save()
        detail_serializer = CustomerDetailSerializer(customer)
        return Response(detail_serializer.data, status=status.HTTP_200_OK)
