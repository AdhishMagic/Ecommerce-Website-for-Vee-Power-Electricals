# Vee Electricals — Database-to-Django ORM Implementation Blueprint (Phase 2)

## 1. Architectural Purpose & Implementation Directives

This document provides the definitive technical mapping specification for converting the logical and physical database design into idiomatic, production-ready Django 4.2+ models in **Phase 3**.

> [!IMPORTANT]
> This is a design blueprint only. **No Python models, migrations, or code files are created during Phase 2.** This document serves as the exact developer blueprint for Phase 3 implementation.

---

## 2. Field Type & Constraint Translation Conventions

| Relational / MySQL 8.0 Concept | Target Django Field Type | Implementation Attributes & Defaults |
|---|---|---|
| `BIGINT UNSIGNED AUTO_INCREMENT` | `models.BigAutoField` | `primary_key=True` |
| `VARCHAR(N)` | `models.CharField` | `max_length=N, default='', blank=True` |
| `VARCHAR(255) UNIQUE` (Email) | `models.EmailField` | `max_length=255, unique=True` |
| Text / Long Text | `models.TextField` | `blank=True, null=True` |
| Status / Category Enums | `models.CharField` | `max_length=..., choices=..., default=...` (Uses `models.TextChoices`) |
| Currency Monies (`DECIMAL(12, 2)`) | `models.DecimalField` | `max_digits=12, decimal_places=2, default=Decimal('0.00')` |
| Aggregate Monies (`DECIMAL(14, 2)`)| `models.DecimalField` | `max_digits=14, decimal_places=2, default=Decimal('0.00')` |
| Percentages (`DECIMAL(5, 2)`) | `models.DecimalField` | `max_digits=5, decimal_places=2, default=Decimal('0.00')` |
| Flags (`TINYINT(1)`) | `models.BooleanField` | `default=True / False` |
| Snapshot Payloads (`JSON`) | `models.JSONField` | `default=dict, blank=True` |
| Created Timestamp | `models.DateTimeField` | `auto_now_add=True` |
| Modified Timestamp | `models.DateTimeField` | `auto_now=True` |
| Protected Foreign Key (`RESTRICT`)| `models.ForeignKey` | `on_delete=models.PROTECT` |
| Nullable Foreign Key (`SET_NULL`) | `models.ForeignKey` | `on_delete=models.SET_NULL, null=True, blank=True` |
| Cascade Foreign Key (`CASCADE`) | `models.ForeignKey` | `on_delete=models.CASCADE` |

---

## 3. Complete Model-by-Model Django ORM Specification

### 3.1 App: `users`

#### Model: `User` (`db_table = 'users'`)
* **Inheritance**: `AbstractUser`, `TimeStampedModel`
* **Django Fields**:
  ```python
  email = models.EmailField(unique=True, max_length=255)
  username = models.CharField(max_length=150, unique=True, blank=True)
  phone = models.CharField(max_length=20, null=True, blank=True)
  role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.CUSTOMER)
  is_active = models.BooleanField(default=True)
  is_staff = models.BooleanField(default=False)
  is_superuser = models.BooleanField(default=False)
  ```
* **Django Meta Constraints & Indexes**:
  ```python
  indexes = [
      models.Index(fields=['email'], name='idx_users_email'),
      models.Index(fields=['role', 'is_active'], name='idx_users_role_active'),
  ]
  constraints = [
      models.CheckConstraint(check=models.Q(role__in=['customer', 'admin']), name='chk_users_role'),
  ]
  ```

#### Model: `CustomerAddress` (`db_table = 'customer_addresses'`)
* **Django Fields**:
  ```python
  user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='addresses')
  recipient_name = models.CharField(max_length=150)
  phone = models.CharField(max_length=20)
  address_line1 = models.CharField(max_length=255)
  address_line2 = models.CharField(max_length=255, blank=True, default='')
  landmark = models.CharField(max_length=150, blank=True, default='')
  city = models.CharField(max_length=100)
  state = models.CharField(max_length=100)
  pincode = models.CharField(max_length=10)
  address_type = models.CharField(max_length=20, choices=AddressType.choices, default=AddressType.HOME)
  is_default = models.BooleanField(default=False)
  default_user_id = models.GeneratedField(
      expression=models.Case(models.When(is_default=True, then=models.F('user_id')), default=None),
      output_field=models.BigIntegerField(null=True),
      db_persist=True,
      unique=True
  )
  ```

---

### 3.2 App: `products` (Catalog Domain)

#### Model: `Category` (`db_table = 'categories'`)
```python
name = models.CharField(max_length=100, unique=True)
slug = models.SlugField(max_length=100, unique=True)
icon = models.CharField(max_length=50, default='⚡')
image = models.URLField(max_length=500, blank=True, default='')
subtitle = models.CharField(max_length=150, blank=True, default='')
hero_order = models.PositiveIntegerField(default=0)
hero_badge = models.CharField(max_length=50, blank=True, default='')
show_in_hero = models.BooleanField(default=False)
discount_enabled = models.BooleanField(default=False)
discount_type = models.CharField(max_length=20, choices=DiscountType.choices, default=DiscountType.PERCENTAGE)
discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
discount_label = models.CharField(max_length=50, blank=True, default='')
is_active = models.BooleanField(default=True)
```

#### Model: `Subcategory` (`db_table = 'subcategories'`)
```python
category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='subcategories')
name = models.CharField(max_length=100)
slug = models.SlugField(max_length=100)
description = models.TextField(null=True, blank=True)
display_order = models.PositiveIntegerField(default=0)
is_active = models.BooleanField(default=True)
# Meta:
unique_together = [('category', 'slug')]
```

#### Model: `Brand` (`db_table = 'brands'`)
```python
name = models.CharField(max_length=100, unique=True)
slug = models.SlugField(max_length=100, unique=True)
logo_url = models.URLField(max_length=500, blank=True, default='')
description = models.TextField(null=True, blank=True)
is_active = models.BooleanField(default=True)
```

#### Model: `Product` (`db_table = 'products'`)
```python
name = models.CharField(max_length=255)
slug = models.SlugField(max_length=255, unique=True)
sku = models.CharField(max_length=100, unique=True)
category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
subcategory = models.ForeignKey(Subcategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name='products')
mrp = models.DecimalField(max_digits=10, decimal_places=2)
price = models.DecimalField(max_digits=10, decimal_places=2)
stock = models.IntegerField(default=0)
low_stock_threshold = models.IntegerField(default=5)
description = models.TextField(null=True, blank=True)
primary_image = models.URLField(max_length=500, blank=True, default='')
featured = models.BooleanField(default=False)
active = models.BooleanField(default=True)

class Meta:
    constraints = [
        models.CheckConstraint(check=models.Q(price__lte=models.F('mrp')), name='chk_product_price_mrp'),
        models.CheckConstraint(check=models.Q(price__gte=0), name='chk_product_price_pos'),
        models.CheckConstraint(check=models.Q(mrp__gte=0), name='chk_product_mrp_pos'),
        models.CheckConstraint(check=models.Q(stock__gte=0), name='chk_product_stock_pos'),
    ]
    indexes = [
        models.Index(fields=['category', 'brand', 'active'], name='idx_prod_cat_brand'),
        models.Index(fields=['featured', 'active'], name='idx_prod_featured'),
        models.Index(fields=['price'], name='idx_prod_price'),
    ]
```

#### Model: `ProductImage` (`db_table = 'product_images'`)
```python
product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
image_url = models.URLField(max_length=500)
alt_text = models.CharField(max_length=255, blank=True, default='')
sort_order = models.PositiveIntegerField(default=0)
is_primary = models.BooleanField(default=False)
```

#### Model: `ProductSpecification` (`db_table = 'product_specifications'`)
```python
product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='specifications')
spec_key = models.CharField(max_length=100)
spec_value = models.CharField(max_length=255)
sort_order = models.PositiveIntegerField(default=0)
class Meta:
    unique_together = [('product', 'spec_key')]
```

---

### 3.3 App: `inventory`

#### Model: `StockTransaction` (`db_table = 'stock_transactions'`)
```python
product = models.ForeignKey('products.Product', on_delete=models.PROTECT, related_name='stock_transactions')
change_amount = models.IntegerField()
transaction_type = models.CharField(max_length=20, choices=StockTransactionType.choices)
order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_transactions')
performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
notes = models.TextField(null=True, blank=True)
created_at = models.DateTimeField(auto_now_add=True)
# Note: No updated_at field. Insert-only ledger.
```

---

### 3.4 App: `orders`

#### Model: `Order` (`db_table = 'orders'`)
```python
order_number = models.CharField(max_length=100, unique=True)
user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
customer_name = models.CharField(max_length=200)
customer_email = models.EmailField(max_length=255)
customer_phone = models.CharField(max_length=20)
shipping_address = models.JSONField()
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
status = models.CharField(max_length=30, choices=OrderStatus.choices, default=OrderStatus.PENDING)
payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
payment_method = models.CharField(max_length=50, default='UPI')
tracking_number = models.CharField(max_length=100, blank=True, default='')
notes = models.TextField(null=True, blank=True)
calculation_snapshot = models.JSONField()

class Meta:
    constraints = [
        models.CheckConstraint(check=models.Q(status__in=[s.value for s in OrderStatus]), name='chk_order_status'),
        models.CheckConstraint(check=models.Q(total_amount__gte=0), name='chk_order_total_pos'),
    ]
    indexes = [
        models.Index(fields=['user', 'created_at'], name='idx_orders_user'),
        models.Index(fields=['status', 'created_at'], name='idx_orders_status'),
    ]
```

#### Model: `OrderItem` (`db_table = 'order_items'`)
```python
order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
product_name = models.CharField(max_length=255)
sku = models.CharField(max_length=100)
image_url = models.URLField(max_length=500, null=True, blank=True)
mrp = models.DecimalField(max_digits=10, decimal_places=2)
unit_price = models.DecimalField(max_digits=10, decimal_places=2)
quantity = models.PositiveIntegerField(default=1)
line_discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
taxable_amount = models.DecimalField(max_digits=12, decimal_places=2)
tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
subtotal = models.DecimalField(max_digits=12, decimal_places=2)
total_amount = models.DecimalField(max_digits=12, decimal_places=2)
```

#### Model: `OrderStatusHistory` (`db_table = 'order_status_history'`)
```python
order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_history')
previous_status = models.CharField(max_length=30, null=True, blank=True)
new_status = models.CharField(max_length=30)
changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
reason = models.TextField(null=True, blank=True)
created_at = models.DateTimeField(auto_now_add=True)
```

---

### 3.5 App: `commercial_config` (Configuration Domain)

#### Model: `TaxConfiguration` (`db_table = 'tax_configurations'`)
```python
tax_name = models.CharField(max_length=100, default='Indian Standard GST')
default_tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
cgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('9.00'))
sgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('9.00'))
igst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('18.00'))
tax_calculation_mode = models.CharField(max_length=20, choices=TaxMode.choices, default=TaxMode.TAX_EXCLUSIVE)
business_state = models.CharField(max_length=100, default='Tamil Nadu')
effective_from = models.DateTimeField(default=timezone.now)
effective_until = models.DateTimeField(null=True, blank=True)
version_number = models.PositiveIntegerField(default=1)
is_active = models.BooleanField(default=True)
created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
```

#### Model: `DeliveryConfiguration` (`db_table = 'delivery_configurations'`)
```python
origin_name = models.CharField(max_length=150, default='Vee Power Coimbatore Hub')
origin_address = models.CharField(max_length=255, default='No 28/1, 2nd floor, MTP Road, NSN palayam')
origin_city = models.CharField(max_length=100, default='Coimbatore')
origin_state = models.CharField(max_length=100, default='Tamil Nadu')
origin_pincode = models.CharField(max_length=10, default='641031')
latitude = models.DecimalField(max_digits=9, decimal_places=6, default=Decimal('11.084800'))
longitude = models.DecimalField(max_digits=9, decimal_places=6, default=Decimal('76.941600'))
base_delivery_charge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('100.00'))
distance_slab_km = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('10.00'))
charge_per_slab = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('100.00'))
free_delivery_threshold = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('999.00'))
fallback_regional_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('100.00'))
free_delivery_enabled = models.BooleanField(default=True)
effective_from = models.DateTimeField(default=timezone.now)
effective_until = models.DateTimeField(null=True, blank=True)
version_number = models.PositiveIntegerField(default=1)
is_active = models.BooleanField(default=True)
created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
```

#### Model: `DistanceSlab` (`db_table = 'distance_slabs'`)
```python
delivery_config = models.ForeignKey(DeliveryConfiguration, on_delete=models.CASCADE, related_name='slabs')
min_distance_km = models.DecimalField(max_digits=6, decimal_places=2)
max_distance_km = models.DecimalField(max_digits=6, decimal_places=2)
rate = models.DecimalField(max_digits=10, decimal_places=2)
sort_order = models.PositiveIntegerField(default=0)
is_active = models.BooleanField(default=True)
```

#### Model: `ShippingRule` (`db_table = 'shipping_rules'`)
```python
state = models.CharField(max_length=100, unique=True)
cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
estimated_days_min = models.PositiveIntegerField(default=2)
estimated_days_max = models.PositiveIntegerField(default=5)
is_active = models.BooleanField(default=True)
```

#### Model: `OrderDiscount` (`db_table = 'order_discounts'`)
```python
code = models.CharField(max_length=50, unique=True)
description = models.CharField(max_length=255, blank=True, default='')
discount_type = models.CharField(max_length=20, choices=DiscountType.choices, default=DiscountType.PERCENTAGE)
discount_value = models.DecimalField(max_digits=10, decimal_places=2)
min_order_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
max_discount_cap = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
usage_limit_total = models.PositiveIntegerField(null=True, blank=True)
usage_limit_per_user = models.PositiveIntegerField(default=1)
allow_stacking = models.BooleanField(default=False)
valid_from = models.DateTimeField(default=timezone.now)
valid_until = models.DateTimeField(null=True, blank=True)
is_active = models.BooleanField(default=True)
created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
```

#### Model: `CompanyStoreConfiguration` (`db_table = 'company_store_configurations'`)
```python
legal_company_name = models.CharField(max_length=200, default='Vee Power Electricals')
brand_name = models.CharField(max_length=150, default='Vee Power Electricals')
gstin = models.CharField(max_length=15, default='33AABFV1234A1ZX')
pan = models.CharField(max_length=10, default='AABFV1234A')
registered_address = models.TextField(default='No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031')
warehouse_address = models.TextField(default='No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031')
support_email = models.EmailField(max_length=255, default='support@veepower.in')
support_phone = models.CharField(max_length=20, default='+91 98765 43210')
bank_name = models.CharField(max_length=150, default='State Bank of India')
bank_account_number = models.CharField(max_length=50, default='38492019482')
bank_ifsc = models.CharField(max_length=20, default='SBIN0001234')
bank_branch = models.CharField(max_length=100, default='Coimbatore Main Branch')
currency_code = models.CharField(max_length=10, default='INR')
currency_symbol = models.CharField(max_length=10, default='₹')
rounding_mode = models.CharField(max_length=20, default='ROUND_HALF_UP')
auto_cancel_unpaid_minutes = models.PositiveIntegerField(default=30)
cancellation_allowed_until = models.CharField(max_length=30, default='CONFIRMED')
return_window_days = models.PositiveIntegerField(default=7)
require_shipping_awb = models.BooleanField(default=True)
upi_enabled = models.BooleanField(default=True)
cards_enabled = models.BooleanField(default=True)
netbanking_enabled = models.BooleanField(default=True)
cod_enabled = models.BooleanField(default=True)
cod_max_limit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('10000.00'))
guest_checkout_enabled = models.BooleanField(default=False)
is_maintenance_mode = models.BooleanField(default=False)
maintenance_notice = models.TextField(null=True, blank=True)
```

---

### 3.6 App: `finance` (B2B, Invoices & Accounting)

#### Model: `Client` (`db_table = 'clients'`)
```python
client_code = models.CharField(max_length=50, unique=True)
company_name = models.CharField(max_length=200)
contact_person = models.CharField(max_length=150)
gstin = models.CharField(max_length=15, unique=True)
email = models.EmailField(max_length=255)
phone = models.CharField(max_length=20)
credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
address = models.TextField(null=True, blank=True)
is_active = models.BooleanField(default=True)
```

#### Model: `Quotation` (`db_table = 'quotations'`)
```python
quotation_number = models.CharField(max_length=50, unique=True)
client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name='quotations')
quotation_date = models.DateField()
expiry_date = models.DateField()
total_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
status = models.CharField(max_length=20, choices=QuotationStatus.choices, default=QuotationStatus.DRAFT)
notes = models.TextField(null=True, blank=True)
created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
# Quotation conversion is represented by status == QuotationStatus.CONVERTED.
# The resulting invoice references this quotation via Invoice.quotation FK (reverse relation: quotation.invoices.first()).
```

#### Model: `QuotationItem` (`db_table = 'quotation_items'`)
```python
quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name='items')
product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
item_name = models.CharField(max_length=255)
quantity = models.PositiveIntegerField(default=1)
unit_price = models.DecimalField(max_digits=12, decimal_places=2)
subtotal = models.DecimalField(max_digits=14, decimal_places=2)
```

#### Model: `Invoice` (`db_table = 'invoices'`)
```python
invoice_number = models.CharField(max_length=50, unique=True)
invoice_date = models.DateField()
due_date = models.DateField()
order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices')
client = models.ForeignKey(Client, on_delete=models.PROTECT, null=True, blank=True, related_name='invoices')
quotation = models.ForeignKey(Quotation, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices')
subtotal = models.DecimalField(max_digits=14, decimal_places=2)
discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
taxable_amount = models.DecimalField(max_digits=14, decimal_places=2)
cgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
sgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
igst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
shipping_fee = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
total_amount = models.DecimalField(max_digits=14, decimal_places=2)
status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.UNPAID)
payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
notes = models.TextField(null=True, blank=True)
calculation_snapshot = models.JSONField()
```

#### Model: `InvoiceItem` (`db_table = 'invoice_items'`)
```python
invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
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
```

#### Model: `PaymentTransaction` (`db_table = 'payment_transactions'`)
```python
order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
gateway = models.CharField(max_length=30, choices=PaymentGateway.choices, default=PaymentGateway.RAZORPAY)
gateway_transaction_id = models.CharField(max_length=100, null=True, blank=True)
gateway_order_id = models.CharField(max_length=100, null=True, blank=True)
gateway_signature = models.CharField(max_length=255, null=True, blank=True)
payment_method = models.CharField(max_length=50, default='UPI')
amount = models.DecimalField(max_digits=12, decimal_places=2)
currency = models.CharField(max_length=10, default='INR')
status = models.CharField(max_length=20, choices=PaymentTxStatus.choices, default=PaymentTxStatus.INITIATED)
error_code = models.CharField(max_length=50, null=True, blank=True)
error_message = models.TextField(null=True, blank=True)
metadata = models.JSONField(null=True, blank=True)
```

#### Model: `Expense` (`db_table = 'expenses'`)
```python
expense_date = models.DateField()
category = models.CharField(max_length=30, choices=ExpenseCategory.choices)
description = models.CharField(max_length=255)
vendor = models.CharField(max_length=150)
amount = models.DecimalField(max_digits=12, decimal_places=2)
status = models.CharField(max_length=20, choices=ExpenseStatus.choices, default=ExpenseStatus.PENDING)
payment_mode = models.CharField(max_length=50, null=True, blank=True)
receipt_url = models.URLField(max_length=500, null=True, blank=True)
created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
```

#### Model: `PayoutSettlement` (`db_table = 'payout_settlements'`)
```python
settlement_id = models.CharField(max_length=100, unique=True)
gateway = models.CharField(max_length=30, default='RAZORPAY')
settlement_date = models.DateField()
gross_amount = models.DecimalField(max_digits=12, decimal_places=2)
gateway_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
tax_on_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
net_amount = models.DecimalField(max_digits=12, decimal_places=2)
status = models.CharField(max_length=20, choices=SettlementStatus.choices, default=SettlementStatus.PROCESSING)
bank_reference = models.CharField(max_length=100, null=True, blank=True)
notes = models.TextField(null=True, blank=True)
```

---

### 3.7 App: `core` (Governance & Inquiries)

#### Model: `AdminConfigAuditLog` (`db_table = 'admin_config_audit_logs'`)
```python
admin_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
domain = models.CharField(max_length=50)
record_id = models.BigIntegerField()
action_type = models.CharField(max_length=20, choices=AuditActionType.choices)
old_value = models.JSONField(null=True, blank=True)
new_value = models.JSONField()
change_reason = models.TextField()
ip_address = models.GenericIPAddressField(null=True, blank=True)
created_at = models.DateTimeField(auto_now_add=True)
```

#### Model: `ContactInquiry` (`db_table = 'contact_inquiries'`)
```python
name = models.CharField(max_length=150)
email = models.EmailField(max_length=255, null=True, blank=True)
phone = models.CharField(max_length=20)
subject = models.CharField(max_length=150)
message = models.TextField()
status = models.CharField(max_length=20, choices=InquiryStatus.choices, default=InquiryStatus.NEW)
admin_notes = models.TextField(null=True, blank=True)
```
