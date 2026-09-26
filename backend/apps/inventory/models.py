from django.db import models
from django.conf import settings


class StockTransactionType(models.TextChoices):
    RESTOCK = 'RESTOCK', 'Restock (Warehouse receipt)'
    SALE = 'SALE', 'Sale (Order deduction)'
    ADJUSTMENT = 'ADJUSTMENT', 'Adjustment (Compensating entry)'
    RETURN = 'RETURN', 'Return (Restocked return)'


class StockTransaction(models.Model):
    """
    Immutable ledger recording all physical stock movements.
    Insert-only table. Deletions and updates are blocked to preserve audit history.
    """
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='stock_transactions'
    )
    change_amount = models.IntegerField()
    transaction_type = models.CharField(
        max_length=20,
        choices=StockTransactionType.choices
    )
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_transactions'
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'stock_transactions'
        verbose_name = 'Stock Transaction'
        verbose_name_plural = 'Stock Transactions'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(transaction_type__in=['RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN']),
                name='chk_stk_type'
            ),
        ]
        indexes = [
            models.Index(fields=['product', 'created_at'], name='idx_stk_prod_created'),
        ]

    def save(self, *args, **kwargs):
        if self.pk and not kwargs.get('force_insert', False):
            if StockTransaction.objects.filter(pk=self.pk).exists():
                from django.core.exceptions import ValidationError
                raise ValidationError("StockTransaction ledger records are immutable and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        raise ValidationError("StockTransaction ledger records are immutable and cannot be deleted.")

    def __str__(self):
        sign = '+' if self.change_amount > 0 else ''
        return f"{self.product.sku}: {sign}{self.change_amount} ({self.transaction_type})"
