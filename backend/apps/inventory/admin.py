from django.contrib import admin
from .models import StockTransaction


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'product',
        'change_amount',
        'transaction_type',
        'order',
        'performed_by',
        'created_at',
    )
    list_filter = ('transaction_type', 'created_at')
    search_fields = ('product__name', 'product__sku', 'notes', 'order__order_number')
    readonly_fields = (
        'product',
        'change_amount',
        'transaction_type',
        'order',
        'performed_by',
        'notes',
        'created_at',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
