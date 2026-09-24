# Vee Electricals — Phase 1.5 Master Business Rule, Configuration & Schema Reconciliation Report

## 1. Executive Summary & Context

### 1.1 Purpose of Phase 1.5
Phase 1 established the initial data blueprint, entity relationships, and frontend mappings for **Vee Power Electricals**. However, inspecting the codebase revealed critical contradictions, underspecified commercial mechanisms, hardcoded frontend mock calculations, and missing administrative controls.

Crucially, corporate management confirmed that **commercial parameters are not permanently fixed**. Statutory tax rates, delivery tariffs, distance steps, discount rules, and free-shipping thresholds will evolve over the life of the enterprise.

**Phase 1.5 is a pure design and architectural reconciliation phase.** No Django models, MySQL tables, migrations, APIs, or React UI modifications have been implemented. Instead, Phase 1.5 resolves every contradiction, eliminates hardcoded assumptions, introduces a domain-separated configuration engine, and guarantees that future configuration edits can **never corrupt historical accounting records**.

---

## 2. Primary Business Principle: Controlled Commercial Adaptability

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CORE COMMERCIAL ARCHITECTURE PRINCIPLE               │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Zero Hardcoding: No commercial rates hardcoded in logic or schema   │
│ 2. Separated Domains: 10 typed configuration domains (No JSON bags)    │
│ 3. Forward-Only Effect: Configuration changes apply ONLY forward       │
│ 4. Historical Snapshots: Orders & Invoices freeze point-in-time rates   │
│ 5. Indelible Audit Trail: All admin edits logged with justification    │
│ 6. Strict Role Separation: Admin-only write; customer public read-only  │
└────────────────────────────────────────────────────────────────────────┘
```

The system establishes a clean four-way boundary:
* **Fixed System Rules**: Software invariants (e.g. `price <= mrp`, `stock >= 0`, email uniqueness, password hashing).
* **Configurable Business Rules**: Commercial parameters editable by administrators (e.g. GST rates, delivery slabs, coupons, thresholds).
* **Derived / Calculated Values**: Mathematical pipeline outputs (e.g. line subtotals, CGST/SGST shares, delivery fees, gross totals).
* **Pending Business Decisions**: Choices requiring executive confirmation before production launch (e.g. tax-inclusive catalog marketing, production logistics contract rates).

---

## 3. Reconciliation of Confirmed Business Inputs

| Business Input | Clarified Commercial Requirement | Phase 1.5 Architectural Resolution | Configuration Domain |
|---|---|---|---|
| **A & B. Tax Calculation & 18% GST** | Tax calculation is required; initial discussed rate is 18% GST. | 18% is treated as a **provisional development default seed**, NOT an invariant constant. Configurable intra/inter-state tax engine designed. | `TaxConfiguration` |
| **C. Admin-Editable Tax** | GST/tax configuration must be editable from the admin panel. | Admin API and UI controls specified with effective dates and audit logging. | `TaxConfiguration` |
| **D. Product Discounts** | Product-specific discounts are required. | Defined distinction between catalog `price` (regular selling price) and time-bound promotional markdowns with double-discount prevention. | `DiscountConfiguration` |
| **E. Order Discounts** | Overall/order-level discounts are required. | Promo codes/coupons with minimum order thresholds, maximum caps, and sequential stacking policy. | `DiscountConfiguration` |
| **F, G, H. Delivery Pricing & Coimbatore Origin** | Delivery charges required; depends on distance from Coimbatore; must be customizable from admin. | Replaced static flat shipping with distance-slab engine. Warehouse dispatch hub at Coimbatore (`641031`) is configurable. | `DeliveryConfiguration`, `DistanceSlab` |
| **I. Unknown Business Values** | Commercial values currently unknown must NOT be hardcoded. | Seeded with provisional test defaults, fully configurable via database/admin. | All Domains |
| **J & K. Historical Integrity** | Configuration changes must never corrupt historical accounting data. | Orders and Invoices capture immutable point-in-time calculation snapshots (`calculation_snapshot`). | Financial Engine |

---

## 4. Reconciliation of the Seven Phase 1 Ambiguities

### Ambiguity 1: Order Status Lifecycle Discrepancies
* **Current Evidence**:
  * `frontend/src/types/order.ts`: `'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'`
  * `frontend/src/context/ShopContext.tsx`: `'pending' | 'processing' | 'shipped' | 'delivered'`
  * `frontend/src/pages/admin/Orders.tsx`: `'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Return Approved' | 'Return Completed' | 'Cancelled'`
  * `frontend/src/pages/customer/Account.tsx`: Handles `Delivered`, `Shipped`, `Processing`, `Pending`, `Confirmed`, `Packed`, `Cancelled`.
* **Conflict**: `Processing` in consumer views conflates warehouse confirmation and item packaging. RMA return states exist in admin but are missing in core types.
* **Confirmed Requirement**: Standardize on a formal warehouse and e-commerce state machine.
* **Proposed Architecture**: Adopt canonical 10-state FSM: `PENDING`, `CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURN_REQUESTED`, `RETURN_APPROVED`, `RETURN_REJECTED`, `RETURN_COMPLETED`. (See `order-state-machine.md`).
* **Business Decision Required**: None; technical FSM resolves all states.
* **Implementation Impact**: Single source of truth in backend models; clean UI status mapping.
* **Phase 2 Dependency**: `Order.status` field choices and state transition validator.

---

### Ambiguity 2: Free Shipping Threshold Inconsistency
* **Current Evidence**:
  * `frontend/src/pages/customer/Checkout.tsx`: Hardcodes `subtotal >= 999 ? 0 : 99`.
  * `frontend/src/pages/admin/Shipping.tsx`: Uses `freeShippingThreshold = 3999`.
* **Conflict**: Customer checkout grants free delivery at ₹999, while administrator panel configures ₹3,999.
* **Confirmed Requirement**: Free delivery threshold must be an admin-configurable parameter.
* **Proposed Architecture**: Decouple threshold completely from application code into `DeliveryConfiguration.free_delivery_threshold`. Seed development database with `₹999.00` with instant admin UI editability.
* **Business Decision Required**: Business confirmation of final production threshold.
* **Implementation Impact**: DRF delivery service queries active configuration row.
* **Phase 2 Dependency**: `DeliveryConfiguration` entity in Phase 2 data model.

---

### Ambiguity 3: Tax Inclusivity vs Exclusivity Conflict
* **Current Evidence**:
  * `frontend/src/pages/customer/ProductDetail.tsx` (Line 87): "Price inclusive of all taxes".
  * `frontend/src/pages/customer/Checkout.tsx` (Lines 48–49): Adds 18% tax on top (`total = subtotal + shipping + tax`).
  * `frontend/src/components/admin/GenerateInvoiceModal.tsx`: Adds `taxPercent: 18` on top.
* **Conflict**: Product page promises tax-inclusive pricing, but Checkout adds 18% extra at payment.
* **Confirmed Requirement**: Tax calculation is mandatory; must support legal Indian GST rules.
* **Proposed Architecture**: Implement `tax_calculation_mode` in `TaxConfiguration` (`TAX_EXCLUSIVE` vs `TAX_INCLUSIVE`). Default initially to `TAX_EXCLUSIVE` to match `Checkout.tsx` development mock.
* **Business Decision Required**: **DECISION REQUIRED**: Does management want consumer catalog prices marketed as tax-inclusive (statutory consumer norm) or tax-exclusive (B2B commercial norm)?
* **Implementation Impact**: Calculation pipeline accommodates both forward addition and backward tax extraction.
* **Phase 2 Dependency**: Tax engine calculation strategy in DRF.

---

### Ambiguity 4: Commercial Quotation to Invoice Workflow
* **Current Evidence**:
  * `frontend/src/pages/admin/Quotations.tsx`: "Convert to Invoice" sets quotation status to `Converted` and alerts user, without defining stock deduction or order links.
* **Conflict**: Undefined inventory impact, invoice generation mechanics, and order linking.
* **Confirmed Requirement**: Approved quotes must convert to legal GST tax invoices.
* **Proposed Architecture**:
  1. Validates that quote is in `Approved` status and within validity date.
  2. Generates an `Invoice` copying line items and referencing `quotation_id`.
  3. Sets quote status to `Converted` (immutable one-way transition).
  4. Physical inventory is **NOT** deducted on quote conversion; stock is deducted only when the resulting invoice is marked `Paid` or converted to an active warehouse dispatch.
* **Business Decision Required**: Confirmation on whether quotation conversion should optionally spawn an `Order` record or directly an `Invoice`.
* **Implementation Impact**: Clean atomic transaction endpoint `POST /api/v1/quotations/<id>/convert/`.
* **Phase 2 Dependency**: `Quotation` and `Invoice` model relationships.

---

### Ambiguity 5: Analytics Data Source & Telemetry Scope
* **Current Evidence**:
  * `frontend/src/pages/admin/TrafficAnalytics.tsx`: Renders rich mock graphs for funnel stages, traffic acquisition channels, new vs returning visitors.
* **Conflict**: Custom internal database telemetry vs external web analytics tool.
* **Confirmed Requirement**: Store requires sales insights and business reporting.
* **Proposed Architecture**:
  * **Sales & Merchandise Analytics**: Aggregated dynamically by DRF from transactional tables (`orders`, `order_items`, `products`).
  * **Web Traffic & Funnel Analytics**: Deferred past MVP; recommended for Google Analytics 4 / Plausible integration. Storing raw web pageviews in MySQL is an anti-pattern that causes database degradation.
* **Business Decision Required**: Approval of external web analytics service.
* **Implementation Impact**: Exclude raw clickstream event tables (`AnalyticsEvent`) from Phase 2 database.
* **Phase 2 Dependency**: Optimized SQL aggregation queries in DRF analytics views.

---

### Ambiguity 6: Payment Gateway Integration Scope (Razorpay)
* **Current Evidence**:
  * UI renders "Razorpay (UPI)", "Credit Card", "NetBanking", "Cash on Delivery", and mock settlement IDs (`setl_94829`).
* **Conflict**: Phase 2 database blueprint vs live third-party gateway integration.
* **Confirmed Requirement**: Secure online payment collection.
* **Proposed Architecture**:
  * **Phase 2**: Implement core payment entities (`PaymentTransaction`, `PayoutSettlement`), checkout state handling, and a mock payment adapter.
  * **Phase 3**: Integrate live Razorpay Python SDK, webhook signature verification (`X-Razorpay-Signature`), and auto-capture.
* **Business Decision Required**: Merchant onboarding credentials on Razorpay.
* **Implementation Impact**: Decouples internal database development from external gateway dependencies.
* **Phase 2 Dependency**: `PaymentTransaction` entity and mock payment view.

---

### Ambiguity 7: Guest Checkout vs Forced Account Registration
* **Current Evidence**:
  * `frontend/src/App.tsx`: Wraps `/checkout` in `<ProtectedRoute allowedRoles={["customer", "admin"]}>` (forcing login).
  * `backend/apps/orders/views.py`: Stub allows `Guest Customer`.
* **Conflict**: Frontend blocks unauthenticated users from reaching checkout, while backend stub expects guest orders.
* **Confirmed Requirement**: Frictionless purchasing without compromising user order history.
* **Proposed Architecture**: At database layer, `orders.user_id` is **nullable** (`ON DELETE SET NULL`), and customer identity (`customer_name`, `customer_email`, `customer_phone`, `shipping_address`) is preserved as a snapshot. Application guest checkout policy is controlled by `StoreConfiguration.guest_checkout_enabled` (Default: `FALSE` initially to match frontend protected route).
* **Business Decision Required**: Confirmation of whether guest checkout should be enabled in the frontend UI for production.
* **Implementation Impact**: Database schema is 100% prepared for both guest and registered checkout without requiring future migrations.
* **Phase 2 Dependency**: Nullable `user_id` on `Order` model.

---

## 5. Entity Mismatch Reconciliation

Phase 1 identified 21 normalized entities. Additional peripheral concepts appearing in documentation or code are formally reconciled below:

| Entity Concept | Discovered In | Phase 1.5 Classification | Architectural Rationale & Technical Decision |
|---|---|---|---|
| `AdminProfile` | `backend-requirements.md` | **REMOVE / MERGE** | Redundant. Use unified Django `User` model with `role='admin'` synchronized to Django's native `is_staff` and `is_superuser` flags. Eliminates unnecessary 1:1 join table. |
| `PaymentTransaction` | `data-model.md` | **KEEP** | Essential. Records individual customer payment attempts, gateway transaction IDs (`razorpay_payment_id`), methods, and verification statuses against orders/invoices. |
| `PasswordResetToken` | `data-model.md` | **USE DJANGO BUILT-IN** | Redundant as separate database table. Use Django's built-in `django.contrib.auth.tokens.default_token_generator` with HMAC cryptographic signing. Tokens are stateless and expire automatically without database table overhead. |
| `AnalyticsEvent` | `backend-requirements.md` | **DEFER / FUTURE EXTENSION** | Excluded from Phase 2. High-volume clickstream telemetry should be routed to GA4 or specialized event stores, not MySQL transactional tables. |
| `TaxConfig` | Phase 1.5 New | **KEEP (NEW)** | Dedicated entity governing statutory tax rates, effective dates, and intra/inter-state GST parameters. |
| `DeliveryConfig` | Phase 1.5 New | **KEEP (NEW)** | Dedicated entity governing dispatch origin coordinates, base charge, slab steps, and free shipping thresholds. |
| `DistanceSlab` | Phase 1.5 New | **KEEP (NEW)** | Dedicated entity modeling distance intervals and per-slab rate increments. |
| `OrderDiscount` | Phase 1.5 New | **KEEP (NEW)** | Dedicated entity governing promo coupons, cart percentage/fixed discounts, caps, and validity windows. |
| `AdminConfigAuditLog` | Phase 1.5 New | **KEEP (NEW)** | Mandatory audit trail capturing administrative modifications to commercial rules. |

---

## 6. Stock Ledger Integrity & Foreign Key Correction

* **The Problem**: Phase 1 specified `Product` $\rightarrow$ `StockTransaction` `CASCADE`. Deleting a product would illegally purge the entire historical audit ledger of warehouse movements!
* **The Target Decision**:
  1. Change foreign key deletion behavior to **`ON DELETE RESTRICT`** (Django: `on_delete=models.PROTECT`).
  2. Implement **Catalog Soft-Deletion** (`is_active = FALSE` or `is_deleted = TRUE`). Deactivated products remain in the database forever to preserve historical integrity.
  3. `StockTransaction` is strictly **insert-only** (immutable).
  4. Discrepancies are resolved solely through compensating `ADJUSTMENT` transactions signed by warehouse personnel.

---

## 7. Order to Invoice Relationship Reconciliation

* **The Operational Model**:
  * **Retail (B2C)**: 1 Order $\rightarrow$ 1 Tax Invoice (Standard direct fulfillment).
  * **Contractors (B2B)**: 1 Order $\rightarrow$ N Invoices (Staged deliveries, milestone billings).
* **The Technical Schema**:
  * `invoices.order_id` is a standard Foreign Key to `orders.id` (enabling 1:N cardinality at database level).
  * In the retail checkout pipeline, an application-level constraint enforces a 1:1 relationship.
  * Invoices generated from commercial quotes reference `invoices.quotation_id` with `order_id = NULL`.

---

## 8. Database Engine Compatibility & Type Mapping

To guarantee complete compatibility between MySQL 8.0 (InnoDB) and Django ORM:

| Concept / Data Type | Raw MySQL 8.0 Construct | Django ORM Specification for Phase 2 | Integrity & Portability Rationale |
|---|---|---|---|
| Primary Keys | `BIGINT UNSIGNED AUTO_INCREMENT` | `models.BigAutoField(primary_key=True)` | Standard Django 64-bit auto-incrementing key. |
| Monetary Currency | `DECIMAL(12, 2)` | `models.DecimalField(max_digits=12, decimal_places=2)` | Exact fixed-point representation; zero floating-point drift. |
| Tax & Percentage Rates | `DECIMAL(5, 2)` | `models.DecimalField(max_digits=5, decimal_places=2)` | Supports percentages up to 100.00% with 2 decimal precision. |
| Status / Type Fields | MySQL `ENUM(...)` | `models.CharField(max_length=50, choices=...)` | Avoids expensive MySQL DDL `ALTER TABLE` locks when adding new status choices. |
| Boolean Flags | `TINYINT(1)` | `models.BooleanField(default=...)` | Python boolean abstraction mapped to MySQL `TINYINT(1)`. |
| Point-in-Time Snapshots | `JSON` | `models.JSONField(default=dict)` | Native MySQL 8.0 binary JSON storage with ORM querying support. |
| Timestamps | `DATETIME DEFAULT CURRENT_TIMESTAMP` | `models.DateTimeField(auto_now_add=True)` | Immutable creation timestamp. |
| Audit Update Timestamps| `ON UPDATE CURRENT_TIMESTAMP` | `models.DateTimeField(auto_now=True)` | Automatic update timestamp on record save. |
| Foreign Key Deletion | `CASCADE` vs `SET_NULL` vs `RESTRICT` | `models.PROTECT`, `models.SET_NULL`, `models.CASCADE` | Enforces audit ledger protection and zero historical data loss. |

---

## 9. Comprehensive Requirement Traceability Matrix

| Requirement Area | Business Rule | Configuration Domain | Conceptual Entity | Future DRF API | Frontend Consumer | Phase 2 Readiness |
|---|---|---|---|---|---|---|
| **User Authentication** | BR-39, BR-40 | Auth | `User` | `POST /api/v1/auth/login/`, `POST /api/v1/auth/register/` | `Login.tsx`, `Register.tsx` | **READY** |
| **Address Book** | Module 1 Rules | User | `CustomerAddress` | `GET/POST/PUT/DELETE /api/v1/users/addresses/` | `Account.tsx` (Addresses) | **READY** |
| **Catalog Browsing** | BR-07, BR-09, BR-20 | Catalog | `Product`, `Category`, `Brand` | `GET /api/v1/products/`, `GET /api/v1/categories/` | `Shop.tsx`, `ProductDetail.tsx` | **READY** |
| **Product Discounts** | BR-08, DEC-1.5-03 | `DiscountConfig` | `Product`, `Category` | `PATCH /api/v1/categories/<id>/` | `ProductDetail.tsx`, `Categories.tsx` | **READY** |
| **Inventory Tracking** | BR-21, BR-22, BR-23 | `InventoryConfig` | `Product`, `StockTransaction` | `GET /api/v1/inventory/`, `POST .../transaction/` | `Inventory.tsx` | **READY** |
| **Order Placement** | BR-12, BR-24, BR-25 | `OrderConfig` | `Order`, `OrderItem` | `POST /api/v1/orders/` | `Checkout.tsx` | **READY** |
| **Fulfillment Management**| BR-24, State FSM | `OrderConfig` | `Order`, `OrderStatusHistory` | `GET/PATCH /api/v1/orders/<id>/` | `Orders.tsx` | **READY** |
| **Tax Calculation** | BR-01..05, DEC-1.5-01| `TaxConfig` | `TaxConfig` | Dynamic Service in Checkout Pipeline | `Checkout.tsx`, `Invoices.tsx` | **READY** |
| **Distance Delivery** | BR-13..16, DEC-1.5-05| `DeliveryConfig` | `DeliveryConfig`, `DistanceSlab` | `POST /api/v1/delivery/calculate/` | `Checkout.tsx`, `Shipping.tsx` | **READY** |
| **Free Delivery** | BR-17..18, DEC-1.5-06| `DeliveryConfig` | `DeliveryConfig` | Evaluated in Checkout Pipeline | `Checkout.tsx`, `ProductDetail.tsx` | **READY** |
| **Order Coupons** | BR-10, BR-11 | `DiscountConfig` | `OrderDiscount` | `POST /api/v1/discounts/validate-coupon/` | `Checkout.tsx` | **READY** |
| **B2B Corporate Clients** | BR-31, BR-32 | B2B Finance | `Client` | `GET/POST/PUT/DELETE /api/v1/clients/` | `Clients.tsx` | **READY** |
| **Commercial Quotations** | BR-33, BR-34 | B2B Finance | `Quotation`, `QuotationItem` | `GET/POST/PUT/DELETE /api/v1/quotations/` | `Quotations.tsx` | **READY** |
| **Quote Conversion** | DEC-1.5-15 | B2B Finance | `Quotation`, `Invoice` | `POST /api/v1/quotations/<id>/convert/` | `Quotations.tsx` | **READY** |
| **Tax Invoicing** | BR-28..30 | `InvoiceConfig` | `Invoice`, `InvoiceItem` | `GET/POST/PATCH /api/v1/invoices/` | `Invoices.tsx` | **READY** |
| **Operating Expenses** | Module 7 Rules | Finance | `Expense` | `GET/POST/PUT/DELETE /api/v1/expenses/` | `Expenses.tsx` | **READY** |
| **Customer Payments** | BR-35, BR-37 | `PaymentConfig` | `PaymentTransaction` | `POST /api/v1/payments/verify/` | `Checkout.tsx` | **READY** |
| **Gateway Payouts** | BR-37, DEC-1.5-16 | Finance | `PayoutSettlement` | `GET /api/v1/finance/payouts/` | `FinanceSummary.tsx` | **READY** |
| **Sales Analytics** | DEC-1.5-21 | Analytics | Computed from `Order`/`Product` | `GET /api/v1/analytics/products/`, `/finance/summary/` | `ProductsAnalytics.tsx`, `FinanceSummary.tsx` | **READY** |
| **Traffic Analytics** | DEC-1.5-21 | Telemetry | External GA4 / Plausible | External Service Integration | `TrafficAnalytics.tsx` | **OPTIONAL** |
| **Customer Inquiries** | Module 8 Rules | Inquiries | `ContactInquiry` | `POST /api/v1/inquiries/` | `Contact.tsx` | **READY** |

---

## 10. Development Defaults vs Business-Approved Production Values

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              PROVISIONAL DEVELOPMENT SEED vs BUSINESS PRODUCTION            │
├──────────────────────────┬─────────────────────────┬────────────────────────┤
│ Commercial Parameter     │ Development Seed        │ Production Status      │
├──────────────────────────┼─────────────────────────┼────────────────────────┤
│ Statutory GST Rate       │ 18.00% (CGST 9% + SGST 9%)│ Confirmed Initial Baseline│
│ Tax Calculation Mode     │ TAX_EXCLUSIVE           │ Business Sign-Off Req. │
│ Origin Dispatch Location │ Coimbatore, TN (641031) │ Confirmed Business Hub │
│ Base Delivery Charge     │ ₹100.00                 │ Provisional Seed Tariff│
│ Distance Slab Step       │ 10.00 km                │ Provisional Seed Tariff│
│ Charge per Slab          │ ₹100.00                 │ Provisional Seed Tariff│
│ Free Shipping Threshold  │ ₹999.00                 │ Business Sign-Off Req. │
│ Discount Stacking Policy │ Sequential with cap     │ Provisional Seed Policy│
│ Razorpay Live Webhooks   │ Mock Adapter            │ Phase 3 Integration    │
│ Web Traffic Analytics    │ GA4 Recommended         │ Business Sign-Off Req. │
└──────────────────────────┴─────────────────────────┴────────────────────────┘
```
