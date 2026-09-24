# Vee Electricals — Database Index Strategy & Performance Blueprint (Phase 2)

## 1. Index Strategy Overview & Guidelines

Indexes accelerate query performance on read-heavy e-commerce paths (catalog browsing, cart checkout, order history) but introduce write amplification during INSERT/UPDATE operations. To maintain optimal performance:
1. **Primary Keys & Foreign Keys**: All primary keys are clustered B-Tree indexes. Every foreign key column is explicitly indexed to eliminate full table scans during JOIN operations and avoid metadata table locks during child row deletions.
2. **Selective Composite Indexing**: Multi-column indexes follow the **Leftmost Prefix Rule** (`equality_column`, `range_or_sort_column`).
3. **Covering Query Optimization**: High-frequency queries (e.g. `/shop` product listings, customer `/account` order listings) are supported by composite indexes that minimize secondary index lookups against the clustered primary table.

---

## 2. Master Table Index Inventory

| Table Name | Index Name | Indexed Columns | Index Type | Target Query Pattern / Screen | Performance Rationale |
|---|---|---|---|---|---|
| `users` | `PRIMARY` | `id` | Clustered | Internal ORM lookup | Standard primary key lookup |
| `users` | `uq_users_email` | `email` | Unique B-Tree | `POST /auth/login/`, `register` | Fast O(1) credential verification |
| `users` | `uq_users_username`| `username` | Unique B-Tree | Django admin auth lookup | Built-in authentication resolution |
| `users` | `idx_users_role_act`| `(role, is_active)` | Composite B-Tree | Admin user lists, staff authorization | Filters active customers vs admin accounts |
| `customer_addresses`| `PRIMARY` | `id` | Clustered | Address edit / delete by ID | Standard PK lookup |
| `customer_addresses`| `idx_addr_user` | `user_id` | Foreign Key B-Tree| `GET /api/v1/users/addresses/` | Retrieves customer address book |
| `customer_addresses`| `uq_addr_default_user`| `default_user_id`| Unique B-Tree | Single default address verification | Prevents race conditions creating duplicate defaults |
| `categories` | `PRIMARY` | `id` | Clustered | Category details | Standard PK lookup |
| `categories` | `uq_cat_slug` | `slug` | Unique B-Tree | `GET /shop?category=slug` | Resolves category filters by URL slug |
| `categories` | `idx_cat_hero` | `(show_in_hero, is_active, hero_order)` | Composite B-Tree | `GET /api/v1/categories/hero/` | High-frequency homepage hero carousel display |
| `subcategories` | `PRIMARY` | `id` | Clustered | Subcategory details | Standard PK lookup |
| `subcategories` | `uq_subcat_slug` | `(category_id, slug)`| Unique Composite | Subcategory URL routing | Enforces uniqueness within parent category |
| `brands` | `PRIMARY` | `id` | Clustered | Brand details | Standard PK lookup |
| `brands` | `uq_brand_slug` | `slug` | Unique B-Tree | `GET /shop?brand=slug` | Resolves brand filtering by URL slug |
| `brands` | `idx_brand_active` | `is_active` | B-Tree | Brand directory slider | Filters active manufacturers for homepage slider |
| `products` | `PRIMARY` | `id` | Clustered | `GET /api/v1/products/<id>/` | Clustered table row lookup |
| `products` | `uq_prod_sku` | `sku` | Unique B-Tree | Warehouse barcode scan / ERP sync | Fast O(1) SKU lookup |
| `products` | `uq_prod_slug` | `slug` | Unique B-Tree | `GET /product/:slug` | Canonical SEO product detail page routing |
| `products` | `idx_prod_cat_brand`| `(category_id, brand_id, active)` | Composite B-Tree | `/shop?category=X&brand=Y` | Primary catalog browsing and facet filtering |
| `products` | `idx_prod_featured` | `(featured, active)` | Composite B-Tree | `GET /products/?featured=true` | Homepage featured products row query |
| `products` | `idx_prod_price` | `price` | B-Tree | `/shop?min_price=X&max_price=Y` | Price range filtering and sorting |
| `products` | `idx_prod_created` | `created_at` | B-Tree | `/shop?sort=newest` | Catalog sort by arrival date |
| `product_images`| `PRIMARY` | `id` | Clustered | Image details | Standard PK lookup |
| `product_images`| `idx_prod_img_sort`| `(product_id, sort_order)` | Composite B-Tree | Product gallery loading | Fetches product images in display sequence order |
| `product_specifications`| `PRIMARY`| `id`| Clustered | Spec details | Standard PK lookup |
| `product_specifications`| `uq_prod_spec` | `(product_id, spec_key)` | Unique Composite | Technical spec table display | Prevents duplicate specs on a single item |
| `stock_transactions`| `PRIMARY` | `id` | Clustered | Transaction entry lookup | Standard PK lookup |
| `stock_transactions`| `idx_stk_prod_created`| `(product_id, created_at)` | Composite B-Tree | `/admin/inventory` stock ledger | Renders chronological stock history for a product |
| `stock_transactions`| `idx_stk_order` | `order_id` | Foreign Key B-Tree| Order audit trace | Audits warehouse stock decrements for an order |
| `orders` | `PRIMARY` | `id` | Clustered | Order lookup | Clustered order record lookup |
| `orders` | `uq_order_number`| `order_number` | Unique B-Tree | `/order-success`, customer lookup | Customer tracking by public order number |
| `orders` | `idx_orders_user`| `(user_id, created_at)`| Composite B-Tree | `GET /api/v1/orders/my-orders/` | Customer `/account` order history in reverse chron order |
| `orders` | `idx_orders_status`| `(status, created_at)`| Composite B-Tree | `GET /admin/orders/?status=X` | Admin fulfillment dashboard status filtering |
| `orders` | `idx_orders_created`| `created_at` | B-Tree | Date range finance reporting | Date-scoped revenue and sales aggregation |
| `order_items` | `PRIMARY` | `id` | Clustered | Item lookup | Standard PK lookup |
| `order_items` | `idx_items_order` | `order_id` | Foreign Key B-Tree| Order detail screen rendering | Fetches all line items belonging to an order |
| `order_items` | `idx_items_product`| `product_id` | Foreign Key B-Tree| `ProductsAnalytics.tsx` top sellers| Aggregates top-selling products by quantity |
| `order_status_history`| `PRIMARY`| `id` | Clustered | History entry | Standard PK lookup |
| `order_status_history`| `idx_hist_order` | `(order_id, created_at)`| Composite B-Tree | Order timeline audit display | Chronological fulfillment audit trail |
| `tax_configurations`| `PRIMARY` | `id` | Clustered | Tax config lookup | Standard PK lookup |
| `tax_configurations`| `idx_tax_lookup` | `(is_active, effective_from, effective_until)` | Composite B-Tree | Checkout Tax Service | Fast O(1) lookup of currently active GST rate version |
| `delivery_configurations`| `PRIMARY`| `id` | Clustered | Delivery config lookup | Standard PK lookup |
| `delivery_configurations`| `idx_del_lookup` | `(is_active, effective_from, effective_until)` | Composite B-Tree | Checkout Delivery Service | Fast lookup of active dispatch origin and base fee |
| `distance_slabs` | `PRIMARY` | `id` | Clustered | Slab lookup | Standard PK lookup |
| `distance_slabs` | `idx_slabs_config_range`| `(delivery_config_id, min_distance_km, max_distance_km)` | Composite B-Tree | Distance pricing engine | Resolves tariff slab for customer's radial distance |
| `shipping_rules` | `PRIMARY` | `id` | Clustered | State rule lookup | Standard PK lookup |
| `shipping_rules` | `uq_ship_state` | `state` | Unique B-Tree | Tier 5 State Fallback query | Fast fallback shipping rate lookup by state name |
| `order_discounts`| `PRIMARY` | `id` | Clustered | Coupon lookup | Standard PK lookup |
| `order_discounts`| `uq_coupon_code` | `code` | Unique B-Tree | `POST /discounts/validate-coupon/` | Fast O(1) coupon resolution by promo code |
| `clients` | `PRIMARY` | `id` | Clustered | Client master lookup | Standard PK lookup |
| `clients` | `uq_client_code` | `client_code` | Unique B-Tree | B2B account reference | Client code resolution |
| `clients` | `uq_client_gstin`| `gstin` | Unique B-Tree | Checkout GST auto-lookup | Fast GSTIN business entity verification |
| `quotations` | `PRIMARY` | `id` | Clustered | Quotation lookup | Standard PK lookup |
| `quotations` | `uq_quote_number`| `quotation_number` | Unique B-Tree | Formal quote tracking | Quote lookup by number |
| `quotations` | `idx_quote_client`| `(client_id, status)` | Composite B-Tree | `/admin/finance/quotations` | Client proposal ledger and status filtering |
| `quotation_items`| `PRIMARY` | `id` | Clustered | Item lookup | Standard PK lookup |
| `quotation_items`| `idx_qitems_quote`| `quotation_id` | Foreign Key B-Tree| Quote PDF generation | Fetches line items for commercial proposal |
| `invoices` | `PRIMARY` | `id` | Clustered | Invoice master lookup | Standard PK lookup |
| `invoices` | `uq_inv_number` | `invoice_number` | Unique B-Tree | Formal invoice tracking | Fast O(1) invoice resolution |
| `invoices` | `idx_inv_order` | `order_id` | Foreign Key B-Tree| Linked retail invoice lookup | Resolves tax invoice for a given customer order |
| `invoices` | `idx_inv_client_stat`| `(client_id, status)` | Composite B-Tree | Outstanding credit calculation | Aggregates unpaid invoices for credit limit checks |
| `invoices` | `idx_inv_date_stat`| `(invoice_date, status)`| Composite B-Tree | P&L summary and monthly sales | Accelerates financial accounting queries |
| `invoice_items` | `PRIMARY` | `id` | Clustered | Invoiced item lookup | Standard PK lookup |
| `invoice_items` | `idx_inv_items_inv`| `invoice_id` | Foreign Key B-Tree| Tax invoice PDF rendering | Retrieves statutory line items for invoice |
| `payment_transactions`| `PRIMARY` | `id` | Clustered | Transaction lookup | Standard PK lookup |
| `payment_transactions`| `idx_pay_order` | `order_id` | Foreign Key B-Tree| Order payment status checks | Checks payment attempts for an order |
| `payment_transactions`| `idx_pay_gateway_id`| `gateway_transaction_id`| B-Tree | Razorpay webhook verification | Fast lookup on incoming webhook payment reference |
| `expenses` | `PRIMARY` | `id` | Clustered | Expense lookup | Standard PK lookup |
| `expenses` | `idx_exp_date_cat` | `(expense_date, category)`| Composite B-Tree | `/admin/finance/expenses` | P&L monthly operational expense aggregations |
| `payout_settlements`| `PRIMARY`| `id` | Clustered | Settlement lookup | Standard PK lookup |
| `payout_settlements`| `uq_payout_setl_id`| `settlement_id` | Unique B-Tree | Bank deposit reconciliation | Fast reconciliation of gateway batch reference |
| `payout_settlements`| `idx_payout_date` | `(settlement_date, status)`| Composite B-Tree | Finance Summary payouts | Renders gateway settlement batches |
| `admin_config_audit_logs`| `PRIMARY`| `id` | Clustered | Audit entry | Standard PK lookup |
| `admin_config_audit_logs`| `idx_audit_domain_rec`| `(domain, record_id, created_at)` | Composite B-Tree | Configuration audit history | Renders historical changes for a specific rule |
| `contact_inquiries`| `PRIMARY` | `id` | Clustered | Inquiry lookup | Standard PK lookup |
| `contact_inquiries`| `idx_inq_status_date`| `(status, created_at)` | Composite B-Tree | Admin ticket dashboard | Filters open vs resolved inquiries |

---

## 3. Index Redundancy Audit & Deduplication Verification

In MySQL InnoDB, defining a `UNIQUE` constraint automatically builds an underlying unique B-Tree index. Adding an ordinary non-unique index on the exact same column creates a duplicate data structure, doubling index maintenance overhead and buffer pool memory consumption without performance benefit.

### 3.1 Systematic Unique vs Ordinary Index Deduplication Audit

| Entity / Table | Column(s) | Constraint Type | Dedicated Ordinary Index? | Audit Finding & Action Taken |
|---|---|---|---|---|
| `users` | `email` | `UNIQUE` (`uq_users_email`) | Omitted (`idx_users_email` removed) | **Deduplicated**: Unique index handles login O(1) lookup. Duplicate index eliminated. |
| `users` | `username` | `UNIQUE` (`uq_users_username`) | Omitted | **Deduplicated**: Built-in Django unique index handles lookups. |
| `categories` | `slug` | `UNIQUE` (`uq_cat_slug`) | Omitted | **Deduplicated**: Slug unique index resolves `/shop?category=slug`. |
| `brands` | `slug` | `UNIQUE` (`uq_brand_slug`) | Omitted | **Deduplicated**: Slug unique index resolves `/shop?brand=slug`. |
| `products` | `sku` | `UNIQUE` (`uq_prod_sku`) | Omitted | **Deduplicated**: Unique index resolves warehouse barcode scans. |
| `products` | `slug` | `UNIQUE` (`uq_prod_slug`) | Omitted | **Deduplicated**: Unique index powers canonical `/product/:slug` routing. |
| `orders` | `order_number` | `UNIQUE` (`uq_order_number`) | Omitted | **Deduplicated**: Customer order tracking resolved in O(1) via unique index. |
| `order_discounts`| `code` | `UNIQUE` (`uq_coupon_code`) | Omitted (`idx_disc_code` removed) | **Deduplicated**: O(1) lookup by coupon code. Composite index starting with `code` eliminated as redundant. |
| `clients` | `client_code` | `UNIQUE` (`uq_client_code`) | Omitted | **Deduplicated**: Client code resolution handled by unique index. |
| `clients` | `gstin` | `UNIQUE` (`uq_client_gstin`) | Omitted | **Deduplicated**: GSTIN lookups handled by unique index. |
| `quotations` | `quotation_number` | `UNIQUE` (`uq_quote_number`) | Omitted | **Deduplicated**: Quote resolution handled by unique index. |
| `invoices` | `invoice_number` | `UNIQUE` (`uq_inv_number`) | Omitted | **Deduplicated**: Statutory invoice resolution handled by unique index. |
| `payout_settlements`| `settlement_id` | `UNIQUE` (`uq_payout_setl_id`) | Omitted | **Deduplicated**: Gateway batch reconciliation handled by unique index. |
| `shipping_rules`| `state` | `UNIQUE` (`uq_ship_state`) | Omitted | **Deduplicated**: State fallback lookup handled by unique index. |

### 3.2 Query Patterns Accelerated by Retained Composite & Filtering Indexes

All non-unique indexes in Section 2 serve distinct composite filtering or sorting access paths:
1. `idx_users_role_act (role, is_active)`: Supports administrative staff listing and permissions checks (`WHERE role = 'admin' AND is_active = 1`).
2. `idx_cat_hero (show_in_hero, is_active, hero_order)`: Renders the homepage promotional hero carousel sorted by display sequence.
3. `idx_prod_cat_brand (category_id, brand_id, active)`: Accelerates the primary catalog filtering screen (`/shop?category=fans&brand=havells`).
4. `idx_prod_featured (featured, active)`: Powers the homepage "Featured Products" row.
5. `idx_prod_price (price)`: Enables price slider filtering (`/shop?min_price=500&max_price=2000`).
6. `idx_orders_user (user_id, created_at)`: Delivers the customer `/account` order history in reverse chronological order (`WHERE user_id = ? ORDER BY created_at DESC`).
7. `idx_orders_status (status, created_at)`: Powers the admin fulfillment queue (`WHERE status = 'CONFIRMED' ORDER BY created_at ASC`).
8. `idx_slabs_config_range (delivery_config_id, min_distance_km, max_distance_km)`: Resolves the distance tariff slab via range comparison.
9. `idx_invoices_client_stat (client_id, status)`: Aggregates outstanding balances for B2B credit limit verification.
10. `idx_invoices_date_stat (invoice_date, status)`: Aggregates revenue for monthly P&L and GST return preparation.
