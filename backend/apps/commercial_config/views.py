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


from apps.commercial_config.services import DiscountService


class CouponValidationView(APIView):
    """
    POST /api/v1/config/coupons/validate/
    Public/customer coupon pre-validation service. Does not mutate database records.
    Delegates validation logic to DiscountService.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CouponValidationInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data['code'].strip().upper()
        order_amount = serializer.validated_data['order_amount']

        disc_res = DiscountService.evaluate_order_discount(
            code=code,
            order_amount=order_amount,
            existing_product_discounts=Decimal('0.00')
        )

        if not disc_res.is_valid:
            return Response(
                {"valid": False, "detail": disc_res.error_message},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "valid": True,
                "code": disc_res.code,
                "discount_type": disc_res.discount_type,
                "discount_value": str(disc_res.discount_value),
                "calculated_discount": str(disc_res.calculated_discount),
                "description": disc_res.description,
            },
            status=status.HTTP_200_OK
        )
