# Vee Electricals — Database Configuration Schema & Versioning Architecture (Phase 2)

## 1. Configuration Domain Separation & Consolidation Architecture

Commercial parameters across **Vee Power Electricals** are not static. Tax rates, shipping tariffs, distance steps, discount rules, and company metadata evolve over time. To ensure optimal database design:
* **Dedicated Versioned Tables for Financial & Logistics Rules**: Domains with high statutory impact, temporal lifecycles, and multi-record hierarchies (`tax_configurations`, `delivery_configurations`, `distance_slabs`, `order_discounts`) are isolated into dedicated, typed relational tables with versioning and effective dating.
* **Consolidated Singleton Table for Company Profile & Store Policies (`company_store_configurations`)**: Creating 5 separate 1-row tables for Company Profile, Currency, Order Policies, Payment Rail Toggles, and Maintenance Flags introduces unnecessary fragmentation and multiple joins. These are consolidated into a single master profile record.
* **Strict Rejection of "Settings JSON Bags"**: Monolithic `{"settings": "..."}` key-value blobs are strictly prohibited. Every configuration parameter possesses strict SQL data typing, check constraints, and indexed lookups.

---

## 2. Configuration Domains & Table Specifications

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COMMERCIAL CONFIGURATION TABLES                       │
├─────────────────────────────┬───────────────────────────────────────────────┤
│ 1. `tax_configurations`     │ Statutory GST rates, intra/inter split, modes │
│ 2. `delivery_configurations`│ Origin coordinates, base fee, slab step, free │
│ 3. `distance_slabs`         │ Granular distance intervals & rate steps      │
│ 4. `shipping_rules`         │ Tier 5 regional state shipping flat fallbacks │
│ 5. `order_discounts`        │ Promo coupon codes, caps, validity windows    │
│ 6. `company_store_configurations` │ Master legal profile, bank info & store flags │
│ 7. `admin_config_audit_logs`     │ Append-only audit log of all rule changes     │
└─────────────────────────────┴───────────────────────────────────────────────┘
```

### 2.1 Tax Configuration Architecture (`tax_configurations`)
* **Purpose**: Governs statutory Indian GST rates, intra-state (CGST + SGST) vs inter-state (IGST) taxation, and tax calculation modes.
* **Versioning**: Incorporates `effective_from`, `effective_until`, `version_number`, and `is_active`.
* **Provisional Seed Baseline**: 18.00% total GST (CGST 9.00% + SGST 9.00% for intra-state Tamil Nadu; IGST 18.00% for outside Tamil Nadu).
* **Tax Modes Supported**:
  * `TAX_EXCLUSIVE`: Prices are net; 18% GST added at checkout (development seed).
  * `TAX_INCLUSIVE`: Prices include GST; tax is extracted backwards for invoice reporting.
* **Resolution Query**:
  ```sql
  SELECT * FROM tax_configurations
  WHERE is_active = 1
    AND effective_from <= NOW()
    AND (effective_until IS NULL OR effective_until > NOW())
  ORDER BY effective_from DESC, version_number DESC
  LIMIT 1;
  ```

---

### 2.2 Delivery Pricing Engine (`delivery_configurations` & `distance_slabs`)
* **Purpose**: Replaces static delivery fees with a configurable distance and regional pricing engine.
* **Dispatch Origin Hub**:
  * Configurable in `delivery_configurations`. Initially seeded as **Coimbatore, Tamil Nadu (PIN: 641031)**.
  * Coordinates: `11.084800, 76.941600`.
* **Distance Slabs Engine**:
  * Base Charge: `₹100.00` (Covers initial slab).
  * Slab Step: `10.00 km`.
  * Additional Charge per Slab: `₹100.00`.
* **Discrete Slabs Representation (`distance_slabs`)**:
  * Continuous half-open interval convention: `[min_distance_km, max_distance_km)`
  * `0.00 <= distance < 10.00 km` (min: `0.00`, max: `10.00`) $\rightarrow$ `₹100.00` (Sort Order 1)
  * `10.00 <= distance < 20.00 km` (min: `10.00`, max: `20.00`) $\rightarrow$ `₹200.00` (Sort Order 2)
  * `20.00 <= distance < 30.00 km` (min: `20.00`, max: `30.00`) $\rightarrow$ `₹300.00` (Sort Order 3)
  * `30.00 <= distance < 40.00 km` (min: `30.00`, max: `40.00`) $\rightarrow$ `₹400.00` (Sort Order 4)
  * `40.00 <= distance < 50.00 km` (min: `40.00`, max: `50.00`) $\rightarrow$ `₹500.00` (Sort Order 5)
  * Distances $\ge 50.00\text{ km}$ fall back to `fallback_regional_rate` (`₹100.00`) or state rate in `shipping_rules`.
* **Free Delivery Threshold**: Configurable in `delivery_configurations.free_delivery_threshold` (Seeded at `₹999.00`).
* **Slab Resolution Algorithm**:
  ```sql
  SELECT rate FROM distance_slabs
  WHERE delivery_config_id = ?
    AND is_active = 1
    AND ? >= min_distance_km
    AND ? < max_distance_km
  ORDER BY sort_order ASC
  LIMIT 1;
  ```

---

### 2.3 Regional Fallback Shipping (`shipping_rules`)
* **Purpose**: Provides Tier 5 fallback rates when destination distance cannot be geocoded (e.g. remote rural PIN codes or geocoding API outages).
* **Initial Seed Rates**:
  * Tamil Nadu: `₹50.00`
  * Karnataka / Kerala: `₹80.00`
  * Maharashtra: `₹100.00`
  * Delhi / Northern States: `₹150.00`

---

### 2.4 Order Discounts & Coupons (`order_discounts`)
* **Purpose**: Governs cart-level promotional coupons with qualification thresholds and maximum discount ceilings.
* **Coupon Attributes**:
  * `code`: Unique uppercase alphanumeric promo code (e.g., `POWER10`, `WELCOME500`).
  * `discount_type`: `percentage` (e.g., 10%) vs `fixed` (e.g., ₹500).
  * `discount_value`: Amount or percentage.
  * `min_order_value`: Minimum cart subtotal required to qualify.
  * `max_discount_cap`: Upper ceiling for percentage discounts (prevents excessive markdowns on large orders).
  * `allow_stacking`: Boolean flag controlling whether coupon can be combined with items having existing product-level promotional markdowns.
  * `usage_limit_total` and `usage_limit_per_user`: Redemptions caps.

---

### 2.5 Consolidated Master Configuration (`company_store_configurations`)
* **Purpose**: Consolidates company legal coordinates, banking coordinates, fulfillment policies, payment rails, and general store flags into a single master row (`id = 1`).
* **Domains Consolidated**:
  1. **Legal Company Profile**: `legal_company_name`, `brand_name`, `gstin`, `pan`, `registered_address`, `warehouse_address`, `support_email`, `support_phone`.
  2. **Banking Coordinates**: `bank_name`, `bank_account_number`, `bank_ifsc`, `bank_branch` (printed on B2B invoices and quotations for NEFT/RTGS wire transfers).
  3. **Billing Policies**: `currency_code` (`'INR'`), `currency_symbol` (`'₹'`), `rounding_mode` (`'ROUND_HALF_UP'`).
  4. **Fulfillment Policies**: `auto_cancel_unpaid_minutes` (`30`), `cancellation_allowed_until` (`'CONFIRMED'`), `return_window_days` (`7`), `require_shipping_awb` (`1`).
  5. **Payment Rail Toggles**: `upi_enabled`, `cards_enabled`, `netbanking_enabled`, `cod_enabled`, `cod_max_limit` (`10000.00`).
  6. **Store Operation Flags**: `guest_checkout_enabled` (`0`), `is_maintenance_mode` (`0`), `maintenance_notice`.

---

## 3. Configuration Temporal Validity & Versioning Workflow

When an administrator edits a versioned configuration entity (such as updating GST from 18% to 12%):

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CONFIGURATION VERSIONING WORKFLOW                    │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Current Active Record:                                              │
│    TaxConfig(v1, rate=18%, effective_from=2026-01-01, effective_until=NULL)│
├────────────────────────────────────────────────────────────────────────┤
│ 2. Admin Publishes Revision (Effective 2026-10-01):                    │
│    Step A: Update v1 -> `effective_until = '2026-10-01 00:00:00'`      │
│    Step B: Insert v2 -> `TaxConfig(v2, rate=12%,                       │
│                         effective_from='2026-10-01 00:00:00',          │
│                         effective_until=NULL, is_active=1)`            │
│    Step C: Append to `admin_config_audit_logs`                         │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Runtime Resolution:                                                 │
│    - Orders placed on 2026-09-25 resolve v1 (18%)                      │
│    - Orders placed on 2026-10-02 resolve v2 (12%)                      │
│    - Past historical orders NEVER recalculate                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Administrative Configuration Audit Log (`admin_config_audit_logs`)

All administrative edits to any configuration domain create an immutable record containing:
* `admin_user_id`: Foreign key to `users(id)` of the acting staff member.
* `domain`: Affected domain string (`TAX`, `DELIVERY`, `DISCOUNT`, `COMPANY_STORE`).
* `record_id`: Primary key of affected row.
* `action_type`: `CREATE`, `UPDATE`, `DEACTIVATE`.
* `old_value`: Full JSON serialization of record prior to edit.
* `new_value`: Full JSON serialization of record after edit.
* `change_reason`: Mandatory text justification entered in admin modal.
* `ip_address`: Administrative client IP address.
* `created_at`: Microsecond-precision timestamp.
* **Security & Compliance**: The table is strictly **insert-only**. No `UPDATE` or `DELETE` grants exist on this table for standard application users.
