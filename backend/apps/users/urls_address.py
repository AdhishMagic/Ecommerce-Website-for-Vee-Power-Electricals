from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views_address import CustomerAddressViewSet

router = DefaultRouter()
router.register(r'', CustomerAddressViewSet, basename='address')

urlpatterns = [
    path('', include(router.urls)),
]
