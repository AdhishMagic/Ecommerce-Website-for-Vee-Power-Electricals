# Vee Electricals — Phase 1.5 Architecture Decision Log (ADL)

## 1. Overview & Decision Framework

This document records the definitive architectural decisions formulated during **Phase 1.5 (Business Rule, Configuration & Schema Reconciliation)**. Each decision resolves contradictions identified in Phase 1 documentation and incorporates the newly confirmed business principles.

---

## 2. Master Decision Records

### DEC-1.5-01: Configurable Tax Architecture (18% GST Seed)
* **Topic**: Tax calculation engine & dynamic rate management.
* **Current State**: Phase 1 noted Indian electrical goods generally use 18% GST, but lacked a formal configuration model.
* **Evidence**: Business Input 3.A, 3.B, 3.C: Tax calculation is required; 18% discussed; GST configuration must be editable from admin panel without code changes.
* **Decision**: Implement a dedicated `TaxConfiguration` domain supporting statutory tax rates (`default_tax_rate`, `cgst_rate`, `sgst_rate`, `igst_rate`), effective dating, and place-of-supply resolution.
* **Reason**: 18% GST is an initial business seed, not an invariant constant. Statutory GST rates in India are subject to GST Council amendments.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Creates `TaxConfig` entity specification in Phase 2 data model.
* **Business Confirmation Required**: Initial seed rate (18.00%) approved for development.

---

### DEC-1.5-02: Tax Inclusivity vs Exclusivity Reconciliation
* **Topic**: Catalog price presentation vs checkout computation.
* **Current State**: `ProductDetail.tsx` renders "Price inclusive of all taxes", while `Checkout.tsx` adds 18% tax on top of subtotal.
* **Evidence**: Phase 1 Ambiguity #3; Indian Consumer Protection Rules require tax-inclusive retail display, while B2B trade uses tax-exclusive supply.
* **Decision**: Architect the billing engine to support configurable `tax_calculation_mode` (`TAX_EXCLUSIVE` vs `TAX_INCLUSIVE`). Default initially to `TAX_EXCLUSIVE` to match `Checkout.tsx` development mock.
* **Reason**: Prevents breaking existing checkout flow while providing a toggle to flip to statutory tax-inclusive pricing once business confirms legal preference.
* **Status**: **PROVISIONAL / BUSINESS DECISION REQUIRED**
* **Phase 2 Impact**: Calculation pipeline accommodates both forward addition and backward extraction formulas.
* **Business Confirmation Required**: Formal confirmation on whether consumer catalog prices should be marketed as inclusive or exclusive of GST.

---

### DEC-1.5-03: Product Discount Architecture & Double-Discount Prevention
* **Topic**: Relationship between MRP, Selling Price, and Category/Product Promotional Discounts.
* **Current State**: `Product.price` is treated as selling price; `ProductDetail.tsx` calculates discount as `(mrp - price)/mrp * 100`. `Categories.tsx` has promotional discount settings.
* **Evidence**: Business Input 3.D: Product-specific discounts required. Risk of compounding discounts if both selling price markdown and category promotion are applied.
* **Decision**: In the database catalog, `price` is the regular selling price. Promotional discounts (category or product level) define a `discount_basis`: either `FROM_MRP` or `FROM_SELLING_PRICE`. Effective selling price can never exceed MRP or fall below 0.00.
* **Reason**: Prevents unintentional cascading discounts (e.g. 20% off already marked-down goods) from wiping out merchant profit margins.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Product and Category schema include explicit discount controls and basis flags.
* **Business Confirmation Required**: Confirmation of default discount basis (Recommended: `FROM_MRP`).

---

### DEC-1.5-04: Order-Level Discounts & Discount Stacking Policy
* **Topic**: Cart-level coupons and compatibility with product discounts.
* **Current State**: No order-level coupon support existed in Phase 1 data model.
* **Evidence**: Business Input 3.E: Overall/order-level discounts are required.
* **Decision**: Define an `OrderDiscount` configuration domain supporting promo codes, percentage/fixed markdowns, minimum order values, and maximum discount caps. Stacking policy defaults to **Sequential Stacking** (product discounts applied first to determine subtotal, then coupon applied) capped by a global maximum discount ceiling.
* **Reason**: Provides marketing flexibility while safeguarding business against abusive coupon compounding.
* **Status**: **CONFIRMED (Policy configurable)**
* **Phase 2 Impact**: Creates `OrderDiscount` conceptual entity; updates Order calculation pipeline.
* **Business Confirmation Required**: Confirmation of maximum allowed discount cap per order.

---

### DEC-1.5-05: Distance-Based Delivery Pricing Engine
* **Topic**: Replacement of simplistic flat shipping with distance-dependent logistics.
* **Current State**: `ShippingRule` in Phase 1 used flat state rates only.
* **Evidence**: Business Input 3.F, 3.G, 3.H: Delivery charges required; depends on distance from Coimbatore; must be customizable from admin panel.
* **Decision**: Design a dynamic delivery pricing engine based on configured origin hub (`Coimbatore`, `Tamil Nadu`, `641031`), base delivery charge, distance slab step, and charge per slab.
* **Reason**: Reflects actual logistics costs for heavy electrical goods (fans, cables) dispatched from the Coimbatore warehouse.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Introduces `DeliveryConfiguration` and `DistanceSlab` entities; updates `Order` shipping calculation.
* **Business Confirmation Required**: Production commercial logistics tariff (Provisional seed: ₹100 base + ₹100 / 10 km).

---

### DEC-1.5-06: Free Delivery Threshold Reconciliation
* **Topic**: Conflicting free shipping thresholds across customer and admin screens.
* **Current State**: `Checkout.tsx` uses `subtotal >= 999 ? 0 : 99`. `Shipping.tsx` uses `freeShippingThreshold = 3999`.
* **Evidence**: Phase 1 Ambiguity #2.
* **Decision**: Decouple the threshold completely from application code into `DeliveryConfiguration.free_delivery_threshold`. Seed development database with `₹999.00` with instant admin UI editability.
* **Reason**: Completely resolves the code discrepancy by delegating the threshold to runtime configuration.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Database seed fixture includes configurable threshold row.
* **Business Confirmation Required**: Final approved production free shipping threshold figure.

---

### DEC-1.5-07: Delivery Rule Precedence Hierarchy
* **Topic**: Conflict resolution among overlapping shipping rules.
* **Current State**: No hierarchy existed.
* **Evidence**: Multiple shipping rules (coupons, distance slabs, state flat rates, free thresholds) can apply simultaneously.
* **Decision**: Enforce a strict 5-tier precedence hierarchy:
  1. Promotional / Customer Override (e.g. Free delivery coupon)
  2. Free Delivery Threshold (if cart qualifies)
  3. Zone / Pincode Specific Override
  4. Distance Slab Engine (Radial distance from Coimbatore)
  5. Regional / State Fallback Rate
  6. Global Default
* **Reason**: Guarantees deterministic, reproducible shipping fee computation.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Standardizes the delivery service algorithm in DRF.
* **Business Confirmation Required**: None.

---

### DEC-1.5-08: Separation of Configuration Domains (No Monolithic JSON)
* **Topic**: Database schema architecture for commercial settings.
* **Current State**: Undefined in Phase 1.
* **Evidence**: Prompt Section 4: "DO NOT create one uncontrolled generic JSON settings object for everything. Prefer clearly separated domain-level configuration concepts."
* **Decision**: Establish 10 distinct configuration domains (`Tax`, `Discount`, `Delivery`, `Billing`, `Invoice`, `Order`, `Payment`, `Company`, `Inventory`, `Store`).
* **Reason**: Preserves SQL data typing, validation constraints, indexed queries, and domain-level RBAC.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Defines separate configuration tables in Phase 2 Django models.
* **Business Confirmation Required**: None.

---

### DEC-1.5-09: Configuration Versioning & Effective Dating
* **Topic**: Traceability of commercial rate revisions over time.
* **Current State**: Undefined in Phase 1.
* **Evidence**: Business Input 3.K: Historical bills/orders/invoices must remain correct even after configuration changes.
* **Decision**: Financial configuration records incorporate `effective_from`, `effective_until`, `is_active`, and `version_number`. Edits create new version records rather than mutating active historical rows.
* **Reason**: Provides an auditable historical timeline of all commercial rules for statutory audits.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Configuration models inherit temporal fields.
* **Business Confirmation Required**: None.

---

### DEC-1.5-10: Administrative Configuration Audit Trail
* **Topic**: Logging of administrative modifications to commercial rules.
* **Current State**: Phase 1 lacked administrative change auditing.
* **Evidence**: Prompt Section 16.
* **Decision**: Require an `AdminConfigAuditLog` recording user ID, domain, record ID, pre-change JSON, post-change JSON, mandatory reason note, IP address, and timestamp.
* **Reason**: Mitigates internal fraud, unauthorized pricing alterations, and provides compliance logs.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Creates `AdminConfigAuditLog` entity in Phase 2.
* **Business Confirmation Required**: None.

---

### DEC-1.5-11: Historical Point-in-Time Billing Snapshot
* **Topic**: Protection of past accounting data from future configuration drift.
* **Current State**: `Order` and `Invoice` stored flat monetary columns but lacked complete calculation context.
* **Evidence**: Business Input 3.K.
* **Decision**: When an order or invoice is generated, the entire calculation context (applied tax rate, CGST/SGST/IGST breakdown, distance slab, applied discounts, and config version) is frozen into an immutable `calculation_snapshot` JSON column.
* **Reason**: Invariant guarantee that historical financial reports will never alter if tax or shipping rates are adjusted later.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Adds `calculation_snapshot` column to `Order` and `Invoice` schemas.
* **Business Confirmation Required**: None.

---

### DEC-1.5-12: Canonical 10-State Order State Machine
* **Topic**: Order fulfillment lifecycle standardization.
* **Current State**: 4 different status sets across `order.ts`, `ShopContext.tsx`, `Orders.tsx`, and `Account.tsx`.
* **Evidence**: Phase 1 Ambiguity #1.
* **Decision**: Adopt the canonical 10-state FSM: `PENDING`, `CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURN_REQUESTED`, `RETURN_APPROVED`, `RETURN_REJECTED`, `RETURN_COMPLETED`.
* **Reason**: Accurately models real-world electrical goods warehousing, dispatch tracking, and RMA return handling.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Standardizes the `Order.status` choices field and serializer state transitions.
* **Business Confirmation Required**: None.

---

### DEC-1.5-13: Stock Ledger Integrity & Foreign Key Correction
* **Topic**: Resolution of `Product` $\rightarrow$ `StockTransaction` `CASCADE` deletion.
* **Current State**: `entity-relationships.md` listed `CASCADE` deletion, violating the immutable ledger principle.
* **Evidence**: Prompt Section 20.
* **Decision**: Change foreign key constraint to `ON DELETE RESTRICT`. Enforce catalog **soft-deletion** (`is_active = FALSE` or `is_deleted = TRUE`). Deleting stock transactions is prohibited. Corrections executed via compensating `ADJUSTMENT` entries.
* **Reason**: Ensures physical inventory audit history is never destroyed by catalog merchandise management.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Updates `StockTransaction` model relation to `PROTECT` / `RESTRICT`; implements soft-delete on `Product`.
* **Business Confirmation Required**: None.

---

### DEC-1.5-14: Order to Invoice Multiplicity & Staged Billing
* **Topic**: Relationship cardinality between orders and tax invoices.
* **Current State**: Phase 1 ambiguously described both 1:1 and 1:N relations.
* **Evidence**: Prompt Section 21; standard retail is 1:1, while B2B contractor supply involves milestone dispatches.
* **Decision**: Model `Invoice.order` as a Foreign Key (1:N capable at database level) with a unique constraint enforced at application layer for standard retail B2C orders.
* **Reason**: Supports standard retail 1:1 out of the box while preserving future architectural capability for partial invoicing and credit notes.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Updates `Invoice` model definition in Phase 2 data blueprint.
* **Business Confirmation Required**: None.

---

### DEC-1.5-15: Commercial Quotation Workflow Reconciliation
* **Topic**: Lifecycle and inventory implications of converting quotations to invoices.
* **Current State**: Frontend mock displays alert and sets quote to `Converted`, without backend mechanics.
* **Evidence**: Phase 1 Ambiguity #4.
* **Decision**: Converting a quotation:
  1. Validates that quote is in `Approved` status and within validity window (`valid_until >= TODAY`).
  2. Generates a formal `Invoice` referencing `quotation_id`.
  3. Sets quote status to `Converted` (one-way irreversible transition).
  4. Does NOT deduct stock until invoice is marked `Paid` or converted to an active delivery fulfillment.
* **Reason**: Quotations are commercial price commitments, not physical stock reservations. Deducting stock prematurely would lock warehouse merchandise before payment.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: DRF endpoint `POST /api/v1/quotations/<id>/convert/` implements this atomic flow.
* **Business Confirmation Required**: Whether quotation conversion should optionally create an `Order` record or directly an `Invoice`.

---

### DEC-1.5-16: Payment Model Separation (Transaction vs Settlement)
* **Topic**: Structural distinction between customer payments and merchant payouts.
* **Current State**: Phase 1 included both `PaymentTransaction` and `PayoutSettlement` in different doc sections.
* **Evidence**: Prompt Section 23; `Transactions.tsx` tracks order payments, while `FinanceSummary.tsx` tracks gateway settlement batches (`setl_94829`).
* **Decision**: Formally retain both entities as separate concepts:
  * `PaymentTransaction`: Customer inbound payments linked to `order_id` / `invoice_id`.
  * `PayoutSettlement`: Gateway batch settlements deposited into the Vee Electricals merchant bank account.
* **Reason**: Conflating customer orders with gateway payout batches makes financial bank reconciliation impossible.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Both entities specified in Phase 2 data model.
* **Business Confirmation Required**: None.

---

### DEC-1.5-17: Payment Gateway Phasing (Razorpay Scope)
* **Topic**: Live payment gateway integration scope.
* **Current State**: Frontend mocks Razorpay UPI, NetBanking, Cards, COD.
* **Evidence**: Phase 1 Ambiguity #6.
* **Decision**:
  * **Phase 2**: Implement payment data entities, checkout state handling, and a simulated mock gateway adapter.
  * **Phase 3**: Implement live Razorpay SDK, webhook signature verification (`X-Razorpay-Signature`), and order auto-capture.
* **Reason**: Decouples core database architecture and order management from external gateway API credentials.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Clean abstraction layer (`PaymentService`) designed in Phase 2.
* **Business Confirmation Required**: Razorpay merchant account credentials for Phase 3.

---

### DEC-1.5-18: Authentication Architecture & AdminProfile Elimination
* **Topic**: User identity model and role separation.
* **Current State**: Phase 1 mentioned `AdminProfile` in some sections, but User has `role='admin'`.
* **Evidence**: Prompt Section 19, 24; Django has built-in RBAC (`is_staff`, `is_superuser`, `groups`, `permissions`).
* **Decision**: **REMOVE** standalone `AdminProfile`. Utilize a unified custom `User` model with `role = 'customer' | 'admin'`, synchronized to Django's native `is_staff` and `is_superuser` flags.
* **Reason**: Eliminates unnecessary 1:1 join table overhead and utilizes Django REST Framework's native permissions (`IsAdminUser`, `IsAuthenticated`).
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Drops `AdminProfile` entity from Phase 2 data model.
* **Business Confirmation Required**: None.

---

### DEC-1.5-19: Guest Checkout Architecture & Route Protection Reconciliation
* **Topic**: Alignment between frontend route protection and backend guest support.
* **Current State**: `App.tsx` wraps `/checkout` in `<ProtectedRoute allowedRoles={["customer", "admin"]}>` (forcing login), while `orders/views.py` stub allows `Guest Customer`.
* **Evidence**: Phase 1 Ambiguity #7.
* **Decision**: At the database layer, `orders.user_id` remains **nullable** (`ON DELETE SET NULL`), and customer identity (`customer_name`, `customer_email`, `customer_phone`, `shipping_address`) is stored as a snapshot. The application policy is governed by `StoreConfiguration.guest_checkout_enabled` (Default: `FALSE` initially to match existing frontend protected route).
* **Reason**: Prepares database for future frictionless guest checkout without requiring schema migrations if business decides to remove the login barrier.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: `Order.user` is `ForeignKey(User, null=True, blank=True)`.
* **Business Confirmation Required**: Confirmation of whether guest checkout should be unlocked in frontend UI.

---

### DEC-1.5-20: Product Catalog Integrity (SKU & Slug Global Uniqueness)
* **Topic**: Catalog lookup identifiers and referential constraints.
* **Current State**: Phase 1 required unique SKU and slug.
* **Evidence**: Prompt Section 26.
* **Decision**: `sku` must be globally unique across all products. `slug` must be globally unique and auto-generated from product name. Category and Brand slugs must also be globally unique.
* **Reason**: SKU is required for warehouse barcode/inventory tracking; slug is required for SEO-friendly canonical URL routing (`/product/:slug`).
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Enforced via `unique=True` in Django models.
* **Business Confirmation Required**: None.

---

### DEC-1.5-21: Analytics Data Source & Telemetry Phasing
* **Topic**: Operational source of store traffic and funnel charts.
* **Current State**: `TrafficAnalytics.tsx` renders mock funnel stages, sessions by channel, and visitor types.
* **Evidence**: Phase 1 Ambiguity #5.
* **Decision**:
  * **Sales & Merchandise Analytics** (`topProducts`, `slowMovers`, `revenueTrend`): Aggregated dynamically by DRF endpoints from `orders`, `order_items`, and `products`.
  * **Web Traffic & Funnel Analytics** (`sessionsByChannel`, `trafficTrend`): Deferred past MVP; recommended for Google Analytics 4 / Plausible integration rather than bloating MySQL with session hit tables.
* **Reason**: Storing millions of raw HTTP pageviews inside transactional MySQL causes severe performance degradation.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Excludes telemetry tables (`AnalyticsEvent`) from Phase 2 database schema.
* **Business Confirmation Required**: Approval of external telemetry tool (e.g. GA4).

---

### DEC-1.5-22: Database Engine Compatibility & Monetary Precision
* **Topic**: MySQL 8.0 / InnoDB and Django ORM field mapping.
* **Current State**: Phase 1 specified MySQL types (e.g. `ENUM`, `TINYINT(1)`).
* **Evidence**: Prompt Section 27; Django models require portable, idiomatic Python field types.
* **Decision**: Map MySQL types to standard Django fields:
  * Currency $\rightarrow$ `DecimalField(max_digits=12, decimal_places=2)`.
  * MySQL `ENUM` $\rightarrow$ `CharField(max_length=..., choices=...)` for ORM portability.
  * `TINYINT(1)` $\rightarrow$ `BooleanField(default=...)`.
  * Snapshots $\rightarrow$ `JSONField(default=dict)`.
  * Primary Keys $\rightarrow$ `BigAutoField`.
* **Reason**: Maximizes Django admin compatibility, testability with SQLite in CI, and portability while running cleanly on MySQL 8.0 InnoDB.
* **Status**: **CONFIRMED**
* **Phase 2 Impact**: Direct specification for Phase 2 Django models.
* **Business Confirmation Required**: None.
