from django.urls import path
from .views_payment import (
    PaymentInitiateView,
    PaymentVerifyView,
    PaymentWebhookView,
    PaymentOrderStatusView,
)

urlpatterns = [
    path('initiate/', PaymentInitiateView.as_view(), name='payment-initiate'),
    path('create-intent/', PaymentInitiateView.as_view(), name='payment-create-intent'),
    path('verify/', PaymentVerifyView.as_view(), name='payment-verify'),
    path('webhook/', PaymentWebhookView.as_view(), name='payment-webhook'),
    path('order/<int:order_id>/', PaymentOrderStatusView.as_view(), name='payment-order-status'),
]
