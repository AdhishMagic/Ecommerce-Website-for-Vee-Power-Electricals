# Vee Power Electricals — Database Integrity Audit Documentation (Step 18)

This document records the comprehensive, read-only-first database integrity audit
of the live development database. The phase **audited before modifying**, found one
real data defect, repaired it explicitly (reversibly, without deletion), hardened
the two code paths that permitted it, and added a permanent 34-test integrity
regression suite plus a re-runnable 44-check live audit script.

- Read-only audit before any change
- No destructive cleanup: the one real defect was repaired by *cancelling*, not deleting
- Every repair is documented with its exact reversal SQL
- No business semantics changed; two guards and one CHECK constraint added

**Baseline commit:** `da93756` (`feat: optimize application performance`)
**Final commit:** `feat: audit database integrity`

---

## 1. Objective

1. Data relationships structurally valid; FK relationships consistent.
2. Business-critical invariants preserved (stock, credit, conversion rules).
3. Financial totals internally consistent (orders, invoices, payments).
4. Inventory and stock ledger reconstructable.
5. Orders, payments, invoices and returns mutually consistent.
6. B2B credit exposure mathematically consistent against limits.
7. Configuration history does not corrupt historical transactions.
8. No orphaned records where prohibited; no duplicate authoritative records.
9. Database constraints match application-level assumptions.
10. Existing migrations accurately represent the current models.

**Live database audited:** MySQL 8.0.46, database `veepower_db` (41 tables), via
`backend/tests/audit_step18_database_integrity.py` executed inside
`veepower_backend` (`python manage.py shell < backend/tests/audit_step18_database_integrity.py`).

---

## 2. Schema Inventory

- **41 tables** across apps: `core`, `users`, `catalog`, `inventory`, `orders`,
  `finance`, `b2b` (clients/quotations), `communication`, `payouts`.
- Every model-declared `ForeignKey` has a physical index.
- All model-declared `UniqueConstraint`s and `CheckConstraint`s exist physically.
- `payment_transactions.gateway_transaction_id` carries a **non-unique** index by
  design: payment idempotency (replay protection) is enforced at the application
  level by `InvoiceService.record_payment`, which replays the stored outcome for a
  repeated gateway id instead of relying on a DB unique constraint (a unique
  constraint would make recording a *duplicate attempt* impossible rather than
  idempotent). The B2 uniqueness check verifies no duplicates exist in practice.
- Migrations: `finance/0001_initial`, `finance/0002_add_payment_reference_check`
  (added this phase). `makemigrations --check --dry-run` → `No changes detected`;
  `showmigrations finance` → both `[X]` applied.
- **Transaction boundaries & locking:** checkout, payment capture/verification,
  quotation conversion, credit checks and stock movements run inside
  `transaction.atomic()` with `select_for_update()` row locks on the affected
  product/order/invoice/client rows (oversell, double-conversion and
  double-payment protection). Communication-log writes are intentionally
  non-transactional relative to business mutations (logging never rolls back
  the primary transaction). Append-only ledgers (stock transactions, audit
  logs) are corrected only by compensating rows.

## 3. Live Data Snapshot (audit time)

| Entity | Count | Notes |
|---|---|---|
| Orders | 276 | 223 PENDING, 12 CONFIRMED, 41 DELIVERED |
| Invoices | 27 | 8 Cancelled (repaired fabrication), 19 active |
| Payment transactions | 1 | unique gateway id, reconciles to its invoice |
| Clients (B2B) | 44 | all active, unique GSTINs |
| Products | 36 | 11 active; 25 inactive fixtures backdated to 2026-09-24 |
| Stock ledger | 281 | 6 RESTOCK + 275 SALE, 0 RETURN; all SALE/RETURN rows reference orders |

## 4. Key Data Semantics Established (and now encoded in tests)

1. **Order composition:** `total = subtotal + tax + shipping`, where `subtotal` is
   **net of product discounts** (sellable `price`; `mrp − price` is informational
   only) and tax is computed at **order level** (18% CGST/SGST domestic,
   IGST inter-state).
2. **Order item rows** carry `taxable_amount = line net amount` and
   `tax_amount = 0.00` — `BillingService` populates item tax only in the
   order-level aggregate ("Populated after tax allocation").
3. `order.total_discount` is **informational** (MRP-based), already netted into
   the subtotal; it is *not* a subtraction term of the composition.
4. **Invoice from order** mirrors the order one-for-one:
   `invoice.total = invoice.subtotal + invoice.tax + invoice.shipping`;
   `invoice.discount_amount` is likewise informational.
5. **Invoice from converted quotation:** `total = quotation value + 18% exclusive
   GST` (e.g. 3000 → 3540.00); IGST path verified for inter-state (Karnataka) clients.
6. **Credit exposure** = Σ max(0, invoice.total − successful payments) over
   Unpaid/Overdue invoices; available credit = max(0, limit − exposure); cancelled
   invoices release exposure; inactive clients cannot consume credit.

The earlier Step 15 audit script (`audit_step15_db_consistency.py`) used formulas
inconsistent with these semantics (Title-case status comparisons never matched
uppercase data; its A11 check was vacuous). Do **not** reuse its formulas; Step 18's
script is authoritative.

---

## 5. Defect Found (High) — Fabricated Duplicate Invoices

**Symptom (initial audit):** 9 invoices referenced the *same* quotation while the
one-conversion rule expects exactly one; client 1 (L&T Construction, credit limit
500,000) showed exposure **477,900.00** — 9 × 53,100.

**Root cause investigation:** 8 of the 9 (ids 2–9, `INV-2026-0002`…`INV-2026-0009`,
each ₹53,100.00, client 1, **no order**, all FK to seeded quotation #1
`QUO-2026-0001`, notes exactly *"Converted during Phase 9 audit"*) were fabricated
by historical audit runs that converted the same Approved quotation repeatedly.
The service guard `convert_quotation_to_invoice` keyed **only** on
`status == CONVERTED`, so nothing rejected a second conversion while the first was
still recorded as Approved. The 9th invoice (`INV-2026-0001`) is the legitimate
seeded invoice of that quotation.

**Exposure impact:** client 1's true exposure is **53,100.00** (one invoice);
the extra 8 were inflating it by 424,800.

## 6. Repairs Executed (explicit, reversible, no deletion)

| # | Action | Reversal SQL |
|---|---|---|
| R1 | Invoices **2–9** → `status = 'Cancelled'` (history preserved; exposure recomputed to 53,100.00 and verified) | `UPDATE invoices SET status='Unpaid' WHERE id IN (2,3,4,5,6,7,8,9);` |
| R2 | Quotation **#1** `Approved` → `Converted` (it carries exactly one non-cancelled invoice, `INV-2026-0001`) | `UPDATE quotations SET status='Approved' WHERE id=1;` |

Post-repair verification: audit check **B6** ("each CONVERTED quotation maps to
exactly one non-cancelled invoice") and **A11** ("invoices only reference
CONVERTED quotations") both PASS; client 1 exposure 53,100.00 ≤ limit 500,000 (F1 PASS).

## 7. Code Hardening (defect class eliminated)

1. **`backend/apps/finance/services/quotation_service.py`** — new guard in
   `convert_quotation_to_invoice`: conversion is rejected if **any** invoice
   already references the quotation, *regardless of quotation status*. This
   closes the exact hole the fabricated invoices exploited (a second conversion
   while the first was still Approved). The 18 legitimate conversions performed by
   the current service (all QTN-* quotations: Converted + exactly 1 invoice)
   remain unaffected.
2. **`backend/apps/finance/models.py`** — `PaymentTransaction` gained
   `chk_pay_reference`: `Q(order__isnull=False) | Q(invoice__isnull=False)`
   (a payment must reference an order or an invoice). All three service-level
   create sites already comply; the viewset is read-only; live data complies.
   Migration **`0002_add_payment_reference_check`** created and applied; live-DB
   verified: raw `INSERT` with both FKs NULL →
   `ERROR 3819 (HY000): Check constraint 'chk_pay_reference' is violated`.

## 8. Permanent Regression Suite

`backend/tests/test_phase8_database_integrity.py` — **34 tests, 7 classes**, all
isolated via `IntegrityTestDataMixin` (users, catalog, tax/delivery configs,
clients, manual orders/invoices):

- `OrphanRelationshipIntegrityTests` — FK orphans, zero-item orders/invoices,
  `ProtectedError` on deleting referenced rows, status-history presence, stock
  restoration only for CANCELLED/RETURN_COMPLETED.
- `AuthoritativeIdentifierUniquenessTests` — SKU, invoice/quotation/order numbers,
  gateway transaction id, communication idempotency keys, config singleton.
- `InventoryLedgerConsistencyTests` — direction invariants, reconstructability,
  idempotent restore via RETURN rows, no negative stock.
- `OrderAndInvoiceTotalsIntegrityTests` — the §4 composition semantics, IGST path,
  overpayment rejection, payment → PAID → outstanding 0.
- `QuotationInvoiceConversionIntegrityTests` — exactly-one invoice per conversion,
  **including regression coverage of the new invoice-existence guard**.
- `B2BCreditIntegrityTests` — exposure math, payment reduction, limit enforcement,
  cancellation release, inactive-client denial, `available ≤ limit`.
- `ConfigurationAndAuditTrailIntegrityTests` — versioned config does not rewrite
  historical totals; audit-log attribution and append-only behaviour.

## 9. Live Audit Script — 44 Checks, All PASS

`backend/tests/audit_step18_database_integrity.py` (read-only; re-runnable):

- **A (orphans/relationships, 16)** — items↔orders/invoices/quotations, ledger↔product,
  ledger order references, payment order/invoice linkage, A11 quotation-conversion
  consistency, status history, restoration legality. *(A11/B6 reflect the repaired state.)*
- **B (uniqueness/config, 7)** — active-SKU, gateway-id, singleton config, tax/slab
  overlap, B6 one-non-cancelled-invoice-per-Converted-quotation, communication keys.
- **C (inventory, 3)** — no negative stock; direction invariants; every product's
  stock ≥ `initial − Σ(ledger)`.
- **D (state machine, 3)** — canonical 10-state vocabulary, no legacy statuses,
  return FSM ordering.
- **E (financial totals, 6)** — item/order/invoice composition per §4; item-level
  tax is either absent (runtime format) or reconciles exactly to the order's
  authoritative tax (legacy seed format — order 2, written by
  `seed_development_data.py`, is the single known legacy-format row); no PAID
  invoice retains outstanding; no overpayment.
- **F (B2B credit, 2)** — no exposure over limit; no negative limits.
- **G (finance, 2)** — non-positive expenses; settlement `net = gross − fee − tax_on_fee`.
- **H (audit trail/RBAC, 5)** — domain vocabulary (runtime domains
  `store/tax/delivery/slabs/shipping-rules/discounts/client/client_credit` plus the
  seed-only legacy `TAX_CONFIGURATION`); no credential/JWT leakage in communication
  logs; admin ⇒ is_staff; role vocabulary; GSTIN uniqueness.

Final run: **AUDIT RESULT: PASS — structural, financial, inventory and audit
integrity verified** (8 informational notes).

---

## 10. Regression Gate Evidence

| Gate | Result |
|---|---|
| Full backend suite (`manage.py test tests`) | **595 tests, OK** (630.8 s) |
| `makemigrations --check --dry-run` | PASS — `No changes detected` |
| `showmigrations finance` | `0001_initial` [X], `0002_add_payment_reference_check` [X] |
| Step 18 integrity suite | **34/34 PASS** |
| Live audit script | **PASS — 44/44 checks** |
| Comprehensive backend audit (`comprehensive_audit.mjs`) | **32/32 PASS** (Auth 8, Isolation 4, Security 4, Business 2, Order FSM 7, Finance 5, Concurrency 2) |
| Responsive overflow audit (`overflow-audit.mjs`) | **172/172 checks, 0 failures** (viewport matrix 1920→414) |
| Playwright end-to-end | **171/171 PASS** |
| Concurrency fixture | neutralized after audit (`products.active=0`, backdated) |
| Docker health | backend healthy (:8000), frontend up (:5173), mysql healthy (:3306) |

## 11. Security

- No credential/token leakage in communication logs (H3 PASS).
- Payment replay protection verified at service level; duplicate gateway ids absent (B2).
- New DB-level CHECK makes order-less *and* invoice-less payments physically impossible.
- Test users in suites use throwaway credentials; no secrets introduced.

## 12. Known Limitations

1. **Legacy seed row:** order 2 (`ORD-2026-0001`, seeded) is the only order whose
   item row carries the full order-level tax; it reconciles exactly and is
   documented, not rewritten (seed files out of audit scope).
2. **Live-data sparsity:** 1 payment transaction, 0 RETURN ledger rows live —
   return/refund invariants are covered by the isolated test suite, not by live rows.
3. **Backdated fixtures:** 25 inactive products carry backdated `created_at`;
   acceptable in a development database, would be inadmissible in production data.
4. **Audit ran on development DB:** production-parity confirmation requires a
   production snapshot run of the same script.

## 13. Production Blockers

None. (One advisory: run `audit_step18_database_integrity.py` against any
production snapshot before go-live, and ensure `finance/0002` is applied.)

## 14. Reproduction

```bash
# 34-test integrity suite
docker exec veepower_backend python manage.py test tests.test_phase8_database_integrity

# 44-check live audit (read-only)
docker exec -i veepower_backend python manage.py shell \
  < backend/tests/audit_step18_database_integrity.py

# Migration state
docker exec veepower_backend python manage.py showmigrations finance
```
