import re
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from apps.common.models import TimeStampedModel


class QuotationStatus(models.TextChoices):
    DRAFT = 'Draft', 'Draft'
    SENT = 'Sent', 'Sent to Client'
    APPROVED = 'Approved', 'Approved by Client'
    REJECTED = 'Rejected', 'Rejected'
    CONVERTED = 'Converted', 'Converted to Invoice'


class InvoiceStatus(models.TextChoices):
    PAID = 'Paid', 'Paid'
    UNPAID = 'Unpaid', 'Unpaid'
    OVERDUE = 'Overdue', 'Overdue'
    CANCELLED = 'Cancelled', 'Cancelled'


class PaymentGateway(models.TextChoices):
    RAZORPAY = 'RAZORPAY', 'Razorpay Gateway'
    COD = 'COD', 'Cash on Delivery'
    NEFT_RTGS = 'NEFT_RTGS', 'Direct Bank Transfer (NEFT/RTGS)'
    MANUAL = 'MANUAL', 'Manual Admin Entry'


class PaymentTxStatus(models.TextChoices):
    INITIATED = 'INITIATED', 'Initiated'
    SUCCESS = 'SUCCESS', 'Success'
    FAILED = 'FAILED', 'Failed'
    REFUNDED = 'REFUNDED', 'Refunded'


class ExpenseCategory(models.TextChoices):
    LOGISTICS = 'Logistics', 'Logistics & Courier'
    MARKETING = 'Marketing', 'Marketing & Advertising'
    SOFTWARE = 'Software', 'Software & IT Infrastructure'
    INVENTORY = 'Inventory', 'Inventory Procurement'
    UTILITIES = 'Utilities', 'Utilities & Electricity'
    OPERATIONS = 'Operations', 'General Office Operations'


class ExpenseStatus(models.TextChoices):
    PAID = 'Paid', 'Paid'
    PENDING = 'Pending', 'Pending Settlement'


class SettlementStatus(models.TextChoices):
    SETTLED = 'Settled', 'Settled to Merchant Bank'
    PROCESSING = 'Processing', 'Processing'
    FAILED = 'Failed', 'Failed'


GST_STATE_CODES = {
    '01': 'Jammu and Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '25': 'Daman and Diu',
    '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra',
    '28': 'Andhra Pradesh',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
    '38': 'Ladakh',
    '97': 'Other Territory',
}


class Client(TimeStampedModel):
    """
    B2B corporate buyers, building contractors, and credit accounts.
    """
    client_code = models.CharField(max_length=50, unique=True)
    company_name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150)
    gstin = models.CharField(max_length=15, unique=True)
    email = models.EmailField(max_length=255)
    phone = models.CharField(max_length=20)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    address = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'clients'
        verbose_name = 'B2B Client'
        verbose_name_plural = 'B2B Clients'
        ordering = ['company_name']
        constraints = [
            models.CheckConstraint(
                check=models.Q(credit_limit__gte=0),
                name='chk_client_credit'
            ),
        ]

    @property
    def pan(self) -> str:
        """Extract statutory Permanent Account Number (PAN) from GSTIN (characters 3 to 12)."""
        if self.gstin and len(self.gstin) >= 12:
            return self.gstin[2:12].upper()
        return ''

    @property
    def state_code(self) -> str:
        """Extract 2-digit GST state code from GSTIN."""
        if self.gstin and len(self.gstin) >= 2:
            return self.gstin[:2]
        return ''

    @property
    def state(self) -> str:
        """Statutory state name derived from GST state code."""
        return GST_STATE_CODES.get(self.state_code, '')

    @property
    def billing_address(self) -> str:
        return self.address or ''

    @property
    def shipping_address(self) -> str:
        return self.address or ''

    @property
    def customer_type(self) -> str:
        return 'CORPORATE'

    @property
    def credit_exposure(self) -> Decimal:
        from apps.finance.services.credit_service import CreditService
        return CreditService.get_outstanding_exposure(self)

    @property
    def available_credit(self) -> Decimal:
        from apps.finance.services.credit_service import CreditService
        return CreditService.get_available_credit(self)

    def clean(self):
        super().clean()
        if self.credit_limit is not None and self.credit_limit < Decimal('0.00'):
            raise ValidationError({'credit_limit': 'Credit limit cannot be negative.'})
        if self.gstin:
            self.gstin = self.gstin.upper().strip()
            if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', self.gstin):
                raise ValidationError({'gstin': 'GSTIN must conform to 15-character Indian statutory format.'})
            if self.gstin[:2] not in GST_STATE_CODES:
                raise ValidationError({'gstin': f"Invalid GST state code '{self.gstin[:2]}'."})

    def save(self, *args, **kwargs):
        if self.client_code:
            self.client_code = self.client_code.upper().strip()
        if self.gstin:
            self.gstin = self.gstin.upper().strip()
        if self.company_name:
            self.company_name = self.company_name.strip()
        if self.contact_person:
            self.contact_person = self.contact_person.strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.company_name} ({self.client_code})"


class Quotation(TimeStampedModel):
    """
    Commercial project estimates and price quotations issued to contractors.
    Quotation conversion is tracked by status == 'Converted'.
    Authoritative link: invoices.quotation_id -> quotations.id (strictly acyclic).
    """
    quotation_number = models.CharField(max_length=50, unique=True)
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='quotations'
    )
    quotation_date = models.DateField()
    expiry_date = models.DateField()
    total_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(
        max_length=20,
        choices=QuotationStatus.choices,
        default=QuotationStatus.DRAFT
    )
    notes = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        db_table = 'quotations'
        verbose_name = 'Quotation'
        verbose_name_plural = 'Quotations'
        ordering = ['-quotation_date', '-id']
        constraints = [
            models.CheckConstraint(
                check=models.Q(expiry_date__gte=models.F('quotation_date')),
                name='chk_quote_dates'
            ),
            models.CheckConstraint(
                check=models.Q(status__in=['Draft', 'Sent', 'Approved', 'Rejected', 'Converted']),
                name='chk_quote_status'
            ),
            models.CheckConstraint(
                check=models.Q(total_value__gte=0),
                name='chk_quote_total_pos'
            ),
        ]
        indexes = [
            models.Index(fields=['client', 'status'], name='idx_quote_client'),
        ]

    def __str__(self):
        return f"{self.quotation_number} - {self.client.company_name} (₹{self.total_value})"


class QuotationItem(models.Model):
    """
    Line items quoted inside a commercial quotation.
    """
    quotation = models.ForeignKey(
        Quotation,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    item_name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'quotation_items'
        verbose_name = 'Quotation Item'
        verbose_name_plural = 'Quotation Items'
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gte=1),
                name='chk_qitem_qty'
            ),
            models.CheckConstraint(
                check=models.Q(unit_price__gte=0) & models.Q(subtotal__gte=0),
                name='chk_qitem_prices'
            ),
        ]

    def __str__(self):
        return f"{self.item_name} x {self.quantity} (Quote: {self.quotation.quotation_number})"


class Invoice(TimeStampedModel):
    """
    Legal GST tax invoices generated for retail orders or B2B client contracts.
    order_id is nullable and non-unique at DB level, supporting 1:N partial dispatches.
    """
    invoice_number = models.CharField(max_length=50, unique=True)
    invoice_date = models.DateField()
    due_date = models.DateField()
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices'
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoices'
    )
    quotation = models.ForeignKey(
        Quotation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices'
    )
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2)
    cgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    sgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    igst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    shipping_fee = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=InvoiceStatus.choices,
        default=InvoiceStatus.UNPAID
    )
    payment_status = models.CharField(max_length=20, default='Pending')
    notes = models.TextField(null=True, blank=True)
    calculation_snapshot = models.JSONField(default=dict)

    class Meta:
        db_table = 'invoices'
        verbose_name = 'Invoice'
        verbose_name_plural = 'Invoices'
        ordering = ['-invoice_date', '-id']
        constraints = [
            models.CheckConstraint(
                check=models.Q(due_date__gte=models.F('invoice_date')),
                name='chk_inv_dates'
            ),
            models.CheckConstraint(
                check=models.Q(status__in=['Paid', 'Unpaid', 'Overdue', 'Cancelled']),
                name='chk_inv_status'
            ),
            models.CheckConstraint(
                check=models.Q(total_amount__gte=0) & models.Q(subtotal__gte=0),
                name='chk_inv_totals'
            ),
        ]
        indexes = [
            models.Index(fields=['client', 'status'], name='idx_inv_client_stat'),
            models.Index(fields=['invoice_date', 'status'], name='idx_inv_date_stat'),
        ]

    def __str__(self):
        return f"{self.invoice_number} ({self.status} - ₹{self.total_amount})"


class InvoiceItem(models.Model):
    """
    Line items detailing statutory GST tax breakdowns per invoiced item.
    """
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    item_name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2)
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'invoice_items'
        verbose_name = 'Invoice Item'
        verbose_name_plural = 'Invoice Items'
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gte=1),
                name='chk_inv_item_qty'
            ),
            models.CheckConstraint(
                check=models.Q(rate__gte=0) & models.Q(total_amount__gte=0),
                name='chk_inv_item_rates'
            ),
        ]

    def __str__(self):
        return f"{self.item_name} x {self.quantity} (Invoice: {self.invoice.invoice_number})"


class PaymentTransaction(TimeStampedModel):
    """
    Records customer inbound payment attempts against orders and invoices.
    """
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments'
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments'
    )
    gateway = models.CharField(
        max_length=30,
        choices=PaymentGateway.choices,
        default=PaymentGateway.RAZORPAY
    )
    gateway_transaction_id = models.CharField(max_length=100, null=True, blank=True)
    gateway_order_id = models.CharField(max_length=100, null=True, blank=True)
    gateway_signature = models.CharField(max_length=255, null=True, blank=True)
    payment_method = models.CharField(max_length=50, default='UPI')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default='INR')
    status = models.CharField(
        max_length=20,
        choices=PaymentTxStatus.choices,
        default=PaymentTxStatus.INITIATED
    )
    error_code = models.CharField(max_length=50, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'payment_transactions'
        verbose_name = 'Payment Transaction'
        verbose_name_plural = 'Payment Transactions'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount__gt=0),
                name='chk_pay_amount'
            ),
            models.CheckConstraint(
                check=models.Q(status__in=['INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED']),
                name='chk_pay_status'
            ),
        ]
        indexes = [
            models.Index(fields=['gateway_transaction_id'], name='idx_pay_gateway_id'),
        ]

    def __str__(self):
        return f"{self.gateway} - ₹{self.amount} ({self.status})"


class Expense(TimeStampedModel):
    """
    Internal administrative operational and capital expense tracking.
    """
    expense_date = models.DateField()
    category = models.CharField(
        max_length=30,
        choices=ExpenseCategory.choices
    )
    description = models.CharField(max_length=255)
    vendor = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=ExpenseStatus.choices,
        default=ExpenseStatus.PENDING
    )
    payment_mode = models.CharField(max_length=50, null=True, blank=True)
    receipt_url = models.CharField(max_length=500, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    class Meta:
        db_table = 'expenses'
        verbose_name = 'Expense'
        verbose_name_plural = 'Expenses'
        ordering = ['-expense_date', '-id']
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount__gt=0),
                name='chk_exp_amount'
            ),
            models.CheckConstraint(
                check=models.Q(status__in=['Paid', 'Pending']),
                name='chk_exp_status'
            ),
            models.CheckConstraint(
                check=models.Q(category__in=[
                    'Logistics', 'Marketing', 'Software', 'Inventory', 'Utilities', 'Operations'
                ]),
                name='chk_exp_cat'
            ),
        ]
        indexes = [
            models.Index(fields=['expense_date', 'category'], name='idx_exp_date_cat'),
        ]

    def __str__(self):
        return f"{self.category}: {self.description} (₹{self.amount})"


class PayoutSettlement(TimeStampedModel):
    """
    Gateway settlement batches received in the merchant bank account.
    """
    settlement_id = models.CharField(max_length=100, unique=True)
    gateway = models.CharField(max_length=30, default='RAZORPAY')
    settlement_date = models.DateField()
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2)
    gateway_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    tax_on_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    net_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=SettlementStatus.choices,
        default=SettlementStatus.PROCESSING
    )
    bank_reference = models.CharField(max_length=100, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'payout_settlements'
        verbose_name = 'Payout Settlement'
        verbose_name_plural = 'Payout Settlements'
        ordering = ['-settlement_date', '-id']
        constraints = [
            models.CheckConstraint(
                check=models.Q(gross_amount__gte=0) & models.Q(net_amount__gte=0),
                name='chk_payout_amounts'
            ),
            models.CheckConstraint(
                check=models.Q(status__in=['Settled', 'Processing', 'Failed']),
                name='chk_payout_status'
            ),
        ]
        indexes = [
            models.Index(fields=['settlement_date', 'status'], name='idx_payout_date'),
        ]

    def __str__(self):
        return f"{self.settlement_id} ({self.status} - Net: ₹{self.net_amount})"
