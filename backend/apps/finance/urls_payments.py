from django.urls import path
from .views_payment import (
    PaymentInitiateView,
    PaymentVerifyView,
    PaymentWebhookView,
    PaymentOrderStatusView,
    PaymentConfigView,
    StandardCreateOrderView,
    StandardVerifyPaymentView,
)

urlpatterns = [
    path('config/', PaymentConfigView.as_view(), name='payment-config'),
    path('initiate/', PaymentInitiateView.as_view(), name='payment-initiate'),
    path('create-intent/', PaymentInitiateView.as_view(), name='payment-create-intent'),
    path('create-order/', StandardCreateOrderView.as_view(), name='payment-standard-create-order'),
    path('verify/', PaymentVerifyView.as_view(), name='payment-verify'),
    path('verify-payment/', StandardVerifyPaymentView.as_view(), name='payment-standard-verify-payment'),
    path('webhook/', PaymentWebhookView.as_view(), name='payment-webhook'),
    path('order/<int:order_id>/', PaymentOrderStatusView.as_view(), name='payment-order-status'),
]
