# Vee Power Electricals — Catalog Domain Architecture & Reference

## 1. Domain Architecture Overview

The **Catalog Domain** manages the master merchandise taxonomy, manufacturer brand registry, product catalog items, multi-image media galleries, and technical specification attributes for Vee Power Electricals.

```
Category (Primary Taxonomy & Hero Showcase)
  └── Subcategory (Secondary Hierarchical Classification)
        └── Product (Master Merchandise Item)
              ├── Brand (Manufacturer Registry: Havells, Schneider, Polycab, etc.)
              ├── ProductImage (Multi-Image Gallery with deterministic primary image)
              └── ProductSpecification (Key-Value Technical Parameters)
```

The Catalog domain interacts with:
- **Inventory Domain**: Reads stock availability (`in_stock` boolean for public users; exact warehouse quantities for authenticated admins). Inventory retains authoritative write control over physical stock levels and ledger tracking.
- **Orders & Checkout Domain**: Re-reads authoritative DB pricing and availability during checkout. Snapshots prices into frozen, immutable `OrderItem` records.
- **Finance Domain**: Historical `InvoiceItem` and `QuotationItem` records reference products while snapshotting price, tax, and name at the moment of creation.

---

## 2. Core Entities & Constraints

### Category (`Category`)
- `name`: Unique CharField (max 100).
- `slug`: Unique SlugField (auto-slugified from name).
- `hero_order`, `show_in_hero`, `hero_badge`: Promotional hero controls.
- `discount_enabled`, `discount_type` (`percentage` / `fixed`), `discount_value`: Category promotion markdown.
- `is_active`: Boolean flag (default: `True`). Inactive categories are hidden from public endpoints.
- **Invariants**:
  - `chk_cat_disc_val`: `discount_value >= 0`.
  - Serializer validates percentage discounts $\le 100\%$.
  - Deleting a category with associated active products triggers safe soft-deactivation (`is_active = False`) instead of hard deletion.

### Subcategory (`Subcategory`)
- `category`: Foreign key to parent `Category` (`on_delete=models.CASCADE`).
- `name`: Non-blank CharField (max 100).
- `slug`: SlugField unique within parent category (`uq_subcat_slug`).
- `display_order`, `is_active`: Display order and activation state.
- **Invariants**:
  - `UniqueConstraint(fields=['category', 'slug'])`.
  - Serializer auto-populates `slug` during `to_internal_value()`.
  - Deleting a subcategory referenced by products soft-deactivates it.

### Brand (`Brand`)
- `name`: Unique CharField (max 100).
- `slug`: Unique SlugField (max 100).
- `logo_url`, `description`, `is_active`.
- **Invariants**:
  - Deleting a brand with existing products soft-deactivates it.

### Product (`Product`)
- `name`: Non-blank CharField (max 255).
- `slug`: Unique SlugField (max 255).
- `sku`: Unique CharField (max 100, normalized to uppercase and stripped).
- `category`: Protected Foreign Key to `Category` (`on_delete=models.PROTECT`).
- `subcategory`: Set-Null Foreign Key to `Subcategory` (`on_delete=models.SET_NULL`, nullable).
- `brand`: Protected Foreign Key to `Brand` (`on_delete=models.PROTECT`).
- `mrp`: DecimalField (max_digits=10, decimal_places=2, $\ge 0$).
- `price`: DecimalField (max_digits=10, decimal_places=2, $\ge 0$).
- `stock`: IntegerField ($\ge 0$).
- `low_stock_threshold`: IntegerField ($\ge 0$, default: 5).
- `primary_image`: CharField (max 500, synchronized automatically with primary `ProductImage`).
- `featured`: Boolean (default: False).
- `active`: Boolean (default: True).
- **Invariants**:
  - `chk_product_price_mrp`: `price <= mrp`.
  - `chk_product_price_pos`: `price >= 0`.
  - `chk_product_mrp_pos`: `mrp >= 0`.
  - `chk_product_stock_pos`: `stock >= 0`.
  - **Category-Subcategory Compatibility**: If both `category` and `subcategory` are set, `subcategory.category_id` must match `category_id`. Enforced at both serializer and model `save()` levels.

### ProductImage (`ProductImage`)
- `product`: Foreign Key to `Product` (`on_delete=models.CASCADE`).
- `image_url`: Non-blank CharField (max 500).
- `sort_order`: PositiveIntegerField (default: 0).
- `is_primary`: Boolean (default: False).
- **Deterministic Normalization**:
  - When saving an image with `is_primary=True`, all other images for the product are unset (`is_primary=False`), and `product.primary_image` is updated.
  - Adding the first image to a product automatically promotes it to primary.
  - Deleting a primary image automatically promotes the next image ordered by `(sort_order, id)` to primary.
  - Deleting the last image resets `product.primary_image` to `""`.
  - Non-admin public endpoints never expose images belonging to inactive products.

### ProductSpecification (`ProductSpecification`)
- `product`: Foreign Key to `Product` (`on_delete=models.CASCADE`).
- `spec_key`: Non-blank CharField (max 100).
- `spec_value`: Non-blank CharField (max 255).
- `sort_order`: PositiveIntegerField (default: 0).
- **Invariants**:
  - `uq_prod_spec`: Unique per `(product, spec_key)`.
  - Stripped strings; blank keys or values are rejected.
  - Non-admin public endpoints never expose specifications for inactive products.

---

## 3. Authoritative Price Integrity & Discount Rules

1. **Decimal Storage**: All prices and discounts are stored in database `DecimalField` columns with scale 2. No floating-point financial arithmetic is permitted.
2. **Authoritative Calculation**: Product selling price and category discounts are computed exclusively on the backend (`BillingService`).
3. **No Client-Authoritative Pricing**: The frontend cart payable amount is never accepted by checkout. Checkout re-reads product state, prices, and stock directly from the database under row-level database locks (`select_for_update`).
4. **Historical Price Protection**:
   - `OrderItem`: Snapshots `unit_price`, `mrp`, `taxable_amount`, and `total_amount` at order confirmation. Subsequent changes to product prices, MRP, or discounts do NOT alter historical order items.
   - `InvoiceItem`: Snapshots `rate`, `taxable_amount`, and `total_amount`. Product updates do NOT alter existing tax invoices.
   - `QuotationItem`: Snapshots `unit_price` and `subtotal`. Product price updates do NOT alter existing commercial quotations.

---

## 4. Product Status & Deletion Safety

| Status | Public Catalog Visibility | Detail Page Access | Checkout Eligibility | Historical Records |
| :--- | :--- | :--- | :--- | :--- |
| **Active (`active=True`)** | Visible in shop & categories | Accessible (`/products/:id` or `:slug`) | Purchasable if in stock | Linked |
| **Inactive (`active=False`)** | Hidden from public catalog | Returns 404 to public users | Rejected by checkout engine | Fully preserved |

### Hardened Product Deletion:
Physical deletion is permanently blocked for any product that has:
- Historical orders (`OrderItem`)
- Historical tax invoices (`InvoiceItem`)
- Historical quotations (`QuotationItem`)
- Warehouse stock ledger entries (`StockTransaction`)

When an admin attempts to delete a product with historical records, the API intercepts the request and performs a safe soft-deactivation (`active = False`), returning HTTP 200 with `{"deactivated": True}` and preserving full audit integrity.

---

## 5. API Endpoints & Behavior

### Public & Admin Endpoints

| Resource | Methods | Public Access | Admin Access |
| :--- | :--- | :--- | :--- |
| `/api/v1/catalog/categories/` | GET, POST | Active only | Full CRUD |
| `/api/v1/catalog/categories/:id_or_slug/` | GET, PUT, PATCH, DELETE | Active only | Full CRUD / Soft-delete |
| `/api/v1/catalog/categories/hero/` | GET | Active hero categories | Read only |
| `/api/v1/catalog/subcategories/` | GET, POST | Active only | Full CRUD |
| `/api/v1/catalog/subcategories/:id_or_slug/` | GET, PUT, PATCH, DELETE | Active only | Full CRUD / Soft-delete |
| `/api/v1/catalog/brands/` | GET, POST | Active only | Full CRUD |
| `/api/v1/catalog/brands/:id_or_slug/` | GET, PUT, PATCH, DELETE | Active only | Full CRUD / Soft-delete |
| `/api/v1/catalog/products/` | GET, POST | Active only (stock masked) | Full CRUD (`?active=true/false`) |
| `/api/v1/catalog/products/:id_or_slug/` | GET, PUT, PATCH, DELETE | Active only | Full CRUD / Safe soft-delete |
| `/api/v1/catalog/images/` | GET, POST, DELETE | Active product images | Full CRUD |
| `/api/v1/catalog/specifications/` | GET, POST, DELETE | Active product specs | Full CRUD |

### Search (`?q=` or `?search=`)
Case-insensitive partial matching across customer-visible fields using parameterized ORM queries:
- Product name (`name__icontains`)
- Product SKU (`sku__icontains`)
- Brand name (`brand__name__icontains`)
- Category name (`category__name__icontains`)
- Subcategory name (`subcategory__name__icontains`)
- Description (`description__icontains`)

SQL injection strings and special characters are handled safely through Django ORM parameterization.

### Filtering Parameters
- `category` / `category_slug`: Filter by category ID or slug.
- `subcategory` / `subcategory_slug`: Filter by subcategory ID or slug.
- `brand` / `brand_slug`: Filter by brand ID or slug.
- `min_price` / `max_price`: Bounded selling price filter.
- `in_stock`: `true` (stock > 0) or `false` (stock = 0).
- `featured`: `true` or `false`.
- `active`: Admin-only filter (`true` or `false`).

### Sorting (`?ordering=`)
Strict allowlist validation:
- `price` / `-price`
- `name` / `-name`
- `created_at` / `-created_at`
- `updated_at` / `-updated_at`
All sort orders append a secondary deterministic sort key (`-id`) to guarantee stable pagination. Unrecognized or malicious ordering attributes are safely ignored.

### Pagination
- Standard pagination with `count`, `next`, `previous`, `page`, `total_pages`, `results`.
- Default page size: `20`.
- Maximum page size: `100` (`page_size` query parameter).

---

## 6. Frontend Integration

1. **Routing by Slug & ID**: Both `/shop?category=switchgear-control` and product URLs `/products/masterpact-mtz-acb-1600a` or `/products/1` resolve reliably.
2. **Stock Visibility**: Customers see qualitative stock status (`In Stock`, `Only X left`, `Out of Stock`). Exact warehouse stock counts and low-stock thresholds are restricted to admin users.
3. **Cart & Checkout Resilience**: Adding a product to cart stores client state, but checkout recalculates authoritative current pricing, validates active availability, and verifies stock atomically.

---

## 7. Test Suite Coverage

The Catalog domain is verified by:
- `tests.test_step5_catalog` (28 focused domain tests)
- `tests.test_phase3_models` (17 catalog/inventory model tests)
- `tests.test_phase5_api` (20 REST API tests)
- `tests.test_phase7_api_integration` (17 integration tests)
- `tests.test_phase7_validation` (14 edge-case tests)
- `tests.test_phase7_security` (7 security tests)
- `tests.test_phase7_performance` (9 query optimization tests)
- Full backend suite: **283 passing tests** with 0 regressions.
- Frontend E2E: **31 passing Playwright tests**, **17 passing live integration tests**.
