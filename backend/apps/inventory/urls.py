from django.urls import path
from .views import InventoryViewSet, add_transaction_view

urlpatterns = [
    path('inventory/', InventoryViewSet.as_view({'get': 'list'}), name='inventory-list'),
    path('inventory/<int:product_id>/transaction/', add_transaction_view, name='inventory-transaction'),
]
