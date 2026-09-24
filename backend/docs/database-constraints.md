# Vee Electricals — Database Constraints & Business Rule Enforcement Matrix (Phase 2)

## 1. Constraint Philosophy & Enforcement Architecture

To guarantee absolute database integrity, business rules must be enforced at the deepest layer possible. However, relational database management systems (RDBMS) have technical boundaries:
* **Database-Enforced Constraints**: Invariant mathematical identities, unique identifiers, foreign key relationships, non-nullability, check conditions, and enum value domains enforced directly by the MySQL 8.0 InnoDB engine. These are infallible and execute on every raw SQL query.
* **Application-Enforced Rules**: Dynamic state machine transitions, regex validations (GSTIN, PIN codes), credit limit comparisons against aggregated balances, and distance slab overlap checks. These are enforced in Django model validation (`clean()`), serializer validation, and atomic database service transactions.

---

## 2. Master Constraints Matrix

| Table Name | Constraint Name | Constraint Type | Target Columns / Expression | Enforced By | Violation Consequence & Business Rationale |
|---|---|---|---|---|---|
| `users` | `PRIMARY` | Primary Key | `id` | Database | Guarantees unique 64-bit user identifier. |
| `users` | `uq_users_email` | Unique | `email` | Database | Prevents duplicate user accounts with identical email. |
| `users` | `uq_users_username`| Unique | `username` | Database | Guarantees unique username for internal Django auth. |
| `users` | `chk_users_role` | Check | `role IN ('customer', 'admin')` | Database | Blocks invalid or unrecognized privilege roles. |
| `customer_addresses`| `uq_addr_default_user`| Unique | `default_user_id` | Database | **Single Default Guarantee**: Enforces at most one `is_default=1` per user via generated column `IF(is_default=1, user_id, NULL)`. |
| `customer_addresses`| `chk_addr_type` | Check | `address_type IN ('home', 'work', 'other')`| Database | Restricts address classification. |
| `customer_addresses`| `chk_addr_pincode`| Check / App | Regex `^[1-9][0-9]{5}$` | Application | Validates statutory 6-digit Indian Postal Identification Number. |
| `categories` | `uq_cat_name` | Unique | `name` | Database | Prevents duplicate category titles. |
| `categories` | `uq_cat_slug` | Unique | `slug` | Database | Guarantees clean URL routing (`/shop?cat=slug`). |
| `categories` | `chk_cat_disc_val`| Check | `discount_value >= 0.00` | Database | Prevents negative discount percentages. |
| `subcategories` | `uq_subcat_slug` | Unique Composite | `(category_id, slug)` | Database | Slugs must be unique within a parent category. |
| `brands` | `uq_brand_name` | Unique | `name` | Database | Prevents duplicate manufacturer names. |
| `brands` | `uq_brand_slug` | Unique | `slug` | Database | Canonical brand routing. |
| `products` | `uq_prod_sku` | Unique | `sku` | Database | SKU is globally unique for warehouse barcode scanning. |
| `products` | `uq_prod_slug` | Unique | `slug` | Database | Public canonical SEO routing (`/product/:slug`). |
| `products` | `chk_prod_price_mrp`| Check | `price <= mrp` | Database | **Commercial Invariant**: Selling price cannot exceed Maximum Retail Price printed on packaging. |
| `products` | `chk_prod_price_pos`| Check | `price >= 0.00` | Database | Merchandise cannot be sold for negative rupee amounts. |
| `products` | `chk_prod_mrp_pos` | Check | `mrp >= 0.00` | Database | Packaging MRP must be non-negative. |
| `products` | `chk_prod_stock_pos`| Check | `stock >= 0` | Database | Physical warehouse inventory cannot drop below zero. |
| `product_specifications`| `uq_prod_spec`| Unique Composite | `(product_id, spec_key)` | Database | Prevents duplicate technical spec keys on one item. |
| `stock_transactions`| `chk_stk_type` | Check | `transaction_type IN ('RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN')` | Database | Restricts stock movement types. |
| `stock_transactions`| `fk_stk_prod` | Foreign Key | `product_id -> products(id) ON DELETE RESTRICT` | Database | **Audit Protection**: Prohibits deleting merchandise that has inventory movements. |
| `orders` | `uq_order_number`| Unique | `order_number` | Database | Public reference must be globally unique (`VPE-XXXXXX`). |
| `orders` | `chk_order_status`| Check | `status IN ('PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_COMPLETED')` | Database | Strict adherence to canonical 10-state FSM. |
| `orders` | `chk_order_pay_status`| Check | `payment_status IN ('Pending', 'Paid', 'Failed', 'Refunded')` | Database | Restricts financial payment statuses. |
| `orders` | `chk_order_totals` | Check | `subtotal >= 0.00 AND total_amount >= 0.00` | Database | Guarantees non-negative monetary totals. |
| `order_items` | `chk_item_qty` | Check | `quantity >= 1` | Database | Purchased quantity must be at least 1 unit. |
| `tax_configurations`| `chk_tax_mode` | Check | `tax_calculation_mode IN ('TAX_EXCLUSIVE', 'TAX_INCLUSIVE')` | Database | Restricts tax calculation modes. |
| `tax_configurations`| `chk_tax_rates` | Check | `default_tax_rate >= 0.00 AND cgst_rate >= 0.00 AND sgst_rate >= 0.00 AND igst_rate >= 0.00` | Database | Prevents negative tax rates. |
| `delivery_configurations`| `chk_del_params`| Check | `base_delivery_charge >= 0.00 AND distance_slab_km > 0.00` | Database | Prevents zero/negative distance step sizes. |
| `distance_slabs` | `chk_slab_range` | Check | `max_distance_km > min_distance_km AND min_distance_km >= 0.00` | Database | Guarantees valid positive distance intervals. |
| `order_discounts` | `uq_coupon_code` | Unique | `code` | Database | Promo coupon codes must be unique. |
| `order_discounts` | `chk_coupon_type`| Check | `discount_type IN ('percentage', 'fixed')` | Database | Restricts discount math types. |
| `clients` | `uq_client_code` | Unique | `client_code` | Database | Corporate client code uniqueness. |
| `clients` | `uq_client_gstin`| Unique | `gstin` | Database | Prevents multiple accounts sharing the same corporate tax entity. |
| `clients` | `chk_client_credit`| Check | `credit_limit >= 0.00` | Database | Credit ceiling cannot be negative. |
| `quotations` | `uq_quote_number`| Unique | `quotation_number` | Database | Commercial quotation number uniqueness. |
| `quotations` | `chk_quote_dates` | Check | `expiry_date >= quotation_date` | Database | Expiry date cannot precede quote creation date. |
| `quotations` | `chk_quote_status`| Check | `status IN ('Draft', 'Sent', 'Approved', 'Rejected', 'Converted')` | Database | Commercial proposal workflow choices. |
| `invoices` | `uq_invoice_num` | Unique | `invoice_number` | Database | Statutory tax invoice numbers must be globally unique. |
| `invoices` | `chk_inv_dates` | Check | `due_date >= invoice_date` | Database | Due date cannot precede invoice issuance date. |
| `invoices` | `chk_inv_status` | Check | `status IN ('Paid', 'Unpaid', 'Overdue', 'Cancelled')` | Database | Invoice collection status choices. |
| `expenses` | `chk_exp_amount` | Check | `amount > 0.00` | Database | Expense claims must be strictly positive amounts. |
| `payout_settlements`| `uq_settlement_id`| Unique | `settlement_id` | Database | Gateway settlement batch identifier uniqueness. |

---

## 3. Application-Enforced Constraints Specification

The following critical business rules cannot be enforced reliably via static SQL constraints and must be executed in Django transactional services:

### 3.1 Order State Transition Invariants
* **Invariant**: An order cannot transition illegally between states (e.g. `SHIPPED` $\rightarrow$ `CANCELLED` is forbidden; `CANCELLED` $\rightarrow$ `CONFIRMED` is forbidden).
* **Enforcement Layer**: `Order.clean()` and `OrderSerializer.validate_status()`. Enforces transition matrix documented in `order-state-machine.md`.

### 3.2 B2B Client Credit Limit Check
* **Invariant**: Outstanding unpaid invoices for a client cannot exceed `client.credit_limit`.
* **Enforcement Layer**: Evaluated inside `InvoiceService.create_invoice()`:
  $$\sum \text{Unpaid Invoices} + \text{New Invoice Total} \le \text{client.credit\_limit}$$
* Attempting to issue an invoice exceeding the ceiling raises `ValidationError("Credit limit exceeded. Current outstanding balance: ₹{outstanding}, Credit limit: ₹{limit}")`.

### 3.3 Statutory Indian GSTIN Validation
* **Invariant**: GSTIN must conform to 15-character statutory format: 2 digits (state code), 5 letters (PAN), 4 digits, 1 letter, 1 character, `'Z'`, 1 checksum digit.
* **Regex**: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
* **Enforcement Layer**: Django validator `validate_indian_gstin()` applied to `Client.gstin` and `Order.gstin`.

### 3.4 Distance Slab Overlap & Gap Prevention
* **Invariant**: In `distance_slabs`, intervals for the same `delivery_config_id` must conform to mathematically continuous half-open intervals `[min_distance_km, max_distance_km)` (lower boundary inclusive, upper boundary exclusive: `distance >= min_distance_km AND distance < max_distance_km`). Intervals must strictly not overlap or leave unrated gaps.
* **Enforcement Layer**: `DistanceSlab.clean()` verifies continuous interval consistency across sorted slab rows: `Slab[i].min_distance_km == Slab[i-1].max_distance_km` for all consecutive records under the same `delivery_config_id`.
