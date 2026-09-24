# Inventory APIs

Base URL: `/api/v1/inventory/`

All inventory endpoints require administrative or staff permissions (`IsAdminUser`). Customers cannot view or mutate internal warehouse stock.

## 1. Inventory Overview
- **Endpoint**: `GET /api/v1/inventory/`
- **Auth**: Admin (`IsAdminUser`)
- **Query Params**:
  - `low_stock`: `true` (filters products where `stock <= low_stock_threshold`)
  - `search` / `q`: Keyword search across product name or SKU.
- **Response**: Paginated list of catalog items with current stock, threshold, and `is_low_stock` indicator.

## 2. Stock Ledger Transactions
- **Endpoint**: `GET /api/v1/inventory/transactions/`
- **Auth**: Admin (`IsAdminUser`)
- **Description**: Paginated view of the immutable, append-only stock ledger.
- **Query Params**:
  - `product` / `product_id`: Filter by Product ID.
  - `type` / `transaction_type`: Filter by transaction type (`RESTOCK`, `SALE`, `ADJUSTMENT`, `RETURN`, `DAMAGE`).
- **Response Fields**:
  - `id`, `product`, `product_name`, `product_sku`, `change_amount`, `transaction_type`, `order`, `performed_by`, `performed_by_email`, `notes`, `created_at`.

## 3. Restock Product
- **Endpoint**: `POST /api/v1/inventory/restock/`
- **Auth**: Admin (`IsAdminUser`)
- **Concurrency Safety**: Uses `transaction.atomic` and row locking (`select_for_update`).
- **Request Body**:
  ```json
  {
      "product_id": 1,
      "quantity": 50,
      "notes": "Container shipment receipt batch #42"
  }
  ```
- **Validation**:
  - `product_id`: Must be a valid, existing product.
  - `quantity`: Positive integer (`min_value=1`).
- **Effect**:
  - Atomically increments `product.stock += quantity`.
  - Appends an immutable `StockTransaction` record of type `RESTOCK`.

## 4. Stock Adjustment
- **Endpoint**: `POST /api/v1/inventory/adjust/`
- **Auth**: Admin (`IsAdminUser`)
- **Concurrency Safety**: Uses `transaction.atomic` and row locking (`select_for_update`).
- **Request Body**:
  ```json
  {
      "product_id": 1,
      "change_amount": -5,
      "notes": "Physical inventory audit variance"
  }
  ```
- **Validation**:
  - `change_amount != 0`.
  - Prevents negative resulting stock: rejects if `product.stock + change_amount < 0` with HTTP 400.
- **Effect**:
  - Atomically updates `product.stock += change_amount`.
  - Appends an immutable `StockTransaction` record of type `ADJUSTMENT`.
