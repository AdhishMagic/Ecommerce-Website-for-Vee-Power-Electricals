# Vee Electricals — Configuration Architecture & Admin Customization Specification (Phase 1.5)

## 1. Architectural Mandate & Core Principles

Commercial parameters for **Vee Power Electricals** are not static. Tax rates, shipping tariffs, discount rules, threshold limits, and company profiles evolve over time due to statutory shifts, logistics contracts, and marketing strategies.

### 1.1 Non-Negotiable Tenets
1. **Zero Hardcoded Commercial Values**: Tax percentages, shipping slab charges, distance intervals, and discount ceilings must never be hardcoded in application logic or database migration defaults.
2. **Domain-Separated Configuration**: Reject monolithic, uncontrolled JSON "settings blobs". Configuration must be partitioned into typed, domain-specific modules with clear data ownership, validation, and schemas.
3. **Point-in-Time Immutability for Transactions**: Configuration changes apply **strictly forward-in-time**. When an order, invoice, or quotation is created, it captures an immutable snapshot of all active commercial rates. A subsequent modification to a tax rate or shipping tariff must **never** rewrite historical financial records or invalidate past accounting statements.
4. **Temporal Validity & Versioning**: Configuration records support effective dating (`effective_from`, `effective_until`) and state management (`is_active`, `version_number`) to allow scheduled tariff updates and auditable historical traceability.
5. **Auditable Administrative Control**: Every administrative edit to commercial rules must record the actor (`created_by`, `updated_by`), timestamp, previous value, new value, and a mandatory business justification note.
6. **Strict Role-Based Authorization**: Only users with explicit administrative privileges (`role='admin'` or designated staff permissions) may read or modify commercial configuration entities. Customers have zero write access and can only view public derived outputs (e.g., active catalog selling price, shipping fee preview at checkout).

---

## 2. Configuration Domains Specification

To guarantee data integrity and operational clarity, configuration is divided into **ten distinct conceptual domains**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ADMIN CONFIGURATION DOMAINS                           │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ 1. Tax Config        │ 2. Discount Config   │ 3. Delivery Pricing Config    │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ 4. Billing Config    │ 5. Invoice Config    │ 6. Order / Fulfillment Config │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ 7. Payment Config    │ 8. Company Profile   │ 9. Inventory Config           │
├──────────────────────┴──────────────────────┴───────────────────────────────┤
│ 10. Commercial & General Store Config                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Domain 1: Tax Configuration (`tax_configuration`)

* **Purpose**: Governs statutory Goods and Services Tax (GST) calculation across retail and B2B transactions, supporting intra-state (CGST + SGST) and inter-state (IGST) taxation under Indian law.
* **Configurable Fields**:
  * `tax_enabled` (Boolean): Master toggle for tax calculations.
  * `default_tax_rate` (Decimal): Default statutory GST percentage (Provisional dev seed: `18.00%`).
  * `cgst_rate` (Decimal): Central GST share for intra-state supply (e.g., `9.00%`).
  * `sgst_rate` (Decimal): State GST share for intra-state supply (e.g., `9.00%`).
  * `igst_rate` (Decimal): Integrated GST rate for inter-state supply (e.g., `18.00%`).
  * `tax_calculation_mode` (Enum): `TAX_EXCLUSIVE` (tax calculated and added on top at checkout) vs `TAX_INCLUSIVE` (tax extracted backwards from catalog retail price).
  * `business_state` (String): Business origin state code/name used to determine intra vs inter-state supply (Default: `'Tamil Nadu'`).
  * `effective_from` (DateTime), `effective_until` (DateTime, Nullable).
* **Access & Visibility**:
  * Edit: Admin Only (`IsAdminUser`).
  * Customer Visibility: Rates and breakdown visible on checkout review, invoice, and order summary. Raw config table hidden.
* **Transaction Impact**:
  * Affects Checkout: **YES** (Calculates tax line items).
  * Affects Invoices: **YES** (Populates statutory tax breakdown on B2C/B2B tax invoices).
* **Integrity & Auditing**:
  * Versioning: Requires versioned records or effective date validity windows.
  * Snapshotting: Order items and invoices snapshot `tax_rate`, `tax_type` (CGST/SGST/IGST), and `tax_amount`.
  * Audit Requirement: Mandatory audit log on rate change.
* **Validation Rules**:
  * Sum validation: In intra-state mode, `cgst_rate + sgst_rate` must equal `default_tax_rate`.
  * Non-negative: All tax rates must be `>= 0.00` and `<= 100.00`.
* **Pending Business Decision**: Final confirmation on whether retail catalog prices are marketed as tax-inclusive or tax-exclusive (See Decision Log `DEC-1.5-02`).

---

### Domain 2: Discount Configuration (`discount_configuration`)

* **Purpose**: Governs promotional price markdowns at both product catalog level and cart/order level.
* **Sub-Domain 2A: Product-Specific Discounts**:
  * `product_id` / `category_id`: Target catalog scope.
  * `discount_type`: `PERCENTAGE` or `FIXED_AMOUNT`.
  * `discount_value`: Percentage (e.g., `15.00%`) or flat rupee markdown (e.g., `₹200.00`).
  * `start_date` / `end_date`: Promotional validity window.
  * `is_active`: Operational toggle.
* **Sub-Domain 2B: Order-Level Discounts (Cart / Coupons / Volume)**:
  * `coupon_code` (String, Optional): Promo code identifier (e.g., `VEEFESTIVE`).
  * `discount_type`: `PERCENTAGE` or `FIXED_AMOUNT`.
  * `discount_value`: Discount quantity.
  * `min_order_value`: Minimum cart subtotal required to unlock discount (e.g., `₹5,000.00`).
  * `max_discount_cap`: Upper ceiling for percentage discounts (e.g., maximum `₹1,000.00`).
  * `applicable_customer_type`: `ALL`, `B2C_ONLY`, `B2B_ONLY`.
  * `usage_limit_per_user`: Max redemptions allowed per account.
* **Sub-Domain 2C: Discount Stacking Policy**:
  * `allow_stacking` (Boolean): Whether order-level discounts can stack on top of products with active product-level discounts (Default: `FALSE` / Pending Confirmation).
  * `stacking_order`: Sequential order of application (`PRODUCT_THEN_ORDER`).
* **Access & Visibility**:
  * Edit: Admin Only.
  * Customer Visibility: Applied promotional badges, strike-through MRP, and discount summary visible.
* **Transaction Impact**:
  * Affects Checkout: **YES** (Reduces net payable amount).
  * Affects Invoices: **YES** (Shows statutory taxable amount after trade discount).
* **Integrity & Auditing**:
  * Order items snapshot `mrp`, applied `discount_amount`, and net unit `price`.
  * Orders snapshot `product_discount_total`, `order_discount_total`, and applied `coupon_code`.

---

### Domain 3: Delivery & Shipping Configuration (`delivery_configuration`)

* **Purpose**: Replaces simplistic static delivery fees with a configurable distance and regional pricing engine.
* **Configurable Fields**:
  * `origin_city` (String): Business dispatch origin city (Configured default: `'Coimbatore'`).
  * `origin_state` (String): Origin state (Configured default: `'Tamil Nadu'`).
  * `origin_pincode` (String): Warehouse dispatch PIN code (Configured default: `'641031'`).
  * `origin_coordinates`: Dispatch latitude/longitude for spatial distance calculation.
  * `base_delivery_charge` (Decimal): Initial charge for first distance slab (Provisional dev default: `₹100.00`).
  * `distance_slab_km` (Decimal): Distance interval step (Provisional dev default: `10.00 km`).
  * `charge_per_slab` (Decimal): Additional fee added per distance slab (Provisional dev default: `₹100.00`).
  * `free_delivery_enabled` (Boolean): Master toggle for free shipping.
  * `free_delivery_threshold` (Decimal): Minimum taxable/discounted subtotal for free delivery (Provisional default: Configurable; see Section 3).
  * `max_delivery_charge` (Decimal, Nullable): Optional cap to prevent exorbitant shipping calculations.
  * `state_overrides_enabled` (Boolean): Toggle to enable fallback flat state rates when precise distance calculation is unavailable.
* **Access & Visibility**:
  * Edit: Admin Only (`/admin/orders/shipping`).
  * Customer Visibility: Delivery fee displayed during checkout Step 1 & Step 3.
* **Transaction Impact**:
  * Affects Checkout: **YES**.
  * Affects Invoices: **YES** (Shipping is a taxable service component under GST).
* **Integrity & Auditing**:
  * Orders and Invoices snapshot `shipping_fee`, `delivery_distance_km`, and `applied_shipping_rule`.

---

### Domain 4: Billing Configuration (`billing_configuration`)

* **Purpose**: Controls mathematical calculation order, currency rounding conventions, and minimum payable thresholds.
* **Configurable Fields**:
  * `currency_code` (String): Default `'INR'` (Indian Rupee, `₹`).
  * `currency_symbol` (String): Default `'₹'`.
  * `rounding_mode` (Enum): `ROUND_HALF_UP` (Nearest Rupee, standard Indian commercial practice) vs `NO_ROUNDING` (Preserve 2 decimal paise).
  * `allow_negative_totals` (Boolean): Hardcoded invariant `FALSE`.
  * `min_order_amount` (Decimal): Minimum checkout order subtotal allowed (Default: `₹0.00` - unconstrained).
  * `cash_on_delivery_surcharge` (Decimal): Optional operational fee for COD payment method (Default: `₹0.00`).
* **Access & Visibility**: Admin edit only; public currency display.
* **Integrity & Auditing**: Changes logged; snapshots frozen on order creation.

---

### Domain 5: Invoice Configuration (`invoice_configuration`)

* **Purpose**: Governs statutory numbering sequences, corporate legal headers, and payment terms for generated tax invoices.
* **Configurable Fields**:
  * `invoice_prefix` (String): e.g., `'INV'` (or financial year prefix `'INV-2026-'`).
  * `invoice_number_padding` (Integer): Sequential digit length (e.g., `4` -> `INV-2026-0001`).
  * `reset_sequence_annually` (Boolean): Reset sequence on Indian Financial Year start (April 1st).
  * `default_due_days_b2c` (Integer): Due date offset for retail orders (Default: `0` days - immediate).
  * `default_due_days_b2b` (Integer): Credit term offset for contractor invoices (Default: `15` or `30` days).
  * `invoice_footer_notes` (Text): Standard legal disclaimer, bank details, and dispute jurisdiction (e.g., "Subject to Coimbatore jurisdiction").
  * `declaration_text` (Text): Statutory declaration under GST rules.
* **Access & Visibility**: Admin edit only; rendered on printable invoice PDFs.
* **Integrity & Auditing**: Sequence counters must be transactionally safe (row locks or atomic increments).

---

### Domain 6: Order / Fulfillment Configuration (`order_configuration`)

* **Purpose**: Regulates order lifecycle timeouts, cancellation allowances, and stock reservation behavior.
* **Configurable Fields**:
  * `auto_cancel_unpaid_minutes` (Integer): Timeout for unpaid online gateway checkouts before returning stock (e.g., `30` minutes).
  * `cancellation_allowed_until` (Enum): Latest lifecycle stage for customer self-service cancellation (Default: `CONFIRMED` or `PACKED`).
  * `return_window_days` (Integer): Days following delivery during which customer can initiate return (e.g., `7` days).
  * `require_shipping_awb` (Boolean): Require Air Waybill / Tracking number before moving order to `SHIPPED` status.
* **Access & Visibility**: Admin edit only; return policies displayed publicly in footer/terms.

---

### Domain 7: Payment Configuration (`payment_configuration`)

* **Purpose**: Controls allowed checkout payment rails, gateway environment modes, and settlement parameters.
* **Configurable Fields**:
  * `upi_enabled` (Boolean): Master toggle for UPI / QR code payment.
  * `cards_enabled` (Boolean): Master toggle for Credit / Debit cards.
  * `netbanking_enabled` (Boolean): Master toggle for Internet Banking.
  * `cod_enabled` (Boolean): Master toggle for Cash on Delivery.
  * `cod_max_limit` (Decimal): Maximum cart value eligible for COD (e.g., `₹10,000.00`).
  * `gateway_provider` (Enum): `RAZORPAY` (Primary target) / `MANUAL_PROTOTYPE`.
  * `gateway_environment` (Enum): `TEST` / `LIVE`.
  * `webhook_secret_key` (String, Masked): Credential for gateway signature verification.
* **Access & Visibility**: Sensitive admin credentials; public endpoint exposes only boolean availability flags.

---

### Domain 8: Company / Business Profile Configuration (`company_configuration`)

* **Purpose**: Master legal identity of Vee Power Electricals rendered on invoices, quotations, order receipts, and website metadata.
* **Configurable Fields**:
  * `legal_business_name` (String): Configured default `'Vee Power Electricals Pvt Ltd'` (or sole proprietorship entity).
  * `brand_display_name` (String): `'Vee Power Electricals'`.
  * `gstin` (String): 15-character statutory GSTIN (e.g., registered Tamil Nadu GSTIN starting with `33`).
  * `pan` (String): 10-character Permanent Account Number.
  * `registered_office_address` (Text): Default from `companyInfo.ts`: `"No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore, TamilNadu - 641031"`.
  * `warehouse_dispatch_address` (Text): Dispatch location if distinct from registered office.
  * `support_email` (String): Customer contact email.
  * `support_phone` (String): Store telephone / mobile.
  * `bank_account_name` (String), `bank_name` (String), `bank_account_number` (String), `bank_ifsc` (String), `bank_branch` (String): Details printed on B2B invoices and quotations for NEFT/RTGS bank transfers.
* **Access & Visibility**: Admin edit; publicly displayed across store footer, contact page, and official accounting documents.

---

### Domain 9: Inventory Configuration (`inventory_configuration`)

* **Purpose**: Governs warehouse stock alerts, negative balance prevention, and auto-restock triggers.
* **Configurable Fields**:
  * `global_low_stock_threshold` (Integer): Fallback stock count triggering low stock badge if product-level threshold is null (Default: `5`).
  * `allow_backorders` (Boolean): Whether customers can purchase out-of-stock items (Strict default: `FALSE`).
  * `prevent_negative_inventory` (Boolean): Hardcoded invariant `TRUE`.
  * `auto_deduct_stock_at_stage` (Enum): Lifecycle stage where physical stock is decremented (`ON_ORDER_CONFIRMED` vs `ON_ORDER_PACKED`).
  * `auto_restore_stock_on_cancel` (Boolean): Default `TRUE`.
* **Access & Visibility**: Admin only.

---

### Domain 10: Commercial & General Store Configuration (`commercial_configuration`)

* **Purpose**: General e-commerce flags, operational banners, and guest access policies.
* **Configurable Fields**:
  * `guest_checkout_enabled` (Boolean): Whether unauthenticated guests can complete checkout (See Decision Log `DEC-1.5-18`).
  * `b2b_registration_auto_approved` (Boolean): Whether newly registered B2B accounts get immediate credit limits or require manual admin vetting (Default: `FALSE` - manual approval).
  * `store_status` (Enum): `OPEN`, `MAINTENANCE_MODE`, `CATALOG_ONLY_NO_CHECKOUT`.
  * `maintenance_notice` (Text, Nullable).
* **Access & Visibility**: Admin edit; store status enforced globally by middleware.

---

## 3. Configuration Ownership, Visibility, and Impact Matrix

| Domain | Entity Concept | Admin Edit RBAC | Customer Visible | Affects Checkout | Affects Invoices | Effective Dating | Snapshot Required | Audit Trail Required |
|---|---|---|---|---|---|---|---|---|
| **Tax** | `TaxConfig` | `IsAdminUser` | Rates & totals only | **YES** | **YES** | **YES** | **YES** | **MANDATORY** |
| **Discount (Product)** | `ProductDiscount` | `IsAdminUser` | Strike-through MRP & % | **YES** | **YES** | **YES** | **YES** | **MANDATORY** |
| **Discount (Order)** | `OrderDiscount` | `IsAdminUser` | Total discount line | **YES** | **YES** | **YES** | **YES** | **MANDATORY** |
| **Delivery Pricing** | `DeliveryConfig`, `DistanceSlab` | `IsAdminUser` | Calculated fee only | **YES** | **YES** | **YES** | **YES** | **MANDATORY** |
| **Billing** | `BillingConfig` | `IsAdminUser` | Currency & totals | **YES** | **YES** | **NO** (Global) | **YES** | **MANDATORY** |
| **Invoice** | `InvoiceConfig` | `IsAdminUser` | On generated PDF/view | **NO** | **YES** | **NO** (Sequence) | **YES** | **MANDATORY** |
| **Order Rules** | `OrderConfig` | `IsAdminUser` | Policies only | **YES** | **NO** | **NO** | **NO** | **MANDATORY** |
| **Payment Rails** | `PaymentConfig` | `IsAdminUser` | Active methods only | **YES** | **NO** | **NO** | **NO** | **MANDATORY** |
| **Company Profile** | `CompanyConfig` | `IsAdminUser` | Header, footer, PDF | **NO** | **YES** | **NO** | **YES** | **MANDATORY** |
| **Inventory Rules** | `InventoryConfig` | `IsAdminUser` | Stock badges only | **YES** (Stock check)| **NO** | **NO** | **NO** | **MANDATORY** |
| **Commercial Store** | `StoreConfig` | `IsAdminUser` | Store status | **YES** | **NO** | **NO** | **NO** | **MANDATORY** |

---

## 4. Configuration Lifecycle, Versioning & Historical Traceability

### 4.1 The Configuration Immutability Dilemma
If an administrator changes the statutory GST rate from 18% to 12%, or changes the delivery slab from ₹100 to ₹120, what happens to orders and invoices issued under the old tariff?

```
WRONG APPROACH (Destructive Mutable Config):
Admin updates TaxConfig(rate=12%)
  ↓
Past invoices dynamically recalculate tax
  ↓
HISTORICAL ACCOUNTING FRAUD & RECONCILIATION COLLAPSE!

CORRECT ARCHITECTURE (Point-in-Time Snapshot + Versioned Config):
Admin creates/updates TaxConfig(v2, effective_from=2026-10-01)
  ↓
New orders (>= 2026-10-01) use TaxConfig v2 (12%)
  ↓
Order #VPE-849201 created on 2026-09-24 permanently retains TaxSnapshot(rate=18%)
  ↓
HISTORICAL DATA 100% UNTOUCHED AND LEGALLY COMPLIANT.
```

### 4.2 Versioning Implementation Pattern for Phase 2
For critical financial configuration entities (`TaxConfig`, `DeliveryConfig`, `DistanceSlab`, `OrderDiscount`):
1. **Explicit Validity Windows**: Each configuration record has `effective_from` (DateTimeField) and optional `effective_until` (DateTimeField, Nullable).
2. **Current Active Lookup**: Active configuration query is strictly deterministic:
   ```sql
   WHERE is_active = TRUE 
     AND effective_from <= CURRENT_TIMESTAMP 
     AND (effective_until IS NULL OR effective_until > CURRENT_TIMESTAMP)
   ORDER BY effective_from DESC LIMIT 1
   ```
3. **Audited Edits**: Rather than updating an active row in place, major financial rate revisions can deprecate the current record (`effective_until = NOW()`, `is_active = FALSE`) and insert a new version record (`effective_from = NOW()`, `version_number = N + 1`), signed by the administrator.

---

## 5. Administrative Audit Trail Specification

Financial and pricing alterations must leave an indelible audit trail to comply with corporate financial governance and internal fraud prevention standards.

### 5.1 Audit Record Data Schema (Conceptual)
Each administrative change to any configuration entity must create an immutable log entry containing:
* `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
* `admin_user_id` (`BIGINT UNSIGNED`, FK to `User`, `ON DELETE SET NULL`): Staff member who executed the edit.
* `configuration_domain` (`VARCHAR(50)`): e.g., `'TAX'`, `'DELIVERY_SLAB'`, `'ORDER_DISCOUNT'`, `'COMPANY_PROFILE'`.
* `record_id` (`BIGINT UNSIGNED`): Primary key of the affected configuration row.
* `action_type` (`ENUM('CREATE', 'UPDATE', 'DEACTIVATE', 'DELETE')`).
* `old_value` (`JSON`, Nullable): Complete serialized JSON snapshot of the record prior to modification.
* `new_value` (`JSON`): Complete serialized JSON snapshot of the record following modification.
* `change_reason` (`TEXT`): Mandatory text justification entered by the administrator (e.g., "Updated delivery tariff as per new DTDC regional logistics agreement").
* `ip_address` (`VARCHAR(45)`, Nullable): Client IP address of the administrative session.
* `created_at` (`DATETIME DEFAULT CURRENT_TIMESTAMP`): Immutable audit timestamp.

---

## 6. Delivery Rule Precedence Engine

When calculating the delivery charge for a checkout cart, multiple overlapping rules might apply. The calculation engine resolves shipping using a strict five-tier precedence hierarchy.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      DELIVERY PRECEDENCE ENGINE                        │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 1: Explicit Order / Customer Promotional Override                 │
│         (e.g., Free Shipping Coupon, B2B Contract VIP Exemption)       │
│         → If matches, delivery fee = 0.00 / override rate              │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 2: Free Delivery Threshold Evaluation                             │
│         (e.g., Subtotal >= Configured Free Shipping Threshold)         │
│         → If qualified and zone eligible, delivery fee = 0.00          │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 3: Zone / Pincode Specific Override                               │
│         (e.g., Local Coimbatore Intra-City Flat Rate)                  │
│         → If destination PIN belongs to specific zone, apply zone fee  │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 4: Configured Distance Slab Engine                                │
│         (Calculated radial distance from Coimbatore origin)            │
│         → base_charge + ceil((distance - slab) / slab) * slab_charge   │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 5: Regional / State Flat Rate Fallback                            │
│         (e.g., Tamil Nadu ₹50, Maharashtra ₹150, Delhi ₹200)           │
│         → Used when destination PIN distance cannot be resolved       │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 6: Global Default Delivery Fee                                    │
│         (Provisional fallback rate: ₹100.00)                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Configuration Anti-Patterns Explicitly Prohibited

1. **The "Settings JSON Bag" Anti-Pattern**: Creating a single `settings` table with a key-value `{"everything": "json"}` column. This bypasses database typing, nullability checks, constraint enforcement, and indexed queries.
2. **Hardcoded Mathematical Constants**: Writing expressions like `subtotal * 0.18` or `subtotal >= 999` directly in Python views or serializers.
3. **In-Place Mutation of Financial Rules without Audit**: Updating a live tax or shipping rate without logging who modified it, when, and why.
4. **Retroactive Calculation on Historical Records**: Computing past invoice totals dynamically on-the-fly by querying current configuration.
