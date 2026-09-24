# Vee Electricals — Phase 2 Final Production Database Design Report

## 1. Executive Summary & Architecture Overview

**Project**: Vee Power Electricals E-Commerce Platform  
**Target Database Engine**: MySQL 8.0+ / InnoDB Storage Engine  
**Target ORM**: Django 4.2+ LTS / Django REST Framework (DRF)  
**Character Set & Collation**: `utf8mb4` / `utf8mb4_unicode_ci`  
**Transaction Isolation**: `READ COMMITTED`  
**Phase Status**: **Phase 2 Complete — Database Design Only** (Zero Django models created; zero migrations executed; zero production tables created).

Phase 2 translates the business reconciliation, configuration architecture, and integrity rules from Phase 1 and Phase 1.5 into a complete, implementation-ready database blueprint.

---

## 2. Final Entity & Table Inventory

The production database comprises **28 normalized entities** organized across **seven cohesive domains**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MASTER DATABASE ENTITY INVENTORY                      │
├─────────────────────┬───────────────────────────────┬───────────────────────┤
│ Domain              │ Entity Name                   │ Database Table Name   │
├─────────────────────┼───────────────────────────────┼───────────────────────┤
│ 1. Identity         │ User                          │ users                 │
│                     │ CustomerAddress               │ customer_addresses    │
├─────────────────────┼───────────────────────────────┼───────────────────────┤
│ 2. Catalog          │ Category                      │ categories            │
│                     │ Subcategory                   │ subcategories         │
│                     │ Brand                         │ brands                │
│                     │ Product                       │ products              │
│                     │ ProductImage                  │ product_images        │
│                     │ ProductSpecification          │ product_specifications│
├─────────────────────┼───────────────────────────────┼───────────────────────┤
│ 3. Inventory        │ StockTransaction              │ stock_transactions    │
├─────────────────────┼───────────────────────────────┼───────────────────────┤
│ 4. Orders           │ Order                         │ orders                │
│                     │ OrderItem                     │ order_items           │
│                     │ OrderStatusHistory            │ order_status_history  │
├─────────────────────┼───────────────────────────────┼───────────────────────┤
│ 5. Configuration    │ TaxConfiguration              │ tax_configurations    │
│                     │ DeliveryConfiguration         │ delivery_configurations│
│                     │ DistanceSlab                  │ distance_slabs        │
│                     │ ShippingRule                  │ shipping_rules        │
│                     │ OrderDiscount                 │ order_discounts       │
│                     │ CompanyStoreConfiguration     │ company_store_configurations│
├─────────────────────┼───────────────────────────────┼───────────────────────┤
│ 6. B2B & Finance    │ Client                        │ clients               │
│                     │ Quotation                     │ quotations            │
│                     │ QuotationItem                 │ quotation_items       │
│                     │ Invoice                       │ invoices              │
│                     │ InvoiceItem                   │ invoice_items         │
│                     │ PaymentTransaction            │ payment_transactions  │
│                     │ Expense                       │ expenses              │
│                     │ PayoutSettlement              │ payout_settlements    │
├─────────────────────┼───────────────────────────────┼───────────────────────┤
│ 7. Governance       │ AdminConfigAuditLog           │ admin_config_audit_logs│
│                     │ ContactInquiry                │ contact_inquiries     │
└─────────────────────┴───────────────────────────────┴───────────────────────┘
```

---

## 3. Comprehensive Schema Traceability Matrix

| Requirement Area | Business Rule | Entity | Table Name | Key Columns | Primary Constraints | Future REST API Endpoint |
|---|---|---|---|---|---|---|
| **User Authentication** | BR-39, BR-40 | `User` | `users` | `email`, `password`, `role`, `is_active`, `is_staff` | `UNIQUE(email)`, `CHECK(role)` | `POST /api/v1/auth/login/`, `POST /auth/register/` |
| **Address Book** | Module 1 | `CustomerAddress` | `customer_addresses` | `user_id`, `address_line1`, `city`, `pincode`, `is_default` | `FK -> users CASCADE`, `UNIQUE(default_user_id)` | `GET/POST/PUT/DELETE /api/v1/users/addresses/` |
| **Catalog Taxonomy** | Module 2 | `Category`, `Brand` | `categories`, `brands` | `name`, `slug`, `icon`, `hero_order`, `logo_url` | `UNIQUE(slug)`, `CHECK(discount_value >= 0)` | `GET /api/v1/categories/`, `GET /api/v1/brands/` |
| **Product Merchandise** | BR-07, BR-21 | `Product` | `products` | `sku`, `slug`, `mrp`, `price`, `stock`, `active` | `UNIQUE(sku)`, `CHECK(price <= mrp)`, `CHECK(stock >= 0)` | `GET/POST/PUT/DELETE /api/v1/products/` |
| **Product Media & Specs**| Module 2 | `ProductImage`, `ProductSpec` | `product_images`, `product_specifications` | `product_id`, `image_url`, `spec_key`, `spec_value` | `FK -> products CASCADE`, `UNIQUE(product, spec_key)` | Embedded in `GET /api/v1/products/<id>/` |
| **Stock Movements** | BR-21, BR-23 | `StockTransaction` | `stock_transactions` | `product_id`, `change_amount`, `transaction_type` | `FK -> products RESTRICT`, `CHECK(type)` | `GET /api/v1/inventory/`, `POST .../transaction/` |
| **Order Checkout** | BR-12, BR-24 | `Order`, `OrderItem` | `orders`, `order_items` | `order_number`, `user_id`, `total_amount`, `status`, `calculation_snapshot` | `UNIQUE(order_number)`, `CHECK(status)`, `CHECK(total >= 0)` | `POST /api/v1/orders/`, `GET /orders/my-orders/` |
| **Fulfillment Tracking**| BR-24, FSM | `OrderStatusHistory` | `order_status_history` | `order_id`, `previous_status`, `new_status`, `reason` | `FK -> orders CASCADE` | `GET/PATCH /api/v1/orders/<id>/` |
| **Statutory GST Tax** | BR-01..05 | `TaxConfiguration` | `tax_configurations` | `default_tax_rate`, `cgst_rate`, `sgst_rate`, `tax_calculation_mode` | `CHECK(rates >= 0)`, `CHECK(tax_mode)` | Tax calculation service in checkout pipeline |
| **Distance Delivery** | BR-13..16 | `DeliveryConfiguration`, `DistanceSlab` | `delivery_configurations`, `distance_slabs` | `origin_city`, `base_delivery_charge`, `min_distance_km`, `rate` | `FK -> delivery_configurations CASCADE`, `CHECK(max > min)` | `POST /api/v1/delivery/calculate/` |
| **Regional Shipping** | BR-19 | `ShippingRule` | `shipping_rules` | `state`, `cost`, `estimated_days_min` | `UNIQUE(state)`, `CHECK(cost >= 0)` | `GET/POST/PUT/DELETE /api/v1/shipping-rules/` |
| **Promotions & Coupons**| BR-10, BR-11 | `OrderDiscount` | `order_discounts` | `code`, `discount_type`, `discount_value`, `min_order_value` | `UNIQUE(code)`, `CHECK(discount_value > 0)` | `POST /api/v1/discounts/validate-coupon/` |
| **Company & Policies** | BR-41..43 | `CompanyStoreConfiguration` | `company_store_configurations` | `gstin`, `registered_address`, `bank_ifsc`, `rounding_mode` | Single-row pattern, `CHECK(rounding_mode)` | `GET /api/v1/settings/` |
| **B2B Corporate Clients**| BR-31, BR-32 | `Client` | `clients` | `client_code`, `company_name`, `gstin`, `credit_limit` | `UNIQUE(client_code)`, `UNIQUE(gstin)` | `GET/POST/PUT/DELETE /api/v1/clients/` |
| **Commercial Estimates**| BR-33, BR-34 | `Quotation`, `QuotationItem` | `quotations`, `quotation_items` | `quotation_number`, `client_id`, `total_value`, `status` | `UNIQUE(quotation_number)`, `CHECK(status)` | `GET/POST/PUT /api/v1/quotations/` |
| **Quote Conversion** | DEC-1.5-15 | `Quotation`, `Invoice` | `quotations`, `invoices` | `invoices.quotation_id`, `status='Converted'` | Acyclic unidirectional link (`invoices.quotation_id -> quotations.id`) | `POST /api/v1/quotations/<id>/convert/` |
| **Tax Invoicing** | BR-28..30 | `Invoice`, `InvoiceItem` | `invoices`, `invoice_items` | `invoice_number`, `order_id`, `taxable_amount`, `cgst_amount`, `total_amount` | `UNIQUE(invoice_number)`, `CHECK(due >= date)` | `GET/POST/PATCH /api/v1/invoices/` |
| **Customer Payments** | BR-35, BR-37 | `PaymentTransaction` | `payment_transactions` | `order_id`, `gateway_transaction_id`, `amount`, `status` | `FK -> orders SET_NULL`, `CHECK(status)` | `POST /api/v1/payments/verify/` |
| **Operating Expenses** | Module 7 | `Expense` | `expenses` | `expense_date`, `category`, `vendor`, `amount`, `status` | `CHECK(category)`, `CHECK(amount > 0)` | `GET/POST/PUT/DELETE /api/v1/expenses/` |
| **Gateway Payouts** | BR-37, DEC-1.5-16 | `PayoutSettlement` | `payout_settlements` | `settlement_id`, `gross_amount`, `gateway_fee`, `net_amount` | `UNIQUE(settlement_id)`, `CHECK(net >= 0)` | `GET /api/v1/finance/payouts/` |
| **Administrative Audit**| DEC-1.5-10 | `AdminConfigAuditLog` | `admin_config_audit_logs` | `admin_user_id`, `domain`, `old_value`, `new_value`, `change_reason` | Append-only, `CHECK(action_type)` | `GET /api/v1/config-audit-logs/` |
| **Customer Inquiries** | Module 8 | `ContactInquiry` | `contact_inquiries` | `name`, `phone`, `subject`, `message`, `status` | `CHECK(status)` | `POST /api/v1/inquiries/` |

---

## 4. Key Architectural Decisions Summary

1. **Unified User Architecture (DEC-1.5-18)**: Eliminated redundant `AdminProfile`. All accounts use a unified `User` model with `role = 'customer' | 'admin'` synchronized with Django's native `is_staff` and `is_superuser`.
2. **Safe Single Default Address Pattern**: Resolved MySQL's conditional uniqueness limitation by generating a stored virtual column `default_user_id = IF(is_default=1, user_id, NULL)` with a database `UNIQUE` constraint, combined with atomic application-level updates.
3. **Protected Stock Ledger (DEC-1.5-13)**: Fixed Phase 1's dangerous `CASCADE` deletion on `stock_transactions.product_id`. Changed to `ON DELETE RESTRICT` (Django `models.PROTECT`). Catalog uses soft-deletion (`active = FALSE`).
4. **Order to Invoice Multiplicity (DEC-1.5-14)**: Modeled `invoices.order_id` as a 1:N capable foreign key (`ON DELETE SET NULL`) at the database level, with an application-level 1:1 constraint for B2C retail checkouts. This supports future B2B milestone dispatches and credit notes.
5. **Dual Financial Storage**: Stored critical figures in structured, indexed `DECIMAL(12, 2)` columns for fast SQL reporting, paired with an immutable `calculation_snapshot` JSON column for microsecond mathematical replay.
6. **Consolidated Master Store Configuration**: Combined Company Profile, Currency, Order Policies, Payment Rail Toggles, and Store Status into a single master profile record (`company_store_configurations`), eliminating table fragmentation.
7. **Append-Only Governance**: `stock_transactions`, `order_status_history`, and `admin_config_audit_logs` are strictly write-only, insert-only audit trails.
8. **Authoritative Unidirectional Quotation $\rightarrow$ Invoice Relationship**: `invoices.quotation_id` $\rightarrow$ `quotations(id)` (`ON DELETE SET NULL`). Removed `quotations.converted_invoice_id`, resolving circular foreign keys and guaranteeing a strictly acyclic migration graph without deferred dependencies.
9. **Continuous Half-Open Distance Slabs**: Reconciled distance intervals to `[min_distance_km, max_distance_km)` (`distance >= min AND distance < max`), eliminating distance gaps and boundary ambiguities.
10. **Index Deduplication Audit**: Omitted redundant ordinary non-unique indexes on columns with existing `UNIQUE` constraints (`users.email`, `products.sku`, `order_discounts.code`, etc.), saving buffer pool RAM and write overhead while preserving O(1) lookups.

---

## 5. Remaining Risks & Business Decisions

### 5.1 Business Decisions Required Prior to Production Launch
1. **Catalog Tax Presentation Mode (`tax_calculation_mode`)**:
   * *Status*: Seeded as `TAX_EXCLUSIVE` (matches development `Checkout.tsx`).
   * *Business Confirmation Required*: Formal approval on whether consumer retail prices should be marketed as tax-inclusive (statutory consumer protection norm) or tax-exclusive (contractor B2B norm).
2. **Production Logistics Courier Tariff**:
   * *Status*: Seeded with provisional test rates (₹100 base + ₹100 / 10 km).
   * *Business Confirmation Required*: Final commercial tariff based on negotiated courier partner agreements (e.g. Porter, DTDC, India Post).
3. **Free Delivery Threshold Sign-Off**:
   * *Status*: Seeded at `₹999.00`.
   * *Business Confirmation Required*: Executive confirmation of free shipping cart threshold.
4. **Promotional Category Discount vs Cart Coupon Stacking Policy**:
   * *Status*: Seeded with non-stacking baseline (`allow_stacking = 0`).
   * *Business Confirmation Required*: Executive sign-off on whether cart-level coupons can stack with products that already have active category markdown discounts.

### 5.2 Technical & Operational Risks
* **Geocoding API Availability**: Distance delivery calculations depend on geocoding destination PIN codes. Mitigated by Tier 5 fallback regional state rates (`shipping_rules`).
* **High-Volume Clickstream Telemetry**: Raw clickstream pageview tracking in MySQL would degrade database performance. Mitigated by recommending Google Analytics 4 / Plausible integration rather than transactional database tables.

---

## 6. Final Cross-Document Database Reconciliation Matrix

| Architectural Area | Architecture | Schema | Relationships | Constraints | Indexes | Django Mapping | Migration Plan | Seed Strategy | Reconciliation Status |
|---|---|---|---|---|---|---|---|---|---|
| **Master Entity Count** | 28 Entities | 28 Tables | 28 Entities | 28 Entities | 28 Tables | 28 Models | 28 Models | 28 Tables | **CONSISTENT** |
| **Table Naming** (`company_store_configurations`) | `company_store_configurations` | `company_store_configurations` | `company_store_configurations` | `company_store_configurations` | `company_store_configurations` | `company_store_configurations` | `company_store_configurations` | `company_store_configurations` | **CORRECTED** |
| **Quotation $\leftrightarrow$ Invoice Direction** | `invoices.quotation_id` | `invoices.quotation_id` | `invoices.quotation_id` | `invoices.quotation_id` | `idx_invoices_quote` | Reverse: `quotation.invoices` | Step 7 Acyclic | N/A | **CORRECTED** |
| **Distance Slab Boundaries** | Continuous `[min, max)` | `[min, max)` (`>=` and `<`) | Defined | `chk_slab_range` | Range query index | DecimalField(6,2) | Step 2 Slabs | Continuous Intervals | **CORRECTED** |
| **Index Redundancy** | Clustered + Unique | Unique deduplicated | Verified | Unique keys | Deduped Section 3 | `unique=True` | Clean | Clean | **CORRECTED** |
| **Stock Ledger Protection** | `RESTRICT` | `RESTRICT` | `RESTRICT` | `fk_stk_prod` | Composite index | `models.PROTECT` | Step 4 / 6 | Dev seeds | **CONSISTENT** |
| **Order $\rightarrow$ Invoice Cardinality** | 1:N DB / 1:1 App | Nullable FK (no unique) | 1:N DB / 1:1 App | Validated | FK index | Nullable FK | Step 7 | N/A | **CONSISTENT** |
| **Single Default Address** | Virtual generated col | `default_user_id` STORED | Owned | Unique default | Unique default | Custom save / unique | Step 1 | Clean | **CONSISTENT** |
| **Dual Financial Storage** | Structured + Snapshot | DECIMAL + JSON | Preserved | Non-negative | Fast reporting | DecimalField + JSONField | Step 5 & 7 | Clean | **CONSISTENT** |
| **Discount Calculation Order** | 10-Step Pipeline | Structured | Preserved | Value ranges | Deduplicated | Validated | Step 2 & 5 | Dev Seed | **CONSISTENT** |
| **Coupon Stacking Policy** | `allow_stacking` | `allow_stacking` | Controlled | Boolean | Lookup index | BooleanField | Step 2 | Dev Baseline | **BUSINESS DECISION REQUIRED** |
| **Catalog Tax Mode** | `tax_calculation_mode`| `tax_calculation_mode`| Versioned | Mode check | Version index | TextChoices | Step 2 | `TAX_EXCLUSIVE` | **BUSINESS DECISION REQUIRED** |
| **Logistics Courier Tariff** | Distance Engine | Base + Slabs | Versioned | Positive check | Slab range | DecimalField | Step 2 | `[DEV SEED]` | **BUSINESS DECISION REQUIRED** |
| **Free Delivery Threshold** | Threshold field | Threshold column | Configured | Value check | N/A | DecimalField | Step 2 | `₹999.00 [DEV SEED]` | **BUSINESS DECISION REQUIRED** |

---

## 7. PHASE 3 READINESS CLASSIFICATION

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 3 READINESS CLASSIFICATION                          │
├────────────────────────────────────────┬──────────────┬────────────────────────────────┤
│ Architectural Domain / Component       │ Status       │ Operational Notes              │
├────────────────────────────────────────┼──────────────┼────────────────────────────────┤
│ 1. Identity & Auth Schema              │ READY        │ Complete Django model mapping  │
│ 2. Customer Address Schema             │ READY        │ Single-default virtual column  │
│ 3. Catalog Taxonomy & Product Schema   │ READY        │ Check constraints, slug unique │
│ 4. Product Gallery & Specs Schema      │ READY        │ Composite keys and sort orders │
│ 5. Immutable Stock Ledger Schema       │ READY        │ ON DELETE RESTRICT protection  │
│ 6. Order & Order Item Schema           │ READY        │ 10-state FSM, snapshot columns │
│ 7. Order Status Audit History Schema   │ READY        │ Append-only transition audit   │
│ 8. Tax Configuration Domain            │ READY        │ Versioned effective dating     │
│ 9. Delivery & Distance Slab Schema     │ READY        │ Slab range check constraints   │
│ 10. Promotional Order Discount Schema  │ READY        │ Promo coupons & usage caps     │
│ 11. Consolidated Store Config Schema   │ READY        │ Master company & policy table  │
│ 12. B2B Client & Credit Schema         │ READY        │ Statutory GSTIN validation     │
│ 13. Commercial Quotation Schema        │ READY        │ Date checks, conversion flow   │
│ 14. GST Tax Invoice Schema             │ READY        │ 1:N capable, frozen snapshots  │
│ 15. Customer Payment Transaction Schema│ READY        │ Gateway transaction tracking   │
│ 16. Operational Expense Schema         │ READY        │ Expense ledger & categories    │
│ 17. Gateway Payout Settlement Schema   │ READY        │ Bank deposit reconciliation    │
│ 18. Administrative Config Audit Log    │ READY        │ Insert-only JSON change trail  │
│ 19. Contact Inquiry Ticket Schema      │ READY        │ Lead & support management      │
├────────────────────────────────────────┼──────────────┼────────────────────────────────┤
│ 20. Migration Dependency Graph         │ READY        │ Acyclic 8-step execution plan  │
│ 21. Database Seed Strategy             │ READY        │ Dev seeds vs Prod values       │
│ 22. Database Index Strategy            │ READY        │ Query-matched B-Tree indexes   │
├────────────────────────────────────────┼──────────────┼────────────────────────────────┤
│ 23. Live Razorpay SDK Integration     │ FUTURE       │ Scheduled for Phase 3 API layer│
│ 24. External Web Analytics (GA4)       │ OPTIONAL     │ Replaces MySQL telemetry       │
├────────────────────────────────────────┼──────────────┼────────────────────────────────┤
│ CRITICAL BLOCKERS FOR PHASE 3          │ NONE (0)     │ Database design is 100% Ready  │
└────────────────────────────────────────┴──────────────┴────────────────────────────────┘
```

> [!IMPORTANT]
> **Phase 2 Database Design is complete.** All 11 technical specification documents have been authored and cross-verified under [`backend/docs/`](file:///c:/Users/BALA%20ADHISH/Documents/Ecommerce-Website-for-Vee-Power-Electricals/backend/docs/). The database architecture is 100% implementation-ready for Phase 3 (Django Models, Migrations & Seeders).
