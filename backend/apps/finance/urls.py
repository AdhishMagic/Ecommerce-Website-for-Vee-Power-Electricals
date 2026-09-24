from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet,
    QuotationViewSet,
    InvoiceViewSet,
    PaymentTransactionViewSet,
    PayoutSettlementViewSet,
)

router = DefaultRouter()
router.register(r'clients', ClientViewSet, basename='finance-client')
router.register(r'quotations', QuotationViewSet, basename='finance-quotation')
router.register(r'invoices', InvoiceViewSet, basename='finance-invoice')
router.register(r'payments', PaymentTransactionViewSet, basename='finance-payment')
router.register(r'settlements', PayoutSettlementViewSet, basename='finance-settlement')

urlpatterns = [
    path('', include(router.urls)),
]
