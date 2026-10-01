# API Reference — Vee Power Electricals

Documents **every implemented route**, extracted from `backend/config/urls.py`
and the app `urls.py` files (verified at commit `d0a62a3`). No invented
endpoints. Domain deep-dives: `docs/{orders,payment,inventory,catalog,finance,
b2b-credit,configuration,communication,error-handling}/README.md`,
`docs/api/expense-api.md`.

## Conventions

- **Base URL:** `/api/v1/`
- **Auth:** JWT Bearer access token (`Authorization: Bearer <access>`).
- **Roles:** `customer`, `admin` (admin also requires `is_staff`).
- **Errors:** canonical envelope `{ success, error: { code, message, details?,
  request_id? } }` with correct HTTP status (Step 12). Validation errors return
  field-level details.
- **Pagination:** DRF page-number pagination on list endpoints.
- **Router-derived endpoints** below expand DRF `DefaultRouter` patterns:
  `list` GET, `create` POST, `retrieve` GET `/{id}/`, `update`/`partial_update`
  PUT/PATCH `/{id}/`, `destroy` DELETE `/{id}/` (permission-gated per viewset).

## Authentication & Users — `apps/users`

| Method | Route | Purpose | Auth | Notes |
|---|---|---|---|---|
| POST | `/api/v1/auth/register/` | Customer self-registration | public | Creates `customer` user; auto-login tokens returned |
| POST | `/api/v1/auth/login/` | Obtain JWT access + refresh | public | Rate-limited (Step 13) |
| POST | `/api/v1/auth/token/refresh/` | Rotate access token | public (refresh token in body) | |
| POST | `/api/v1/auth/logout/` | Blacklist refresh token | auth | |
| GET | `/api/v1/auth/me/` | Current user profile | auth | |
| POST | `/api/v1/auth/password-reset/` | Request reset (email token) | public | Always 200 (no account enumeration) |
| POST | `/api/v1/auth/password-reset/confirm/` | Set new password with token | public | |

## Addresses — `apps/users` (`urls_address`), prefix `/api/v1/addresses/`

CustomerAddress ViewSet: standard CRUD (`GET/POST /`, `GET/PUT/PATCH/DELETE
/{id}/`). Owner-scoped: customers see only their own addresses (IDOR-safe);
admin sees all. First address defaults automatically.

## Catalog — `apps/products`, prefix `/api/v1/catalog/`

| Route | Purpose | Auth |
|---|---|---|
| `/categories/` + `/{id}/` | Category CRUD (list/create public; write ops admin) | mixed |
| `/subcategories/` + `/{id}/` | Subcategory CRUD | mixed |
| `/brands/` + `/{id}/` | Brand CRUD | mixed |
| `/products/` + `/{id}/` | Product list/detail; admin create/update/delete; list is public, filters/search/pagination | mixed |
| `/images/` + `/{id}/` | Product image management (admin) | admin |
| `/specifications/` + `/{id}/` | Product spec management (admin) | admin |

Business rules: SKU unique; product images/specs FK-protected; deactivation
hides from customer listings without destroying history.

## Inventory — `apps/inventory`, prefix `/api/v1/inventory/`

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/` | Stock overview across products | admin |
| GET | `/transactions/` | Ledger listing (filterable) | admin |
| POST | `/restock/` | RESTOCK ledger entry (+stock) | admin |
| POST | `/adjust/` | Manual ADJUSTMENT entry | admin |
| GET | `/summary/{product_id}/` | Per-product ledger summary | admin |

Ledger is append-only (`RESTOCK`/`SALE`/`ADJUSTMENT`/`RETURN`); every SALE/RETURN
row references its order; reconstructability invariant
`stock ≥ initial − Σ(ledger)` is audited live (Step 18). Overselling is blocked
by row-locked deduction in checkout.

## Orders — `apps/orders`, prefix `/api/v1/orders/`

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/checkout/` | Atomic cart → order (backend-authoritative totals, stock deduction, snapshot) | customer/admin |
| GET | `/my-orders/` | Customer's own orders | customer/admin |
| GET | `/` | Admin order list (filter by status) | admin |
| GET | `/{id}/` | Order detail (owner or admin) | auth |
| PUT/PATCH | `/{id}/status/` | FSM transition (canonical state machine) | admin |
| POST | `/{id}/cancel/` | Cancel order + restore stock | owner/admin |
| POST | `/{id}/return/` (alias `/return-request/`) | Request return on DELIVERED order | owner |
| GET | `/{id}/history/` | Status history | owner/admin |

**FSM (canonical, 10 states — legacy states rejected):** `PENDING → CONFIRMED →
PACKED → SHIPPED → DELIVERED`; `CANCELLED` from pre-delivery states;
`RETURN_REQUESTED → RETURN_APPROVED → RETURN_COMPLETED` or `RETURN_REJECTED`
from DELIVERED. Full rules: `docs/orders/README.md`.

## Payments — `apps/finance` (`urls_payments`), prefix `/api/v1/payments/`

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/initiate/` (alias `/create-intent/`) | Create Razorpay order for an order/invoice | customer/admin |
| POST | `/verify/` | Verify checkout signature; capture; idempotent by gateway id | customer/admin |
| B2B webhook | `/webhook/` | Razorpay webhook (signature-verified) | HMAC secret |
| GET | `/order/{order_id}/` | Payment status for an order | owner/admin |

Amount authority: backend recalculates and validates amounts; `record_payment`
rejects overpayment; replayed gateway ids return the stored outcome.

## Finance — `apps/finance` (`urls`), prefix `/api/v1/finance/`

| Route | Purpose | Auth |
|---|---|---|
| `/clients/` + `/{id}/` | B2B client CRUD; freeze (`is_active`) supported | admin |
| `/quotations/` + `/{id}/` | Quotation CRUD + workflow actions | admin |
| `/invoices/` + `/{id}/` | Invoice list/detail; generated from orders or quotation conversion | admin |
| `/payments/` + `/{id}/` | Payment transaction ledger (read-only viewset) | admin |
| `/settlements/` + `/{id}/` | Payout settlements ledger | admin |
| GET | `/summary/` (alias `/dashboard/`) | Finance KPIs (query-count bounded, Step 17) | admin |

## Expenses — `apps/finance` (`urls_expenses`), prefix `/api/v1/expenses/`

Expense ViewSet: CRUD (`GET/POST /`, `GET/PUT/PATCH/DELETE /{id}/`), admin-only.
Details: `docs/api/expense-api.md`. Non-positive amounts rejected (audited).

## Configuration — `apps/commercial_config`, prefix `/api/v1/config/`

| Route | Purpose | Auth |
|---|---|---|
| GET/PUT | `/store/` | Company/store singleton config (public read, admin write) |
| `/tax/` + `/{id}/` | Tax configuration (GST rates per state path) | admin |
| `/delivery/` + `/{id}/` | Delivery configuration (origin, base fee, free threshold) | admin |
| `/slabs/` + `/{id}/` | Distance slabs (pincode-based) | admin |
| `/shipping-rules/` + `/{id}/` | Shipping rules | admin |
| `/discounts/` + `/{id}/` | Order discount rules (capped) | admin |
| POST | `/coupons/validate/` | Coupon validation at checkout |
| `/audit-logs/` + `/{id}/` | Config change audit trail (read-only) | admin |

Every config change writes an `AdminConfigAuditLog` row (domain vocabulary:
`store/tax/delivery/slabs/shipping-rules/discounts/client/client_credit`);
historical transactions keep their stored snapshot figures.

## Inquiries / Communication — `apps/core`, prefix `/api/v1/inquiries/`

ContactInquiry ViewSet: public `POST /` (contact form → email + log);
admin list/manage under `/admin/`. Communication templates, logs and
password-reset hooks: `docs/communication/README.md`.

## Health

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/health/` (also `/health/`) | Readiness probe: application up + database connected |

## Placeholder (not API)

Frontend `/admin/customers` and `/admin/settings` are "Coming soon" placeholder
routes — they call no API. Customer profile data flows through `/auth/me/` and
`/addresses/`.
