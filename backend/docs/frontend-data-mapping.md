# Vee Electricals — Frontend-to-Backend Data Mapping & Mock Data Migration (Phase 1)

## 1. Frontend Screen to Backend API Data Mapping

The following matrix documents every user-facing and administrator-facing screen in the Vee Electricals React application, mapping frontend user actions to required REST endpoints, database operations, and payload structures.

### 1.1 Customer Screens

| Screen / Feature | User Interaction | HTTP Method & Endpoint | Target Entities | Request Payload / Query Params | Response Data |
|---|---|---|---|---|---|
| **Home (`/`)** | Page load | `GET /api/v1/categories/hero/` | `categories` | None | Active hero promotional categories (id, name, slug, image, subtitle, badge, discount). |
| | Featured products row | `GET /api/v1/products/?featured=true` | `products`, `brands` | `featured=true` | Array of featured products with images, price, MRP. |
| | Brand slider | `GET /api/v1/brands/` | `brands` | None | List of brand names and logo URLs. |
| **Shop (`/shop`)** | Catalog browsing | `GET /api/v1/products/` | `products`, `categories`, `brands` | `category`, `brand`, `search`, `sort`, `in_stock`, `min_price`, `max_price` | Paginated product list with total count and facets. |
| | Category view (`?view=categories`) | `GET /api/v1/categories/` | `categories`, `subcategories` | None | All categories with nested subcategories. |
| **Product Detail (`/product/:id`)** | Page load | `GET /api/v1/products/<id>/` | `products`, `product_images`, `product_specifications` | None | Full product details, image gallery, technical specs, live stock count. |
| | Related products | `GET /api/v1/products/?category=<cat>&exclude=<id>&limit=4` | `products` | `category`, `exclude`, `limit` | 4 related products in same category. |
| **Checkout (`/checkout`)** | GSTIN auto-lookup | `GET /api/v1/clients/lookup-gstin/?gstin=<val>` | `clients` | `gstin` | Business name and registered address. |
| | Place Order | `POST /api/v1/orders/` | `orders`, `order_items`, `stock_transactions` | `{ customerName, customerEmail, customerPhone, shippingAddress, items, totalAmount, taxAmount, shippingFee, paymentMethod, isBusinessOrder, gstin }` | Created `Order` object with unique `orderNumber`. |
| **Account (`/account`)** | View my orders | `GET /api/v1/orders/my-orders/` | `orders`, `order_items` | None (reads auth token) | Array of customer's historical orders with items and fulfillment status. |
| | View saved addresses | `GET /api/v1/users/addresses/` | `customer_addresses` | None (reads auth token) | Array of saved customer addresses. |
| | Add new address | `POST /api/v1/users/addresses/` | `customer_addresses` | `{ recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default }` | Created address object. |
| | Edit address | `PUT /api/v1/users/addresses/<id>/` | `customer_addresses` | Address updates | Updated address object. |
| | Delete address | `DELETE /api/v1/users/addresses/<id>/`| `customer_addresses` | None | `204 No Content`. |
| | Set default address | `PATCH /api/v1/users/addresses/<id>/set-default/` | `customer_addresses` | None | Updated address list. |
| **Contact (`/contact`)** | Submit message | `POST /api/v1/inquiries/` | `contact_inquiries` | `{ name, phone, email, subject, message }` | `201 Created` with confirmation message. |

---

### 1.2 Admin Screens

| Screen / Feature | User Interaction | HTTP Method & Endpoint | Target Entities | Request Payload / Query Params | Response Data |
|---|---|---|---|---|---|
| **Products (`/admin/products`)** | List products table | `GET /api/v1/products/?page=1&limit=20` | `products`, `categories`, `brands` | `search`, `category`, `brand` | Paginated product list. |
| | Delete product | `DELETE /api/v1/products/<id>/` | `products` | None | `204 No Content`. |
| **Product Form (`/admin/products/add`, `/edit/:id`)** | Create product | `POST /api/v1/products/` | `products`, `product_images`, `product_specifications` | `{ name, sku, brand_id, category_id, subcategory_id, mrp, price, stock, lowStockThreshold, description, active, images, specifications }` | Created product object. |
| | Update product | `PUT /api/v1/products/<id>/` | `products`, `product_images`, `product_specifications` | Product update fields | Updated product object. |
| **Categories (`/admin/categories`)** | List categories | `GET /api/v1/categories/` | `categories` | None | All categories with hero display and discount metadata. |
| | Update category & hero settings | `PATCH /api/v1/categories/<id>/` | `categories` | `{ name, subtitle, image, is_active, show_in_hero, hero_order, hero_badge, discount_enabled, discount_type, discount_value, discount_label }` | Updated category object. |
| **Inventory (`/admin/inventory`)** | Live stock table | `GET /api/v1/inventory/` | `products`, `categories`, `brands` | `search`, `stock_status` | Product stock status, low stock flags, last updated date. |
| | Stock adjust modal | `POST /api/v1/inventory/<id>/transaction/` | `stock_transactions`, `products` | `{ quantity, type, notes }` | Created transaction record & updated product stock. |
| **Orders (`/admin/orders`)** | View all orders | `GET /api/v1/orders/` | `orders`, `order_items` | `status`, `search`, `date_from`, `date_to` | Paginated list of all customer orders. |
| | Update status / AWB | `PATCH /api/v1/orders/<id>/` | `orders`, `order_status_history` | `{ status, tracking_number }` | Updated order record. |
| **Shipping (`/admin/orders/shipping`)** | Load rules | `GET /api/v1/shipping-rules/` | `shipping_rules` | None | List of state shipping rates and free shipping threshold. |
| | Add shipping rule | `POST /api/v1/shipping-rules/` | `shipping_rules` | `{ state, cost }` | Created rule object. |
| | Delete shipping rule | `DELETE /api/v1/shipping-rules/<id>/` | `shipping_rules` | None | `204 No Content`. |
| **Clients (`/admin/finance/clients`)** | List B2B clients | `GET /api/v1/clients/` | `clients` | `search` | All B2B clients, contact persons, GSTIN, credit limits, total invoiced. |
| | Add client | `POST /api/v1/clients/` | `clients` | `{ companyName, contactPerson, gstin, email, phone, creditLimit }` | Created client record. |
| | Edit client | `PUT /api/v1/clients/<id>/` | `clients` | Client updates | Updated client record. |
| **Quotations (`/admin/finance/quotations`)** | List quotations | `GET /api/v1/quotations/` | `quotations`, `clients` | `status` | All quotations with client names, dates, values, statuses. |
| | Create quotation | `POST /api/v1/quotations/` | `quotations`, `quotation_items` | `{ client_id, expiry, notes, items: [{ product, quantity, price }] }` | Created quotation with calculated total value. |
| | Convert to invoice | `POST /api/v1/quotations/<id>/convert/` | `quotations`, `invoices`, `invoice_items` | None | Status set to `Converted`; created `Invoice` object. |
| **Invoices (`/admin/finance/invoices`)** | Invoice ledger | `GET /api/v1/invoices/` | `invoices`, `clients` | `status` | All tax invoices with client names, due dates, amounts, statuses. |
| | Generate invoice | `POST /api/v1/invoices/` | `invoices`, `invoice_items` | `{ client_id, order_id, date, dueDate, notes, items: [{ product, quantity, rate, taxPercent }] }` | Generated invoice with calculated tax and total. |
| | Mark as paid | `PATCH /api/v1/invoices/<id>/` | `invoices` | `{"status": "Paid"}` | Updated invoice status. |
| **Expenses (`/admin/finance/expenses`)** | Expense ledger | `GET /api/v1/expenses/` | `expenses` | `category` | All recorded operating expenses. |
| | Add expense | `POST /api/v1/expenses/` | `expenses` | `{ date, category, description, vendor, amount, status }` | Created expense record. |
| | Delete expense | `DELETE /api/v1/expenses/<id>/` | `expenses` | None | `204 No Content`. |
| **Finance Summary (`/admin/finance/summary`)** | P&L overview | `GET /api/v1/finance/summary/` | Aggregated from `invoices`, `expenses`, `payout_settlements` | `period` | Revenue, Expenses, Net Profit, Operating Margin, Monthly P&L table. |
| **Transactions (`/admin/orders/transactions`)** | Financial transactions | `GET /api/v1/finance/transactions/` | Aggregated from `orders`, `invoices` | `date_range` | Revenue trend graph, tax collected, shipping collected, avg order value. |
| **Products Analytics (`/admin/analytics/products`)** | Product performance | `GET /api/v1/analytics/products/` | Aggregated from `order_items`, `products`, `brands` | `timeframe` | Top selling products, slow movers, revenue by category, brand performance. |
| **Traffic Analytics (`/admin/analytics/traffic`)** | Store traffic | `GET /api/v1/analytics/traffic/` | Aggregated or Telemetry service | `timeframe` | Sessions, funnel stages, channel breakdown. *(See item 5 in confirmation list)*. |
| **Import Products (`/admin/import`)** | Bulk spreadsheet import | `POST /api/v1/products/import-csv/` | `products`, `categories`, `brands` | Multipart FormData (`file`) | Validation summary: valid rows imported count, error list with row numbers. |

---

## 2. Frontend Mock Data Inventory & Migration Plan

Every mock/hardcoded dataset currently residing in the React frontend has been cataloged and classified below into four operational buckets:

1. **Database-Driven (Replaced by MySQL & Django REST API)**
2. **Frontend-Only (Permanent UI state / Local UI logic)**
3. **Configuration / Static Metadata**
4. **Unknown / Requires Confirmation**

### Classification & Migration Roster

| Mock Data Source | File Location | Classification | Migration Destination | Phasing & Notes |
|---|---|---|---|---|
| `mockProducts` (20+ items) | `frontend/src/data/mock/products.ts` | **Database-Driven** | `products`, `product_images`, `product_specifications` | Will be seeded into MySQL via Django fixture / seeder in Phase 3. |
| `mockCategories` | `frontend/src/data/mock/products.ts` | **Database-Driven** | `categories`, `subcategories` | Seeded into MySQL; hero promotions configurable via Admin UI. |
| `mockBrands` (10 items) | `frontend/src/data/mock/products.ts` | **Database-Driven** | `brands` | Seeded into MySQL. |
| `orders` mock list | `frontend/src/data/mock/products.ts` | **Database-Driven** | `orders`, `order_items` | Seeded into MySQL for test environments; real orders created via `/checkout`. |
| `INITIAL_CLIENTS` | `frontend/src/pages/admin/Clients.tsx` | **Database-Driven** | `clients` | Migrate to MySQL `clients` table; fetched via `GET /api/v1/clients/`. |
| `INITIAL_INVOICES` | `frontend/src/pages/admin/Invoices.tsx` | **Database-Driven** | `invoices`, `invoice_items` | Migrate to MySQL `invoices` table; fetched via `GET /api/v1/invoices/`. |
| `INITIAL_QUOTES` | `frontend/src/pages/admin/Quotations.tsx` | **Database-Driven** | `quotations`, `quotation_items` | Migrate to MySQL `quotations` table; fetched via `GET /api/v1/quotations/`. |
| `INITIAL_EXPENSES` | `frontend/src/pages/admin/Expenses.tsx` | **Database-Driven** | `expenses` | Migrate to MySQL `expenses` table; fetched via `GET /api/v1/expenses/`. |
| `INITIAL_RULES` (Shipping) | `frontend/src/pages/admin/Shipping.tsx` | **Database-Driven** | `shipping_rules` | Migrate to MySQL `shipping_rules` table. |
| `initialPayouts` | `frontend/src/pages/admin/FinanceSummary.tsx` | **Database-Driven** | `payout_settlements` | Stored in MySQL or fetched from payment gateway integration. |
| `plTrendData`, `plTableData` | `frontend/src/pages/admin/FinanceSummary.tsx` | **Database-Driven** | Computed API endpoint | Replaced by Django aggregation query on `invoices` & `expenses`. |
| `revenueTrend`, `transactions` | `frontend/src/pages/admin/Transactions.tsx` | **Database-Driven** | Computed API endpoint | Replaced by Django aggregation query on `orders`. |
| `topProducts`, `slowMovers` | `frontend/src/pages/admin/ProductsAnalytics.tsx`| **Database-Driven** | Computed API endpoint | Replaced by DRF endpoint calculating order frequency and stock turnover. |
| Customer `addresses` mock | `frontend/src/pages/customer/Account.tsx` | **Database-Driven** | `customer_addresses` | Replaced by `GET/POST /api/v1/users/addresses/`. |
| `mockPreview` (Import) | `frontend/src/pages/admin/ImportProducts.tsx` | **Database-Driven** | Backend CSV/Excel parser | Dynamic upload validation response from `POST /api/v1/products/import-csv/`. |
| Mock Login fallback users | `frontend/src/services/authService.ts` | **Database-Driven** | `users` (Django Auth) | Delete client-side mock fallbacks once DRF auth is running. |
| `admin_hero_categories` cache | `localStorage` | **Database-Driven** | `GET /api/v1/categories/hero/` | Remove `localStorage` caching once backend endpoint is live. |
| `vp_products`, `vp_orders` | `localStorage` (`ShopContext.tsx`) | **Database-Driven** | DRF API endpoints | Replace `localStorage` sync with REST API queries in Phase 4. |
| `trafficTrend`, `funnelData` | `frontend/src/pages/admin/TrafficAnalytics.tsx` | **Unknown / Requires Confirmation** | Custom Telemetry vs External Analytics | Subject to architectural confirmation (Google Analytics vs custom DB tables). |
| `COMPANY_NAME`, `COMPANY_ADDRESS`| `frontend/src/constants/companyInfo.ts` | **Configuration / Static** | Frontend Constant or Settings API | Retain as frontend constant or expose via `GET /api/v1/settings/`. |
| `INDIAN_STATES` array | `frontend/src/pages/admin/Shipping.tsx` | **Configuration / Static** | Frontend Constant | Remains in frontend for form dropdown options. |
| "Why Choose Us", Badges | `frontend/src/pages/customer/Home.tsx`, `ProductDetail.tsx`| **Frontend-Only** | Static JSX Components | Permanent UI presentation elements. |
| Active UI Tabs & Modals | Various components | **Frontend-Only** | React `useState` | Ephemeral client-side UI states. |
