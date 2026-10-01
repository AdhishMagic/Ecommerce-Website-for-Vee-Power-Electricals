# User Guide — Vee Power Electricals

Business-user guide to the **implemented** functionality, matching the current
UI (verified at commit `d0a62a3`). Developer docs: `docs/architecture/README.md`;
API details: `docs/api/README.md`.

## 1. Customer Workflows (storefront)

### Registration & Login
- **Register** (`/register`): name, email, phone, password → account created
  (role `customer`), confirmation email logged; you are signed in automatically.
- **Login** (`/login`): email + password. **Forgot password** (`/forgot-password`)
  emails a reset link (valid 24 h) → `/reset-password`.
- Session: kept signed in via refresh token; expiry is handled transparently.

### Browsing
- **Home** (`/`): featured categories/products, offers.
- **Shop** (`/shop`): product grid with search, category/brand/price filters,
  sorting, pagination.
- **Product detail** (`/product/:id`): images, specifications, price (MRP vs
  selling price), stock availability, related products.

### Cart
- Add from product detail or shop grid; quantity adjustments; cart persists in
  your browser. Totals shown in the cart are indicative — **final GST, delivery
  and discounts are computed authoritatively by the backend at checkout**.

### Checkout → Order
1. **Address** — select a saved address or add a new one (defaults supported).
2. **Review** — exact GST breakdown (CGST/SGST intra-state or IGST
   inter-state), delivery fee (free above the configured threshold), discounts.
3. **Payment** — pay online via Razorpay (test mode in development) or
   **Cash on Delivery** where eligible.
4. **Success** (`/order-success`) shows the order number; totals are final.

### Orders, Delivery & Returns (`/account`)
- **My Orders** lists all orders with status badges and full status timeline.
- Order states you will see: `Pending → Confirmed → Packed → Shipped →
  Delivered` (or `Cancelled`).
- **Cancel** an order while it is pre-delivery (stock returns to inventory).
- **Return** a delivered order: request → admin approves/rejects → completion
  restores stock; refunds follow the finance policy (see §3 of
  `docs/limitations.md`).
- **Account** page: profile details, saved addresses (add/edit/default),
  order history.

## 2. Admin Workflows (`/admin`, admin role required)

| Area | Route | What you do |
|---|---|---|
| Dashboard | `/admin` | KPIs, revenue/expense trend charts, low-stock highlights |
| Products | `/admin/products` | List/search/edit products; **Add** (`products/add`) & **Edit** (`products/edit/:id`) forms with images, specs, MRP/price, stock, activation |
| Import | `/admin/import` | Bulk CSV product import |
| Categories | `/admin/categories` | Category management incl. discount rules |
| Inventory | `/admin/inventory` | Stock overview, **restock**, manual adjustment, full ledger per product |
| Orders | `/admin/orders` | Fulfil via status buttons (Pending → Confirmed → … → Delivered); handle cancellations & returns (approve/reject/complete) |
| Transactions | `/admin/orders/transactions` | Payment transaction ledger |
| Shipping | `/admin/orders/shipping` | Delivery config, distance slabs, shipping rules |
| Finance | `/admin/finance/summary` | Invoiced/paid/outstanding/expenses KPIs + P&L trend |
| Expenses | `/admin/finance/expenses` | Record and manage business expenses |
| Quotations | `/admin/finance/quotations` | Create B2B quotations, send, approve, **convert to invoice** (credit-checked) |
| Invoices | `/admin/finance/invoices` | Invoice ledger with payment state |
| Clients (B2B) | `/admin/finance/clients` | Client directory: GSTIN, credit limits, freeze/reactivate |
| Analytics | `/admin/analytics/products`, `/admin/analytics/traffic` | Product & traffic analytics charts |

> **Placeholder routes (not implemented yet):** `/admin/customers` (Customer
> Management) and `/admin/settings` (Settings) currently show a "Coming soon"
> panel and invoke no backend functionality. Customer administration today is
> limited to the Django admin site (`/admin/` Django panel) and order-linked
> views.

### Business Rules Admins Should Know
- **Order totals are immutable**: prices, GST, delivery and discounts are
  snapshotted at checkout; later catalog/config changes never alter existing
  orders.
- **FSM discipline**: invalid transitions are rejected (e.g. Pending →
  Delivered); every accepted transition is logged and the customer is emailed.
- **Stock is ledger-backed**: every movement (sale, restock, adjustment,
  return) is an append-only ledger entry; stock can never go negative; oversell
  is blocked even under concurrent load.
- **Quotation conversion is once-only** and enforces the client's credit limit;
  converted invoices add 18% GST to the quotation value.
- **B2B exposure**: outstanding invoice balances count against credit limits;
  payments free credit; frozen clients cannot transact.
- **Configuration changes are audited**: old/new values, actor, IP, reason are
  recorded; history is preserved.

## 3. Where the Money Actually Moves

- Online payments are captured through Razorpay (HMAC-verified).
- **Automated outbound refunds are not automated**: return/cancel money
  movement is executed manually in the Razorpay dashboard, reconciled via
  credit notes/invoice adjustments in-app (see `docs/limitations.md`).
- COD settlement and payout settlements are tracked in the finance module.

## 4. Roles

| Capability | Customer | Admin |
|---|---|---|
| Browse/shop/cart/checkout | ✅ | ✅ |
| Own orders/addresses/returns | ✅ | ✅ |
| Admin panel | ❌ | ✅ |
| Order FSM transitions, inventory, finance, config | ❌ | ✅ |
