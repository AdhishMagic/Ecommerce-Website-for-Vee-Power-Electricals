# Vee Electricals — Production Database Schema Specification (Phase 2)

## 1. Schema Conventions & Standard Field Archetypes

### 1.1 Column Naming & Data Type Standards
* **Primary Keys**: Named `id`, typed as `BIGINT UNSIGNED AUTO_INCREMENT` (Django `BigAutoField`).
* **Foreign Keys**: Named `<singular_parent_table>_id` (e.g., `user_id`, `product_id`, `order_id`), typed as `BIGINT UNSIGNED`.
* **String Columns**: Explicit `VARCHAR(length)` with length chosen based on domain requirements.
* **Text Columns**: `TEXT` for descriptions and notes, `LONGTEXT` for comprehensive product documentation.
* **Monetary Columns**: `DECIMAL(12, 2)` (or `DECIMAL(14, 2)` for aggregate enterprise billing), unsigned or signed as required. Never `FLOAT` or `DOUBLE`.
* **Percentage / Rates**: `DECIMAL(5, 2)` (supports `0.00` to `100.00`).
* **Boolean Flags**: `TINYINT(1)` (Django `BooleanField`), default `0` or `1`.
* **Snapshots / Payloads**: `JSON` (MySQL 8.0 binary JSON; Django `JSONField`).
* **Timestamps**:
  * Creation: `created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)` (Django `auto_now_add=True`).
  * Modification: `updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)` (Django `auto_now=True`).

---

## 2. Table-by-Table Comprehensive Field Specifications

### 2.1 Identity Domain

#### Table 1: `users` (Entity: `User`)
* **Purpose**: Unified identity, credential verification, and RBAC authorization for both retail customers and store administrators. Eliminates redundant `AdminProfile`.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Soft Deletion**: `is_active = 0` deactivates login without deleting transactional links.

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Unique 64-bit user identifier |
| `email` | `VARCHAR(255)` | NO | None | `UNIQUE` | Primary login identifier; lowercase valid email regex |
| `username` | `VARCHAR(150)` | NO | None | `UNIQUE` | Internal Django username; defaults to email prefix |
| `password` | `VARCHAR(255)` | NO | None | None | PBKDF2/Argon2 cryptographic password hash |
| `first_name` | `VARCHAR(150)` | NO | `''` | None | User's first name |
| `last_name` | `VARCHAR(150)` | NO | `''` | None | User's surname / last name |
| `phone` | `VARCHAR(20)` | YES | `NULL` | None | Indian mobile: 10-15 digits (`+91` prefix accepted) |
| `role` | `VARCHAR(20)` | NO | `'customer'` | `CHECK (role IN ('customer', 'admin'))` | System role differentiation |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Active account flag; `0` = deactivated |
| `is_staff` | `TINYINT(1)` | NO | `0` | None | Django admin access permission (synchronized to `role == 'admin'`) |
| `is_superuser`| `TINYINT(1)` | NO | `0` | None | Root superuser administrative privileges |
| `date_joined` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Account registration timestamp |
| `last_login` | `DATETIME(6)` | YES | `NULL` | None | Last successful authentication timestamp |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Indexes**:
  * `uq_users_email` ON (`email`) — *Unique index enforced by UNIQUE constraint (redundant non-unique index omitted to eliminate write amplification).*
  * `uq_users_username` ON (`username`) — *Unique index enforced by UNIQUE constraint.*
  * `idx_users_role_active` ON (`role`, `is_active`) — *Composite B-Tree filtering active customers vs administrative accounts.*

---

#### Table 2: `customer_addresses` (Entity: `CustomerAddress`)
* **Purpose**: Saved recipient shipping and billing addresses associated with a customer account.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `user_id` $\rightarrow$ `users(id)` (`ON DELETE CASCADE`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Address identifier |
| `user_id` | `BIGINT UNSIGNED` | NO | None | `FK -> users(id)` | Owning user account |
| `recipient_name`| `VARCHAR(150)` | NO | None | None | Name of recipient at delivery destination |
| `phone` | `VARCHAR(20)` | NO | None | None | Contact phone for delivery courier |
| `address_line1` | `VARCHAR(255)` | NO | None | None | Building, Flat/Door No., Street name |
| `address_line2` | `VARCHAR(255)` | YES | `''` | None | Area, Landmark, Colony (optional) |
| `landmark` | `VARCHAR(150)` | YES | `''` | None | Delivery landmark assistance |
| `city` | `VARCHAR(100)` | NO | None | None | Destination city / municipality |
| `state` | `VARCHAR(100)` | NO | None | None | Indian State / Union Territory |
| `pincode` | `VARCHAR(10)` | NO | None | None | Statutory 6-digit Indian PIN code regex `^[1-9][0-9]{5}$` |
| `address_type` | `VARCHAR(20)` | NO | `'home'` | `CHECK (address_type IN ('home', 'work', 'other'))` | Address classification |
| `is_default` | `TINYINT(1)` | NO | `0` | None | Whether this address is the user's primary default |
| `default_user_id`| `BIGINT UNSIGNED` | YES | `NULL` | `GENERATED ALWAYS AS (IF(is_default = 1, user_id, NULL)) STORED`, `UNIQUE` | Database-level safe single default enforcement |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Single Default Address Enforcement**:
  * *MySQL Limitation*: A standard `UNIQUE(user_id, is_default)` fails because it allows only one non-default (`0`) address per user.
  * *Database Guarantee*: Virtual generated column `default_user_id = IF(is_default=1, user_id, NULL)` with `UNIQUE(default_user_id)`. Since MySQL permits unlimited `NULL` entries in unique indexes, multiple `is_default=0` rows can exist, but only one `is_default=1` row per user is permitted by the database engine.
  * *Application Enforcement*: Handled atomically in Django via `CustomerAddress.objects.filter(user=user, is_default=True).update(is_default=False)` prior to saving a new default.

---

### 2.2 Catalog Domain

#### Table 3: `categories` (Entity: `Category`)
* **Purpose**: Primary merchandise taxonomy and homepage hero promotional showcase.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Category identifier |
| `name` | `VARCHAR(100)` | NO | None | `UNIQUE` | Category title (e.g., 'Fans', 'Wires & Cables') |
| `slug` | `VARCHAR(100)` | NO | None | `UNIQUE` | URL-safe slug (e.g., 'wires-cables') |
| `icon` | `VARCHAR(50)` | NO | `'⚡'` | None | Display emoji or icon identifier |
| `image` | `VARCHAR(500)` | NO | `''` | None | Category promotional banner URL |
| `subtitle` | `VARCHAR(150)` | NO | `''` | None | Marketing subtitle |
| `hero_order` | `INT UNSIGNED` | NO | `0` | None | Display sequence in homepage hero carousel |
| `hero_badge` | `VARCHAR(50)` | NO | `''` | None | Badge text (e.g., 'Top Rated', 'Trending') |
| `show_in_hero` | `TINYINT(1)` | NO | `0` | None | Toggle to feature on homepage hero carousel |
| `discount_enabled`| `TINYINT(1)`| NO | `0` | None | Master toggle for category promotion |
| `discount_type` | `VARCHAR(20)` | NO | `'percentage'`| `CHECK (discount_type IN ('percentage', 'fixed'))` | Category discount markdown type |
| `discount_value`| `DECIMAL(10, 2)`| NO | `0.00` | `CHECK (discount_value >= 0.00)` | Promotional value (percentage or rupee) |
| `discount_label`| `VARCHAR(50)` | NO | `''` | None | Rendered label (e.g., 'UP TO 20% OFF') |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Active visibility toggle |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

---

#### Table 4: `subcategories` (Entity: `Subcategory`)
* **Purpose**: Secondary hierarchical classification under a parent category.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `category_id` $\rightarrow$ `categories(id)` (`ON DELETE CASCADE`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Subcategory identifier |
| `category_id` | `BIGINT UNSIGNED` | NO | None | `FK -> categories(id)` | Parent category |
| `name` | `VARCHAR(100)` | NO | None | None | Subcategory name (e.g., 'Ceiling Fans') |
| `slug` | `VARCHAR(100)` | NO | None | None | URL slug scoped to parent |
| `description` | `TEXT` | YES | `NULL` | None | Category description |
| `display_order`| `INT UNSIGNED` | NO | `0` | None | Sequence order in navigation menus |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Active status flag |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Unique Constraints**: `UNIQUE KEY uq_subcat_category_slug (category_id, slug)`

---

#### Table 5: `brands` (Entity: `Brand`)
* **Purpose**: Manufacturer brand registry (Havells, Polycab, Finolex, Philips, Legrand).
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Brand identifier |
| `name` | `VARCHAR(100)` | NO | None | `UNIQUE` | Brand commercial name |
| `slug` | `VARCHAR(100)` | NO | None | `UNIQUE` | URL slug |
| `logo_url` | `VARCHAR(500)` | NO | `''` | None | High-res logo image asset URL |
| `description` | `TEXT` | YES | `NULL` | None | Manufacturer overview |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Brand active flag |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

---

#### Table 6: `products` (Entity: `Product`)
* **Purpose**: Master electrical goods merchandise catalog item.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `category_id` $\rightarrow$ `categories(id)` (`ON DELETE RESTRICT` / `models.PROTECT`).
  * `subcategory_id` $\rightarrow$ `subcategories(id)` (`ON DELETE SET NULL`).
  * `brand_id` $\rightarrow$ `brands(id)` (`ON DELETE RESTRICT` / `models.PROTECT`).
* **Soft Deletion**: `active = 0` hides product from public browsing without deleting inventory or order audit links.

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Product master ID |
| `name` | `VARCHAR(255)` | NO | None | None | Commercial product title |
| `slug` | `VARCHAR(255)` | NO | None | `UNIQUE` | Global SEO slug for `/product/:slug` |
| `sku` | `VARCHAR(100)` | NO | None | `UNIQUE` | Globally unique stock-keeping unit |
| `category_id` | `BIGINT UNSIGNED` | NO | None | `FK -> categories(id)` | Master category |
| `subcategory_id`| `BIGINT UNSIGNED`| YES | `NULL` | `FK -> subcategories(id)`| Optional secondary subcategory |
| `brand_id` | `BIGINT UNSIGNED` | NO | None | `FK -> brands(id)` | Manufacturer brand |
| `mrp` | `DECIMAL(10, 2)` | NO | None | `CHECK (mrp >= 0.00)` | Maximum Retail Price printed on box |
| `price` | `DECIMAL(10, 2)` | NO | None | `CHECK (price >= 0.00)`| Active standard store selling price |
| `stock` | `INT` | NO | `0` | `CHECK (stock >= 0)` | Live physical warehouse inventory balance |
| `low_stock_threshold`| `INT` | NO | `5` | `CHECK (low_stock_threshold >= 0)` | Alert threshold for low inventory badge |
| `description` | `LONGTEXT` | YES | `NULL` | None | Full marketing and technical description |
| `primary_image`| `VARCHAR(500)` | NO | `''` | None | Primary catalog listing image URL |
| `featured` | `TINYINT(1)` | NO | `0` | None | Highlighted on homepage featured row |
| `active` | `TINYINT(1)` | NO | `1` | None | Soft-deletion and store visibility toggle |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Check Constraints**: `CONSTRAINT chk_product_price_mrp CHECK (price <= mrp)`
* **Indexes**:
  * `idx_products_category_brand` ON (`category_id`, `brand_id`, `active`)
  * `idx_products_featured` ON (`featured`, `active`)
  * `idx_products_price` ON (`price`)

---

#### Table 7: `product_images` (Entity: `ProductImage`)
* **Purpose**: High-resolution gallery images for a product.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `product_id` $\rightarrow$ `products(id)` (`ON DELETE CASCADE`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Image identifier |
| `product_id` | `BIGINT UNSIGNED` | NO | None | `FK -> products(id)` | Parent product |
| `image_url` | `VARCHAR(500)` | NO | None | None | CDN / Media server image URL |
| `alt_text` | `VARCHAR(255)` | NO | `''` | None | Accessibility image description |
| `sort_order` | `INT UNSIGNED` | NO | `0` | None | Carousel display order sequence |
| `is_primary` | `TINYINT(1)` | NO | `0` | None | Primary display image flag |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |

---

#### Table 8: `product_specifications` (Entity: `ProductSpecification`)
* **Purpose**: Key-value technical parameters for electrical goods (e.g., Sweep: 1200mm, Wattage: 50W, Voltage: 230V, Wire Gauge: 1.5 sq mm).
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `product_id` $\rightarrow$ `products(id)` (`ON DELETE CASCADE`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Specification identifier |
| `product_id` | `BIGINT UNSIGNED` | NO | None | `FK -> products(id)` | Parent product |
| `spec_key` | `VARCHAR(100)` | NO | None | None | Technical attribute name (e.g., 'Sweep') |
| `spec_value` | `VARCHAR(255)` | NO | None | None | Technical value (e.g., '1200 mm') |
| `sort_order` | `INT UNSIGNED` | NO | `0` | None | Specification table display order |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |

* **Unique Constraints**: `UNIQUE KEY uq_product_spec (product_id, spec_key)`

---

### 2.3 Inventory Domain

#### Table 9: `stock_transactions` (Entity: `StockTransaction`)
* **Purpose**: Immutable ledger recording all physical stock additions, sales deductions, administrative adjustments, and returns.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `product_id` $\rightarrow$ `products(id)` (`ON DELETE RESTRICT` / `models.PROTECT`). *DEC-1.5-13: Products with stock history cannot be physically deleted.*
  * `order_id` $\rightarrow$ `orders(id)` (`ON DELETE SET NULL`).
  * `performed_by_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).
* **Immutability Guarantee**: Strictly insert-only; updates and deletions are blocked. No `updated_at` column.

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Transaction identifier |
| `product_id` | `BIGINT UNSIGNED` | NO | None | `FK -> products(id)` | Target merchandise |
| `change_amount` | `INT` | NO | None | None | Signed count change (e.g., `+50`, `-2`) |
| `transaction_type`| `VARCHAR(20)`| NO | None | `CHECK (transaction_type IN ('RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN'))` | Movement classification |
| `order_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> orders(id)` | Optional linked order reference |
| `performed_by_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Administrator / warehouse staff actor |
| `notes` | `TEXT` | YES | `NULL` | None | Justification note or supplier batch # |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Immutable transaction timestamp |

* **Indexes**:
  * `idx_stock_tx_product_created` ON (`product_id`, `created_at`)
  * `idx_stock_tx_order` ON (`order_id`)

---

### 2.4 Orders Domain

#### Table 10: `orders` (Entity: `Order`)
* **Purpose**: Customer retail purchases and corporate procurement orders adhering to canonical 10-state FSM.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `user_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`). Nullable to support guest checkout (DEC-1.5-19).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Internal database order ID |
| `order_number` | `VARCHAR(100)` | NO | None | `UNIQUE` | Public human-readable order number (e.g., `VPE-849201`) |
| `user_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Registered user or NULL if guest order |
| `customer_name` | `VARCHAR(200)` | NO | None | None | Customer full name snapshot |
| `customer_email`| `VARCHAR(255)` | NO | None | None | Customer email snapshot |
| `customer_phone`| `VARCHAR(20)` | NO | None | None | Customer mobile snapshot |
| `shipping_address`| `JSON` | NO | None | None | Immutable JSON snapshot of delivery address |
| `billing_address` | `JSON` | YES | `NULL` | None | Optional B2B billing address snapshot |
| `is_business_order`| `TINYINT(1)` | NO | `0` | None | B2B tax invoice request flag |
| `company_name` | `VARCHAR(200)` | YES | `NULL` | None | Corporate business name snapshot |
| `gstin` | `VARCHAR(15)` | YES | `NULL` | None | Statutory 15-character GSTIN snapshot |
| `subtotal` | `DECIMAL(12, 2)`| NO | None | `CHECK (subtotal >= 0.00)` | Gross product catalog subtotal |
| `product_discount`| `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (product_discount >= 0.00)` | Sum of product promotional markdowns |
| `order_discount`| `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (order_discount >= 0.00)` | Coupon / order-level discount amount |
| `total_discount`| `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (total_discount >= 0.00)` | Total discount = product + order discount |
| `taxable_amount`| `DECIMAL(12, 2)`| NO | None | `CHECK (taxable_amount >= 0.00)` | Subtotal minus trade discounts |
| `tax_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (tax_amount >= 0.00)` | Total statutory GST |
| `cgst_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (cgst_amount >= 0.00)` | Central GST component (intra-state) |
| `sgst_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (sgst_amount >= 0.00)` | State GST component (intra-state) |
| `igst_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (igst_amount >= 0.00)` | Integrated GST component (inter-state) |
| `shipping_fee` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (shipping_fee >= 0.00)` | Final charged logistics shipping fee |
| `shipping_discount`| `DECIMAL(12, 2)`| NO| `0.00` | `CHECK (shipping_discount >= 0.00)`| Free shipping discount concession |
| `total_amount` | `DECIMAL(12, 2)`| NO | None | `CHECK (total_amount >= 0.00)` | Final gross payable total |
| `status` | `VARCHAR(30)` | NO | `'PENDING'` | `CHECK (status IN ('PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_COMPLETED'))` | Canonical 10-state FSM status |
| `payment_status`| `VARCHAR(20)` | NO | `'Pending'` | `CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refunded'))` | Financial payment status |
| `payment_method`| `VARCHAR(50)` | NO | `'UPI'` | None | Selected payment method |
| `tracking_number`| `VARCHAR(100)` | YES | `''` | None | Carrier tracking / Air Waybill (AWB) |
| `notes` | `TEXT` | YES | `NULL` | None | Customer order notes / instructions |
| `calculation_snapshot`| `JSON` | NO | None | None | Complete frozen mathematical calculation context |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Order placement timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Order status update timestamp |

* **Indexes**:
  * `idx_orders_user` ON (`user_id`, `created_at`)
  * `idx_orders_status` ON (`status`, `created_at`)
  * `idx_orders_payment_status` ON (`payment_status`)
  * `idx_orders_created_at` ON (`created_at`)

---

#### Table 11: `order_items` (Entity: `OrderItem`)
* **Purpose**: Frozen line items snapshotting product price, tax, and name at the moment of order placement.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `order_id` $\rightarrow$ `orders(id)` (`ON DELETE CASCADE`).
  * `product_id` $\rightarrow$ `products(id)` (`ON DELETE SET NULL`). *Historical line item survives if product is deleted.*

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Line item identifier |
| `order_id` | `BIGINT UNSIGNED` | NO | None | `FK -> orders(id)` | Parent order reference |
| `product_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> products(id)` | Product master reference (nullable) |
| `product_name` | `VARCHAR(255)` | NO | None | None | Frozen snapshot of product name |
| `sku` | `VARCHAR(100)` | NO | None | None | Frozen snapshot of SKU |
| `image_url` | `VARCHAR(500)` | YES | `NULL` | None | Frozen snapshot of primary thumbnail URL |
| `mrp` | `DECIMAL(10, 2)` | NO | None | `CHECK (mrp >= 0.00)` | Unit MRP snapshot |
| `unit_price` | `DECIMAL(10, 2)` | NO | None | `CHECK (unit_price >= 0.00)` | Unit selling price snapshot |
| `quantity` | `INT UNSIGNED` | NO | `1` | `CHECK (quantity >= 1)` | Purchased quantity count |
| `line_discount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (line_discount >= 0.00)` | Unit discount markdown × quantity |
| `taxable_amount`| `DECIMAL(12, 2)`| NO | None | `CHECK (taxable_amount >= 0.00)`| Line taxable base after discount |
| `tax_rate` | `DECIMAL(5, 2)` | NO | `18.00`| `CHECK (tax_rate >= 0.00)` | Statutory GST percentage snapshot |
| `tax_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (tax_amount >= 0.00)` | Statutory GST tax amount for line |
| `subtotal` | `DECIMAL(12, 2)`| NO | None | `CHECK (subtotal >= 0.00)` | `quantity * unit_price` |
| `total_amount` | `DECIMAL(12, 2)`| NO | None | `CHECK (total_amount >= 0.00)` | Line subtotal + tax (or net inclusive) |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |

* **Indexes**:
  * `idx_order_items_order` ON (`order_id`)
  * `idx_order_items_product` ON (`product_id`)

---

#### Table 12: `order_status_history` (Entity: `OrderStatusHistory`)
* **Purpose**: Immutable audit log tracking state transitions and fulfillment updates.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `order_id` $\rightarrow$ `orders(id)` (`ON DELETE CASCADE`).
  * `changed_by_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | History entry identifier |
| `order_id` | `BIGINT UNSIGNED` | NO | None | `FK -> orders(id)` | Parent order |
| `previous_status`| `VARCHAR(30)` | YES | `NULL` | None | Prior order status state |
| `new_status` | `VARCHAR(30)` | NO | None | None | Newly assigned order status state |
| `changed_by_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Administrator / staff who authorized change |
| `reason` | `TEXT` | YES | `NULL` | None | Operational remarks / tracking note |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Immutable transition timestamp |

* **Indexes**:
  * `idx_order_history_order` ON (`order_id`, `created_at`)

---

### 2.5 Commercial Configuration Domain

#### Table 13: `tax_configurations` (Entity: `TaxConfiguration`)
* **Purpose**: Versioned statutory tax configuration governing GST rates and intra/inter-state split.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `created_by_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Configuration row ID |
| `tax_name` | `VARCHAR(100)` | NO | `'Indian Standard GST'` | None | Commercial name of tax rule |
| `default_tax_rate`| `DECIMAL(5, 2)`| NO | `18.00` | `CHECK (default_tax_rate >= 0.00)` | Statutory total GST rate (provisional default: 18%) |
| `cgst_rate` | `DECIMAL(5, 2)` | NO | `9.00` | `CHECK (cgst_rate >= 0.00)` | Central GST share for intra-state supply |
| `sgst_rate` | `DECIMAL(5, 2)` | NO | `9.00` | `CHECK (sgst_rate >= 0.00)` | State GST share for intra-state supply |
| `igst_rate` | `DECIMAL(5, 2)` | NO | `18.00` | `CHECK (igst_rate >= 0.00)` | Integrated GST rate for inter-state supply |
| `tax_calculation_mode`| `VARCHAR(20)`| NO | `'TAX_EXCLUSIVE'` | `CHECK (tax_calculation_mode IN ('TAX_EXCLUSIVE', 'TAX_INCLUSIVE'))` | Catalog tax mode toggle |
| `business_state`| `VARCHAR(100)` | NO | `'Tamil Nadu'` | None | Merchant origin state for place of supply |
| `effective_from`| `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Validity start timestamp |
| `effective_until`| `DATETIME(6)` | YES | `NULL` | None | Validity expiry timestamp (NULL = indefinitely active) |
| `version_number`| `INT UNSIGNED` | NO | `1` | None | Monotonically increasing version counter |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Operational active toggle |
| `created_by_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Administrator who published version |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Indexes**:
  * `idx_tax_config_lookup` ON (`is_active`, `effective_from`, `effective_until`)

---

#### Table 14: `delivery_configurations` (Entity: `DeliveryConfiguration`)
* **Purpose**: Dispatch origin hub coordinates and base shipping pricing parameters.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `created_by_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Configuration identifier |
| `origin_name` | `VARCHAR(150)` | NO | `'Vee Power Coimbatore Hub'` | None | Dispatch warehouse facility title |
| `origin_address`| `VARCHAR(255)` | NO | `'No 28/1, 2nd floor, MTP Road, NSN palayam'` | None | Warehouse street address |
| `origin_city` | `VARCHAR(100)` | NO | `'Coimbatore'` | None | Dispatch origin city |
| `origin_state` | `VARCHAR(100)` | NO | `'Tamil Nadu'` | None | Dispatch origin state |
| `origin_pincode`| `VARCHAR(10)` | NO | `'641031'` | None | Dispatch warehouse PIN code |
| `latitude` | `DECIMAL(9, 6)` | YES | `11.084800` | None | Warehouse GPS latitude coordinate |
| `longitude` | `DECIMAL(9, 6)` | YES | `76.941600` | None | Warehouse GPS longitude coordinate |
| `base_delivery_charge`| `DECIMAL(10, 2)`| NO | `100.00` | `CHECK (base_delivery_charge >= 0.00)` | Base fee for initial slab (provisional seed) |
| `distance_slab_km`| `DECIMAL(6, 2)`| NO | `10.00` | `CHECK (distance_slab_km > 0.00)` | Step distance in kilometers (provisional seed) |
| `charge_per_slab`| `DECIMAL(10, 2)`| NO | `100.00` | `CHECK (charge_per_slab >= 0.00)` | Additional cost per slab (provisional seed) |
| `free_delivery_threshold`| `DECIMAL(12, 2)`| NO| `999.00` | `CHECK (free_delivery_threshold >= 0.00)`| Minimum cart value for free shipping |
| `fallback_regional_rate`| `DECIMAL(10, 2)`| NO| `100.00` | `CHECK (fallback_regional_rate >= 0.00)`| Flat rate when distance geocoding fails |
| `free_delivery_enabled`| `TINYINT(1)`| NO | `1` | None | Master toggle for free delivery threshold |
| `effective_from`| `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Validity start timestamp |
| `effective_until`| `DATETIME(6)` | YES | `NULL` | None | Expiry timestamp |
| `version_number`| `INT UNSIGNED` | NO | `1` | None | Monotonically increasing version counter |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Operational active toggle |
| `created_by_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Authorizing administrator |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

---

#### Table 15: `distance_slabs` (Entity: `DistanceSlab`)
* **Purpose**: Discrete distance bands and per-slab rate increments.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `delivery_config_id` $\rightarrow$ `delivery_configurations(id)` (`ON DELETE CASCADE`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Slab row identifier |
| `delivery_config_id`| `BIGINT UNSIGNED`| NO| None | `FK -> delivery_configurations(id)` | Owning delivery configuration |
| `min_distance_km`| `DECIMAL(6, 2)`| NO | None | `CHECK (min_distance_km >= 0.00)` | Lower distance boundary (inclusive, `distance >= min_distance_km`) |
| `max_distance_km`| `DECIMAL(6, 2)`| NO | None | `CHECK (max_distance_km > min_distance_km)` | Upper distance boundary (exclusive, `distance < max_distance_km`) |
| `rate` | `DECIMAL(10, 2)`| NO | None | `CHECK (rate >= 0.00)` | Tariff charged for this distance interval |
| `sort_order` | `INT UNSIGNED` | NO | `0` | None | Sequence priority order |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Active toggle |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Mathematical Interval Convention**:
  * Slabs operate on continuous, non-overlapping half-open intervals: `[min_distance_km, max_distance_km)`.
  * SQL Resolution Query: `WHERE delivery_config_id = ? AND is_active = 1 AND ? >= min_distance_km AND ? < max_distance_km`.
  * Precludes unrated distance gaps and boundary ambiguities.
* **Indexes**:
  * `idx_slabs_config_range` ON (`delivery_config_id`, `min_distance_km`, `max_distance_km`)

---

#### Table 16: `shipping_rules` (Entity: `ShippingRule`)
* **Purpose**: Regional state flat rates used as Tier 5 fallback when destination distance cannot be resolved.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Rule identifier |
| `state` | `VARCHAR(100)` | NO | None | `UNIQUE` | Indian State / Union Territory name |
| `cost` | `DECIMAL(10, 2)`| NO | `0.00` | `CHECK (cost >= 0.00)` | Fallback regional shipping fee |
| `estimated_days_min`| `INT UNSIGNED`| NO| `2` | None | Minimum expected transit days |
| `estimated_days_max`| `INT UNSIGNED`| NO| `5` | None | Maximum expected transit days |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Operational active status |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

---

#### Table 17: `order_discounts` (Entity: `OrderDiscount`)
* **Purpose**: Cart-level promotional coupon codes and order discounts.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `created_by_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Discount row identifier |
| `code` | `VARCHAR(50)` | NO | None | `UNIQUE` | Uppercase coupon promo code (e.g., `POWER10`) |
| `description` | `VARCHAR(255)` | NO | `''` | None | Marketing description |
| `discount_type` | `VARCHAR(20)` | NO | `'percentage'`| `CHECK (discount_type IN ('percentage', 'fixed'))` | Discount markdown type |
| `discount_value`| `DECIMAL(10, 2)`| NO | None | `CHECK (discount_value > 0.00)` | Percentage or flat rupee value |
| `min_order_value`| `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (min_order_value >= 0.00)` | Cart qualification threshold |
| `max_discount_cap`| `DECIMAL(12, 2)`| YES| `NULL` | `CHECK (max_discount_cap IS NULL OR max_discount_cap > 0.00)`| Upper ceiling for percentage discounts |
| `usage_limit_total`| `INT UNSIGNED`| YES | `NULL` | None | Maximum global redemptions allowed |
| `usage_limit_per_user`| `INT UNSIGNED`| NO | `1` | None | Redemptions allowed per customer account |
| `allow_stacking`| `TINYINT(1)` | NO | `0` | None | Whether coupon can stack with product discounts |
| `valid_from` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Campaign start date |
| `valid_until` | `DATETIME(6)` | YES | `NULL` | None | Campaign expiration date (NULL = no expiry) |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Active toggle |
| `created_by_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Authorizing administrator |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Indexes**:
  * `idx_order_discounts_lookup` ON (`code`, `is_active`, `valid_from`, `valid_until`)

---

#### Table 18: `company_store_configurations` (Entity: `CompanyStoreConfiguration`)
* **Purpose**: Consolidated master profile of Vee Power Electricals: company legal identity, bank coordinates, fulfillment policies, payment rail toggles, and general store flags. Consolidating these into one clean table avoids creating multiple 1-row fragmented tables.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Row Cardinality**: Single-row singleton configuration pattern.

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Configuration row ID |
| `legal_company_name`| `VARCHAR(200)`| NO| `'Vee Power Electricals'` | None | Statutory legal entity name |
| `brand_name` | `VARCHAR(150)` | NO | `'Vee Power Electricals'` | None | Marketing brand display title |
| `gstin` | `VARCHAR(15)` | NO | `'33AABFV1234A1ZX'` | None | Statutory 15-character Indian GSTIN |
| `pan` | `VARCHAR(10)` | NO | `'AABFV1234A'` | None | Permanent Account Number |
| `registered_address`| `TEXT` | NO | `'No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031'` | None | Legal registered office address |
| `warehouse_address`| `TEXT` | NO | `'No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031'` | None | Physical goods dispatch warehouse |
| `support_email`| `VARCHAR(255)` | NO | `'support@veepower.in'` | None | Customer service email address |
| `support_phone`| `VARCHAR(20)` | NO | `'+91 98765 43210'` | None | Customer helpline mobile/phone |
| `bank_name` | `VARCHAR(150)` | NO | `'State Bank of India'` | None | Bank name printed on B2B invoices |
| `bank_account_number`| `VARCHAR(50)`| NO | `'38492019482'` | None | Current account number for NEFT/RTGS |
| `bank_ifsc` | `VARCHAR(20)` | NO | `'SBIN0001234'` | None | Bank branch IFSC code |
| `bank_branch` | `VARCHAR(100)` | NO | `'Coimbatore Main Branch'` | None | Bank branch location |
| `currency_code`| `VARCHAR(10)` | NO | `'INR'` | None | Transaction currency code |
| `currency_symbol`| `VARCHAR(10)`| NO | `'₹'` | None | Currency symbol |
| `rounding_mode`| `VARCHAR(20)` | NO | `'ROUND_HALF_UP'`| `CHECK (rounding_mode IN ('ROUND_HALF_UP', 'NO_ROUNDING'))` | Commercial currency rounding method |
| `auto_cancel_unpaid_minutes`| `INT UNSIGNED`| NO| `30` | None | Cron timeout for unpaid online orders |
| `cancellation_allowed_until`| `VARCHAR(30)`| NO| `'CONFIRMED'`| `CHECK (cancellation_allowed_until IN ('PENDING', 'CONFIRMED', 'PACKED'))` | Self-service cancellation cutoff stage |
| `return_window_days`| `INT UNSIGNED`| NO| `7` | None | Days post-delivery to request return |
| `require_shipping_awb`| `TINYINT(1)`| NO| `1` | None | Require tracking number to ship |
| `upi_enabled` | `TINYINT(1)` | NO | `1` | None | UPI / QR code payment rail toggle |
| `cards_enabled`| `TINYINT(1)` | NO | `1` | None | Credit / Debit card payment rail toggle |
| `netbanking_enabled`| `TINYINT(1)`| NO | `1` | None | Net Banking payment rail toggle |
| `cod_enabled` | `TINYINT(1)` | NO | `1` | None | Cash on Delivery payment rail toggle |
| `cod_max_limit`| `DECIMAL(12, 2)`| NO| `10000.00`| `CHECK (cod_max_limit >= 0.00)` | Maximum eligible order total for COD |
| `guest_checkout_enabled`| `TINYINT(1)`| NO| `0` | None | Whether unauthenticated checkout is allowed |
| `is_maintenance_mode`| `TINYINT(1)`| NO| `0` | None | Maintenance mode downtime toggle |
| `maintenance_notice`| `TEXT` | YES | `NULL` | None | Public downtime announcement |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Last update timestamp |

---

### 2.6 B2B Domain

#### Table 19: `clients` (Entity: `Client`)
* **Purpose**: B2B corporate buyers, building contractors, and credit accounts.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Corporate client master ID |
| `client_code` | `VARCHAR(50)` | NO | None | `UNIQUE` | Public client identifier (e.g., `CLI-001`) |
| `company_name` | `VARCHAR(200)` | NO | None | None | Registered corporate title |
| `contact_person`| `VARCHAR(150)`| NO | None | None | Primary procurement manager name |
| `gstin` | `VARCHAR(15)` | NO | None | `UNIQUE` | 15-character statutory GSTIN regex |
| `email` | `VARCHAR(255)` | NO | None | None | Official accounts/billing email |
| `phone` | `VARCHAR(20)` | NO | None | None | Business contact telephone |
| `credit_limit` | `DECIMAL(14, 2)`| NO | `0.00` | `CHECK (credit_limit >= 0.00)` | Maximum outstanding unpaid credit ceiling |
| `address` | `TEXT` | YES | `NULL` | None | Registered corporate billing address |
| `is_active` | `TINYINT(1)` | NO | `1` | None | Active enterprise account status |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* *Total Invoiced Architectural Decision*: Storing `total_invoiced` as a mutable column creates synchronization anomalies. In this architecture, total invoiced is **computed dynamically** as `SELECT SUM(total_amount) FROM invoices WHERE client_id = ? AND status != 'Cancelled'`.

---

#### Table 20: `quotations` (Entity: `Quotation`)
* **Purpose**: Commercial project estimates and price quotations issued to contractors.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `client_id` $\rightarrow$ `clients(id)` (`ON DELETE RESTRICT` / `models.PROTECT`).
  * `created_by_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).
* **Quotation Conversion Flow**: Quotation conversion is represented by `status = 'Converted'`. The resulting tax invoice references this quotation via `invoices.quotation_id -> quotations(id)`, maintaining a clean, strictly acyclic relationship without circular foreign keys.

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Quotation internal ID |
| `quotation_number`| `VARCHAR(50)`| NO | None | `UNIQUE` | Formal quote reference (e.g., `QT-2026-001`) |
| `client_id` | `BIGINT UNSIGNED` | NO | None | `FK -> clients(id)` | Corporate client |
| `quotation_date`| `DATE` | NO | None | None | Quote issuance date |
| `expiry_date` | `DATE` | NO | None | None | Commercial quote validity cutoff |
| `total_value` | `DECIMAL(14, 2)`| NO | `0.00` | `CHECK (total_value >= 0.00)` | Sum of quoted line items |
| `status` | `VARCHAR(20)` | NO | `'Draft'` | `CHECK (status IN ('Draft', 'Sent', 'Approved', 'Rejected', 'Converted'))` | Commercial proposal lifecycle |
| `notes` | `TEXT` | YES | `NULL` | None | Commercial terms, delivery milestones |
| `created_by_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Sales engineer / creator |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Check Constraints**: `CONSTRAINT chk_quote_dates CHECK (expiry_date >= quotation_date)`
* **Indexes**:
  * `uq_quote_number` ON (`quotation_number`) — *Unique index enforced by UNIQUE constraint.*
  * `idx_quotations_client` ON (`client_id`, `status`)

---

#### Table 21: `quotation_items` (Entity: `QuotationItem`)
* **Purpose**: Line items quoted inside a commercial quotation.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `quotation_id` $\rightarrow$ `quotations(id)` (`ON DELETE CASCADE`).
  * `product_id` $\rightarrow$ `products(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Line item identifier |
| `quotation_id` | `BIGINT UNSIGNED` | NO | None | `FK -> quotations(id)` | Parent quotation |
| `product_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> products(id)` | Product master reference (nullable) |
| `item_name` | `VARCHAR(255)` | NO | None | None | Quoted product description |
| `quantity` | `INT UNSIGNED` | NO | `1` | `CHECK (quantity >= 1)` | Quoted merchandise quantity count |
| `unit_price` | `DECIMAL(12, 2)`| NO | None | `CHECK (unit_price >= 0.00)` | Negotiated commercial unit rate |
| `subtotal` | `DECIMAL(14, 2)`| NO | None | `CHECK (subtotal >= 0.00)` | `quantity * unit_price` |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |

* **Indexes**:
  * `idx_quotation_items_quote` ON (`quotation_id`)

---

### 2.7 Finance Domain

#### Table 22: `invoices` (Entity: `Invoice`)
* **Purpose**: Legal GST tax invoices generated for retail orders or B2B client contracts.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `order_id` $\rightarrow$ `orders(id)` (`ON DELETE SET NULL`). *1:N capable at database level; DEC-1.5-14.*
  * `client_id` $\rightarrow$ `clients(id)` (`ON DELETE RESTRICT` / `models.PROTECT`).
  * `quotation_id` $\rightarrow$ `quotations(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Internal invoice ID |
| `invoice_number`| `VARCHAR(50)` | NO | None | `UNIQUE` | Statutory GST invoice sequence (e.g., `INV-2026-0001`) |
| `invoice_date` | `DATE` | NO | None | None | Legal tax invoice issuance date |
| `due_date` | `DATE` | NO | None | None | Payment due date cutoff |
| `order_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> orders(id)` | Originating retail order (nullable) |
| `client_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> clients(id)` | B2B corporate client (nullable) |
| `quotation_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> quotations(id)`| Originating commercial quote (nullable) |
| `subtotal` | `DECIMAL(14, 2)`| NO | None | `CHECK (subtotal >= 0.00)` | Gross merchandise subtotal |
| `discount_amount`| `DECIMAL(14, 2)`| NO| `0.00` | `CHECK (discount_amount >= 0.00)` | Applied commercial discounts |
| `taxable_amount`| `DECIMAL(14, 2)`| NO | None | `CHECK (taxable_amount >= 0.00)` | Taxable supply base after trade discounts |
| `cgst_amount` | `DECIMAL(14, 2)`| NO | `0.00` | `CHECK (cgst_amount >= 0.00)` | Central GST component |
| `sgst_amount` | `DECIMAL(14, 2)`| NO | `0.00` | `CHECK (sgst_amount >= 0.00)` | State GST component |
| `igst_amount` | `DECIMAL(14, 2)`| NO | `0.00` | `CHECK (igst_amount >= 0.00)` | Integrated GST component |
| `tax_amount` | `DECIMAL(14, 2)`| NO | `0.00` | `CHECK (tax_amount >= 0.00)` | Total GST = CGST + SGST + IGST |
| `shipping_fee` | `DECIMAL(14, 2)`| NO | `0.00` | `CHECK (shipping_fee >= 0.00)` | Charged delivery logistics fee |
| `total_amount` | `DECIMAL(14, 2)`| NO | None | `CHECK (total_amount >= 0.00)` | Gross legally payable total |
| `status` | `VARCHAR(20)` | NO | `'Unpaid'` | `CHECK (status IN ('Paid', 'Unpaid', 'Overdue', 'Cancelled'))` | Invoice settlement status |
| `payment_status`| `VARCHAR(20)` | NO | `'Pending'` | `CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refunded'))` | Financial payment status |
| `notes` | `TEXT` | YES | `NULL` | None | Legal disclaimer, dispute jurisdiction |
| `calculation_snapshot`| `JSON` | NO | None | None | Frozen mathematical rate snapshot |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Check Constraints**: `CONSTRAINT chk_invoice_dates CHECK (due_date >= invoice_date)`
* **Indexes**:
  * `idx_invoices_order` ON (`order_id`)
  * `idx_invoices_client` ON (`client_id`, `status`)
  * `idx_invoices_date` ON (`invoice_date`, `status`)

---

#### Table 23: `invoice_items` (Entity: `InvoiceItem`)
* **Purpose**: Line items detailing statutory GST tax breakdowns per item for legal compliance.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `invoice_id` $\rightarrow$ `invoices(id)` (`ON DELETE CASCADE`).
  * `product_id` $\rightarrow$ `products(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Line item identifier |
| `invoice_id` | `BIGINT UNSIGNED` | NO | None | `FK -> invoices(id)` | Parent tax invoice |
| `product_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> products(id)` | Master merchandise reference |
| `item_name` | `VARCHAR(255)` | NO | None | None | Commercial merchandise title |
| `sku` | `VARCHAR(100)` | YES | `NULL` | None | Item SKU snapshot |
| `quantity` | `INT UNSIGNED` | NO | `1` | `CHECK (quantity >= 1)` | Invoiced quantity count |
| `rate` | `DECIMAL(12, 2)`| NO | None | `CHECK (rate >= 0.00)` | Unit selling rate |
| `taxable_amount`| `DECIMAL(14, 2)`| NO | None | `CHECK (taxable_amount >= 0.00)`| Line taxable base (`quantity * rate`) |
| `tax_percent` | `DECIMAL(5, 2)` | NO | `18.00`| `CHECK (tax_percent >= 0.00)` | Applied GST percentage rate |
| `cgst_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (cgst_amount >= 0.00)` | CGST component |
| `sgst_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (sgst_amount >= 0.00)` | SGST component |
| `igst_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (igst_amount >= 0.00)` | IGST component |
| `tax_amount` | `DECIMAL(12, 2)`| NO | `0.00` | `CHECK (tax_amount >= 0.00)` | Total line GST amount |
| `total_amount` | `DECIMAL(14, 2)`| NO | None | `CHECK (total_amount >= 0.00)` | Taxable amount + tax amount |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |

* **Indexes**:
  * `idx_invoice_items_invoice` ON (`invoice_id`)

---

#### Table 24: `payment_transactions` (Entity: `PaymentTransaction`)
* **Purpose**: Records individual customer inbound payment attempts, gateway verification signatures, and statuses against orders and invoices.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Keys**:
  * `order_id` $\rightarrow$ `orders(id)` (`ON DELETE SET NULL`).
  * `invoice_id` $\rightarrow$ `invoices(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Transaction internal identifier |
| `order_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> orders(id)` | Target retail order |
| `invoice_id` | `BIGINT UNSIGNED` | YES | `NULL` | `FK -> invoices(id)` | Target tax invoice |
| `gateway` | `VARCHAR(30)` | NO | `'RAZORPAY'` | `CHECK (gateway IN ('RAZORPAY', 'COD', 'NEFT_RTGS', 'MANUAL'))` | Payment rail provider |
| `gateway_transaction_id`| `VARCHAR(100)`| YES| `NULL` | None | Gateway payment reference (e.g., `pay_Ohb1284`) |
| `gateway_order_id`| `VARCHAR(100)`| YES | `NULL` | None | Gateway order ID (e.g., `order_EKf38491`) |
| `gateway_signature`| `VARCHAR(255)`| YES | `NULL` | None | Cryptographic signature string |
| `payment_method`| `VARCHAR(50)` | NO | `'UPI'` | None | Specific method (UPI, Card, NetBanking, COD) |
| `amount` | `DECIMAL(12, 2)`| NO | None | `CHECK (amount > 0.00)` | Transaction monetary amount |
| `currency` | `VARCHAR(10)` | NO | `'INR'` | None | Transaction currency code |
| `status` | `VARCHAR(20)` | NO | `'INITIATED'` | `CHECK (status IN ('INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED'))` | Payment attempt state |
| `error_code` | `VARCHAR(50)` | YES | `NULL` | None | Gateway error code if failed |
| `error_message` | `TEXT` | YES | `NULL` | None | Gateway rejection message |
| `metadata` | `JSON` | YES | `NULL` | None | Gateway webhook response payload |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Transaction initiation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Verification timestamp |

* **Indexes**:
  * `idx_payment_tx_order` ON (`order_id`)
  * `idx_payment_tx_invoice` ON (`invoice_id`)
  * `idx_payment_tx_gateway_ref` ON (`gateway_transaction_id`)

---

#### Table 25: `expenses` (Entity: `Expense`)
* **Purpose**: Internal administrative operational and capital expense tracking.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `created_by_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Expense entry identifier |
| `expense_date` | `DATE` | NO | None | None | Incurred expense date |
| `category` | `VARCHAR(30)` | NO | None | `CHECK (category IN ('Logistics', 'Marketing', 'Software', 'Inventory', 'Utilities', 'Operations'))` | Expense classification category |
| `description` | `VARCHAR(255)` | NO | None | None | Expense description / invoice note |
| `vendor` | `VARCHAR(150)` | NO | None | None | Payee / vendor entity |
| `amount` | `DECIMAL(12, 2)`| NO | None | `CHECK (amount > 0.00)` | Incurred expense value |
| `status` | `VARCHAR(20)` | NO | `'Pending'` | `CHECK (status IN ('Paid', 'Pending'))` | Settlement status |
| `payment_mode` | `VARCHAR(50)` | YES | `NULL` | None | Payment mode (NEFT, UPI, Cash) |
| `receipt_url` | `VARCHAR(500)` | YES | `NULL` | None | Digital receipt voucher image URL |
| `created_by_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Authorizing staff member |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Indexes**:
  * `idx_expenses_date_category` ON (`expense_date`, `category`)

---

#### Table 26: `payout_settlements` (Entity: `PayoutSettlement`)
* **Purpose**: Records gateway settlement batches received in the merchant bank account.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Settlement internal identifier |
| `settlement_id`| `VARCHAR(100)` | NO | None | `UNIQUE` | Gateway settlement identifier (e.g., `setl_94829`) |
| `gateway` | `VARCHAR(30)` | NO | `'RAZORPAY'` | None | Settling payment gateway |
| `settlement_date`| `DATE` | NO | None | None | Bank deposit settlement date |
| `gross_amount` | `DECIMAL(12, 2)`| NO | None | `CHECK (gross_amount >= 0.00)` | Total gross collections in batch |
| `gateway_fee` | `DECIMAL(10, 2)`| NO | `0.00` | `CHECK (gateway_fee >= 0.00)` | Gateway MDR / processing deduction |
| `tax_on_fee` | `DECIMAL(10, 2)`| NO | `0.00` | `CHECK (tax_on_fee >= 0.00)` | GST on gateway fee |
| `net_amount` | `DECIMAL(12, 2)`| NO | None | `CHECK (net_amount >= 0.00)` | Net funds credited to merchant bank |
| `status` | `VARCHAR(20)` | NO | `'Processing'` | `CHECK (status IN ('Settled', 'Processing', 'Failed'))` | Batch deposit status |
| `bank_reference`| `VARCHAR(100)` | YES | `NULL` | None | Bank UTR / transaction reference number |
| `notes` | `TEXT` | YES | `NULL` | None | Settlement reconciliation remarks |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record creation timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Record last modification timestamp |

* **Indexes**:
  * `idx_payouts_date` ON (`settlement_date`, `status`)

---

### 2.8 Governance & Communication Domain

#### Table 27: `admin_config_audit_logs` (Entity: `AdminConfigAuditLog`)
* **Purpose**: Append-only audit trail recording every administrative modification to commercial and financial configuration rules.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* **Foreign Key**: `admin_user_id` $\rightarrow$ `users(id)` (`ON DELETE SET NULL`).
* **Immutability Guarantee**: Strictly insert-only. No `updated_at` column. Updates and deletes are blocked.

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Audit log entry identifier |
| `admin_user_id`| `BIGINT UNSIGNED` | YES | `NULL` | `FK -> users(id)` | Authorizing staff member |
| `domain` | `VARCHAR(50)` | NO | None | None | Configuration domain (`TAX`, `DELIVERY`, `DISCOUNT`, `COMPANY`) |
| `record_id` | `BIGINT UNSIGNED` | NO | None | None | Primary key of affected configuration record |
| `action_type` | `VARCHAR(20)` | NO | None | `CHECK (action_type IN ('CREATE', 'UPDATE', 'DEACTIVATE', 'DELETE'))` | Administrative action |
| `old_value` | `JSON` | YES | `NULL` | None | Serialized pre-change JSON state |
| `new_value` | `JSON` | NO | None | None | Serialized post-change JSON state |
| `change_reason`| `TEXT` | NO | None | None | Mandatory business justification note |
| `ip_address` | `VARCHAR(45)` | YES | `NULL` | None | Client IPv4 / IPv6 address of admin session |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Immutable audit timestamp |

* **Indexes**:
  * `idx_config_audit_domain_rec` ON (`domain`, `record_id`, `created_at`)
  * `idx_config_audit_admin` ON (`admin_user_id`)

---

#### Table 28: `contact_inquiries` (Entity: `ContactInquiry`)
* **Purpose**: Lead generation, bulk procurement inquiry requests, and customer support tickets.
* **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)

| Column Name | Data Type | Nullable | Default | Constraints / Uniqueness | Description / Validation |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | NO | Auto | `PRIMARY KEY` | Ticket identifier |
| `name` | `VARCHAR(150)` | NO | None | None | Inquirer's full name |
| `email` | `VARCHAR(255)` | YES | `NULL` | None | Optional contact email |
| `phone` | `VARCHAR(20)` | NO | None | None | Contact telephone / mobile |
| `subject` | `VARCHAR(150)` | NO | None | None | Inquiry topic or bulk product SKU |
| `message` | `TEXT` | NO | None | None | Inquiry inquiry details |
| `status` | `VARCHAR(20)` | NO | `'New'` | `CHECK (status IN ('New', 'In Progress', 'Resolved', 'Closed'))` | Support workflow status |
| `admin_notes` | `TEXT` | YES | `NULL` | None | Internal administrative resolution notes |
| `created_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Ticket submission timestamp |
| `updated_at` | `DATETIME(6)` | NO | `CURRENT_TIMESTAMP(6)` | None | Status update timestamp |

* **Indexes**:
  * `idx_inquiries_status_created` ON (`status`, `created_at`)
