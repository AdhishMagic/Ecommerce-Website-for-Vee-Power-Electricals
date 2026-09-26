from django.urls import path
from .views import (
    InventoryOverviewView,
    StockTransactionListView,
    StockRestockView,
    StockAdjustmentView,
    StockLedgerSummaryView,
)

urlpatterns = [
    path('', InventoryOverviewView.as_view(), name='inventory-overview'),
    path('transactions/', StockTransactionListView.as_view(), name='inventory-transactions'),
    path('restock/', StockRestockView.as_view(), name='inventory-restock'),
    path('adjust/', StockAdjustmentView.as_view(), name='inventory-adjust'),
    path('summary/<int:product_id>/', StockLedgerSummaryView.as_view(), name='inventory-summary'),
]
