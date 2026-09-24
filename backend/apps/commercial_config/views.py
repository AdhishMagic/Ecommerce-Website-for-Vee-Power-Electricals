from decimal import Decimal
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminUser
from .models import (
    CompanyStoreConfiguration,
    TaxConfiguration,
    DeliveryConfiguration,
    DistanceSlab,
    ShippingRule,
    OrderDiscount,
    DiscountType,
)
from .serializers import (
    CompanyStoreConfigurationSerializer,
    TaxConfigurationSerializer,
    DeliveryConfigurationSerializer,
    DistanceSlabSerializer,
    ShippingRuleSerializer,
    OrderDiscountSerializer,
    CouponValidationInputSerializer,
)


class CompanyStoreConfigView(APIView):
    """
    GET /api/v1/config/store/ (Public)
    PUT / PATCH /api/v1/config/store/ (Admin)
    Master company profile, GSTIN, legal registered office, and checkout toggles.
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    def get_object(self):
        obj, _ = CompanyStoreConfiguration.objects.get_or_create(id=1)
        return obj

    def get(self, request):
        config = self.get_object()
        return Response(CompanyStoreConfigurationSerializer(config).data)

    def put(self, request):
        config = self.get_object()
        serializer = CompanyStoreConfigurationSerializer(config, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        config = self.get_object()
        serializer = CompanyStoreConfigurationSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class TaxConfigurationViewSet(viewsets.ModelViewSet):
    """
    Administrative management for versioned GST tax rate splits.
    """
    queryset = TaxConfiguration.objects.all().order_by('-version_number')
    serializer_class = TaxConfigurationSerializer
    permission_classes = [IsAdminUser]


class DeliveryConfigurationViewSet(viewsets.ModelViewSet):
    """
    Delivery hub coordinates and base delivery thresholds.
    """
    queryset = DeliveryConfiguration.objects.prefetch_related('slabs').all().order_by('-version_number')
    serializer_class = DeliveryConfigurationSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = DeliveryConfiguration.objects.prefetch_related('slabs').all().order_by('-version_number')
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)
        return qs


class DistanceSlabViewSet(viewsets.ModelViewSet):
    """
    Continuous half-open distance tariff slabs [min_km, max_km).
    """
    queryset = DistanceSlab.objects.all().order_by('sort_order', 'min_distance_km')
    serializer_class = DistanceSlabSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = DistanceSlab.objects.all().order_by('sort_order', 'min_distance_km')
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)
        return qs


class ShippingRuleViewSet(viewsets.ModelViewSet):
    """
    Regional state fallback flat rate rules.
    """
    queryset = ShippingRule.objects.all().order_by('state')
    serializer_class = ShippingRuleSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = ShippingRule.objects.all().order_by('state')
        if not (self.request.user and self.request.user.is_authenticated and (self.request.user.is_staff or getattr(self.request.user, 'role', '') == 'admin')):
            qs = qs.filter(is_active=True)
        return qs


class OrderDiscountViewSet(viewsets.ModelViewSet):
    """
    Administrative management for promotional coupon codes.
    """
    queryset = OrderDiscount.objects.all().order_by('-created_at')
    serializer_class = OrderDiscountSerializer
    permission_classes = [IsAdminUser]


class CouponValidationView(APIView):
    """
    POST /api/v1/config/coupons/validate/
    Public/customer coupon pre-validation service. Does not mutate database records.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CouponValidationInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data['code'].strip().upper()
        order_amount = serializer.validated_data['order_amount']

        now = timezone.now()
        coupon = OrderDiscount.objects.filter(code__iexact=code).first()

        if not coupon:
            return Response(
                {"valid": False, "detail": f"Coupon code '{code}' does not exist."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not coupon.is_active:
            return Response(
                {"valid": False, "detail": f"Coupon code '{code}' is not currently active."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if coupon.valid_from and coupon.valid_from > now:
            return Response(
                {"valid": False, "detail": f"Coupon code '{code}' is not yet valid."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if coupon.valid_until and coupon.valid_until < now:
            return Response(
                {"valid": False, "detail": f"Coupon code '{code}' has expired."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if order_amount < coupon.min_order_value:
            return Response(
                {
                    "valid": False,
                    "detail": f"Minimum order amount of ₹{coupon.min_order_value} required to use coupon '{code}'."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Compute discount
        if coupon.discount_type == DiscountType.PERCENTAGE:
            calc = (order_amount * (coupon.discount_value / Decimal('100.00'))).quantize(Decimal('0.01'))
            if coupon.max_discount_cap and calc > coupon.max_discount_cap:
                calc = coupon.max_discount_cap
        else:
            calc = min(coupon.discount_value, order_amount)

        return Response(
            {
                "valid": True,
                "code": coupon.code,
                "discount_type": coupon.discount_type,
                "discount_value": str(coupon.discount_value),
                "calculated_discount": str(calc),
                "description": coupon.description,
            },
            status=status.HTTP_200_OK
        )
