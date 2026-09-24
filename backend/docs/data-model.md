# Vee Electricals — Data Model & MySQL Blueprint (Phase 1)

## 1. Database Architecture & Design Principles

* **Target Database Engine**: MySQL 8.0+ / InnoDB
* **Character Set & Collation**: `utf8mb4` / `utf8mb4_unicode_ci`
* **Naming Conventions**:
  * Tables: Snake_case, pluralized (e.g., `users`, `products`, `orders`, `order_items`).
  * Columns: Snake_case (e.g., `created_at`, `total_amount`, `is_active`).
  * Primary Keys: `id` (`BIGINT UNSIGNED AUTO_INCREMENT` or `CHAR(36)` UUID).
  * Foreign Keys: `<singular_parent_table>_id` (e.g., `user_id`, `product_id`, `order_id`).
  * Boolean flags: `is_` or `has_` prefix (`TINYINT(1)`).
  * Monies / Currencies: `DECIMAL(12, 2)` (never store currency as `FLOAT` or `DOUBLE`).
  * Timestamps: `created_at` (`DATETIME DEFAULT CURRENT_TIMESTAMP`), `updated_at` (`DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`).

---

## 2. Complete Entity Specifications

### Entity 1: User (`users`)
* **Purpose**: Primary authentication, authorization, and customer account record.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `email`, `username`
* **Required Fields**:
  * `email` (`VARCHAR(255)`, UNIQUE, NOT NULL)
  * `username` (`VARCHAR(150)`, UNIQUE, NOT NULL)
  * `password` (`VARCHAR(255)`, NOT NULL - hashed)
  * `first_name` (`VARCHAR(150)`, NOT NULL, DEFAULT '')
  * `last_name` (`VARCHAR(150)`, NOT NULL, DEFAULT '')
  * `role` (`ENUM('customer', 'admin')`, NOT NULL, DEFAULT `'customer'`)
* **Optional Fields**:
  * `phone` (`VARCHAR(20)`, NULL)
* **Status Fields**:
  * `is_active` (`TINYINT(1)`, DEFAULT 1)
  * `is_staff` (`TINYINT(1)`, DEFAULT 0)
  * `is_superuser` (`TINYINT(1)`, DEFAULT 0)
  * `is_admin` (`TINYINT(1)`, DEFAULT 0)
* **Timestamps**:
  * `date_joined` (`DATETIME DEFAULT CURRENT_TIMESTAMP`)
  * `last_login` (`DATETIME NULL`)
  * `created_at`, `updated_at`
* **Relationships**:
  * Has many `CustomerAddress` records.
  * Has many `Order` records.
* **Validation**: Valid email format; phone must be 10-15 digits if supplied.

---

### Entity 2: CustomerAddress (`customer_addresses`)
* **Purpose**: Reusable shipping and billing addresses saved in customer account address book.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `user_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `recipient_name` (`VARCHAR(150)`, NOT NULL)
  * `phone` (`VARCHAR(20)`, NOT NULL)
  * `address_line1` (`VARCHAR(255)`, NOT NULL)
  * `city` (`VARCHAR(100)`, NOT NULL)
  * `state` (`VARCHAR(100)`, NOT NULL)
  * `pincode` (`VARCHAR(10)`, NOT NULL)
  * `is_default` (`TINYINT(1)`, NOT NULL, DEFAULT 0)
* **Optional Fields**:
  * `address_line2` (`VARCHAR(255)`, NULL, DEFAULT '')
  * `landmark` (`VARCHAR(150)`, NULL, DEFAULT '')
  * `address_type` (`ENUM('home', 'work', 'other')`, DEFAULT `'home'`)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Belongs to `User` (`ON DELETE CASCADE`).
* **Validation**: Indian PIN code must be exactly 6 digits; only 1 default address per user.

---

### Entity 3: Category (`categories`)
* **Purpose**: Primary product taxonomy and promotional homepage showcase metadata.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `slug`, `name`
* **Required Fields**:
  * `name` (`VARCHAR(100)`, UNIQUE, NOT NULL)
  * `slug` (`VARCHAR(100)`, UNIQUE, NOT NULL)
* **Optional Fields**:
  * `icon` (`VARCHAR(50)`, DEFAULT '⚡')
  * `image` (`VARCHAR(500)`, DEFAULT '')
  * `subtitle` (`VARCHAR(150)`, DEFAULT '')
  * `hero_order` (`INT UNSIGNED`, DEFAULT 0)
  * `hero_badge` (`VARCHAR(50)`, DEFAULT '')
  * `discount_type` (`ENUM('percentage', 'fixed')`, DEFAULT `'percentage'`)
  * `discount_value` (`DECIMAL(10, 2)`, DEFAULT 0.00)
  * `discount_label` (`VARCHAR(50)`, DEFAULT '')
* **Status Fields**:
  * `is_active` (`TINYINT(1)`, DEFAULT 1)
  * `show_in_hero` (`TINYINT(1)`, DEFAULT 0)
  * `discount_enabled` (`TINYINT(1)`, DEFAULT 0)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Has many `Subcategory` records.
  * Has many `Product` records.
* **Validation**: Discount value cannot be negative; percentage discount <= 100%.

---

### Entity 4: Subcategory (`subcategories`)
* **Purpose**: Secondary product classification under a parent category.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Constraints**: Unique pair (`category_id`, `slug`)
* **Required Fields**:
  * `category_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `name` (`VARCHAR(100)`, NOT NULL)
  * `slug` (`VARCHAR(100)`, NOT NULL)
* **Optional Fields**:
  * `description` (`TEXT`, NULL)
  * `display_order` (`INT UNSIGNED`, DEFAULT 0)
* **Status Fields**:
  * `is_active` (`TINYINT(1)`, DEFAULT 1)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Belongs to `Category` (`ON DELETE CASCADE`).
  * Has many `Product` records.

---

### Entity 5: Brand (`brands`)
* **Purpose**: Manufacturer brand registry (e.g., Havells, Finolex, Polycab, Philips).
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `slug`, `name`
* **Required Fields**:
  * `name` (`VARCHAR(100)`, UNIQUE, NOT NULL)
  * `slug` (`VARCHAR(100)`, UNIQUE, NOT NULL)
* **Optional Fields**:
  * `logo_url` (`VARCHAR(500)`, DEFAULT '')
  * `description` (`TEXT`, NULL)
* **Status Fields**:
  * `is_active` (`TINYINT(1)`, DEFAULT 1)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Has many `Product` records.

---

### Entity 6: Product (`products`)
* **Purpose**: Master electrical merchandise catalog item.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `sku`
* **Required Fields**:
  * `name` (`VARCHAR(255)`, NOT NULL)
  * `slug` (`VARCHAR(255)`, NOT NULL)
  * `sku` (`VARCHAR(100)`, UNIQUE, NOT NULL)
  * `category_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `brand_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `mrp` (`DECIMAL(10, 2)`, NOT NULL)
  * `price` (`DECIMAL(10, 2)`, NOT NULL)
  * `stock` (`INT`, NOT NULL, DEFAULT 0)
  * `low_stock_threshold` (`INT`, NOT NULL, DEFAULT 5)
* **Optional Fields**:
  * `subcategory_id` (`BIGINT UNSIGNED`, NULL)
  * `description` (`LONGTEXT`, NULL)
  * `primary_image` (`VARCHAR(500)`, DEFAULT '')
* **Status Fields**:
  * `featured` (`TINYINT(1)`, DEFAULT 0)
  * `active` (`TINYINT(1)`, DEFAULT 1)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Belongs to `Category` (`ON DELETE RESTRICT`).
  * Belongs to `Subcategory` (`ON DELETE SET NULL`).
  * Belongs to `Brand` (`ON DELETE RESTRICT`).
  * Has many `ProductImage` records.
  * Has many `ProductSpecification` records.
  * Has many `StockTransaction` records.
* **Validation**:
  * `price >= 0`, `stock >= 0`.
  * `mrp >= price` (Selling price cannot exceed Maximum Retail Price).

---

### Entity 7: ProductImage (`product_images`)
* **Purpose**: Multiple high-resolution images for a single product gallery.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `product_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `image_url` (`VARCHAR(500)`, NOT NULL)
  * `sort_order` (`INT UNSIGNED`, NOT NULL, DEFAULT 0)
  * `is_primary` (`TINYINT(1)`, NOT NULL, DEFAULT 0)
* **Optional Fields**:
  * `alt_text` (`VARCHAR(255)`, DEFAULT '')
* **Timestamps**: `created_at`
* **Relationships**:
  * Belongs to `Product` (`ON DELETE CASCADE`).

---

### Entity 8: ProductSpecification (`product_specifications`)
* **Purpose**: Key-value technical parameters for electrical goods (e.g., Sweep: 1200mm, Wattage: 50W, Voltage: 230V, Wire Gauge: 1.5 sq mm).
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `product_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `spec_key` (`VARCHAR(100)`, NOT NULL)
  * `spec_value` (`VARCHAR(255)`, NOT NULL)
* **Optional Fields**:
  * `sort_order` (`INT UNSIGNED`, DEFAULT 0)
* **Timestamps**: `created_at`
* **Relationships**:
  * Belongs to `Product` (`ON DELETE CASCADE`).

---

### Entity 9: StockTransaction (`stock_transactions`)
* **Purpose**: Immutable ledger tracking all warehouse stock additions, customer sales, adjustments, and returns.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `product_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `change_amount` (`INT`, NOT NULL)
  * `transaction_type` (`ENUM('RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN')`, NOT NULL)
* **Optional Fields**:
  * `order_id` (`BIGINT UNSIGNED`, NULL)
  * `notes` (`TEXT`, NULL)
  * `performed_by_id` (`BIGINT UNSIGNED`, NULL)
* **Timestamps**: `created_at` (Immutable, no updated_at)
* **Relationships**:
  * Belongs to `Product` (`ON DELETE RESTRICT` / Django `models.PROTECT`). *Reconciled in Phase 1.5 (DEC-1.5-13): Products with inventory movements cannot be hard-deleted; catalog uses soft-deletion.*
  * Belongs to `Order` (`ON DELETE SET NULL`).
  * Belongs to `User` (`performed_by_id`, `ON DELETE SET NULL`).
* **Validation**:
  * `RESTOCK` and `RETURN`: `change_amount > 0`.
  * `SALE` and negative `ADJUSTMENT`: stock deduction must not result in negative inventory.
  * Audit entries are insert-only; updates and deletions are strictly blocked.

---

### Entity 10: Order (`orders`)
* **Purpose**: Customer retail purchases and contractor orders placed through checkout.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `order_number`
* **Required Fields**:
  * `order_number` (`VARCHAR(100)`, UNIQUE, NOT NULL - e.g., `VPE-849201`)
  * `user_id` (`BIGINT UNSIGNED`, NULL - nullable to support both guest checkout and registered accounts; DEC-1.5-19)
  * `customer_name` (`VARCHAR(200)`, NOT NULL)
  * `customer_email` (`VARCHAR(255)`, NOT NULL)
  * `customer_phone` (`VARCHAR(20)`, NOT NULL)
  * `shipping_address` (`JSON`, NOT NULL)
  * `subtotal` (`DECIMAL(12, 2)`, NOT NULL)
  * `discount_amount` (`DECIMAL(12, 2)`, NOT NULL, DEFAULT 0.00)
  * `tax_amount` (`DECIMAL(12, 2)`, NOT NULL, DEFAULT 0.00)
  * `shipping_fee` (`DECIMAL(12, 2)`, NOT NULL, DEFAULT 0.00)
  * `total_amount` (`DECIMAL(12, 2)`, NOT NULL)
  * `status` (`ENUM('PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_COMPLETED')`, NOT NULL, DEFAULT `'PENDING'`) *Standardized on 10-state FSM in Phase 1.5; DEC-1.5-12.*
  * `payment_status` (`ENUM('Pending', 'Paid', 'Failed', 'Refunded')`, NOT NULL, DEFAULT `'Pending'`)
  * `payment_method` (`VARCHAR(50)`, NOT NULL, DEFAULT `'UPI'`)
  * `calculation_snapshot` (`JSON`, NOT NULL - captures frozen rates, distance, CGST/SGST/IGST breakdown, and active config version; DEC-1.5-11)
* **Optional Fields**:
  * `is_business_order` (`TINYINT(1)`, DEFAULT 0)
  * `company_name` (`VARCHAR(200)`, NULL)
  * `gstin` (`VARCHAR(15)`, NULL)
  * `billing_address` (`JSON`, NULL)
  * `tracking_number` (`VARCHAR(100)`, NULL, DEFAULT '')
  * `notes` (`TEXT`, NULL)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Belongs to `User` (`ON DELETE SET NULL`).
  * Has many `OrderItem` records (`ON DELETE CASCADE`).
  * Has many `OrderStatusHistory` records (`ON DELETE CASCADE`).
  * Has linked `Invoice` records (1:1 primary for retail, 1:N capable for B2B; DEC-1.5-14).

---

### Entity 11: OrderItem (`order_items`)
* **Purpose**: Snapshot line item belonging to a customer order.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `order_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `product_name` (`VARCHAR(255)`, NOT NULL)
  * `price` (`DECIMAL(10, 2)`, NOT NULL)
  * `quantity` (`INT UNSIGNED`, NOT NULL, DEFAULT 1)
  * `subtotal` (`DECIMAL(12, 2)`, NOT NULL)
* **Optional Fields**:
  * `product_id` (`BIGINT UNSIGNED`, NULL - retained if original product is deleted)
  * `sku` (`VARCHAR(100)`, NULL)
  * `image_url` (`VARCHAR(500)`, NULL)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Belongs to `Order` (`ON DELETE CASCADE`).
  * Belongs to `Product` (`ON DELETE SET NULL`).

---

### Entity 12: OrderStatusHistory (`order_status_history`)
* **Purpose**: Audit log tracking timestamped status changes and fulfillment updates.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `order_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `status` (`VARCHAR(50)`, NOT NULL)
* **Optional Fields**:
  * `comment` (`TEXT`, NULL)
  * `changed_by_id` (`BIGINT UNSIGNED`, NULL)
* **Timestamps**: `created_at`
* **Relationships**:
  * Belongs to `Order` (`ON DELETE CASCADE`).
  * Belongs to `User` (`changed_by_id`, `ON DELETE SET NULL`).

---

### Entity 13: ShippingRule (`shipping_rules`)
* **Purpose**: Regional delivery costs and free delivery settings.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `state`
* **Required Fields**:
  * `state` (`VARCHAR(100)`, UNIQUE, NOT NULL - e.g., 'Tamil Nadu', 'Maharashtra')
  * `cost` (`DECIMAL(10, 2)`, NOT NULL, DEFAULT 0.00)
* **Optional Fields**:
  * `estimated_days_min` (`INT UNSIGNED`, DEFAULT 2)
  * `estimated_days_max` (`INT UNSIGNED`, DEFAULT 5)
* **Status Fields**:
  * `is_active` (`TINYINT(1)`, DEFAULT 1)
* **Timestamps**: `created_at`, `updated_at`

---

### Entity 14: Client (`clients`)
* **Purpose**: B2B corporate buyers, building contractors, and credit accounts.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `client_code`, `gstin`
* **Required Fields**:
  * `client_code` (`VARCHAR(50)`, UNIQUE, NOT NULL - e.g., `CLI-001`)
  * `company_name` (`VARCHAR(200)`, NOT NULL)
  * `contact_person` (`VARCHAR(150)`, NOT NULL)
  * `gstin` (`VARCHAR(15)`, NOT NULL)
  * `email` (`VARCHAR(255)`, NOT NULL)
  * `phone` (`VARCHAR(20)`, NOT NULL)
  * `credit_limit` (`DECIMAL(14, 2)`, NOT NULL, DEFAULT 0.00)
* **Optional Fields**:
  * `address` (`TEXT`, NULL)
  * `total_invoiced` (`DECIMAL(14, 2)`, NOT NULL, DEFAULT 0.00)
* **Status Fields**:
  * `is_active` (`TINYINT(1)`, DEFAULT 1)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Has many `Quotation` records.
  * Has many `Invoice` records.
* **Validation**: GSTIN format regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`.

---

### Entity 15: Quotation (`quotations`)
* **Purpose**: Commercial project estimates and price quotations issued to B2B clients.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `quotation_number`
* **Required Fields**:
  * `quotation_number` (`VARCHAR(50)`, UNIQUE, NOT NULL - e.g., `QT-2026-001`)
  * `client_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `quotation_date` (`DATE`, NOT NULL)
  * `expiry_date` (`DATE`, NOT NULL)
  * `total_value` (`DECIMAL(14, 2)`, NOT NULL, DEFAULT 0.00)
  * `status` (`ENUM('Draft', 'Sent', 'Approved', 'Rejected', 'Converted')`, NOT NULL, DEFAULT `'Draft'`)
* **Optional Fields**:
  * `notes` (`TEXT`, NULL)
  * `created_by_id` (`BIGINT UNSIGNED`, NULL)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Belongs to `Client` (`ON DELETE RESTRICT`).
  * Has many `QuotationItem` records.
  * May have one converted `Invoice` record.

---

### Entity 16: QuotationItem (`quotation_items`)
* **Purpose**: Line items quoted inside a commercial quotation.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `quotation_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `item_name` (`VARCHAR(255)`, NOT NULL)
  * `quantity` (`INT UNSIGNED`, NOT NULL, DEFAULT 1)
  * `unit_price` (`DECIMAL(12, 2)`, NOT NULL)
  * `subtotal` (`DECIMAL(14, 2)`, NOT NULL)
* **Optional Fields**:
  * `product_id` (`BIGINT UNSIGNED`, NULL)
* **Timestamps**: `created_at`
* **Relationships**:
  * Belongs to `Quotation` (`ON DELETE CASCADE`).
  * Belongs to `Product` (`ON DELETE SET NULL`).

---

### Entity 17: Invoice (`invoices`)
* **Purpose**: Legal GST tax invoice issued for customer retail orders or B2B client contracts.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `invoice_number`
* **Required Fields**:
  * `invoice_number` (`VARCHAR(50)`, UNIQUE, NOT NULL - e.g., `INV-2026-101`)
  * `invoice_date` (`DATE`, NOT NULL)
  * `due_date` (`DATE`, NOT NULL)
  * `subtotal` (`DECIMAL(14, 2)`, NOT NULL)
  * `tax_amount` (`DECIMAL(14, 2)`, NOT NULL, DEFAULT 0.00)
  * `total_amount` (`DECIMAL(14, 2)`, NOT NULL)
  * `status` (`ENUM('Paid', 'Unpaid', 'Overdue', 'Cancelled')`, NOT NULL, DEFAULT `'Unpaid'`)
  * `calculation_snapshot` (`JSON`, NOT NULL - captures immutable point-in-time rates, CGST/SGST/IGST breakdown, and active config version; DEC-1.5-11)
* **Optional Fields**:
  * `order_id` (`BIGINT UNSIGNED`, NULL)
  * `client_id` (`BIGINT UNSIGNED`, NULL)
  * `quotation_id` (`BIGINT UNSIGNED`, NULL)
  * `notes` (`TEXT`, NULL)
* **Timestamps**: `created_at`, `updated_at`
* **Relationships**:
  * Belongs to `Order` (`ON DELETE SET NULL` - 1:1 primary for retail, 1:N capable for B2B; DEC-1.5-14).
  * Belongs to `Client` (`ON DELETE RESTRICT`).
  * Belongs to `Quotation` (`ON DELETE SET NULL`).
  * Has many `InvoiceItem` records (`ON DELETE CASCADE`).

---

### Entity 18: InvoiceItem (`invoice_items`)
* **Purpose**: Line items with explicit GST tax breakdowns for invoicing.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `invoice_id` (`BIGINT UNSIGNED`, NOT NULL)
  * `item_name` (`VARCHAR(255)`, NOT NULL)
  * `quantity` (`INT UNSIGNED`, NOT NULL, DEFAULT 1)
  * `rate` (`DECIMAL(12, 2)`, NOT NULL)
  * `tax_percent` (`DECIMAL(5, 2)`, NOT NULL, DEFAULT 18.00)
  * `tax_amount` (`DECIMAL(12, 2)`, NOT NULL, DEFAULT 0.00)
  * `total_amount` (`DECIMAL(14, 2)`, NOT NULL)
* **Optional Fields**:
  * `product_id` (`BIGINT UNSIGNED`, NULL)
* **Timestamps**: `created_at`
* **Relationships**:
  * Belongs to `Invoice` (`ON DELETE CASCADE`).
  * Belongs to `Product` (`ON DELETE SET NULL`).

---

### Entity 19: Expense (`expenses`)
* **Purpose**: Internal administrative operational and capital expense tracking.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `expense_date` (`DATE`, NOT NULL)
  * `category` (`ENUM('Logistics', 'Marketing', 'Software', 'Inventory', 'Utilities', 'Operations')`, NOT NULL)
  * `description` (`VARCHAR(255)`, NOT NULL)
  * `vendor` (`VARCHAR(150)`, NOT NULL)
  * `amount` (`DECIMAL(12, 2)`, NOT NULL)
  * `status` (`ENUM('Paid', 'Pending')`, NOT NULL, DEFAULT `'Pending'`)
* **Optional Fields**:
  * `receipt_url` (`VARCHAR(500)`, NULL)
  * `payment_mode` (`VARCHAR(50)`, NULL)
* **Timestamps**: `created_at`, `updated_at`
* **Validation**: `amount > 0`.

---

### Entity 20: PayoutSettlement (`payout_settlements`)
* **Purpose**: Records gateway settlement batches received in the merchant bank account.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Unique Fields**: `settlement_id`
* **Required Fields**:
  * `settlement_id` (`VARCHAR(100)`, UNIQUE, NOT NULL - e.g., `setl_94829`)
  * `settlement_date` (`DATE`, NOT NULL)
  * `gross_amount` (`DECIMAL(12, 2)`, NOT NULL)
  * `gateway_fee` (`DECIMAL(10, 2)`, NOT NULL, DEFAULT 0.00)
  * `net_amount` (`DECIMAL(12, 2)`, NOT NULL)
  * `status` (`ENUM('Settled', 'Processing', 'Failed')`, NOT NULL, DEFAULT `'Processing'`)
* **Timestamps**: `created_at`, `updated_at`

---

### Entity 21: ContactInquiry (`contact_inquiries`)
* **Purpose**: Lead generation, bulk inquiry requests, and customer support tickets.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Required Fields**:
  * `name` (`VARCHAR(150)`, NOT NULL)
  * `phone` (`VARCHAR(20)`, NOT NULL)
  * `subject` (`VARCHAR(150)`, NOT NULL)
  * `message` (`TEXT`, NOT NULL)
  * `status` (`ENUM('New', 'In Progress', 'Resolved', 'Closed')`, NOT NULL, DEFAULT `'New'`)
* **Optional Fields**:
  * `email` (`VARCHAR(255)`, NULL)
  * `admin_notes` (`TEXT`, NULL)
* **Timestamps**: `created_at`, `updated_at`

---

## 3. Phase 1.5 Configuration Entities Specification (Design Blueprint)

> [!NOTE]
> The following entities are designed to support commercial adaptability without code changes as established in Phase 1.5. They will be implemented as Django models in Phase 2. For detailed architectural definitions, refer to [configuration-architecture.md](file:///c:/Users/BALA%20ADHISH/Documents/Ecommerce-Website-for-Vee-Power-Electricals/backend/docs/configuration-architecture.md).

### Entity 22: TaxConfig (`tax_configurations`)
* **Purpose**: Governs statutory GST rates, intra/inter-state split, and calculation modes.
* **Key Fields**: `id`, `tax_enabled` (Boolean), `default_tax_rate` (`DECIMAL(5, 2)`), `cgst_rate` (`DECIMAL(5, 2)`), `sgst_rate` (`DECIMAL(5, 2)`), `igst_rate` (`DECIMAL(5, 2)`), `tax_calculation_mode` (`VARCHAR(20)`), `business_state` (`VARCHAR(100)`), `effective_from` (`DATETIME`), `effective_until` (`DATETIME`, NULL), `is_active` (`TINYINT(1)`).

### Entity 23: DeliveryConfig (`delivery_configurations`)
* **Purpose**: Governs warehouse dispatch origin coordinates, base shipping fees, distance slabs, and free delivery thresholds.
* **Key Fields**: `id`, `origin_city` (`VARCHAR(100)`), `origin_state` (`VARCHAR(100)`), `origin_pincode` (`VARCHAR(10)`), `base_delivery_charge` (`DECIMAL(10, 2)`), `distance_slab_km` (`DECIMAL(6, 2)`), `charge_per_slab` (`DECIMAL(10, 2)`), `free_delivery_enabled` (`TINYINT(1)`), `free_delivery_threshold` (`DECIMAL(12, 2)`), `is_active` (`TINYINT(1)`).

### Entity 24: DistanceSlab (`distance_slabs`)
* **Purpose**: Granular distance-based delivery pricing increments.
* **Key Fields**: `id`, `delivery_config_id` (`BIGINT UNSIGNED`), `min_distance_km` (`DECIMAL(6, 2)`), `max_distance_km` (`DECIMAL(6, 2)`), `rate` (`DECIMAL(10, 2)`), `sort_order` (`INT`).

### Entity 25: OrderDiscount (`order_discounts`)
* **Purpose**: Cart-level promotional coupon codes and order discounts.
* **Key Fields**: `id`, `coupon_code` (`VARCHAR(50)`, UNIQUE), `discount_type` (`ENUM('percentage', 'fixed')`), `discount_value` (`DECIMAL(10, 2)`), `min_order_value` (`DECIMAL(12, 2)`), `max_discount_cap` (`DECIMAL(12, 2)`, NULL), `valid_from` (`DATETIME`), `valid_until` (`DATETIME`), `is_active` (`TINYINT(1)`).

### Entity 26: AdminConfigAuditLog (`admin_config_audit_logs`)
* **Purpose**: Indelible audit trail recording administrative changes to commercial and financial rules.
* **Key Fields**: `id`, `admin_user_id` (`BIGINT UNSIGNED`), `domain` (`VARCHAR(50)`), `record_id` (`BIGINT UNSIGNED`), `action_type` (`VARCHAR(20)`), `old_value` (`JSON`), `new_value` (`JSON`), `change_reason` (`TEXT`), `ip_address` (`VARCHAR(45)`), `created_at` (`DATETIME`).

