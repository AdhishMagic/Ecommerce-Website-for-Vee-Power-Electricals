# Vee Power Electricals — Complete Business Workflow Documentation (Step 15)

This document describes the end-to-end business workflows of the Vee Power Electricals
platform, how each is validated, and the failure/recovery contracts the system honors.
Every workflow is exercised through the public REST API against the live Django backend
and MySQL database — no mocks, no direct database manipulation of business state.

- Backend workflow suite: `backend/tests/test_step15_complete_workflows.py` (69 tests)
- Frontend E2E workflow suite: `frontend/tests/complete-workflows.spec.ts` (30 tests)
- Database consistency audit: `backend/tests/audit_step15_db_consistency.py` (20 checks)

---

## 1. Complete Customer Workflow (Golden Path)

```
Register → Login → Browse → Search → Product → Cart → Checkout
        → Order → Payment → Confirm → Pack → Ship → Deliver → Invoice → Finance
        → Return Request → Approve → Complete → Stock Restore → Reconciliation
```

Validated by `test_w20_01_complete_b2c_golden_path_register_to_delivery_to_return_completion`:

1. `POST /api/v1/auth/register/` — user created, password hashed (PBKDF2), JWT issued.
2. `POST /api/v1/addresses/` — shipping address saved.
3. `GET /api/v1/catalog/products/` — active products with authoritative price/stock.
4. `POST /api/v1/orders/checkout/` — server computes tax, delivery, discounts; stock reserved atomically.
5. `POST /api/v1/payments/initiate/` → `POST /api/v1/payments/verify/` — HMAC signature verified before the order moves to `Confirmed`/`Paid`.
6. Admin FSM transitions: `Confirmed → Packed → Shipped → Delivered` (each audited in `OrderStatusHistory`).
7. `InvoiceService.create_invoice_for_order()` — invoice snapshot of order totals; paid status derived from successful payment.
8. `POST /api/v1/orders/{id}/return/` — customer return request; stock NOT restored at request time.
9. Admin approves → completes return; stock restored exactly once with a `RETURN` ledger entry.
10. Final state: order `Return Completed`, payment `Paid`, ledger consistent, communication log populated.

## 2. Checkout Workflow

Endpoint: `POST /api/v1/orders/checkout/` (authentication required).

The backend is the sole financial authority. The frontend only collects intent.

- **Address validation** — `shipping_address_id` must reference the caller's address; missing/foreign address → 400.
- **Tax** — intra-state: CGST + SGST split (business state match); inter-state: IGST. Rates come from the active `TaxConfiguration`.
- **Delivery** — base charge + distance slabs + free-delivery threshold from the active `DeliveryConfiguration` (e.g. order ≥ ₹2,000 ships free; sub-threshold orders pay slab/fallback rates).
- **Coupons** — `OrderDiscount` validated for activity, validity window, minimum order value, usage limit; percentage discounts capped by `max_discount_cap`.
- **Stock** — quantity must be > 0 and ≤ available stock; inactive products rejected.
- **Snapshot** — price, tax, delivery and discount values are snapshotted onto the order at creation; later configuration changes never alter existing orders.

## 3. Payment Workflow

- `POST /api/v1/payments/initiate/` creates a Razorpay gateway order and returns `gateway_order_id`.
- `POST /api/v1/payments/verify/` validates the HMAC signature (`gateway_order_id|payment_id`) server-side:
  - invalid signature → 400, order remains `Pending`;
  - duplicate verification → idempotent success (no duplicate order/payment effects);
  - unknown order → 400.
- Webhook/event handling is idempotent; late webhooks for cancelled orders do not resurrect orders.
- COD orders skip the gateway: payment status stays `Pending` until delivery settlement.

## 4. Order Lifecycle (FSM)

```
Pending → Confirmed → Packed → Shipped → Delivered
Pending → Cancelled
Delivered → Return Requested → Return Approved → Return Completed
Return Requested → Return Rejected
```

- Transitions via `PATCH /api/v1/orders/{id}/status/` (admin) and `POST /api/v1/orders/{id}/cancel/` (customer).
- Invalid jumps (e.g. `Pending → Delivered`) are rejected with 400.
- Every accepted transition writes an `OrderStatusHistory` row (audit trail) and emits a customer communication.
- Stock effects: deducted at checkout; restored only on `Cancelled` or `Return Completed`.

## 5. Inventory Lifecycle

- Checkout reserves stock atomically inside the order transaction; concurrent orders cannot oversell (verified with 10 parallel checkouts against stock=5 → exactly 5 succeed).
- `StockTransaction` is an append-only ledger: `SALE` (−qty), `RETURN`/`RESTOCK` (+qty), `ADJUSTMENT`.
- Product stock can never go negative; failed orders release no phantom reservations.
- Return request alone does not restore stock; only `Return Completed` does, exactly once.

## 6. Invoice Lifecycle

- `InvoiceService.create_invoice_for_order()` snapshots subtotal, taxable amount, CGST/SGST/IGST, shipping and total into `Invoice` + `InvoiceItem` rows.
- `InvoiceService.record_payment()` applies payments; `outstanding_amount = max(0, total − paid)` is a model property derived from successful `PaymentTransaction`s.
- `Paid` status is only reachable when outstanding reaches 0; invoices remain historically immutable when catalog prices or configuration change afterwards.

## 7. Quotation Lifecycle (B2B)

```
Draft → Sent → Approved → Converted
```

- Created per `Client` with itemized lines; totals computed server-side.
- `POST /api/v1/finance/quotations/{id}/convert/` issues a `Client` invoice linked via `quotation` FK.
- Duplicate conversion is rejected (400); conversion enforces the client credit limit; inactive clients cannot be quoted or converted.
- The quotation remains historically intact after conversion.

## 8. B2B / Credit Workflow

- `Client` carries `credit_limit`; exposure = sum of outstanding amounts of non-cancelled, non-paid invoices.
- Quotation conversion checks available credit and rejects (400, "credit limit exceeded") when the new invoice would exceed the limit.
- Client create/update/write audit entries into `AdminConfigAuditLog` (domain `client_credit`).
- Payments reduce exposure; fully paid invoices free the credit.

## 9. Finance Workflow

- `GET /api/v1/finance/summary/` (admin/staff only) aggregates KPIs from invoices, payments and expenses: total invoiced, paid, outstanding, expenses, net income, plus a six-month revenue/expense trend and P&L breakdown.
- Payments recorded on invoices are the single source for revenue; expenses are validated (positive amount, valid category) on creation.
- The frontend renders backend aggregates only — no client-side financial calculation.

## 10. Return Workflow (RMA)

- Eligibility: only `Delivered` orders can request a return (400 otherwise); duplicate return requests are rejected.
- Approval: admin moves `Return Requested → Return Approved`; rejection uses `Return Rejected` with a reason (customer notified).
- Completion: `Return Completed` restores stock once and writes `RETURN` ledger entries; financial reconciliation follows the invoice/refund policy (automated Razorpay outbound refunds remain deferred).

## 11. Communication Workflow

- `CommunicationLog` rows are written for registration, order confirmation, payment events, order-status changes, invoice generation and return events.
- Each log stores event type, recipient, template and a sanitized context snapshot — never passwords or JWTs (audited).
- Communication failures never roll back the primary business transaction; duplicate events are handled idempotently via `idempotency_key`.

## 12. Configuration Workflow

- `CompanyStoreConfiguration`, `TaxConfiguration`, `DeliveryConfiguration` (with `DistanceSlab`s) and `OrderDiscount` drive checkout math.
- Effective-date windows select the active configuration; overlapping active configurations are rejected.
- All configuration mutations are captured in `AdminConfigAuditLog` (old/new values, actor, IP, reason); unauthorized (non-admin) changes are rejected with 403.
- Historical orders/invoices keep their original snapshots after any configuration change.

## 13. RBAC Workflow

Roles exercised: `customer`, `admin/staff`, `superadmin` (plus B2B `Client` objects operated by staff).

| Resource                | Customer | Staff/Admin | Superadmin |
|-------------------------|----------|-------------|------------|
| Catalog, search         | ✅       | ✅          | ✅         |
| Own orders / addresses  | ✅       | ✅          | ✅         |
| Other users' orders     | ❌       | ✅          | ✅         |
| Order FSM transitions   | ❌       | ✅          | ✅         |
| Finance summary         | ❌ (403) | ✅          | ✅         |
| Expenses / quotations   | ❌       | ✅          | ✅         |
| Configuration changes   | ❌       | ✅ (audited)| ✅         |

- Unauthenticated access to protected routes → 401; authenticated but unauthorized → 403.
- Frontend route guards (`ProtectedRoute`) mirror — but never replace — backend enforcement.

## 14. Failure / Recovery Behavior

All failures return the canonical error contract (`detail` or field-keyed errors) with the correct HTTP status, leave no partial transaction state, and keep the database consistent:

| Failure                    | HTTP | Behavior                                            |
|----------------------------|------|-----------------------------------------------------|
| Invalid payload            | 400  | Nothing persisted                                   |
| Insufficient stock         | 400  | No order, no stock change                            |
| Insufficient credit        | 400  | No invoice issued                                    |
| Invalid payment signature  | 400  | Order stays Pending; no payment recorded             |
| Invalid FSM transition     | 400  | Status unchanged                                     |
| Expired/tampered token     | 401  | Protected resources unreachable                      |
| Unauthorized role          | 403  | No mutation, admin action logged where applicable    |
| Concurrent oversell        | 400  | Atomic row locking; exactly the available units sell |

## 15. Known Limitations

1. **Automated Razorpay outbound refunds are deferred** (per phase instructions): return completion restores stock and adjusts invoice state, but the actual money movement must be executed manually in the Razorpay dashboard.
2. **SMTP delivery is environment-dependent**: communication logs are always written, but real email delivery requires configured SMTP credentials; tests validate log creation, not inbox delivery.
3. **Cart is client-side until checkout**: the persistent cart lives in browser storage (authenticated gating applied); the backend validates everything authoritatively at checkout — there is no server-side cart model.
4. **Delivery distance is slab-derived**: distance is estimated from address pincode/region slabs, not live GIS routing.
5. **Payment gateway runs in test mode** outside production keys; verification uses the configured test secret via HMAC.

## 16. Test Commands

```bash
# Backend
docker exec veepower_backend python manage.py check
docker exec veepower_backend python manage.py makemigrations --check --dry-run
docker exec veepower_backend python manage.py test tests.test_step15_complete_workflows
docker exec veepower_backend python manage.py test tests

# Frontend
npm run typecheck
npm run build
npm run test:integration
npx playwright test
npx playwright test tests/e2e/responsive.spec.ts
npx playwright test tests/complete-workflows.spec.ts
node tests/comprehensive_audit.mjs

# Database consistency audit (read-only)
docker exec -i veepower_backend python manage.py shell < backend/tests/audit_step15_db_consistency.py

# Infrastructure
docker compose ps
```
