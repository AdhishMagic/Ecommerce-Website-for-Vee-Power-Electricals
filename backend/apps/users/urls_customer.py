from django.urls import path
from .views_customer import (
    AdminCustomerListCreateView,
    AdminCustomerSummaryView,
    AdminCustomerDetailView,
    AdminCustomerStatusToggleView,
)

urlpatterns = [
    path('', AdminCustomerListCreateView.as_view(), name='admin-customer-list-create'),
    path('summary/', AdminCustomerSummaryView.as_view(), name='admin-customer-summary'),
    path('<int:pk>/', AdminCustomerDetailView.as_view(), name='admin-customer-detail'),
    path('<int:pk>/status/', AdminCustomerStatusToggleView.as_view(), name='admin-customer-status'),
]
