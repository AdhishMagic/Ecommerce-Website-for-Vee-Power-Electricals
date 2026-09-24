from decimal import Decimal
from django.db import models
from django.conf import settings
from apps.common.models import TimeStampedModel


class OrderStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Payment'
    CONFIRMED = 'CONFIRMED', 'Confirmed'
    PACKED = 'PACKED', 'Packed'
    SHIPPED = 'SHIPPED', 'Shipped'
    DELIVERED = 'DELIVERED', 'Delivered'
    CANCELLED = 'CANCELLED', 'Cancelled'
    RETURN_REQUESTED = 'RETURN_REQUESTED', 'Return Requested'
    RETURN_APPROVED = 'RETURN_APPROVED', 'Return Approved'
    RETURN_REJECTED = 'RETURN_REJECTED', 'Return Rejected'
    RETURN_COMPLETED = 'RETURN_COMPLETED', 'Return Completed'


class PaymentStatus(models.TextChoices):
    PENDING = 'Pending', 'Pending'
    PAID = 'Paid', 'Paid'
    FAILED = 'Failed', 'Failed'
    REFUNDED = 'Refunded', 'Refunded'


class Order(TimeStampedModel):
    """
    Customer retail purchases and corporate procurement orders adhering to canonical 10-state FSM.
    """
    order_number = models.CharField(max_length=100, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders'
    )
    customer_name = models.CharField(max_length=200)
    customer_email = models.EmailField(max_length=255)
    customer_phone = models.CharField(max_length=20)
    shipping_address = models.JSONField(default=dict)
    billing_address = models.JSONField(null=True, blank=True)
    is_business_order = models.BooleanField(default=False)
    company_name = models.CharField(max_length=200, null=True, blank=True)
    gstin = models.CharField(max_length=15, null=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    product_discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    order_discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    shipping_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    shipping_discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=30,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING
    )
    payment_method = models.CharField(max_length=50, default='UPI')
    tracking_number = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(null=True, blank=True)
    calculation_snapshot = models.JSONField(default=dict)

    class Meta:
        db_table = 'orders'
        verbose_name = 'Order'
        verbose_name_plural = 'Orders'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(status__in=[s.value for s in OrderStatus]),
                name='chk_order_status'
            ),
            models.CheckConstraint(
                check=models.Q(payment_status__in=['Pending', 'Paid', 'Failed', 'Refunded']),
                name='chk_order_pay_status'
            ),
            models.CheckConstraint(
                check=models.Q(subtotal__gte=0) & models.Q(total_amount__gte=0),
                name='chk_order_totals'
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'created_at'], name='idx_orders_user'),
            models.Index(fields=['status', 'created_at'], name='idx_orders_status'),
            models.Index(fields=['payment_status'], name='idx_orders_payment_status'),
            models.Index(fields=['created_at'], name='idx_orders_created'),
        ]

    def __str__(self):
        return f"{self.order_number} ({self.status} - ₹{self.total_amount})"


class OrderItem(models.Model):
    """
    Frozen line items snapshotting product price, tax, and name at the moment of order placement.
    """
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    product_name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100)
    image_url = models.CharField(max_length=500, null=True, blank=True)
    mrp = models.DecimalField(max_digits=10, decimal_places=2)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)
    line_discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_items'
        verbose_name = 'Order Item'
        verbose_name_plural = 'Order Items'
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gte=1),
                name='chk_item_qty'
            ),
        ]

    def __str__(self):
        return f"{self.product_name} x {self.quantity} (Order: {self.order.order_number})"


class OrderStatusHistory(models.Model):
    """
    Immutable audit log tracking order fulfillment state transitions.
    """
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='status_history'
    )
    previous_status = models.CharField(max_length=30, null=True, blank=True)
    new_status = models.CharField(max_length=30)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_status_history'
        verbose_name = 'Order Status History'
        verbose_name_plural = 'Order Status Histories'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['order', 'created_at'], name='idx_order_history_order'),
        ]

    def __str__(self):
        return f"{self.order.order_number}: {self.previous_status} -> {self.new_status}"
