# Configuration Domain Architecture & Specification

## 1. Overview & Architecture

The **Configuration Domain** (`commercial_config`) provides centralized, auditable, historically safe, and strictly server-authoritative business rules for Vee Power Electricals. It eliminates hardcoded rates, delivery fees, and discount ceilings from client code and backend business logic.

### Key Architectural Tenets:
- **Server Authoritative**: All financial calculations (GST breakdown, delivery tariffs, coupons) execute exclusively in backend services (`TaxService`, `DeliveryService`, `DiscountService`, `BillingService`). Frontend clients never submit calculated tax or shipping overrides.
- **Historical Transaction Isolation**: Financial transactions (`Order`, `OrderItem`, `TaxInvoice`, `InvoiceItem`, `Quotation`, `QuotationItem`) persist immutable JSON calculation snapshots (`calculation_snapshot`) and monetary column values at creation time. Subsequent configuration mutations never mutate historical records.
- **Effective-Dated Temporal Versioning**: Configurations (such as `TaxConfiguration` and `DeliveryConfiguration`) support temporal activation windows (`effective_from` and `effective_until`). Query operations accept target dates to evaluate past, present, or future scheduled policies without overlapping conflicts.
- **Continuous Half-Open Distance Slabs**: Distance slabs operate on strict `[min_km, max_km)` intervals, guaranteeing deterministic lookup without boundary ambiguity.
- **Immutable Security-Sanitized Audit Trail**: Every administrative write or mutation triggers an `AdminConfigAuditLog` entry, automatically stripping credentials, passwords, JWT tokens, and gateway secrets.

---

## 2. Configuration Subsystems

### 2.1 Company / Store Configuration (`CompanyStoreConfiguration`)
Represents the statutory identity of Vee Power Electricals.
- **Singleton Pattern**: Exactly one active configuration row is permitted. Invocations of `clean()` and `save()` enforce database integrity by raising validation errors if a second instance is attempted.
- **Statutory Fields**:
  - `company_name`, `legal_name`, `address_line1`, `city`, `state`, `pincode`, `phone_number`, `email`, `pan_number`.
  - `gstin`: Validated against statutory 15-character format (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`), matching PAN digits (chars 3–12).
  - Default currency is INR (`₹`), operational status is tracked via `is_active`.

### 2.2 Tax Configuration (`TaxConfiguration`)
Governs GST statutory calculations.
- **Tax Modes**: Inclusive vs. Exclusive.
- **GST Split Rules**:
  - **Intra-State**: Applicable when origin state matches destination state (Tamil Nadu → Tamil Nadu). Evaluates statutory split: `CGST (9%) + SGST (9%) = 18%`.
  - **Inter-State**: Applicable when origin state differs from destination state (Tamil Nadu → Kerala / Karnataka). Evaluates `IGST (18%)`.
- **Effective Dating & Overlap Prevention**:
  - `clean()` enforces `effective_until > effective_from`.
  - Temporal query prevents two active tax configurations from overlapping within the same date range.

### 2.3 Delivery Configuration (`DeliveryConfiguration`)
Governs freight, dispatch tariffs, and free shipping qualifications.
- **Base Delivery Charge**: Applied when distance slab or regional rules do not supersede.
- **Free Delivery Threshold**: Minimum order subtotal qualifying the order for free standard shipping (e.g., ₹5,000.00).
- **Default Origin State**: Default origin for distance and tax calculations (e.g., "Tamil Nadu").

### 2.4 Distance Slabs (`DistanceSlab`)
Canonical distance-based tariff calculation.
- **Interval Format**: `[min_km, max_km)` — Minimum inclusive, maximum exclusive.
- **Boundary Verification**:
  - Distance `9.99 km` matches slab `[0.00, 10.00)`.
  - Distance `10.00 km` transitions to slab `[10.00, 20.00)`.
  - Distance `19.99 km` matches slab `[10.00, 20.00)`.
  - Distance `20.00 km` transitions to slab `[20.00, 30.00)`.
- **Overlap Prevention**: Enforced via model `clean()` and serializer validation ensuring no two active slabs for the same delivery configuration overlap.

### 2.5 Shipping Rules (`ShippingRule`)
State-level and regional flat rate fallbacks.
- Priority-ordered rule evaluation.
- Deterministic fallback when distance calculations are unavailable.

### 2.6 Order Discounts & Coupons (`OrderDiscount`)
Promotional campaign and coupon code management.
- **Types**: Percentage discount (`PERCENTAGE`) or Flat amount discount (`FIXED`).
- **Validation**:
  - Non-negative amounts.
  - Percentage capped at 100%.
  - `valid_until > valid_from`.
  - Minimum order subtotal requirement (`min_order_amount`).
  - Maximum discount cap (`max_discount_amount`).
- **Combined Discount Guard**: Combined order discounts are capped at **50%** of the order subtotal to preserve commercial margins.

### 2.7 Configuration Audit Trail (`AdminConfigAuditLog`)
Tracks administrative actions and adjustments.
- **Logged Attributes**: `config_type`, `config_id`, `action` (CREATE, UPDATE, DELETE, DEACTIVATE), `actor` (User), `previous_state`, `new_state`, `ip_address`, `timestamp`.
- **Sanitization Engine**: `sanitize_audit_payload` automatically scrubs:
  - `password`, `secret`, `token`, `jwt`, `api_key`, `access_token`, `refresh_token`, `authorization`.
- **Immutability**: Read-only via API (`AdminConfigAuditLogViewSet`). Ordinary users and retail customers have no access. Normal users cannot delete logs.

---

## 3. RBAC & Security Matrix

| Endpoint / Operation | Anonymous | Retail Customer | Staff User | Superadmin / Admin |
|:---|:---:|:---:|:---:|:---:|
| **Public Store Config** (`/api/v1/config/company/public/`) | Read-Only | Read-Only | Read-Only | Read-Only |
| **Admin Store Config** (`/api/v1/config/company/`) | 401 | 403 | 403 | Full Access |
| **Tax Configurations** (`/api/v1/config/taxes/`) | 401 | 403 | 403 | Full Access |
| **Delivery Configurations** (`/api/v1/config/delivery/`) | 401 | 403 | 403 | Full Access |
| **Distance Slabs** (`/api/v1/config/distance-slabs/`) | 401 | 403 | 403 | Full Access |
| **Shipping Rules** (`/api/v1/config/shipping-rules/`) | 401 | 403 | 403 | Full Access |
| **Discounts / Coupons** (`/api/v1/config/discounts/`) | 401 | 403 | 403 | Full Access |
| **Admin Audit Logs** (`/api/v1/config/audit-logs/`) | 401 | 403 | 403 | Read-Only |

---

## 4. API Reference

All configuration endpoints reside under `/api/v1/config/`:

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---|
| `GET` | `/api/v1/config/company/public/` | Public store contact & identity details | No |
| `GET`, `PUT`, `PATCH` | `/api/v1/config/company/` | Admin company settings & statutory PAN/GSTIN | Admin |
| `GET`, `POST` | `/api/v1/config/taxes/` | List and create tax configurations | Admin |
| `GET`, `PUT`, `PATCH` | `/api/v1/config/taxes/{id}/` | Retrieve and update tax configuration | Admin |
| `GET`, `POST` | `/api/v1/config/delivery/` | List and create delivery configurations | Admin |
| `GET`, `PUT`, `PATCH` | `/api/v1/config/delivery/{id}/` | Retrieve and update delivery configuration | Admin |
| `GET`, `POST` | `/api/v1/config/distance-slabs/` | List and create distance slabs | Admin |
| `GET`, `PUT`, `PATCH` | `/api/v1/config/distance-slabs/{id}/` | Retrieve and update distance slab | Admin |
| `GET`, `POST` | `/api/v1/config/shipping-rules/` | List and create regional shipping rules | Admin |
| `GET`, `PUT`, `PATCH` | `/api/v1/config/shipping-rules/{id}/` | Retrieve and update regional shipping rule | Admin |
| `GET`, `POST` | `/api/v1/config/discounts/` | List and create discount campaigns | Admin |
| `GET`, `PUT`, `PATCH` | `/api/v1/config/discounts/{id}/` | Retrieve and update discount campaign | Admin |
| `GET` | `/api/v1/config/audit-logs/` | Query immutable administrative audit records | Admin |

---

## 5. Implementation Status

### IMPLEMENTED
- [x] Singleton `CompanyStoreConfiguration` with statutory GSTIN regex and PAN segment validation.
- [x] Statutory GST intra-state (`CGST + SGST`) and inter-state (`IGST`) computation in `TaxService`.
- [x] Non-overlapping effective dates for `TaxConfiguration` and `DeliveryConfiguration`.
- [x] Temporal lookup supporting past, present, and scheduled effective dates.
- [x] Canonical half-open distance slab tariffs `[min_km, max_km)` with exact boundary handling.
- [x] Slabs overlap prevention on creation/update.
- [x] Deterministic regional shipping rule fallbacks.
- [x] Promotional coupons with minimum order amount, maximum cap, and statutory 50% discount ceiling.
- [x] Immutable `AdminConfigAuditLog` recording actor, type, previous and new state values.
- [x] Automatic credential and secret redaction in audit payloads (`password`, `secret`, `token`, `jwt`, `api_key`).
- [x] Historical transaction isolation: mutations to configuration never alter past orders, invoices, or quotations.
- [x] Complete test suite (`tests/test_step11_configuration.py`) with 24/24 passing scenarios.
- [x] Full backend regression (413/413 tests passing).
- [x] Full Playwright regression (31/31 passed) and integration test suite (17/17 passed).
- [x] Comprehensive audit script (32/32 passed).

### DEFERRED
- Automated multi-currency real-time exchange rate sync (currently fixed to INR / ₹ as per business requirements).
- Geographic polygon / GeoJSON boundary matching for shipping tariffs (distance slabs + state rules currently handle all delivery zones).

### KNOWN LIMITATIONS
- Single active company profile supported by design; multi-tenant store switching is out of scope for this single-vendor deployment.
- Tax configuration edits require explicit effective-until termination before a new active configuration for the same period can be created.
