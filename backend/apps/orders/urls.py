from django.urls import path
from .views import (
    CheckoutView,
    CustomerMyOrdersView,
    OrderDetailView,
    AdminOrderListView,
    AdminOrderStatusUpdateView,
    OrderStatusHistoryListView,
)

urlpatterns = [
    path('checkout/', CheckoutView.as_view(), name='order-checkout'),
    path('my-orders/', CustomerMyOrdersView.as_view(), name='order-my-orders'),
    path('', AdminOrderListView.as_view(), name='order-admin-list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('<int:pk>/status/', AdminOrderStatusUpdateView.as_view(), name='order-status-update'),
    path('<int:pk>/history/', OrderStatusHistoryListView.as_view(), name='order-history'),
]
