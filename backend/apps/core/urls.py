from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ContactInquiryViewSet

router = DefaultRouter()
router.register(r'admin', ContactInquiryViewSet, basename='inquiry-admin')
router.register(r'', ContactInquiryViewSet, basename='inquiry')

urlpatterns = [
    path('', include(router.urls)),
]
