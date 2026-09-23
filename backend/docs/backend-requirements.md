# Vee Electricals — Backend Requirements & Architecture Blueprint (Phase 1)

## 1. Executive Summary & Project Overview

**Vee Electricals** (Vee Power Electricals) is an e-commerce platform specializing in electrical goods, including ceiling/exhaust fans, wires & cables, modular switches, LED lighting, MCBs, distribution boards, and industrial electrical accessories. The platform serves both **B2C retail consumers** and **B2B corporate/contractor clients** (e.g., L&T Construction, Tata Projects, Reliance Retail, Godrej Properties).

### Technical Stack & Target Architecture
* **Frontend**: React 18, TypeScript, Tailwind CSS, Vite.
* **Backend**: Python 3.11+, Django 4.2+ LTS, Django REST Framework (DRF).
* **Database**: MySQL 8.0+ (InnoDB storage engine, UTF8MB4 charset).
* **Architecture**: Decoupled Client-Server (`React SPA -> Django REST API -> MySQL`).
* **Deployment Target**: Docker & Docker Compose (`frontend`, `backend`, `db`, `nginx`).

---

## 2. Identified Business Modules

Based on the comprehensive inspection of the existing React codebase (`pages/admin`, `pages/customer`, `pages/auth`, `context/`, `services/`, `data/mock/`), eight core business modules have been identified.

### Module 1: Authentication & User Management
* **Purpose**: Identity management, credential verification, role-based access control (RBAC), customer profile and address management.
* **Main Entities**: `User`, `CustomerAddress`, `AdminProfile`.
* **Users**: Unauthenticated Guests, Registered Retail Customers, Store Administrators.
* **CRUD Operations**:
  * Guest: Register account, login, request password reset.
  * Customer: View/edit profile (`/account`), manage saved delivery addresses (Create, Read, Update, Delete, Set Default).
  * Admin: List users, view customer details, toggle staff/admin flags.
* **Dependencies**: Cross-cutting; required by Orders, Finance, Invoices, and Analytics.
* **Important Business Rules**:
  * Email is the primary unique identifier for login.
  * Passwords must be hashed using Django's PBKDF2/Argon2.
  * Role differentiation: `CUSTOMER` vs `ADMIN`.
  * Customers can store multiple shipping addresses but can mark only one as `isDefault`.

### Module 2: Catalog & Brand Management
* **Purpose**: Manage hierarchical product categories, subcategories, manufacturer brands, product specifications, and homepage hero banner promotions.
* **Main Entities**: `Category`, `Subcategory`, `Brand`, `Product`, `ProductImage`, `ProductSpecification`.
* **Users**: Public Visitors, Retail Customers, Store Administrators.
* **CRUD Operations**:
  * Customer/Public: Browse products, filter by category/brand/price, full-text search, view product details and technical specifications.
  * Admin: Full CRUD on Products (`/admin/products`, `/admin/products/add`, `/admin/products/edit/:id`), Categories (`/admin/categories`), and Category Hero Promotions. Bulk product import (`/admin/import`).
* **Dependencies**: Feeds into Inventory, Orders, Quotations, and Analytics.
* **Important Business Rules**:
  * Every product must belong to a Category and Brand.
  * Stock keeping unit (`sku`) must be globally unique.
  * `mrp` (Maximum Retail Price) must be greater than or equal to `price` (Selling Price).
  * Discount calculation: `((mrp - price) / mrp) * 100`.
  * Admin can configure promotional discounts and hero order for categories to feature on the homepage carousel.

### Module 3: Inventory & Stock Management
* **Purpose**: Track live physical stock levels, manage stock adjustments, monitor low stock thresholds, and log stock movement audit trails.
* **Main Entities**: `Product` (stock fields), `StockTransaction`.
* **Users**: Store Administrators, Warehouse Managers, System (automated stock deductions).
* **CRUD Operations**:
  * Customer: Read-only stock status (`IN STOCK`, `LOW STOCK (<= threshold)`, `OUT OF STOCK`).
  * Admin: View inventory ledger (`/admin/inventory`), adjust stock counts with transaction type and notes (`RESTOCK`, `SALE`, `ADJUSTMENT`, `RETURN`).
* **Dependencies**: Products, Orders (stock decrement on purchase / increment on cancellation/return).
* **Important Business Rules**:
  * Stock counts cannot drop below 0.
  * Stock adjustments must create an immutable `StockTransaction` audit entry.
  * When `stock <= low_stock_threshold` (default 5 or 10), trigger low stock warning flag.

### Module 4: Order Processing & Checkout
* **Purpose**: Cart checkout, customer shipping address selection, B2B GST tax invoicing, payment method recording, and multi-stage order lifecycle tracking.
* **Main Entities**: `Order`, `OrderItem`, `OrderStatusHistory`, `ShippingRule`.
* **Users**: Retail Customers, B2B Buyers, Store Administrators.
* **CRUD Operations**:
  * Customer: Create order (`POST /api/v1/orders/`), view customer order history (`/account`), track fulfillment status.
  * Admin: List orders (`/admin/orders`), filter by fulfillment status, update status (`Confirmed`, `Packed`, `Shipped`, `Delivered`, `Cancelled`), attach tracking number (`AWB`), generate invoice.
* **Dependencies**: Users, Products, Inventory, Invoices, Shipping.
* **Important Business Rules**:
  * Order items must capture product price and name as a point-in-time snapshot (historical integrity if product prices change later).
  * Standard electrical goods tax in India is 18% GST (CGST 9% + SGST 9% intra-state, or IGST 18% inter-state).
  * Shipping rules: Free shipping threshold (e.g. ₹999 on customer checkout or ₹3,999 configurable in admin) or flat state rates.
  * B2B buyers can input company GSTIN at checkout to receive a compliant B2B tax invoice.

### Module 5: B2B Clients & Credit Management
* **Purpose**: Manage enterprise accounts, contractors, corporate buyers, credit limits, and total invoiced amounts.
* **Main Entities**: `Client` (Corporate Buyer).
* **Users**: Store Administrators, B2B Accounts Team.
* **CRUD Operations**:
  * Admin: Create, view, edit client profiles (`/admin/finance/clients`), assign credit limits, view GSTIN, contact person, and aggregated billing history.
* **Dependencies**: Quotations, Invoices.
* **Important Business Rules**:
  * Client GSTIN must follow the statutory 15-character Indian GST format (e.g., `27AADCL2445P1Z3`).
  * Outstanding unpaid invoices must not exceed the client's allocated `credit_limit`.

### Module 6: Quotations & Estimates
* **Purpose**: Generate commercial price estimates for contractors and bulk procurement before contract finalization.
* **Main Entities**: `Quotation`, `QuotationItem`.
* **Users**: Store Administrators, Sales Engineers.
* **CRUD Operations**:
  * Admin: Create quotation (`/admin/finance/quotations`), add line items with custom rates, set validity/expiry date, print/download PDF, update status (`Draft`, `Sent`, `Approved`, `Rejected`, `Converted`).
  * Admin: Convert approved quotation directly into a tax invoice.
* **Dependencies**: Clients, Products, Invoices.
* **Important Business Rules**:
  * Quotations have a strict expiration date.
  * When converted, status shifts to `Converted` and a linked `Invoice` is created.

### Module 7: Invoicing & Financial Transactions
* **Purpose**: Issue legal GST tax invoices, track payment receipts, monitor overdue accounts, record operating expenses, and calculate P&L summaries.
* **Main Entities**: `Invoice`, `InvoiceItem`, `PaymentTransaction`, `Expense`, `PayoutSettlement`.
* **Users**: Store Administrators, Accountants.
* **CRUD Operations**:
  * Admin: View invoice ledger (`/admin/finance/invoices`), generate invoices (`INV-YYYY-XXX`), mark as paid, send payment reminders, download PDF.
  * Admin: Record operational expenses (`/admin/finance/expenses`) across categories (Logistics, Marketing, Software, Inventory, Utilities).
  * Admin: View P&L analytics and gateway payout settlements (`/admin/finance/summary`, `/admin/orders/transactions`).
* **Dependencies**: Orders, Clients, Quotations.
* **Important Business Rules**:
  * Tax invoice numbers must be sequential and unique per financial year.
  * Invoice amount = Subtotal + Tax Amount (CGST/SGST/IGST).
  * Status progression: `Unpaid` -> `Paid`, or `Unpaid` -> `Overdue` (if current date > dueDate).

### Module 8: Customer Inquiries & Communications
* **Purpose**: Capture lead inquiries, bulk order requests, and customer support messages.
* **Main Entities**: `ContactInquiry`.
* **Users**: Public Visitors, Customer Support Administrators.
* **CRUD Operations**:
  * Public: Submit contact form (`/contact`) with name, phone, email, subject, and message.
  * Admin: View and respond to inquiries.
* **Dependencies**: Standalone.

---

## 3. Requirement Traceability Matrix

| Requirement Area | Business Module | Entity | Future DRF API | Frontend Component / Page |
|---|---|---|---|---|
| User Authentication | Users & Auth | `User` | `POST /api/v1/auth/login/` | `pages/auth/Login.tsx` |
| User Registration | Users & Auth | `User` | `POST /api/v1/auth/register/` | `pages/auth/Register.tsx` |
| Session Validation | Users & Auth | `User` | `GET /api/v1/auth/me/` | `context/AuthContext.tsx`, `services/authService.ts` |
| Password Reset | Users & Auth | `User`, `PasswordResetToken` | `POST /api/v1/auth/forgot-password/` | `pages/auth/ForgotPassword.tsx` |
| Customer Address Book | Users & Auth | `CustomerAddress` | `GET/POST/PUT/DELETE /api/v1/users/addresses/` | `pages/customer/Account.tsx` (Addresses tab) |
| Product Catalog Listing | Catalog | `Product`, `Category`, `Brand` | `GET /api/v1/products/` | `pages/customer/Shop.tsx`, `pages/customer/Home.tsx` |
| Product Details & Specs | Catalog | `Product`, `ProductSpecification` | `GET /api/v1/products/<id>/` | `pages/customer/ProductDetail.tsx` |
| Category Management | Catalog | `Category` | `GET/POST/PATCH/DELETE /api/v1/categories/` | `pages/admin/Categories.tsx` |
| Hero Banner Categories | Catalog | `Category` | `GET /api/v1/categories/hero/` | `components/common/HeroSection.tsx` |
| Admin Product CRUD | Catalog | `Product` | `POST/PUT/PATCH/DELETE /api/v1/products/` | `pages/admin/Products.tsx`, `ProductForm.tsx` |
| Bulk Product Import | Catalog | `Product` | `POST /api/v1/products/import-csv/` | `pages/admin/ImportProducts.tsx` |
| Live Stock Level Tracking | Inventory | `Product` (stock), `StockTransaction` | `GET /api/v1/inventory/` | `pages/admin/Inventory.tsx` |
| Manual Stock Adjustment | Inventory | `StockTransaction` | `POST /api/v1/inventory/<id>/transaction/` | `pages/admin/Inventory.tsx` (Adjust modal) |
| Checkout & Order Placement | Orders | `Order`, `OrderItem` | `POST /api/v1/orders/` | `pages/customer/Checkout.tsx` |
| Customer Order History | Orders | `Order`, `OrderItem` | `GET /api/v1/orders/my-orders/` | `pages/customer/Account.tsx` (Orders tab) |
| Admin Order Fulfillment | Orders | `Order`, `OrderStatusHistory` | `GET/PATCH /api/v1/orders/<id>/` | `pages/admin/Orders.tsx` |
| Shipping Rule Management | Orders | `ShippingRule` | `GET/POST/PUT/DELETE /api/v1/shipping-rules/` | `pages/admin/Shipping.tsx` |
| B2B Corporate Clients | B2B & Finance | `Client` | `GET/POST/PUT/DELETE /api/v1/clients/` | `pages/admin/Clients.tsx` |
| Commercial Quotations | B2B & Finance | `Quotation`, `QuotationItem` | `GET/POST/PUT/DELETE /api/v1/quotations/` | `pages/admin/Quotations.tsx` |
| Quotation to Invoice | B2B & Finance | `Quotation`, `Invoice` | `POST /api/v1/quotations/<id>/convert/` | `pages/admin/Quotations.tsx` |
| Tax Invoicing | B2B & Finance | `Invoice`, `InvoiceItem` | `GET/POST/PATCH /api/v1/invoices/` | `pages/admin/Invoices.tsx` |
| Operating Expense Ledger | B2B & Finance | `Expense` | `GET/POST/PUT/DELETE /api/v1/expenses/` | `pages/admin/Expenses.tsx` |
| Transaction & Gateway Payouts | B2B & Finance | `PaymentTransaction`, `PayoutSettlement` | `GET /api/v1/finance/transactions/` | `pages/admin/Transactions.tsx`, `FinanceSummary.tsx` |
| Sales & Traffic Analytics | Analytics | Computed / `AnalyticsEvent` | `GET /api/v1/analytics/products/`, `/traffic/` | `pages/admin/ProductsAnalytics.tsx`, `TrafficAnalytics.tsx` |
| Contact Form Submission | Inquiries | `ContactInquiry` | `POST /api/v1/inquiries/` | `pages/customer/Contact.tsx` |

---

## 4. Ambiguities & Items Requiring Confirmation

> [!WARNING]
> The following 7 items are discrepancies, underspecified rules, or missing backend behaviors identified in the existing frontend code. They are marked **UNKNOWN / REQUIRES CONFIRMATION** and must be resolved before finalizing the Phase 2 database schema.

1. **Order Status Value Discrepancies**:
   * In `types/order.ts`: `status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'`.
   * In `context/ShopContext.tsx`: `status: 'pending' | 'processing' | 'shipped' | 'delivered'`.
   * In `pages/admin/Orders.tsx`: `status: 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Return Approved' | 'Return Completed' | 'Cancelled'`.
   * In `pages/customer/Account.tsx`: Handles `Delivered`, `Shipped`, `Processing`, `Pending`, `Confirmed`, `Packed`, `Cancelled`.
   * **STATUS**: *UNKNOWN / REQUIRES CONFIRMATION*. Recommendation: Standardize the state machine on:
     `PENDING` -> `CONFIRMED` -> `PACKED` -> `SHIPPED` -> `DELIVERED`, with branching for `CANCELLED`, `RETURN_REQUESTED`, `RETURN_APPROVED`, `RETURN_COMPLETED`.

2. **Free Shipping Threshold Inconsistency**:
   * `pages/customer/Checkout.tsx` hardcodes: `checkoutSubtotal >= 999 ? 0 : 99`.
   * `pages/admin/Shipping.tsx` defaults to: `freeShippingThreshold: 3999` with per-state rules (e.g., Maharashtra ₹50, Delhi ₹100, Karnataka ₹80).
   * **STATUS**: *UNKNOWN / REQUIRES CONFIRMATION*. Should the threshold be a global database setting with per-state fallback rates, or a hardcoded business constant?

3. **Tax Handling (MRP vs Selling Price vs Subtotal)**:
   * `pages/customer/ProductDetail.tsx` displays: *"Price inclusive of all taxes"*.
   * `pages/customer/Checkout.tsx` calculates: `tax = Math.round(checkoutSubtotal * 0.18)` and adds tax on top of the subtotal (`total = checkoutSubtotal + shipping + tax`).
   * `components/admin/GenerateInvoiceModal.tsx` specifies: `taxPercent: 18` per item.
   * **STATUS**: *UNKNOWN / REQUIRES CONFIRMATION*. Indian GST e-commerce laws require clarifying whether customer catalog prices are tax-inclusive (tax extracted for invoicing) or tax-exclusive (tax added at checkout).

4. **Quotation to Invoice Workflow**:
   * In `pages/admin/Quotations.tsx`, clicking "Convert to Invoice" displays an alert and sets quotation status to `"Converted"`. It currently does not specify whether converting a quotation automatically deducts inventory or creates an `Order` record.
   * **STATUS**: *UNKNOWN / REQUIRES CONFIRMATION*.

5. **Analytics Data Source**:
   * `ProductsAnalytics.tsx` and `TrafficAnalytics.tsx` currently render rich mock graphs (e.g., funnel steps, sessions by channel, traffic source, new vs returning visitors).
   * **STATUS**: *UNKNOWN / REQUIRES CONFIRMATION*. Should traffic/session analytics be tracked via custom backend event tables, or should the backend only serve sales/product aggregations, leaving web traffic to Google Analytics / Plausible?

6. **Payment Gateway Integration**:
   * UI displays "Razorpay (UPI)", "Credit Card", "NetBanking", "Cash on Delivery", and mentions Razorpay settlement IDs (`setl_94829`).
   * **STATUS**: *UNKNOWN / REQUIRES CONFIRMATION*. Confirmation required on whether Razorpay webhooks and auto-signature verification are in scope for Phase 2/3.

7. **Guest vs Registered Checkout**:
   * `App.tsx` wraps `/checkout` in `<ProtectedRoute allowedRoles={["customer", "admin"]}>`, requiring users to log in before checking out.
   * However, `backend/apps/orders/views.py` allows guest checkout (`customer_name=data.get('customerName', 'Guest Customer')`).
   * **STATUS**: *UNKNOWN / REQUIRES CONFIRMATION*. Align on whether guest checkout without account registration is supported.
