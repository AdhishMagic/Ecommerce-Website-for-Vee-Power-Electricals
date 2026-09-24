# Catalog APIs

Base URL: `/api/v1/catalog/`

## 1. Categories

### 1.1 List Categories
- **Endpoint**: `GET /api/v1/catalog/categories/`
- **Auth**: Optional (`AllowAny`). Non-admin users see active categories only.
- **Query Params**:
  - `show_in_hero`: `true` or `false`
- **Response**: Paginated list of category objects.

### 1.2 Hero Categories
- **Endpoint**: `GET /api/v1/catalog/categories/hero/`
- **Auth**: Optional (`AllowAny`). Returns active hero categories ordered by `hero_order`.

### 1.3 Category Detail
- **Endpoint**: `GET /api/v1/catalog/categories/{id}/`
- **Auth**: Optional (`AllowAny`).

### 1.4 Admin Category Operations
- **Endpoints**: `POST`, `PUT`, `PATCH`, `DELETE /api/v1/catalog/categories/`
- **Auth**: Admin (`IsAdminUser`).
- **Validation**:
  - `name`: Required
  - `slug`: Optional (auto-generated from `name` if blank)
  - `discount_value`: Positive decimal; maximum 100% when percentage.

---

## 2. Subcategories

### 2.1 List Subcategories
- **Endpoint**: `GET /api/v1/catalog/subcategories/`
- **Auth**: Optional (`AllowAny`). Non-admin users see active subcategories only.
- **Query Params**:
  - `category`: Filter by category ID or slug.

### 2.2 Subcategory Detail
- **Endpoint**: `GET /api/v1/catalog/subcategories/{id}/`
- **Auth**: Optional (`AllowAny`).

---

## 3. Brands

### 3.1 List Brands
- **Endpoint**: `GET /api/v1/catalog/brands/`
- **Auth**: Optional (`AllowAny`). Non-admin users see active brands only.

### 3.2 Brand Detail
- **Endpoint**: `GET /api/v1/catalog/brands/{id}/`
- **Auth**: Optional (`AllowAny`).

---

## 4. Products

### 4.1 List Products
- **Endpoint**: `GET /api/v1/catalog/products/`
- **Auth**: Optional (`AllowAny`). Public users see active products only (`active=True`).
- **Filtering & Search Parameters**:
  - `category`: Filter by category ID or slug.
  - `category_slug`: Filter by category slug.
  - `brand`: Filter by brand ID or slug.
  - `brand_slug`: Filter by brand slug.
  - `min_price`: Minimum selling price (Decimal).
  - `max_price`: Maximum selling price (Decimal).
  - `featured`: `true` or `false`.
  - `q` / `search`: Substring search in name, SKU, or description.
  - `ordering`: `price`, `-price`, `name`, `-name`, `created_at`, `-created_at`.
- **Response Item Schema (Public)**:
  - `id`, `name`, `slug`, `sku`, `category`, `subcategory`, `brand`, `mrp`, `price`, `in_stock`, `primary_image`, `featured`, `active`, `created_at`.
  - *Note*: Internal inventory counts (`stock`, `low_stock_threshold`) are omitted for public users.
- **Response Item Schema (Admin)**:
  - Includes physical `stock` count and `low_stock_threshold`.

### 4.2 Product Detail
- **Endpoint**: `GET /api/v1/catalog/products/{id}/`
- **Auth**: Optional (`AllowAny`).
- **Additional Data**: Nested `images` gallery and key-value `specifications`.

### 4.3 Create Product
- **Endpoint**: `POST /api/v1/catalog/products/`
- **Auth**: Admin (`IsAdminUser`).
- **Request Body**:
  ```json
  {
      "name": "Havells Monoblock Pump 1HP",
      "sku": "HAV-PUMP-01",
      "category": 1,
      "brand": 2,
      "mrp": "7500.00",
      "price": "6200.00",
      "stock": 25,
      "low_stock_threshold": 5,
      "featured": true,
      "active": true
  }
  ```
- **Validation**:
  - `price <= mrp` constraint enforced.
  - `stock >= 0`, `mrp >= 0`, `price >= 0`.
  - Unique SKU check.

### 4.4 Update Product
- **Endpoint**: `PATCH /api/v1/catalog/products/{id}/`
- **Auth**: Admin (`IsAdminUser`).

### 4.5 Safe Product Deletion
- **Endpoint**: `DELETE /api/v1/catalog/products/{id}/`
- **Auth**: Admin (`IsAdminUser`).
- **Protected Ledger Behavior**:
  If the product has historical stock ledger entries (`StockTransaction`), deleting the product catches `ProtectedError` and safely deactivates the product (`active = False`), returning HTTP 200 with `{"deactivated": true}` rather than throwing an unhandled database exception.
