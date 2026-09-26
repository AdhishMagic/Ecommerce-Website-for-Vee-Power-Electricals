from django.urls import path
from .views import (
    CheckoutView,
    CustomerMyOrdersView,
    OrderDetailView,
    AdminOrderListView,
    AdminOrderStatusUpdateView,
    OrderStatusHistoryListView,
    OrderCancelView,
    OrderReturnRequestView,
)

urlpatterns = [
    path('checkout/', CheckoutView.as_view(), name='order-checkout'),
    path('my-orders/', CustomerMyOrdersView.as_view(), name='order-my-orders'),
    path('', AdminOrderListView.as_view(), name='order-admin-list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('<int:pk>/status/', AdminOrderStatusUpdateView.as_view(), name='order-status-update'),
    path('<int:pk>/cancel/', OrderCancelView.as_view(), name='order-cancel'),
    path('<int:pk>/return/', OrderReturnRequestView.as_view(), name='order-return-request'),
    path('<int:pk>/return-request/', OrderReturnRequestView.as_view(), name='order-return-request-alias'),
    path('<int:pk>/history/', OrderStatusHistoryListView.as_view(), name='order-history'),
]
