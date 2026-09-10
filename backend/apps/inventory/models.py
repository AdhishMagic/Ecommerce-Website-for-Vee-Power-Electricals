from django.db import models
from apps.common.models import TimeStampedModel
from apps.products.models import Product

class StockTransaction(TimeStampedModel):
    TRANSACTION_TYPES = (
        ('RESTOCK', 'Restock'),
        ('SALE', 'Sale'),
        ('ADJUSTMENT', 'Adjustment'),
        ('RETURN', 'Return'),
    )

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_transactions')
    change_amount = models.IntegerField()
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.transaction_type} ({self.change_amount}) for {self.product.name}"
