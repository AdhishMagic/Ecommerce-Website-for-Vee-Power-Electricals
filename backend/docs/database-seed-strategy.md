# Vee Electricals — Database Seed Data Strategy & Development Fixtures (Phase 2)

## 1. Overview & Seed Philosophy

To ensure immediate local development productivity while preventing untested seed values from leaking into production, this document formalizes the **Seed Data Strategy**.

### 1.1 Strict Boundary: Development Default vs Production Business Value
Every seed record is explicitly classified into one of two operational tiers:
* **[DEV SEED] Development Default**: Provisional baseline data injected into local Docker/development environments to allow testing of UI interactions, cart checkout, and admin screens. These values are **not** legally or commercially binding.
* **[PROD GOV] Production Business Value**: Certified corporate data (statutory GSTIN, legal bank accounts, negotiated logistics tariffs, approved free-shipping thresholds) configured by authorized business executives before commercial launch.

---

## 2. Master Development Seed Specifications

### 2.1 Initial Administrative & Test Users (`users`)
* **Environment**: Local Development Only.
* **Security Rule**: Real production passwords and API keys are **never** committed to version control or seed fixtures. Development passwords use standard Django test hashes.

| User Account | Email | Role | Flags | Development Credentials Note | Tier |
|---|---|---|---|---|---|
| **Super Admin** | `admin@veepower.in` | `admin` | `is_staff=1`, `is_superuser=1` | Seeded via environment variables (`DJANGO_SUPERUSER_EMAIL` / `PASSWORD`) | `[DEV SEED]` |
| **Sales Staff** | `sales@veepower.in` | `admin` | `is_staff=1`, `is_superuser=0` | Seeded with temporary password for testing admin orders/quotes | `[DEV SEED]` |
| **Test Retail Customer** | `rajesh.kumar@example.com` | `customer` | `is_staff=0`, `is_superuser=0` | Pre-seeded with saved delivery address in Coimbatore for checkout testing | `[DEV SEED]` |

---

### 2.2 Commercial Tax Configuration (`tax_configurations`)

| Configuration Field | Development Seed Value | Production Status | Business Governance Note |
|---|---|---|---|
| `tax_name` | `'Indian Standard GST (Electrical Goods)'` | Approved Baseline | Statutory classification |
| `default_tax_rate` | `18.00%` | **[DEV SEED] Initial Baseline** | Subject to GST Council statutory revisions |
| `cgst_rate` | `9.00%` | **[DEV SEED] Initial Baseline** | 50% share of intra-state GST |
| `sgst_rate` | `9.00%` | **[DEV SEED] Initial Baseline** | 50% share of intra-state GST |
| `igst_rate` | `18.00%` | **[DEV SEED] Initial Baseline** | 100% share of inter-state GST |
| `tax_calculation_mode` | `'TAX_EXCLUSIVE'` | **[PROD GOV] Pending Confirmation** | Defaulted to match `Checkout.tsx`; pending executive choice |
| `business_state` | `'Tamil Nadu'` | Approved Baseline | Legal origin of Vee Power Electricals |
| `effective_from` | `'2026-01-01 00:00:00'` | Active Baseline | Validity start |
| `version_number` | `1` | Initial Version | Monotonic version counter |
| `is_active` | `1` | Active | Operational toggle |

---

### 2.3 Delivery Configuration & Distance Slabs (`delivery_configurations` & `distance_slabs`)

#### Delivery Configuration Master Seed
| Configuration Field | Development Seed Value | Production Status | Business Governance Note |
|---|---|---|---|
| `origin_name` | `'Vee Power Coimbatore Hub'` | Approved Baseline | Physical warehouse hub |
| `origin_address` | `'No 28/1, 2nd floor, MTP Road, NSN palayam'` | Approved Baseline | Warehouse address from `companyInfo.ts` |
| `origin_city` | `'Coimbatore'` | Approved Baseline | Commercial origin city |
| `origin_state` | `'Tamil Nadu'` | Approved Baseline | Origin state |
| `origin_pincode` | `'641031'` | Approved Baseline | Origin warehouse PIN code |
| `latitude`, `longitude` | `11.084800, 76.941600` | Approved Baseline | MTP Road warehouse coordinates |
| `base_delivery_charge`| `₹100.00` | **[DEV SEED] Provisional Tariff** | To be updated per negotiated courier contract |
| `distance_slab_km` | `10.00 km` | **[DEV SEED] Provisional Tariff** | Step interval |
| `charge_per_slab` | `₹100.00` | **[DEV SEED] Provisional Tariff** | Additional fee per 10 km step |
| `free_delivery_threshold`| `₹999.00` | **[DEV SEED] Pending Sign-Off** | Reconciled dev seed; pending executive confirmation |
| `fallback_regional_rate` | `₹100.00` | **[DEV SEED] Provisional Tariff** | Flat rate when distance geocoding fails |
| `free_delivery_enabled` | `1` | Active Baseline | Enabled |

#### Distance Slabs Fixture Matrix (`distance_slabs`)
* **Interval Convention**: Continuous half-open intervals `[min_distance_km, max_distance_km)` evaluated as `distance >= min_distance_km AND distance < max_distance_km`.

| Slab ID | Min Distance (km) [$\ge$] | Max Distance (km) [$<$] | Rate (₹) | Sort Order | Classification |
|---|---|---|---|---|---|
| Slab 1 | `0.00` | `10.00` | `₹100.00` | 1 | `[DEV SEED]` (Provisional) |
| Slab 2 | `10.00` | `20.00` | `₹200.00` | 2 | `[DEV SEED]` (Provisional) |
| Slab 3 | `20.00` | `30.00` | `₹300.00` | 3 | `[DEV SEED]` (Provisional) |
| Slab 4 | `30.00` | `40.00` | `₹400.00` | 4 | `[DEV SEED]` (Provisional) |
| Slab 5 | `40.00` | `50.00` | `₹500.00` | 5 | `[DEV SEED]` (Provisional) |

---

### 2.4 State Fallback Shipping Rules (`shipping_rules`)
* **Purpose**: Fallback rates for regional state shipping when distance geocoding is unavailable.

| State Name | Fallback Cost (₹) | Min Days | Max Days | Classification |
|---|---|---|---|---|
| **Tamil Nadu** | `₹50.00` | 1 | 3 | `[DEV SEED]` |
| **Karnataka** | `₹80.00` | 2 | 4 | `[DEV SEED]` |
| **Kerala** | `₹80.00` | 2 | 4 | `[DEV SEED]` |
| **Andhra Pradesh / Telangana** | `₹90.00` | 2 | 5 | `[DEV SEED]` |
| **Maharashtra** | `₹100.00` | 3 | 5 | `[DEV SEED]` |
| **Delhi / NCR** | `₹150.00` | 4 | 7 | `[DEV SEED]` |

---

### 2.5 Promotional Order Discounts (`order_discounts`)
* **Purpose**: Test coupon codes seeded to validate checkout coupon verification.

| Coupon Code | Type | Value | Min Cart (₹) | Max Cap (₹) | Stacking Allowed | Status |
|---|---|---|---|---|---|---|
| `WELCOME10` | `percentage` | `10.00%` | `₹1,000.00` | `₹500.00` | `0` (No stacking) | `[DEV SEED]` |
| `VEE500` | `fixed` | `₹500.00` | `₹5,000.00` | `NULL` | `0` (No stacking) | `[DEV SEED]` |

---

### 2.6 Master Company & Store Configuration (`company_store_configurations`)
* **Purpose**: Master singleton record (`id = 1`) seeded on database setup.

| Field Name | Seed Value | Classification |
|---|---|---|
| `legal_company_name` | `'Vee Power Electricals'` | `[PROD GOV]` |
| `brand_name` | `'Vee Power Electricals'` | `[PROD GOV]` |
| `gstin` | `'33AABFV1234A1ZX'` (Provisional format) | `[DEV SEED]` (Replace with statutory GSTIN) |
| `pan` | `'AABFV1234A'` | `[DEV SEED]` (Replace with statutory PAN) |
| `registered_address` | `'No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031'` | `[PROD GOV]` |
| `warehouse_address` | `'No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore - 641031'` | `[PROD GOV]` |
| `support_email` | `'support@veepower.in'` | `[PROD GOV]` |
| `support_phone` | `'+91 98765 43210'` | `[PROD GOV]` |
| `bank_name` | `'State Bank of India'` | `[DEV SEED]` (Replace with live current account) |
| `bank_account_number`| `'38492019482'` | `[DEV SEED]` |
| `bank_ifsc` | `'SBIN0001234'` | `[DEV SEED]` |
| `bank_branch` | `'Coimbatore Main Branch'` | `[DEV SEED]` |
| `currency_code` | `'INR'` | `[PROD GOV]` |
| `currency_symbol` | `'₹'` | `[PROD GOV]` |
| `rounding_mode` | `'ROUND_HALF_UP'` | `[PROD GOV]` |
| `auto_cancel_unpaid_minutes`| `30` | `[DEV SEED]` |
| `cancellation_allowed_until`| `'CONFIRMED'` | `[DEV SEED]` |
| `return_window_days`| `7` | `[DEV SEED]` |
| `require_shipping_awb`| `1` | `[DEV SEED]` |
| `upi_enabled`, `cards_enabled`, `netbanking_enabled`, `cod_enabled` | `1, 1, 1, 1` | `[DEV SEED]` |
| `cod_max_limit` | `10000.00` | `[DEV SEED]` |
| `guest_checkout_enabled`| `0` | `[DEV SEED]` |

---

### 2.7 Catalog Merchandise Seed Roster (Categories, Brands, Products)
* **Categories**: 6 Core categories (Fans, Wires & Cables, Modular Switches, LED Lighting, MCB & Distribution, Industrial Accessories).
* **Brands**: 8 Industry manufacturers (Havells, Polycab, Finolex, Philips, Legrand, Anchor, Schneider Electric, Crompton).
* **Initial Products**: 20+ representative electrical merchandise items matching `frontend/src/data/mock/products.ts` with genuine technical specifications and stock counts.
* **B2B Clients**: 5 Corporate contractor accounts (L&T Construction, Reliance Retail, Tata Projects, Shapoorji Pallonji, Godrej Properties) matching `frontend/src/pages/admin/Clients.tsx`.

---

## 3. Seed Execution Mechanism for Phase 3

In Phase 3, seeding will be executed using an idempotent Django custom management command:
```bash
python manage.py seed_development_data
```
The command:
1. Wraps execution in an atomic database transaction (`transaction.atomic`).
2. Checks whether data already exists (using `get_or_create` with SKU / slug / code lookups).
3. Safely populates development test records without duplicating rows or wiping existing data.
4. Generates a clear command-line summary of seeded entities.
