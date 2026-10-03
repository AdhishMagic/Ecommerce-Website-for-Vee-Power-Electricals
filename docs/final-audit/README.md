# Step 22 — Final Application Audit

The authoritative final technical audit of the Vee Power Electricals e-commerce
application, consolidating evidence from Steps 1–21 immediately before the
application-freeze phase (Step 23). This phase added no functionality, made no
redesign, performed no speculative refactoring, and deleted no tests. Every
conclusion below is evidence-backed; live evidence was (re-)executed at
baseline commit `d820cac` during this audit.

- **Audited baseline commit:** `d820cac` (`chore: clean repository`)
- **Prior verified commits:** `c30f4e7` (documentation), `d0a62a3` (regression), `4e0e4c4` (database integrity audit)
- **Working tree at audit start:** clean except untracked local metadata (`.freebuff/`), never committed
- **Status:** VERIFIED — application-side; see §32 for the readiness decision

---

## 1. Audit Objective

Establish, with evidence, whether the current application is: functionally
complete within declared scope, architecturally consistent, database-integrity
safe, security-hardened, regression-tested, responsive, performance-validated,
documented, repository-clean, and deployment-ready from an application
perspective. The implementation is the technical source of truth; the
documented requirements and business rules are the functional source of truth.

## 2. Baseline Commit

`d820cac` — `chore: clean repository` (Step 21). Confirmed via
`git status --short` (clean except `.freebuff/`) and `git log -1 --oneline` at
audit start. No code has changed since Step 21's full post-cleanup regression.

## 3. Current Commit

`d820cac` at audit start. The only change produced by this phase is this
document (`docs/final-audit/README.md`), committed as
`docs: finalize application audit`. No source, test, or configuration file was
modified.

## 4. Requirements Traceability

Every requirement is traced to implementation evidence. Nothing is assumed;
statuses are Verified / Partially verified / Deferred.

| Requirement | Implementation | Evidence | Status |
|---|---|---|---|
| Authentication | JWT (HS256, access 30 min / refresh 7 d, rotation + blacklist) in `backend/config/settings/base.py` (`SIMPLE_JWT`, ~L155); login/refresh/logout/reset endpoints; `token_blacklist` tables live in DB | `docs/security/authentication.md`; `test_phase4_auth_rbac.py` (43 tests); integration script auth checks | **Verified** |
| RBAC | Permission classes `IsCustomer`, `IsAdminUser`, `IsStaffOrReadOnly`, `IsSuperAdminUser`, `IsOwnerOrAdmin` in `backend/apps/users/permissions.py` (re-read live this audit); frontend `ProtectedRoute` guards; inactive users rejected | `test_phase4_auth_rbac.py`; `test_step13_security.py` (45 tests); Playwright RBAC specs | **Verified** |
| Catalog | Categories → subcategories → brands → products with SKU, slugs, images (primary image), activation/deactivation (soft delete), admin import | `test_step5_catalog.py` (28); `docs/catalog/`; live audit catalog checks; Playwright catalog specs | **Verified** |
| Inventory | Stock balances + insert-only stock ledger, transaction direction, order deduction, cancellation/return restoration, negative-stock + overselling protection, row-lock concurrency | `test_phase6_services.py`, `test_step6_inventory.py` (20), `test_phase7_concurrency.py`; `docs/inventory/`; audit inventory checks | **Verified** |
| Orders | Canonical 10-state FSM (`OrderStatus` in `apps/orders/models.py:7` re-read live: PENDING, CONFIRMED, PACKED, SHIPPED, DELIVERED, CANCELLED, RETURN_REQUESTED/APPROVED/REJECTED/COMPLETED); immutable `OrderStatusHistory`; `total = subtotal(net) + tax + shipping` | `test_step7_order_return.py` (22), `order_payment_consistency.py` (20); audit E1–E4 | **Verified** |
| Payments | Payment creation, gateway validation, HMAC/webhook validation, amount authority, idempotency by gateway id, duplicate-webhook safety, cross-order protection, `chk_pay_reference` DB constraint | `test_payment_gateway.py` (19); `docs/payment/`; audit payment checks; `finance/models.py:505` constraint verified live | **Verified** (outbound refunds deferred — §30) |
| Returns | Request → approval/rejection → completion; return quantities, stock restoration, refund accounting via invoice adjustment/credit notes | `test_step7_order_return.py`, `test_step15_complete_workflows.py` return flows | **Verified** |
| Quotations | Draft → approved → converted (single-conversion rule); snapshot behaviour; strict status gates; `select_for_update` concurrency | `test_step8_quotation_invoice.py` (14); guard code re-read live in `quotation_service.py` (§13) | **Verified** |
| Invoices | Statutory invoice generation on conversion (+18% GST on quotation value), invoice numbering, payment status, outstanding balance, overpayment blocked | `test_step8_quotation_invoice.py`, audit E4–E6 (PAID ⇒ no outstanding; no overpaid invoices) | **Verified** |
| B2B / Credit | `Client` model (unique GSTIN, client code, active/frozen), `credit_limit` CHECK ≥ 0, `available_credit = max(0, credit_limit − exposure)` (`finance/models.py:168` re-read live), concurrent credit consumption via `select_for_update`, audit history | `test_step9_b2b_credit.py` (25); audit F1/F2/F3, H6 (GSTIN uniqueness) | **Verified** |
| Finance | Expenses (non-positive blocked), payout settlements (`net = gross − fee − tax_on_fee`), balances, summary, reversals; exposure = Σ max(0, invoice − payments) over Unpaid/Overdue | `test_step10_finance.py` (25), `expense_api.py` (16); audit G1/G2 | **Verified** |
| Configuration | Company/store/GST/slabs/discount-cap/shipping config with insert-only `admin_config_audit_logs` protecting historical transactions | `test_step11_configuration.py` (24); audit H1/H2 (domains, SET_NULL trail) | **Verified** |
| Communication | Email + in-app communication logs, templates, password-reset hooks; logs never leak credentials (audit H3) | `communication_service.py` (17 tests); `docs/communication/` | **Verified** (SMS/WhatsApp deferred — §30) |
| Responsive UI | 13-viewport suite, 200% zoom, modals, mobile tables; no horizontal overflow | Responsive 62/62 + overflow 172/172 (Step 21 at `d820cac`); `docs/responsive/` | **Verified** |
| Security | RBAC, IDOR/BOLA, mass assignment, SQLi, XSS, CSRF, CORS, security headers, rate limiting, payment/webhook security, JWT rotation/blacklist, audit logging | `test_step13_security.py` (45) + `test_phase7_security.py` (14); `docs/security/authentication.md` | **Verified** |
| Testing | 595 backend tests (27 files), 34-test integrity suite, 44-check live audit, 171 Playwright, 17 integration, 32 comprehensive, 172 overflow, 13 perf | `docs/testing/README.md` (authoritative); live re-verification §22 | **Verified** |
| Documentation | 14 curated docs (`docs/`), backend design records, README; all real routes/config documented | `docs/api/README.md`, `docs/architecture/README.md`, `docs/deployment/README.md`, `docs/user-guide/README.md`, `docs/limitations.md`; link check §26 | **Verified** |
| Error handling | Structured exception handling, validation errors, DRF error responses, frontend error surfaces | `test_step12_error_handling.py` (30); `docs/error-handling/` | **Verified** |
| Deployment readiness | Docker Compose stack healthy; `production.py` requires env; env matrix documented | Docker 3/3 healthy live this audit; `docs/deployment/README.md` | **Partially verified** (no production deployment exists — §27) |

No requirement was invented; deferred items are tracked in §30 and never
counted as implemented.

## 5. Architecture

Target architecture is **React + TypeScript + Vite + Tailwind** (frontend),
**Django + Django REST Framework** (backend), **MySQL 8** (data), **Docker**
(infrastructure). Verified live:

- **Frontend ownership unambiguous:** single API layer (`frontend/src/services/authService.ts`, `productService.ts`); all other data flows through typed API calls to `/api/v1/...`. Obsolete wrappers (`api.ts`, `inventoryService.ts`, `orderService.ts`, `types/order.ts`, `types/inventory.ts`) removed at Step 21 — absence re-verified live this audit (`ls frontend/src/services/`, `frontend/src/types/`).
- **Backend ownership unambiguous:** 8 Django apps (`users`, `products`, `inventory`, `orders`, `finance`, `commercial_config`, `communication`, `common`/`core`); all business logic server-side in services (`apps/finance/services/`, inventory services). No business logic duplicated into the frontend; cart is deliberately client-side until checkout, with authoritative backend validation (documented limitation, not duplication).
- **API ownership unambiguous:** single API surface under `/api/v1/` documented from actual URLConf (`docs/api/README.md`).
- **Database ownership unambiguous:** single MySQL instance (`veepower_db`), Django migrations sole schema authority; `makemigrations --check` → *No changes detected* live.
- **No obsolete runtimes:** repository grep for Laravel/Express runtimes returns only Django ORM `Case`/`When` expression code; no active Laravel/Express service exists.
- **No production mock data:** `MOCK_|mockData|mock_` scan of `frontend/src` → 0 matches; integration-hardening and comprehensive-audit data-isolation checks green at Step 21.

Reference: `docs/architecture/README.md` (layer boundaries, Mermaid diagram, key decisions, updated post-Step-21).

**Ambiguities:** none found. The only deliberate boundary note is the client-side cart (§29).

## 6. Authentication

- JWT HS256; access 30 min, refresh 7 d; refresh rotation with blacklist (`token_blacklist_blacklistedtoken`, `token_blacklist_outstandingtoken` tables verified live in DB).
- Login, refresh, logout, password reset (timeout 86400 s) verified by 43 auth tests + live integration checks (refresh returns 200 + new access token).
- Dev fallback secrets exist in `base.py` only; `production.py` requires `DJANGO_SECRET_KEY`/`JWT_SECRET_KEY` from environment (verified in `docs/security/authentication.md` and Step 19 security review).

## 7. RBAC (Authorization)

- Five permission classes re-read live from `backend/apps/users/permissions.py`: `IsCustomer` (explicitly excludes staff/superusers), `IsAdminUser`, `IsStaffOrReadOnly`, `IsSuperAdminUser`, `IsOwnerOrAdmin` (object-level owner-or-admin).
- API authorization enforced server-side (tests assert 401/403 across roles); frontend `ProtectedRoute` is UX only — the audit explicitly does **not** treat frontend guards as security.
- IDOR/BOLA protection: owner-or-admin object permissions + per-user query scoping (45-test security suite; live integration IDOR check green).
- Admin/customer isolation enforced; inactive users are rejected at authentication.
- Audit-trail integrity: admin users `is_staff=True` (audit H4), roles within vocabulary (H5), audit logs domain-checked (H2) with `SET_NULL` preserving history (H1) — all PASS live.

## 8. Catalog

- Category hierarchy (categories → subcategories, brands) with products carrying SKU identifiers, slugs, image gallery with primary image.
- Product activation/deactivation is soft delete (`active=0`) preserving historical order/invoice links; 11 active products live; fixture hygiene documented (`docs/operations/README.md` §8).
- Catalog APIs and customer rendering verified (28 catalog tests, Playwright catalog specs, live integration product checks).
- No mock catalog data active (§5).

## 9. Inventory

- Authoritative model: stock balances + insert-only `stock_transactions` ledger (direction recorded; updates/deletes blocked).
- Order placement deducts stock; cancellation restores; return completion restores; negative-stock and overselling protection via row locking; concurrency tests green (`test_phase7_concurrency.py` + comprehensive audit concurrency 2/2).
- Integrity verified live: audit inventory checks PASS (structural, financial, inventory and audit integrity — `AUDIT RESULT: PASS`, 44 checks).
- No manual stock alterations were made during this audit (none were needed).

## 10. Orders

- Canonical 10-state `OrderStatus` re-read live (`apps/orders/models.py:7–17`); legacy states (`PROCESSING`, `OUT_FOR_DELIVERY`, `RETURNED`) are rejected by validation.
- Composition verified live by audit checks E1–E3: `order.subtotal == Σ item.subtotal`; item tax absent (runtime) or reconciles to order tax (legacy seed row only); `order.total = subtotal(net) + tax + shipping`.
- Creation, totals, tax (order-level), shipping, discounts (`total_discount` informational, MRP-based), cancellation, and impossible-state-combination rejection all covered by `test_step7_order_return.py` (22), `order_payment_consistency.py` (20), and Step 15 workflow tests (69).
- Immutable `OrderStatusHistory` audit log.

## 11. Returns

- Full lifecycle: `RETURN_REQUESTED` → `RETURN_APPROVED`/`RETURN_REJECTED` → `RETURN_COMPLETED`, with return-quantity validation, stock restoration on completion, and invoice adjustment/credit-note accounting.
- Reason requirements and state-gate rejections covered in Step 7/Step 15 suites; live integration script exercised return flows end-to-end at Step 21.

## 12. Payments

- Payment creation with gateway validation; HMAC/webhook signature validation; amount authority (server-side amount is authoritative); idempotency keyed by gateway transaction id (duplicate webhooks safe); cross-order transaction protection (a payment cannot attach to a different order).
- Payment/order and payment/invoice relationships enforced; **`chk_pay_reference`** (`payment_transactions.order OR invoice must be set`) verified live: constraint present in `apps/finance/models.py:505`, migration `finance/0002_add_payment_reference_check` applied (`showmigrations finance` → `[X]` both).
- Automated Razorpay **outbound** refunds remain deferred/manual — a documented scope decision (§30), not classified as a defect.

## 13. Quotations

- Lifecycle draft → approved → converted with strict status gates; direct transition to `CONVERTED` forbidden except through `convert_quotation_to_invoice` (error message verified in code).
- Step 18 hardening re-verified live in `apps/finance/services/quotation_service.py` (~L90–112): `select_for_update()` row lock on the quotation, duplicate-conversion guard, and the **invoice-existence guard** (a quotation already carrying an invoice can never be converted again, regardless of status — the authoritative marker).
- Snapshot behaviour: quotations freeze pricing at approval; conversion consumes the snapshot.

## 14. Invoices

- Converted invoice = quotation value + 18% GST; invoice totals mirror order composition (audit E4); invoice numbering sequential; payment status and outstanding amount maintained (`PAID` ⇒ outstanding zero — E5; no overpayment — E6), all PASS live.
- Historical isolation: configuration changes never rewrite historical invoices (insert-only audit-log protection, H1/H2 PASS live).

## 15. B2B / Credit

- `Client` model re-read live (`apps/finance/models.py:101`): unique GSTIN (H6 PASS), client code, active/frozen status (frozen clients cannot consume credit — F3 informational), `credit_limit` with DB CHECK ≥ 0 (F2 PASS).
- Authoritative calculation re-read live at `finance/models.py:168`:
  `available_credit = max(0, credit_limit − exposure)`, where exposure = Σ max(0, invoice.total − payments) over Unpaid/Overdue invoices (F1: no client exceeds limit — PASS; live exposure sample: client 1 = 53,100 vs limit 500,000).
- Successful payments reduce exposure; concurrent credit consumption serialized via `select_for_update` (`test_phase7_concurrency.py`); full client audit history retained.

## 16. Finance

- Expenses: non-positive amounts blocked (G1 PASS); payout settlements: `net = gross − fee − tax_on_fee` (G2 PASS); balances, summary, and reversals verified by 25 finance tests + 16 expense-API tests.
- No fabricated duplicate invoices remain: the Step 18 repair (ids 2–9 cancelled, not deleted, preserving audit history) still holds — audit E1–E6 green live.

## 17. Configuration

- Company/store, GST, distance slabs, discount cap, shipping rules, delivery configuration — all admin-managed with validation and insert-only `admin_config_audit_logs`.
- Configuration changes are historically isolated from transactions (H1/H2 PASS live); 24 configuration tests green.

## 18. Communication

- Email + in-app communication logs with templates; password-reset hooks; credential/token leakage into logs blocked (H3 PASS live).
- Development uses the console email backend (logged, not sent) — documented limitation; production requires `EMAIL_*` env configuration (§29). SMS/WhatsApp deferred (§30).

## 19. Error Handling

- Structured exception types, DRF validation errors, consistent error payloads, frontend error boundaries/toasts; 30 dedicated error-handling tests green (`test_step12_error_handling.py`); `docs/error-handling/`.

## 20. Security

- Server-side enforcement verified across: RBAC (§7), IDOR/BOLA, mass assignment, SQL injection, XSS, CSRF, CORS, security headers, rate limiting (throttle settings `THROTTLE_RATE_*` in `base.py:132–140`), payment security, webhook verification, auth timing, and audit logging — 59 dedicated security tests (45 + 14) green at Step 21; security checks inside the 44-check live audit green this audit.
- Secret hygiene re-verified live: no `.env` tracked; no private-key blocks, AWS keys, `sk_live_`, or `rzp_live_` credentials anywhere in tracked content (only doc references and `.env.example` templates with placeholder/dev-only values); secrets read from environment.
- Rate limiting is in-memory in development — multi-worker production should configure Redis (documented limitation, §29; not a defect against current scope).

## 21. Database Integrity

Re-executed live this audit at `d820cac`:

- **34-test integrity suite:** `python manage.py test tests.test_phase8_database_integrity` → **Ran 34 tests — OK** (37.9 s).
- **44-check live audit:** `AUDIT RESULT: PASS — structural, financial, inventory and audit integrity verified` (8 informational notes; 0 offending rows in every invariant).
- **Migrations:** `manage.py check` → 0 issues; `makemigrations --check --dry-run` → *No changes detected*; `showmigrations finance` → `0001_initial [X]`, `0002_add_payment_reference_check [X]`.
- **Live tables:** 40 base tables verified via `information_schema` (explicit list captured; includes `token_blacklist_*`, audit logs, ledgers). Informational: `docs/database/README.md` (Step 18) records "41 tables" — a documentation-count drift of one, reconciled in §28; no integrity impact.
- Full schema record, repair history (R1/R2 with reversal SQL), and transaction-boundary documentation: `docs/database/README.md`.

## 22. Regression (Automated)

Two evidence tiers:

**Re-executed live during this audit (at `d820cac`):**

| Gate | Result |
|---|---|
| Django system check | 0 issues |
| Migration drift / pending | none (no changes detected) |
| 34-test integrity suite | 34/34 OK |
| 44-check live DB audit | PASS (44/44 invariants) |
| TypeScript (`tsc --noEmit`) | clean |
| Production build (`vite build`) | clean (8.99 s, code-splitting intact) |
| Docs link check (85 markdown files) | 54 relative links, **0 broken** |
| Secret scan | clean |
| Docker stack | 3/3 healthy (`veepower_backend` healthy, `veepower_frontend` up, `veepower_mysql` healthy) |
| Backend test inventory | 595 `def test_` methods across 27 files — static count matches Step 19/21 runner result |

**Cited from Step 21's post-cleanup full regression (executed at exactly `d820cac`; zero source changes since — verified via `git log` and clean tree):**

| Gate | Result at `d820cac` |
|---|---|
| Backend full suite | 595/595 OK (498 s), 0 failures/errors/skips |
| Playwright E2E | 171/171 (workers=1, sequential) |
| Live integration script | 17/17 |
| Comprehensive backend audit (Node) | 32/32 |
| Overflow audit | 172/172 |
| Performance gate | 13/13 (+10 backend perf tests inside the 595) |
| Visual capture/compare | 15 baselines, no UI drift |

Authoritative regression record with per-suite reproduction commands: `docs/testing/README.md` (§19). Sequential-execution rule for mutating suites: `docs/testing/README.md` §18.

## 23. Responsive

- Comprehensive responsive suite 62/62 (13 viewports 1920×1080 → 414×896, 200%-zoom simulation, admin modals, mobile table scroll) and overflow audit 172/172 at `d820cac`.
- Step 16 defects (modal max-height, checkout min-width) fixed and locked since; no UI changes after Step 16.
- Accessibility behaviors (keyboard navigation, focus visibility, reduced motion, touch) validated within the 62-test suite; visual comparison remains capture/inspect (§29).

## 24. Performance

- Frontend: 13/13 performance gate (no duplicate critical requests; admin bundle/chart isolation from customer routes; lazy images; stable dense lists; delayed-data resilience).
- Backend: 10 query-count/N+1 bound tests green within the 595 (product list/detail, category, my-orders, order items, pagination, client invoices constant as rows grow, finance summary bounded).
- No new optimization performed in this audit (validation-only phase, per rules).

## 25. Documentation

- 14 curated docs under `docs/` (architecture, api, security, database, testing, deployment, operations, user-guide, limitations, + domain docs), root README with real routes, 26 preserved backend design records (file:/// links converted to relative at Step 21).
- Live link check this audit: **85 markdown files, 54 relative links, 0 broken**.
- Documentation reflects the real implementation (routes derived from URLConf; env matrix from `base.py`); known limitations documented in `docs/limitations.md`.

## 26. Repository

- Working tree clean at baseline and kept clean throughout; only this document added (staged individually; `git add .` never used).
- Post-Step-21 tracked-file census (389 files) unchanged; dead code removed (5 obsolete frontend files); `.freebuff/` local metadata never committed.
- No historical evidence deleted: all phase reports, docs, and audit records preserved.

## 27. Deployment Readiness (Application Perspective)

- **Docker stack healthy live:** backend (healthy, :8000), frontend (:5173), MySQL 8.0.46 (healthy, :3306); health/readiness endpoints verified in prior phases.
- **Configuration:** `production.py` requires real env secrets; complete env matrix documented (`docs/deployment/README.md`); dev fallbacks are explicit and dev-only.
- **Not yet validated against live infrastructure:** no production deployment exists yet — HTTPS/proxy header enforcement, Redis cache for multi-worker rate limiting, production SMTP, and real Razorpay keys are documented pre-deployment configuration steps, not application defects.
- **Pre-production checklist** (advisory, from Steps 18–21): run `audit_step18_database_integrity.py` against the production snapshot after first migrate; confirm `finance/0002_add_payment_reference_check` applied; configure Redis cache; configure `EMAIL_*` SMTP; supply live Razorpay credentials; set `DJANGO_SECRET_KEY`/`JWT_SECRET_KEY`/`DATABASE_*`/`RAZORPAY_*`/`FRONTEND_URL`/`VITE_API_URL`.

## 28. Findings

**Critical:** none.

**High:** none.

**Medium:** none.

**Low:** none.

**Informational:**

1. **Doc table-count drift:** `docs/database/README.md` (Step 18) states 41 tables; live `information_schema` shows 40 base tables (explicit list verified this audit). A count transcription artifact from the Step 18 record; the integrity invariants are unaffected (all PASS). Recorded, not silently corrected, to preserve historical evidence.
2. **Test-runner dependency note:** `@playwright/test` is consumed from root-level `node_modules` and not declared in `frontend/package.json` (known informational finding from Step 19; root `node_modules` must not be deleted).
3. **Cosmetic test-script string:** integration script prints `Tax: ₹undefined` in its own console line while asserting correct totals (Step 19 §14).
4. **Legacy seed row** `ORD-2026-0001` stores order-level tax on its item row (reconciles exactly; seed data outside app scope).
5. **Dev audit fixtures:** 25 backdated inactive products + per-run `Concurrency Test Switchgear` fixture neutralized by documented hygiene procedure.
6. **No production environment exists** against which to run the audit script — pre-production checklist in §27 covers this.

No Critical or High finding exists; no blocker fix was required, so no code was changed and the freeze phase can proceed.

## 29. Known Limitations

Maintained authoritatively in [docs/limitations.md](../limitations.md) (verified at `d0a62a3`, unchanged since). Headlines: console email backend in development; in-memory rate limiting (Redis for multi-worker production); INR-only; offline support limited; client-side cart until checkout (backend validates authoritatively); pincode-slab delivery (no GIS); Razorpay test-mode in development; visual comparison is capture/inspect; `/admin/customers` and `/admin/settings` are "Coming soon" placeholders.

## 30. Deferred Features

Not implemented by scope decision; never classified as done:

- Automated Razorpay outbound refunds (manual execution + in-app reconciliation).
- External GST filing/API integration; external credit bureau integration.
- SMS/WhatsApp notification channel.
- i18n / multi-currency.
- Automated screenshot pixel-diff thresholds.
- Server-side cart model.

## 31. Production Blockers

**None** from the application perspective. The application is deploy-ready per §27; remaining items are standard pre-production environment configuration (secrets, Redis, SMTP, live gateway keys, HTTPS proxy) plus the advisory production-snapshot audit run. No code change is required.

## 32. Final Readiness Decision

**VERIFIED — the application is ready for the freeze phase (Step 23).**

Basis: every required audit category holds evidence (§4 traceability: 18/18 requirements Verified, 1 Partially verified by definition — deployment against live infrastructure); all live gates re-executed this audit pass; all full-regression gates passed at exactly `d820cac` with zero source changes since; zero Critical/High/Medium/Low findings; all limitations are documented and none violates an established requirement. No numerical scores are used; subsystems are not ranked. The deployment-readiness row is *Partially verified* because no production deployment exists — this is explicitly not claimed anywhere in the record.

## 33. Reproduction

```bash
# Baseline confirmation
git status --short && git log -1 --oneline   # expect clean tree + d820cac

# Django / migrations (in-container)
docker exec veepower_backend sh -c "python manage.py check && python manage.py makemigrations --check --dry-run && python manage.py showmigrations finance"

# Live 44-check integrity audit
docker exec -i veepower_backend python manage.py shell < backend/tests/audit_step18_database_integrity.py

# 34-test integrity suite
docker exec veepower_backend python manage.py test tests.test_phase8_database_integrity --noinput

# Frontend typecheck + build
cd frontend && npx tsc --noEmit && npm run build

# Full regression suites (sequential for DB-mutating ones; see docs/testing/README.md §18)
docker exec veepower_backend python manage.py test tests --noinput          # 595 tests, ~8-11 min
node tests/integration.test.mjs                                             # 17 checks
npx playwright test --reporter=list                                         # 171 tests
node tests/overflow-audit.mjs                                               # 172 checks
node tests/comprehensive_audit.mjs                                          # 32 checks
```

*Audit executed 2026-10-03 at baseline `d820cac`. Only this document was created by Step 22.*
