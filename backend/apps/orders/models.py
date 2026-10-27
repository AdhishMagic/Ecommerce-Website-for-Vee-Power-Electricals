from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
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
    PARTIALLY_PAID = 'Partially Paid', 'Partially Paid'
    FAILED = 'Failed', 'Failed'
    REFUNDED = 'Refunded', 'Refunded'


class Order(TimeStampedModel):
    """
    Customer retail purchases and corporate procurement orders adhering to canonical 10-state FSM.
    Supports full online payment as well as 50% online advance Cash on Delivery (COD).
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

    # Split-Payment and Cash On Delivery (COD) tracking
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    outstanding_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    is_cod = models.BooleanField(default=False)
    cod_advance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    cod_balance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    cod_balance_collected = models.BooleanField(default=False)
    cod_collected_at = models.DateTimeField(null=True, blank=True)

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
                check=models.Q(payment_status__in=['Pending', 'Paid', 'Partially Paid', 'Failed', 'Refunded']),
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

    @property
    def latest_payment_transaction(self):
        return self.payments.order_by('-created_at').first()

    @property
    def razorpay_order_id(self):
        txn = self.latest_payment_transaction
        return txn.gateway_order_id if txn else None

    @property
    def razorpay_payment_id(self):
        txn = self.latest_payment_transaction
        return txn.gateway_transaction_id if txn else None

    @property
    def payment_verification_status(self):
        txn = self.latest_payment_transaction
        return txn.status if txn else None


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


class Cart(TimeStampedModel):
    """
    Persistent shopping cart strictly owned by an authenticated user or guest session.
    Enforces at most one active cart per authenticated user in the database.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='carts'
    )
    session_key = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)
    active_user_id = models.GeneratedField(
        expression=models.Case(
            models.When(is_active=True, then=models.F('user_id')),
            default=None
        ),
        output_field=models.BigIntegerField(null=True),
        db_persist=True,
        unique=True
    )

    class Meta:
        db_table = 'carts'
        verbose_name = 'Cart'
        verbose_name_plural = 'Carts'
        constraints = [
            models.CheckConstraint(
                check=models.Q(user__isnull=False) | models.Q(session_key__isnull=False),
                name='chk_cart_has_owner'
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'is_active'], name='idx_cart_user_active'),
            models.Index(fields=['session_key', 'is_active'], name='idx_cart_session_active'),
        ]

    def __str__(self):
        owner = f"User {self.user_id}" if self.user_id else f"Session {self.session_key}"
        return f"Cart #{self.id} ({owner}, active={self.is_active})"

    def clean(self):
        super().clean()
        if not self.user_id and not self.session_key:
            raise ValidationError("Cart must have either an authenticated user or a session key.")

    def validate_unique(self, exclude=None):
        exclude_list = list(exclude or [])
        if 'active_user_id' not in exclude_list:
            exclude_list.append('active_user_id')
        super().validate_unique(exclude=exclude_list)


class CartItem(TimeStampedModel):
    """
    Line item in a shopping cart associated with a product and quantity.
    Strictly isolated and validated through the parent Cart.
    """
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='cart_items'
    )
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = 'cart_items'
        verbose_name = 'Cart Item'
        verbose_name_plural = 'Cart Items'
        constraints = [
            models.UniqueConstraint(
                fields=['cart', 'product'],
                name='uniq_cart_product'
            ),
            models.CheckConstraint(
                check=models.Q(quantity__gte=1),
                name='chk_cart_item_qty'
            ),
        ]
        indexes = [
            models.Index(fields=['cart'], name='idx_cart_item_cart'),
            models.Index(fields=['product'], name='idx_cart_item_product'),
        ]

    def __str__(self):
        return f"Cart #{self.cart_id} - {self.product.name} x {self.quantity}"

