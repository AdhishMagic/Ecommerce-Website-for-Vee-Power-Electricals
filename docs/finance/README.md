# Finance Domain Architecture & Finalization

## 1. Executive Overview

The Finance domain in **Vee Power Electricals** provides authoritative, server-enforced financial operations across:
- **Invoices & Invoice Items** (GST-compliant tax invoices, immutable historical snapshots)
- **Payment Transactions** (Gateway validation, HMAC verification, replay prevention)
- **Payment/Invoice Reconciliation** (Idempotent settlement, partial payments, row-level concurrency protection)
- **Expenses** (Staff/Admin operational expense tracking with strict RBAC)
- **Payout Settlements** (Merchant/gateway bank settlements with UTR tracking)
- **B2B Credit Integration** (Real-time credit limit, exposure, and available credit validation)
- **Authoritative Financial Analytics** (Deterministic date filtering, P&L reporting, KPI rollups)

The backend remains the strict financial source of truth. Frontend clients are never trusted for totals, taxes, discounts, or outstanding balances.

---

## 2. Invoice Lifecycle & Business Rules

### Invoice Lifecycle States
Invoices transition through authoritative lifecycle states:
- `UNPAID` (or `Unpaid`): Default status upon generation. Balance remains outstanding.
- `PAID` (or `Paid`): Marked only when cumulative successful payments equal or exceed the total amount (`outstanding_amount == 0`). Transitioning to `PAID` while outstanding balance remains is strictly rejected by the API (`400 Bad Request`).
- `OVERDUE` (or `Overdue`): Set when current date exceeds `due_date` without full settlement.
- `CANCELLED` (or `Cancelled`): Voided invoice; items remain recorded for historical snapshot audit.

### Authoritative Calculations & Server Enforcement
All invoice amounts are calculated on the server using `Decimal` arithmetic and frozen into historical calculation snapshots:
- **Subtotal**: Sum of `(item.unit_price * item.quantity) - item.discount`.
- **Taxable Amount**: Base value subject to Goods & Services Tax.
- **GST Components**:
  - **Intra-state (Tamil Nadu / Code 33)**: 50% CGST + 50% SGST.
  - **Inter-state**: 100% IGST.
- **Total Amount**: `taxable_amount + cgst + sgst + igst + delivery_charge`.
- **Paid Amount**: Server-aggregated sum of all associated `PaymentTransaction` records with `status='Completed'`.
- **Outstanding Amount**: `max(Decimal('0.00'), total_amount - paid_amount)`.

---

## 3. Payment Lifecycle & Reconciliation

### PaymentTransaction States
- `Created`: Initialized payment session.
- `In_Transit`: Processing through payment gateway.
- `Completed`: Authoritative successful transaction verified via Razorpay HMAC signature or administrator manual reconciliation.
- `Failed`: Gateway declined or timeout; does not reduce invoice outstanding balance.
- `Refunded`: Reversal recorded; re-opens outstanding balance if applicable.

### Payment → Invoice Reconciliation Chain
1. Client submits payment confirmation or webhook triggers reconciliation.
2. System acquires a row-level lock (`select_for_update()`) on the target `Invoice` to prevent concurrent race conditions.
3. System verifies idempotency via `gateway_transaction_id`: duplicate payment requests return the existing transaction without double-counting.
4. System validates that payment `amount <= invoice.outstanding_amount`.
5. PaymentTransaction record is created with `status='Completed'`.
6. Invoice outstanding balance is recalculated:
   - If `outstanding_amount == Decimal('0.00')`, invoice status automatically transitions to `Paid`.
   - If `outstanding_amount > 0`, invoice status remains `Unpaid` (partially settled).
7. Communication events are dispatched fail-safe (email/SMS failure does not roll back financial transactions).

---

## 4. Order & Quotation Financial Chains

### Order → Payment → Invoice Chain
- Order total payable amount is locked at checkout.
- Customer settles payment via Razorpay payment gateway with HMAC validation.
- Payment triggers idempotent invoice generation.
- Order and invoice line items match in quantity, price, tax breakdown, and snapshot.
- Partial dispatches support 1:N invoice generation where multiple invoices map to distinct shipment fulfillments of an order.

### Quotation → Invoice → Payment Chain
- B2B customer receives commercial quotation with frozen item rates, discounts, and credit terms.
- Upon Quotation approval, conversion triggers invoice generation copying snapshot figures.
- Quotation values remain historically immutable.
- Payment settlement updates invoice outstanding balance and immediately reduces B2B credit exposure via `CreditService`.

---

## 5. Expenses & Payout Settlements

### Operational Expenses
- **CRUD Operations**: Handled via `/api/v1/finance/expenses/`.
- **RBAC**: Restricted to `IsAdminUser` or Staff. Normal customers and B2B clients receive `403 Forbidden`.
- **Validation**: Requires positive Decimal amounts (`amount > 0`). Creator user is automatically attributed from `request.user` to prevent spoofing.
- **Filtering**: Filterable by category, date range, payment method, and search terms.

### Gateway Payout Settlements
- **Separation of Concerns**: `PayoutSettlement` models merchant/gateway bank transfers deposited to Vee Power's bank account, strictly separated from customer `PaymentTransaction` records.
- **Fields**:
  - `settlement_id`: Gateway-issued identifier.
  - `settlement_date`: Date funds were transferred.
  - `gross_amount`: Total collected volume.
  - `gateway_fee`: Processing commission and GST deducted by gateway.
  - `net_amount`: Actual bank deposit (`gross_amount - gateway_fee`).
  - `bank_reference` / `utr`: Unique Transaction Reference for bank statement reconciliation.
  - `status`: `PENDING`, `PROCESSED`, `FAILED`.

---

## 6. B2B Credit Integration

Integrated with `CreditService` (`backend/apps/b2b/services.py`):
- **Credit Limit**: Authoritative cap assigned to B2B client profile.
- **Credit Exposure**: Sum of outstanding balances across all active invoices for the client.
- **Available Credit**: `credit_limit - credit_exposure`.
- **Enforcement**: Orders or credit conversions exceeding available credit are rejected unless authorized by credit override. Settling an invoice immediately restores available credit.

---

## 7. Decimal Precision & Rounding Rules

All monetary calculations in the Finance domain use Python's `Decimal` type with `ROUND_HALF_UP` rounding:
- Currency precision: 2 decimal places (`Decimal('0.01')`).
- Tax calculations: Rounded to nearest paise (`Decimal('0.01')`).
- Tested across extreme edge values: ₹0.01, ₹0.05, ₹99.99, ₹999.99, ₹1,000.01, and large multi-lakh enterprise invoices.
- Floating-point calculations are strictly prohibited.

---

## 8. Role-Based Access Control (RBAC) & IDOR Protection

| Endpoint / Resource | Retail Customer | B2B Client | Staff / Admin |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/finance/invoices/` | Own invoices only | Own company invoices only | All invoices |
| `GET /api/v1/finance/invoices/{id}/` | Own invoice only (`403`/`404` for others) | Own invoice only | Full access |
| `POST /api/v1/finance/invoices/{id}/record-payment/` | Forbidden (`403`) | Forbidden (`403`) | Permitted |
| `GET /api/v1/finance/payments/` | Own payments only | Own company payments only | All payments |
| `GET /api/v1/finance/expenses/` | Forbidden (`403`) | Forbidden (`403`) | Full CRUD |
| `GET /api/v1/finance/payout-settlements/` | Forbidden (`403`) | Forbidden (`403`) | View & reconcile |
| `GET /api/v1/finance/summary/` | Forbidden (`403`) | Forbidden (`403`) | Full KPI & P&L |

---

## 9. API Reference

### Finance Summary & KPIs (single authoritative dashboard metrics endpoint)
- `GET /api/v1/finance/summary/?filter_type={today|current_month|previous_month|30_days|all_time|custom}&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  - Filter semantics (project timezone `Asia/Kolkata`), resolved by `resolve_summary_date_range()`:
    - `today` — today's calendar date only
    - `current_month` — 1st of the current month through today
    - `previous_month` — the complete previous calendar month
    - `30_days` — rolling window `today - 30 days` through today (not the calendar month)
    - `all_time` — no date restriction (all historical records)
    - `custom` — explicit `start_date`/`end_date`
  - Any other `filter_type` returns `400` with the supported list; invalid values are never silently downgraded.
  - Date-filtered metrics: `kpis.total_invoiced`, `kpis.total_paid` (alias `total_sales`), `kpis.total_expenses`.
  - Complete-database snapshots (filter independent): `kpis.total_outstanding`, `kpis.b2b_outstanding`
    (unpaid/overdue invoices only) and the order metrics — `total_orders_count`, `open_orders_count`
    (`PENDING`+`CONFIRMED`+`PACKED`), `confirmed_orders_count`, `out_for_delivery_count` (`SHIPPED`),
    `returns_count` (`RETURN_REQUESTED`+`RETURN_APPROVED`+`RETURN_COMPLETED`), plus the full
    `order_metrics` status breakdown.
  - Also returns `total_invoiced`, `total_sales`, `total_outstanding`, `b2b_outstanding` as flat top-level
    keys, `kpis` (legacy contract), `payouts_summary`, `monthly_trend` (6-month revenue/expense trend,
    ordered and zero-filled) and `breakdowns`.
  - Order metrics are computed with a single conditional-aggregate `COUNT` query over the complete
    `orders` table. Clients must never derive these values from a paginated record page.

### Invoices
- `GET /api/v1/finance/invoices/`: Paginated list with filtering by `status`, `customer`, `date_from`, `date_to`.
- `GET /api/v1/finance/invoices/{id}/`: Invoice detail with line items and historical calculation snapshot.
- `POST /api/v1/finance/invoices/{id}/record-payment/`: Authoritative payment settlement.
- `GET /api/v1/finance/invoices/{id}/payments/`: Authoritative payment history for the invoice.
- `PATCH /api/v1/finance/invoices/{id}/update_status/`: Status transition with validation (PAID blocked if outstanding > 0).

### Payments
- `GET /api/v1/finance/payments/`: List payment transactions with filters (`status`, `order`, `invoice`, `gateway`).
- `GET /api/v1/finance/payments/{id}/`: Transaction detail with gateway order and verification metadata.

### Expenses
- `GET /api/v1/finance/expenses/`: List operational expenses with category and date filtering.
- `POST /api/v1/finance/expenses/`: Record new operational expense.
- `PUT / PATCH / DELETE /api/v1/finance/expenses/{id}/`: Modify or remove expense (Admin/Staff only).

### Payout Settlements
- `GET /api/v1/finance/payout-settlements/`: List gateway payout settlements with status and date filtering.
- `POST /api/v1/finance/payout-settlements/`: Record or import merchant settlement.

---

## 10. Status & Scope Classification

### IMPLEMENTED
- Authoritative server-side invoice generation with GST splits (CGST, SGST, IGST).
- Immutable historical calculation snapshots on invoices and invoice items.
- Row-level locking (`select_for_update()`) on payment recording to prevent race conditions.
- Strict invoice status progression and blocking of `PAID` transitions when outstanding > 0.
- Payment transaction idempotency on gateway transaction ID.
- Staff/Admin expense tracking with creator attribution and amount validation.
- Payout settlement data model and API separating customer payments from merchant bank deposits.
- B2B credit integration and automatic credit exposure reduction upon invoice settlement.
- Real-time Finance Summary dashboard with deterministic date filtering and 6-month P&L trend.
- Zero N+1 query regression using `prefetch_related('payments')` and `select_related('order', 'customer')`.

### DEFERRED
- Automated webhook-driven reverse payout settlement scraping directly from Razorpay Bank Transfer API. (Manual / CSV settlement recording implemented; automated provider API polling deferred).
- Automated customer refund processing through gateway API. (Refund data model and ledger balance adjustments implemented; automated outbound gateway API refund triggers deferred).

### KNOWN LIMITATIONS
- PayoutSettlement model stores bank UTR in `bank_reference` column; exposed as both `bank_reference` and `utr` aliases for backwards-compatibility.
- Cross-currency exchange rates: All operations are strictly denominated in Indian Rupees (`INR` / `₹`). Multi-currency FX translation is not supported in the current architecture.
