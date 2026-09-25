# Phase 7 Implementation Plan: Backend Testing, Security Hardening, Performance & E2E Validation

**Project:** Vee Power Electricals E-Commerce Platform  
**Phase:** 7 — Backend Testing, Security Hardening, Performance & E2E Validation  
**Current Baseline:** 121 / 121 Tests Passing (Commit `63ddd3d67a9b9984ef5b127155b1c7b2e1c1539d`)  
**Target:** Robust enterprise hardening, comprehensive edge coverage, concurrency validation, query optimization, zero regressions.

---

## 1. Baseline Verification & Strict Scope Boundaries

### 1.1 Verified Baseline Status
- **Phase 3 (Models & Schema):** 17 / 17 PASS
- **Phase 4 (Auth & RBAC):** 43 / 43 PASS
- **Phase 5 (Core REST API):** 31 / 31 PASS
- **Phase 6 (Business Services):** 30 / 30 PASS
- **Total Combined Regression:** **121 / 121 PASS** (Executed in 87.701s inside `veepower_backend`).

### 1.2 Strict Scope Boundaries & Guardrails
- **DO NOT** modify the 28 canonical Phase 3 database models.
- **DO NOT** generate new migrations (`makemigrations --check --dry-run` must remain clean: `No changes detected`).
- **DO NOT** modify frontend code (`git status frontend` must remain clean: 0 files changed).
- **DO NOT** redesign Phase 4 JWT authentication or Phase 5 REST API contracts.
- **DO NOT** replace the Phase 6 domain services (`TaxService`, `DiscountService`, `DeliveryService`, `BillingService`, `InventoryService`, `CheckoutService`, `OrderWorkflowService`, `CreditService`, `InvoiceService`, `QuotationService`).
- **DO NOT** integrate live external payment gateways or third-party logistics APIs.

---

## 2. Test Architecture Plan

Phase 7 tests will be modularized under `backend/tests/` into 7 distinct files to ensure maintainability, clear domain separation, and prevent regression:

```
backend/tests/
├── test_phase3_models.py          # 17 tests (Phase 3 baseline)
├── test_phase4_auth_rbac.py       # 43 tests (Phase 4 baseline)
├── test_phase5_api.py             # 31 tests (Phase 5 baseline)
├── test_phase6_services.py        # 30 tests (Phase 6 baseline)
├── test_phase7_security.py        # Security hardening & ownership isolation
├── test_phase7_validation.py      # Input validation & malicious data boundaries
├── test_phase7_concurrency.py     # Multi-threaded stock races & transaction rollback
├── test_phase7_billing_edges.py   # Tax/discount/delivery mathematical boundary limits
├── test_phase7_order_workflows.py # 10-state FSM, RMA, rollback & quotation conversion
├── test_phase7_api_integration.py # Full E2E REST API flows across all 7 endpoints
└── test_phase7_performance.py     # Query count profiling (N+1 audit) & rate limiting
```

---

## 3. Detailed Hardening Specifications

### 3.1 Security Hardening (`test_phase7_security.py`)
1. **Authentication Token Vulnerabilities:**
   - Unauthenticated requests to protected endpoints return `401 Unauthorized`.
   - Malformed, truncated, or tampered JWT signatures return `401 Unauthorized`.
   - Expired JWT tokens return `401 Unauthorized`.
   - Blacklisted refresh tokens cannot generate new access tokens.
2. **Authorization & RBAC Hardening:**
   - Customer attempting admin endpoints (`/api/v1/inventory/restock/`, `/api/v1/inventory/adjust/`, `/api/v1/orders/admin/{id}/status/`, `/api/v1/finance/invoices/`, `/api/v1/inquiries/admin/`) returns `403 Forbidden`.
   - Staff without permissions restricted from critical finance and store configuration endpoints.
3. **Cross-Customer Data Isolation & Ownership:**
   - Customer A cannot view, update, or delete Customer B's addresses (`404 Not Found` or `403 Forbidden`).
   - Customer A cannot view or cancel Customer B's orders.
   - Customer A cannot checkout using Customer B's address ID.
   - Private financial transactions and B2B client ledgers restricted from standard retail customers.
4. **Information Leakage & Secret Exposure:**
   - Error envelopes never leak SQL syntax, stack traces, database credentials, server paths, or raw exception strings.
   - User serializers never expose password hashes, reset tokens, or private claims.
   - Readonly fields (`order_number`, `status`, `total_amount`, `calculation_snapshot`) cannot be manipulated via payload mutation.

### 3.2 Input Validation Hardening (`test_phase7_validation.py`)
1. **Missing & Malformed Data:**
   - Missing required fields on addresses, checkout, restock, adjustments, inquiries, and coupons.
   - Null values, empty strings, and oversized strings (>10,000 characters).
   - Malformed JSON request bodies handled gracefully with standard `400 Bad Request`.
2. **Numeric & Boundary Values:**
   - Negative product prices, zero/negative checkout quantities, negative stock restock amounts.
   - Negative order amounts in coupon validation.
   - Decimals with invalid precision or non-numeric formatting.
3. **Format & Semantic Validation:**
   - Invalid PIN codes (letters, < 6 digits, > 6 digits).
   - Malformed email addresses.
   - Invalid enum values for `AddressType`, `OrderStatus`, `InquiryStatus`.
4. **Pagination & Query Defense:**
   - Massive page sizes (`?page_size=1000000`) capped safely.
   - Invalid ordering fields (`?ordering=non_existent`) handled without internal server errors (500).

### 3.3 Concurrency & Race Conditions (`test_phase7_concurrency.py`)
1. **Simultaneous Stock Contention (`TransactionTestCase`):**
   - Two concurrent threads attempting to purchase the last available stock (e.g. stock=5, both demand 4):
     - Exactly one thread succeeds.
     - One thread receives `InsufficientStockError` / `400 Bad Request`.
     - Stock decrements to exactly 1 (never negative).
     - Stock ledger contains exactly one `SALE` transaction.
2. **Concurrent Sale + Restock:**
   - Thread A deducts stock, Thread B adds restock simultaneously.
   - Final stock reflects exact arithmetic net balance without dirty writes.
3. **Idempotent Cancellation under Concurrency:**
   - Competing cancellation calls on the same order only execute inventory return once.

### 3.4 Billing, Tax & Tariff Boundary Limits (`test_phase7_billing_edges.py`)
1. **Discount Edges:**
   - Zero-value coupon (0% / ₹0).
   - Percentage discount with `max_discount_cap` exactly hit vs exceeded.
   - Fixed discount equal to or greater than order subtotal (capped at subtotal, subtotal never negative).
   - Minimum order value: exactly met (₹500.00) vs ₹0.01 below (₹499.99).
   - Combined discount stacking: hard cap at 50% enforced even when multiple promo discounts apply.
2. **Tax Engine Edges:**
   - `TAX_EXCLUSIVE` (additive) vs `TAX_INCLUSIVE` (reverse extraction).
   - Intra-state (Tamil Nadu: 9% CGST + 9% SGST) vs Inter-state (Other States: 18% IGST).
   - Edge tax rates (0%, 5%, 12%, 28%).
3. **Delivery Tariff Boundaries:**
   - Free delivery threshold: exactly met (₹1,000.00 -> ₹0 delivery) vs ₹0.01 below (₹999.99 -> delivery fee charged).
   - Distance slab half-open intervals $[min, max)$:
     - Exact slab min boundary $\rightarrow$ matches current slab.
     - Exact slab max boundary $\rightarrow$ transitions to next slab.
     - Distance exceeds all slabs $\rightarrow$ falls back to shipping rule or base delivery charge.
   - High-precision Decimal `ROUND_HALF_UP` verification.

### 3.5 Order FSM, RMA & Checkout Atomicity (`test_phase7_order_workflows.py`)
1. **Canonical 10-State FSM Matrix:**
   - Test all valid transitions (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `PACKED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`).
   - Test cancellations from `PENDING`, `CONFIRMED`, `PACKED`.
   - Test RMA transitions (`DELIVERED` $\rightarrow$ `RETURN_REQUESTED` $\rightarrow$ `RETURN_APPROVED` $\rightarrow$ `RETURN_COMPLETED` or `RETURN_REJECTED`).
   - Test terminal protection: `CANCELLED`, `RETURN_REJECTED`, `RETURN_COMPLETED` reject any further state transition.
   - Verify every valid transition appends an `OrderStatusHistory` audit record.
2. **Checkout Atomicity & Rollback:**
   - Inject simulated failure at stock deduction or order item insertion:
     - Verify database rolls back completely.
     - No orphan order record, no deducted stock, no ghost stock transactions.
3. **Quotation $\rightarrow$ Invoice Conversion:**
   - Verify quotation conversion locks quotation, creates `Invoice` with sequential `INV-{YYYY}-{XXXX}`.
   - Re-attempting conversion on `Converted` quotation raises validation error.
   - Historical item prices preserved even if current product catalog price changes.
4. **B2B Credit Exposure Limits:**
   - Credit limit exactly reached vs exceeded (rejected).
   - Aggregate unpaid and overdue invoices into exposure.

### 3.6 End-to-End REST API Integration (`test_phase7_api_integration.py`)
- Full lifecycle integration tests covering all 7 endpoint domains:
  1. `/api/v1/catalog/` (Search, category filtering, product detail).
  2. `/api/v1/addresses/` (CRUD, default address enforcement).
  3. `/api/v1/orders/` (Customer checkout, order tracking, admin status updates).
  4. `/api/v1/inventory/` (Admin restock, adjustment, audit trail).
  5. `/api/v1/finance/` (Invoices, quotations, conversion action).
  6. `/api/v1/inquiries/` (Contact submission, admin resolution).
  7. `/api/v1/config/` (Store and delivery config endpoints).

### 3.7 Performance Profiling & Query Optimization (`test_phase7_performance.py`)
- Measure query counts using `django.test.utils.CaptureQueriesContext`:
  - Catalog list view: verify `select_related('category', 'brand')` and `prefetch_related('images')` prevent N+1 queries.
  - Order list & detail views: verify items and address queries are bounded.
  - Pagination checks: verify database `COUNT(*)` and `LIMIT/OFFSET` behavior.
  - Rate limiting & abuse checks: test repeated login attempts and sensitive endpoint hits.

---

## 4. Execution Workflow & Verification Steps

1. **Step 1:** Implement `test_phase7_security.py` and verify PASS.
2. **Step 2:** Implement `test_phase7_validation.py` and verify PASS.
3. **Step 3:** Implement `test_phase7_concurrency.py` and verify multi-threaded safety.
4. **Step 4:** Implement `test_phase7_billing_edges.py` and verify numerical edge limits.
5. **Step 5:** Implement `test_phase7_order_workflows.py` and verify FSM, rollback, and quotations.
6. **Step 6:** Implement `test_phase7_api_integration.py` and verify end-to-end API workflows.
7. **Step 7:** Implement `test_phase7_performance.py` and profile query counts.
8. **Step 8:** Run complete regression test suite (`docker exec veepower_backend python manage.py test tests --noinput`).
9. **Step 9:** Execute integrity and safety checks (`makemigrations --check --dry-run`, `check`, `git status frontend`).
10. **Step 10:** Compile `PHASE_7_IMPLEMENTATION_REPORT.md` and commit with `test(hardening): validate and harden backend platform`.
