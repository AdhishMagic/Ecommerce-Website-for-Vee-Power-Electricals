from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CompanyStoreConfigView,
    TaxConfigurationViewSet,
    DeliveryConfigurationViewSet,
    DistanceSlabViewSet,
    ShippingRuleViewSet,
    OrderDiscountViewSet,
    CouponValidationView,
)

router = DefaultRouter()
router.register(r'tax', TaxConfigurationViewSet, basename='config-tax')
router.register(r'delivery', DeliveryConfigurationViewSet, basename='config-delivery')
router.register(r'slabs', DistanceSlabViewSet, basename='config-slabs')
router.register(r'shipping-rules', ShippingRuleViewSet, basename='config-shipping-rules')
router.register(r'discounts', OrderDiscountViewSet, basename='config-discounts')

urlpatterns = [
    path('store/', CompanyStoreConfigView.as_view(), name='config-store'),
    path('coupons/validate/', CouponValidationView.as_view(), name='config-coupon-validate'),
    path('', include(router.urls)),
]
