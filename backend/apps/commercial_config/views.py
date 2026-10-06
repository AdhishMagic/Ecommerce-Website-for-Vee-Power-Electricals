from decimal import Decimal
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminUser
from apps.core.models import AdminConfigAuditLog
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
    CompanyStoreConfigurationPublicSerializer,
    TaxConfigurationSerializer,
    DeliveryConfigurationSerializer,
    DistanceSlabSerializer,
    ShippingRuleSerializer,
    OrderDiscountSerializer,
    CouponValidationInputSerializer,
    AdminConfigAuditLogSerializer,
)
from .services.audit_service import log_admin_config_change
from .services import DiscountService


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

    @staticmethod
    def _is_administrator(user) -> bool:
        return bool(
            user
            and user.is_authenticated
            and (
                getattr(user, 'role', '') == 'admin'
                or getattr(user, 'is_staff', False)
                or getattr(user, 'is_superuser', False)
            )
        )

    def get(self, request):
        config = self.get_object()
        # Administrators see bank settlement coordinates; anonymous and customer
        # callers receive the public projection without them.
        if self._is_administrator(request.user):
            return Response(CompanyStoreConfigurationSerializer(config).data)
        return Response(CompanyStoreConfigurationPublicSerializer(config).data)

    def put(self, request):
        config = self.get_object()
        old_data = CompanyStoreConfigurationSerializer(config).data
        serializer = CompanyStoreConfigurationSerializer(config, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_admin_config_change(
            domain='store',
            record_id=config.id,
            action_type='UPDATE',
            user=request.user,
            old_value=old_data,
            new_value=serializer.data,
            change_reason=request.data.get('change_reason', 'Updated company store configuration'),
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response(serializer.data)

    def patch(self, request):
        config = self.get_object()
        old_data = CompanyStoreConfigurationSerializer(config).data
        serializer = CompanyStoreConfigurationSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_admin_config_change(
            domain='store',
            record_id=config.id,
            action_type='UPDATE',
            user=request.user,
            old_value=old_data,
            new_value=serializer.data,
            change_reason=request.data.get('change_reason', 'Patched company store configuration'),
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response(serializer.data)


class TaxConfigurationViewSet(viewsets.ModelViewSet):
    """
    Administrative management for versioned GST tax rate splits.
    """
    queryset = TaxConfiguration.objects.all().order_by('-version_number')
    serializer_class = TaxConfigurationSerializer
    permission_classes = [IsAdminUser]

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        log_admin_config_change(
            domain='tax',
            record_id=instance.id,
            action_type='CREATE',
            user=self.request.user,
            old_value=None,
            new_value=TaxConfigurationSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Created TaxConfiguration v{instance.version_number}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_update(self, serializer):
        old_data = TaxConfigurationSerializer(serializer.instance).data
        instance = serializer.save()
        log_admin_config_change(
            domain='tax',
            record_id=instance.id,
            action_type='UPDATE',
            user=self.request.user,
            old_value=old_data,
            new_value=TaxConfigurationSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Updated TaxConfiguration v{instance.version_number}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_destroy(self, instance):
        old_data = TaxConfigurationSerializer(instance).data
        rec_id = instance.id
        instance.delete()
        log_admin_config_change(
            domain='tax',
            record_id=rec_id,
            action_type='DELETE',
            user=self.request.user,
            old_value=old_data,
            new_value={},
            change_reason=self.request.data.get('change_reason', f"Deleted TaxConfiguration #{rec_id}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )


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

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        log_admin_config_change(
            domain='delivery',
            record_id=instance.id,
            action_type='CREATE',
            user=self.request.user,
            old_value=None,
            new_value=DeliveryConfigurationSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Created DeliveryConfiguration v{instance.version_number}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_update(self, serializer):
        old_data = DeliveryConfigurationSerializer(serializer.instance).data
        instance = serializer.save()
        log_admin_config_change(
            domain='delivery',
            record_id=instance.id,
            action_type='UPDATE',
            user=self.request.user,
            old_value=old_data,
            new_value=DeliveryConfigurationSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Updated DeliveryConfiguration v{instance.version_number}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_destroy(self, instance):
        old_data = DeliveryConfigurationSerializer(instance).data
        rec_id = instance.id
        instance.delete()
        log_admin_config_change(
            domain='delivery',
            record_id=rec_id,
            action_type='DELETE',
            user=self.request.user,
            old_value=old_data,
            new_value={},
            change_reason=self.request.data.get('change_reason', f"Deleted DeliveryConfiguration #{rec_id}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )


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

    def perform_create(self, serializer):
        instance = serializer.save()
        log_admin_config_change(
            domain='slabs',
            record_id=instance.id,
            action_type='CREATE',
            user=self.request.user,
            old_value=None,
            new_value=DistanceSlabSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Created DistanceSlab [{instance.min_distance_km}-{instance.max_distance_km}km)"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_update(self, serializer):
        old_data = DistanceSlabSerializer(serializer.instance).data
        instance = serializer.save()
        log_admin_config_change(
            domain='slabs',
            record_id=instance.id,
            action_type='UPDATE',
            user=self.request.user,
            old_value=old_data,
            new_value=DistanceSlabSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Updated DistanceSlab [{instance.min_distance_km}-{instance.max_distance_km}km)"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_destroy(self, instance):
        old_data = DistanceSlabSerializer(instance).data
        rec_id = instance.id
        instance.delete()
        log_admin_config_change(
            domain='slabs',
            record_id=rec_id,
            action_type='DELETE',
            user=self.request.user,
            old_value=old_data,
            new_value={},
            change_reason=self.request.data.get('change_reason', f"Deleted DistanceSlab #{rec_id}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )


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

    def perform_create(self, serializer):
        instance = serializer.save()
        log_admin_config_change(
            domain='shipping-rules',
            record_id=instance.id,
            action_type='CREATE',
            user=self.request.user,
            old_value=None,
            new_value=ShippingRuleSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Created ShippingRule for {instance.state}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_update(self, serializer):
        old_data = ShippingRuleSerializer(serializer.instance).data
        instance = serializer.save()
        log_admin_config_change(
            domain='shipping-rules',
            record_id=instance.id,
            action_type='UPDATE',
            user=self.request.user,
            old_value=old_data,
            new_value=ShippingRuleSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Updated ShippingRule for {instance.state}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_destroy(self, instance):
        old_data = ShippingRuleSerializer(instance).data
        rec_id = instance.id
        instance.delete()
        log_admin_config_change(
            domain='shipping-rules',
            record_id=rec_id,
            action_type='DELETE',
            user=self.request.user,
            old_value=old_data,
            new_value={},
            change_reason=self.request.data.get('change_reason', f"Deleted ShippingRule #{rec_id}"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )


class OrderDiscountViewSet(viewsets.ModelViewSet):
    """
    Administrative management for promotional coupon codes.
    """
    queryset = OrderDiscount.objects.all().order_by('-created_at')
    serializer_class = OrderDiscountSerializer
    permission_classes = [IsAdminUser]

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        log_admin_config_change(
            domain='discounts',
            record_id=instance.id,
            action_type='CREATE',
            user=self.request.user,
            old_value=None,
            new_value=OrderDiscountSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Created OrderDiscount '{instance.code}'"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_update(self, serializer):
        old_data = OrderDiscountSerializer(serializer.instance).data
        instance = serializer.save()
        log_admin_config_change(
            domain='discounts',
            record_id=instance.id,
            action_type='UPDATE',
            user=self.request.user,
            old_value=old_data,
            new_value=OrderDiscountSerializer(instance).data,
            change_reason=self.request.data.get('change_reason', f"Updated OrderDiscount '{instance.code}'"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def perform_destroy(self, instance):
        old_data = OrderDiscountSerializer(instance).data
        rec_id = instance.id
        code = instance.code
        instance.delete()
        log_admin_config_change(
            domain='discounts',
            record_id=rec_id,
            action_type='DELETE',
            user=self.request.user,
            old_value=old_data,
            new_value={},
            change_reason=self.request.data.get('change_reason', f"Deleted OrderDiscount '{code}'"),
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )


class AdminConfigAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/v1/config/audit-logs/ (Admin only)
    Append-only audit trail recording administrative configuration changes.
    """
    # select_related('admin_user') resolves admin_email in the same query
    # instead of one lookup per audit row.
    queryset = AdminConfigAuditLog.objects.select_related('admin_user').all().order_by('-created_at')
    serializer_class = AdminConfigAuditLogSerializer
    permission_classes = [IsAdminUser]


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
