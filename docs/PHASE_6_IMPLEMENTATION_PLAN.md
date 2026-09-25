# Phase 6 Implementation Plan — Business Logic, Billing & Inventory Workflows

**Project:** Vee Power Electricals E-Commerce Platform  
**Target Stack:** Python 3.12 / Django 5.2 / Django REST Framework / MySQL 8.0 / SimpleJWT  
**Date:** September 24, 2026  
**Status:** **PROPOSED & UNDER REVIEW**

---

## 1. Executive Summary & Objective

Phase 6 extracts core business rules out of views and serializers into a dedicated, transaction-safe, domain-driven service layer across:
- **Commercial Configuration**: Billing calculation pipeline, GST tax engine, promotional discount engine, and distance-based delivery tariff engine.
- **Inventory**: Transaction-safe restock, sale allocation, inventory adjustments, and atomic order cancellation stock restoration.
- **Orders**: Customer checkout workflow orchestration and canonical 10-state Finite State Machine (FSM) transitions with automated business side-effects.
- **B2B Finance**: Sequential tax invoice generation, quotation-to-invoice conversion with duplicate protection, and client credit limit enforcement.

All services are designed to be independent of HTTP request objects, deterministic, and transaction-atomic.

---

## 2. Baseline Architecture Audit & Separation of Concerns

### A. Existing Behavior to Preserve
1. **28 Canonical Database Models**: Zero modifications to model definitions or tables (`Category`, `Subcategory`, `Brand`, `Product`, `ProductImage`, `ProductSpecification`, `StockTransaction`, `CustomerAddress`, `Order`, `OrderItem`, `OrderStatusHistory`, `Client`, `Quotation`, `QuotationItem`, `Invoice`, `InvoiceItem`, `PaymentTransaction`, `PayoutSettlement`, `Expense`, `CompanyStoreConfiguration`, `TaxConfiguration`, `DeliveryConfiguration`, `DistanceSlab`, `ShippingRule`, `OrderDiscount`, `AdminConfigAuditLog`, `ContactInquiry`, `User`).
2. **Phase 5 REST API Contract**: Endpoints under `/api/v1/` (`catalog`, `inventory`, `addresses`, `orders`, `finance`, `inquiries`, `config`) must retain identical URL signatures, request payloads, response envelopes, pagination, and status codes.
3. **Phase 4 RBAC & SimpleJWT Auth**: Permission classes (`IsAuthenticated`, `IsAdminUser`, `IsCustomer`) and ownership scoping remain authoritative.
4. **Data Isolation**: A customer must never see another customer's addresses, orders, or private records.
5. **Frontend Protection**: React frontend codebase remains 100% untouched.

### B. Business Logic to Extract into Domain Services
1. **Checkout Calculation**: Move 150+ lines of price summation, GST splitting, delivery charge computation, and snapshot formatting out of `CheckoutView` into `BillingService` and `CheckoutService`.
2. **Tax Engine**: Extract intra-state (CGST+SGST) vs inter-state (IGST) calculation into a reusable `TaxService` supporting both `TAX_EXCLUSIVE` and `TAX_INCLUSIVE` modes.
3. **Discount Engine**: Extract coupon evaluation, minimum order requirements, percentage caps, and stacking prevention into `DiscountService`.
4. **Delivery Engine**: Extract radial distance tariff calculation, `DistanceSlab.rate` lookup, state fallback rules, and free-delivery qualification into `DeliveryService`.
5. **Inventory Mutations**: Extract row-locking (`select_for_update`), non-negative stock invariants, and immutable ledger logging (`StockTransaction`) out of views into `InventoryService`.
6. **Order Cancellation & Stock Restoration**: Implement automated, non-duplicating stock restoration when orders transition to `CANCELLED` within `OrderWorkflowService`.
7. **Quotation Conversion**: Implement atomic quotation-to-invoice conversion (`QuotationService`) preserving acyclic 1:N relations and preventing duplicate conversions.
8. **B2B Credit Exposure**: Implement `CreditService` to evaluate client outstanding exposures against `client.credit_limit`.

### C. Unresolved Business Decisions (Kept Configurable & Deferred)
1. **Tax Mode (`DEC-1.5-02`)**: B2C retail MRP inclusive vs B2B tax-exclusive. Kept dynamic via `TaxConfiguration.tax_calculation_mode` (default: `TAX_EXCLUSIVE`).
2. **Free Delivery Threshold (`DEC-1.5-03`)**: Retail checkout ₹999 vs admin shipping ₹3,999. Kept dynamic via `DeliveryConfiguration.free_delivery_threshold` (default seed: `₹999.00`).
3. **Discount Stacking Policy (`DEC-1.5-04`)**: Strict mutual exclusion vs sequential compounding. Kept configurable via `OrderDiscount.allow_stacking` (default: sequential with 50% cap).
4. **Distance Tariff Matrix**: Provisional development rates (₹100 per 10km slab) remain seed-only; runtime calculation strictly reads active database slabs.

### D. Scope Deferred to Later Phases
1. **Live Payment Gateway Integration (Razorpay/PayU)**: Deferred to dedicated integration phase. No mock or fake external gateway calls will be created.
2. **Automated Reverse Logistics Courier APIs (Shiprocket/Porter)**: Manual tracking number assignment preserved; no external carrier webhook integration in Phase 6.
3. **Credit Notes Engine**: Credit notes schema / refund ledger remains deferred to Phase 7/8.

---

## 3. Detailed Service Architecture Blueprint

### 3.1 Commercial Configuration Domain Services (`backend/apps/commercial_config/services/`)

#### 1. `TaxService` (`tax_service.py`)
- **Inputs**: `subtotal: Decimal`, `destination_state: str`, optional `tax_config: Optional[TaxConfiguration]`.
- **Logic**:
  - Resolves active `TaxConfiguration`.
  - Determines Place of Supply: compares `origin_state` (default `'Tamil Nadu'`) with `destination_state`.
  - **Intra-State**: CGST (`default_tax_rate / 2`) + SGST (`default_tax_rate / 2`).
  - **Inter-State**: IGST (`default_tax_rate`).
  - Supports `TAX_EXCLUSIVE` and `TAX_INCLUSIVE` mathematics with `ROUND_HALF_UP` precision.
- **Output**: `TaxCalculationResult` dataclass with structured amounts, rates, and tax type.

#### 2. `DiscountService` (`discount_service.py`)
- **Inputs**: `order_amount: Decimal`, `coupon_code: Optional[str]`, `items_discount_total: Decimal = 0`.
- **Logic**:
  - Validates active status, date validity window, and `min_order_value`.
  - Computes percentage or fixed discount.
  - Applies `max_discount_cap` where configured.
  - Enforces stacking bounds (cannot exceed 50% of gross order or drop total below ₹1.00).
- **Output**: `DiscountCalculationResult` dataclass with discount amount, code, and calculation details.

#### 3. `DeliveryService` (`delivery_service.py`)
- **Inputs**: `destination_state: str`, `destination_pincode: str`, `taxable_amount: Decimal`, optional `distance_km: Optional[Decimal]`.
- **Logic**:
  - Resolves active `DeliveryConfiguration`.
  - Checks free delivery: if `taxable_amount >= free_delivery_threshold`, fee = 0.
  - If distance is provided: queries `DistanceSlab` matching `min_distance_km <= distance_km < max_distance_km` and applies `slab.rate`.
  - If no matching slab or distance: queries `ShippingRule` by destination state.
  - Fallback: `base_delivery_charge` from `DeliveryConfiguration`.
- **Output**: `DeliveryCalculationResult` dataclass with fee, rule applied, and free shipping qualification.

#### 4. `BillingService` (`billing_service.py`)
- Orchestrates the **14-step deterministic billing pipeline**:
  1. Product validation
  2. Stock validation
  3. Base item subtotals
  4. Product-level discounts
  5. Net cart subtotal
  6. Order-level coupon evaluation via `DiscountService`
  7. Total discount aggregation
  8. Taxable amount determination
  9. Statutory GST calculation via `TaxService`
  10. Logistics & delivery calculation via `DeliveryService`
  11. Free delivery evaluation
  12. Gross payable compilation
  13. Half-up currency rounding & non-negative floor check
  14. Point-in-time calculation snapshot dictionary creation

---

### 3.2 Inventory Domain Services (`backend/apps/inventory/services/`)

#### `InventoryService` (`inventory_service.py`)
- **`restock_product(product_id, quantity, performed_by, notes)`**:
  - Concurrency lock via `select_for_update()`.
  - Increments `product.stock += quantity`.
  - Appends immutable `StockTransaction` (type `RESTOCK`).
- **`sale_deduct_stock(product, quantity, order, performed_by, notes)`**:
  - Concurrency lock via `select_for_update()`.
  - Verifies `product.active` and `product.stock >= quantity`.
  - Decrements `product.stock -= quantity`.
  - Appends immutable `StockTransaction` (type `SALE`, linked to `order`).
- **`adjust_stock(product_id, change_amount, performed_by, notes)`**:
  - Concurrency lock via `select_for_update()`.
  - Validates `product.stock + change_amount >= 0`.
  - Updates stock.
  - Appends immutable `StockTransaction` (type `ADJUSTMENT`).
- **`restore_order_stock(order, performed_by, reason)`**:
  - Verifies order has historical `SALE` transactions.
  - Verifies order has NOT already had stock restored (checks for existing `RETURN` transactions).
  - For each `OrderItem`, locks product row, increments stock, and writes immutable `StockTransaction` (type `RETURN`, linked to `order`).

---

### 3.3 Orders Domain Services (`backend/apps/orders/services/`)

#### 1. `CheckoutService` (`checkout_service.py`)
- Orchestrates customer checkout atomically within `transaction.atomic()`:
  - Validates customer and owned shipping address.
  - Executes `BillingService.calculate_cart(...)`.
  - Creates `Order` with frozen `calculation_snapshot`.
  - Creates snapshot `OrderItem` rows.
  - Deducts stock via `InventoryService.sale_deduct_stock(...)`.
  - Creates initial `OrderStatusHistory` (`PENDING`).
  - Guarantees zero partial mutations if any step fails.

#### 2. `OrderWorkflowService` (`order_workflow_service.py`)
- Enforces canonical 10-state FSM transitions:
  - Validates target status against allowed transition map.
  - Rejects invalid transitions and mutations on terminal states (`CANCELLED`, `RETURN_REJECTED`, `RETURN_COMPLETED`).
  - Side-Effect: On transition to `CANCELLED`, executes `InventoryService.restore_order_stock(...)`.
  - Side-Effect: On transition to `RETURN_COMPLETED`, executes `InventoryService.restore_order_stock(...)`.
  - Creates immutable audit record in `OrderStatusHistory`.

---

### 3.4 B2B Finance Domain Services (`backend/apps/finance/services/`)

#### 1. `InvoiceService` (`invoice_service.py`)
- Generates sequential financial year invoice numbers: `INV-{FY}-{XXXX}` with atomic sequence locking.
- Generates immutable snapshot and `InvoiceItem` rows.
- Reconciles historical pricing without recalculating from live product catalog prices.

#### 2. `QuotationService` (`quotation_service.py`)
- Handles quotation conversion:
  - Validates quotation status (must not already be `Converted`).
  - Calls `InvoiceService` to create linked `Invoice`.
  - Sets `quotation.status = QuotationStatus.CONVERTED`.
  - Prevents duplicate conversions.

#### 3. `CreditService` (`credit_service.py`)
- Computes client outstanding exposure = sum of unpaid invoices.
- Evaluates against `client.credit_limit`.
- Blocks order/invoice creation if credit limit is exceeded.

---

## 4. Testing & Verification Strategy

Create `backend/tests/test_phase6_services.py` covering:
1. **Billing & Tax Tests**:
   - Intra-state CGST + SGST (Tamil Nadu -> Tamil Nadu).
   - Inter-state IGST (Tamil Nadu -> Karnataka).
   - Tax-exclusive vs Tax-inclusive calculations.
   - Percentage vs Fixed discounts with caps.
   - Half-up rounding precision.
2. **Delivery Engine Tests**:
   - Distance slab tariff matching `[min_km, max_km)`.
   - Free delivery qualification above threshold.
   - State shipping rule fallback.
3. **Inventory Workflow Tests**:
   - Concurrency locking with `select_for_update()`.
   - Stock deduction on sale.
   - Stock restoration on cancellation.
   - Duplicate restoration prevention.
   - Rejection of negative stock adjustments.
4. **Order FSM Tests**:
   - Valid transition sequence (`PENDING` -> `CONFIRMED` -> `PACKED` -> `SHIPPED` -> `DELIVERED`).
   - Rejection of illegal transitions (`PENDING` -> `DELIVERED`, `SHIPPED` -> `CANCELLED`).
   - Terminal state immutability.
5. **Finance & B2B Tests**:
   - Quotation conversion to invoice.
   - Duplicate conversion prevention.
   - Client credit limit enforcement.
   - Historical invoice price freezing.
6. **Full Regression Verification**:
   - Phase 3 (17 tests) + Phase 4 (43 tests) + Phase 5 (31 tests) + Phase 6 tests = **100% PASS**.

---

## 5. Documentation & Deliverables

1. `backend/docs/business-logic/`:
   - `billing.md`
   - `tax.md`
   - `discounts.md`
   - `delivery.md`
   - `inventory-workflows.md`
   - `order-workflows.md`
   - `quotation-invoice.md`
   - `payment-transactions.md`
   - `transaction-boundaries.md`
2. `PHASE_6_IMPLEMENTATION_REPORT.md`
