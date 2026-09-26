# Vee Power Electricals — Inventory Domain Architecture & Reference

## 1. Domain Architecture Overview

The **Inventory Domain** is the authoritative, immutable source of truth for all stock movements, current warehouse balances, reservation integrity, and stock reconciliations for Vee Power Electricals.

```
Product (Catalog) ─── authoritative physical stock count (Product.stock)
       ▲
       │ atomicity + row lock (select_for_update)
       ▼
StockTransaction (Immutable Ledger: RESTOCK, SALE, ADJUSTMENT, RESTORATION)
       ▲
       ├── Restock Workflow (Admin/Staff inward movement)
       ├── Stock Adjustment Workflow (Admin discrepancy calibration)
       ├── Order Checkout Reservation & Deduction (Sales)
       ├── Order Cancellation Restoration (Restoration)
       └── Return Completion (Warehouse physical return verification)
```

The Inventory domain interfaces tightly with:
- **Catalog Domain (`Product`)**: Physical stock quantity `Product.stock` is maintained in sync with ledger transaction records. Inactive products preserve their entire immutable ledger history.
- **Orders & Checkout Domain (`OrderWorkflowService`)**: Atomically reserves and deducts stock under row-level database locks during order placement.
- **Payment Domain (`PaymentGatewayService`)**: Ensures idempotency across webhook deliveries, payment retries, and late confirmation webhooks to prevent duplicate deductions or restorations.
- **Returns Domain**: Strict return boundary where only physically received and approved returns (`RETURN_COMPLETED`) restore inventory.

---

## 2. Stock Ledger Integrity (`StockTransaction`)

The `StockTransaction` model represents an append-only, immutable inventory ledger.

### Immutability Guarantees
- **Model-Level Override**: `save()` prevents updating existing records (`if self.pk and StockTransaction.objects.filter(pk=self.pk).exists(): raise ValidationError("StockTransaction records are immutable...")`).
- **Deletion Protection**: `delete()` raises `ValidationError("StockTransaction records cannot be deleted. The inventory ledger is immutable.")`.
- **Django Admin Enforcement**: Admin model disables `has_add_permission`, `has_change_permission`, and `has_delete_permission`, ensuring read-only auditing in the Django administration panel.

### Core Ledger Fields
- `product`: Protected Foreign Key to `Product` (`on_delete=models.PROTECT`).
- `transaction_type`: Enum string representing the reason for inventory movement:
  - `RESTOCK`: Inward supplier inventory addition (positive quantity).
  - `SALE`: Outward order checkout inventory deduction (negative quantity).
  - `ADJUSTMENT`: Discrepancy, damage, audit, or count reconciliation adjustment (positive or negative).
  - `RESTORATION`: Inward restoration following order cancellation or completed return (positive quantity).
- `quantity`: Absolute quantity involved in the movement ($> 0$).
- `change_amount`: Authoritative signed integer representing net delta to stock balance:
  - `+quantity` for `RESTOCK` and `RESTORATION`.
  - `-quantity` for `SALE`.
  - `+quantity` or `-quantity` for `ADJUSTMENT`.
- `reference_order`: Nullable Foreign Key to `Order` (`on_delete=models.SET_NULL`), linking deductions and restorations directly to orders.
- `created_by`: Nullable Foreign Key to `User` (`on_delete=models.SET_NULL`), providing full auditability of the staff or admin initiating the movement.
- `notes`: Descriptive explanation or reason for the transaction.
- `created_at`: Timestamp indexed for historical reporting and audit queries.

---

## 3. Current Stock Calculation & Ledger Reconciliation

Current stock is derived authoritatively from the database:
1. **Authoritative Field**: `Product.stock` stores the current available quantity for performant query filters, sorting, and low-stock alerting.
2. **Ledger Derivation**: At any time, authoritative reconciliation verifies that:
   $$\text{Current Stock} = \sum_{\text{ledger}} \text{change\_amount}$$
3. **Reconciliation Service**: `InventoryService.get_ledger_summary(product_id)` computes:
   - Total Restocked (`RESTOCK`)
   - Total Sold (`SALE`)
   - Net Adjustments (`ADJUSTMENT`)
   - Total Restored (`RESTORATION`)
   - Computed Ledger Balance vs Authoritative `Product.stock`
   - Discrepancy Check (`discrepancy = product.stock - computed_balance`)

### Non-Negative Stock Invariant
- Database check constraint `chk_product_stock_pos` enforces `stock >= 0`.
- Application service layer validates that no deduction or negative adjustment can cause `product.stock < 0`. If insufficient stock exists, an `InsufficientStockException` is raised, rolling back the database transaction.

---

## 4. Restock Workflow

Admin and staff members can restock warehouse inventory through `InventoryService.restock_product()`.

### Rules & Validations:
- **Authorization**: Staff and Admin roles only. Unauthenticated users and customers receive `403 Forbidden` / `401 Unauthorized`.
- **Positive Quantity**: Restock quantity must be an integer $> 0$ and $\le 1,000,000$ per batch.
- **Product Existence**: Rejects non-existent product IDs with `404 Not Found`.
- **Atomicity**: Executed inside `transaction.atomic()` with `select_for_update()`.
- **Ledger Record**: Produces an immutable `StockTransaction` with type `RESTOCK` and `change_amount = +quantity`.

---

## 5. Stock Adjustment Workflow

Inventory adjustments handle physical audit discrepancies, shrinkage, damages, or manual corrections through `InventoryService.adjust_stock()`.

### Rules & Validations:
- **Authorization**: Staff and Admin roles only.
- **Signed Delta**: `change_amount` can be positive (found surplus) or negative (shrinkage/damage), bounded between $-1,000,000$ and $+1,000,000$. Zero delta is rejected.
- **Stock Floor Guard**: Resulting stock (`product.stock + change_amount`) cannot drop below 0.
- **Reason Required**: Serializer mandates non-empty `reason` (minimum 3 characters) for full audit traceability.
- **Ledger Record**: Produces an immutable `StockTransaction` with type `ADJUSTMENT` and signed `change_amount`.

---

## 6. Order → Inventory Deduction & Payment Consistency

### Checkout Stock Deduction
1. When a customer initiates checkout via `OrderWorkflowService.create_order_from_cart()`, all cart items are locked using `Product.objects.select_for_update()`.
2. Stock is verified against line item quantities. If any product has insufficient stock, the transaction is aborted and no order or ledger records are created.
3. For each order item, `InventoryService.deduct_order_stock()`:
   - Decrements `product.stock -= item.quantity`.
   - Records a `StockTransaction` with type `SALE`, `change_amount = -item.quantity`, and `reference_order = order`.

### Payment Gateway Idempotency & Consistency
- **Payment Success**: When Razorpay payment is captured, `PaymentGatewayService.verify_payment_signature()` transitions order to `CONFIRMED`.
  - Stock was already deducted at checkout reservation.
  - Payment retries or duplicate signature submissions verify payment but do not duplicate stock deduction.
- **Duplicate Webhook Protection**: `PaymentGatewayService.handle_webhook()` checks if the order or transaction was already finalized. Duplicate `payment.captured` webhooks are acknowledged idempotently without altering inventory.
- **Failed Payment**: Order remains `PENDING` (or cancelled if payment expired). Stock deduction is not repeated on retry; if retry succeeds, existing reservation transitions to `CONFIRMED`.
- **Late Webhook After Cancellation**: If a webhook arrives for an order already marked `CANCELLED`, the payment is flagged/logged, but the cancelled order is **not** resurrected, and inventory is not re-deducted.

---

## 7. Cancellation & Stock Restoration

When an eligible order is cancelled via `OrderWorkflowService.cancel_order()`:
1. **Canonical State Check**: Only unfulfilled orders (`PENDING`, `CONFIRMED`, `PACKED`) can be cancelled.
2. **Row Locking**: Order is locked with `Order.objects.select_for_update()` to prevent concurrent cancellation races.
3. **Idempotency Guard**: `cancel_order()` checks if stock was already restored for the order by querying existing `StockTransaction` records with `transaction_type=RESTORATION` and `reference_order=order`.
4. **Atomic Restoration**:
   - `product.stock += item.quantity` under row-lock.
   - Creates `StockTransaction` with type `RESTORATION`, `change_amount = +item.quantity`, and `reference_order = order`.
5. **Duplicate Cancellation**: A subsequent cancellation attempt is rejected, preventing double restoration.

---

## 8. Return Boundary Specification

The return lifecycle follows the canonical Order FSM:
`DELIVERED` $\rightarrow$ `RETURN_REQUESTED` $\rightarrow$ `RETURN_APPROVED` $\rightarrow$ `RETURN_REJECTED` / `RETURN_COMPLETED`.

### Authoritative Inventory Effect:
- `RETURN_REQUESTED`: Customer submits return request. **No inventory movement.**
- `RETURN_APPROVED`: Staff authorizes return shipment. **No inventory movement** (merchandise is still in transit with customer).
- `RETURN_REJECTED`: Staff or inspection rejects return. **No inventory movement.**
- `RETURN_COMPLETED`: Warehouse physically inspects and receives merchandise into stock. **Stock is restored exactly once**:
  - `product.stock += returned_quantity`.
  - `StockTransaction` created with type `RESTORATION`, `notes="Return completed for order ..."`.

---

## 9. Concurrency & Transaction Isolation Strategy

High-concurrency checkout and restocking scenarios are safeguarded using explicit row-level locking:
1. **Row-Level Locks**: Every mutating stock operation uses `Product.objects.select_for_update()`.
2. **Deterministic Locking Order**: Multi-item checkouts sort product IDs in ascending order (`order_by('id')`) before acquiring `select_for_update()` locks, mathematically eliminating deadlock conditions between concurrent checkouts.
3. **Multi-Thread / Multi-Connection Validation**:
   - Tested under 10 concurrent threads each running on independent database connections competing for an initial stock of 5 units.
   - Result: Exactly 5 checkouts succeed, exactly 5 fail with `InsufficientStockException`, final stock is exactly 0, and exactly 5 ledger rows are recorded.

---

## 10. Role-Based Access Control (RBAC) & Visibility

| Resource / Endpoint | Public / Anonymous | Customer | Staff (`is_staff=True`) | Admin (`role=ADMIN`) |
| :--- | :--- | :--- | :--- | :--- |
| Catalog Stock Indicator | `in_stock` (bool) | `in_stock` (bool) | Exact quantity | Exact quantity |
| Low Stock Warnings | Hidden | Hidden | Visible ($\le \text{threshold}$) | Visible ($\le \text{threshold}$) |
| Stock Transaction History | 401 Unauthorized | 403 Forbidden | Read-Only | Read-Only |
| Restock API | 401 Unauthorized | 403 Forbidden | Allowed | Allowed |
| Stock Adjustment API | 401 Unauthorized | 403 Forbidden | Allowed | Allowed |
| Ledger Summary Audit | 401 Unauthorized | 403 Forbidden | Allowed | Allowed |

Sensitive inventory figures (exact warehouse counts, supplier restock notes, transaction creator identities) are strictly excluded from public serializers (`ProductListSerializer`, `ProductDetailSerializer`).

---

## 11. API Endpoints Reference

All endpoints are prefixed with `/api/v1/inventory/`:

| Method | Endpoint | Description | Permissions |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/inventory/overview/` | List products with inventory health, current stock, and low-stock alerts | Staff / Admin |
| `GET` | `/api/v1/inventory/transactions/` | Filterable, paginated audit ledger of all `StockTransaction` movements | Staff / Admin |
| `POST` | `/api/v1/inventory/restock/` | Add inward stock to a product | Staff / Admin |
| `POST` | `/api/v1/inventory/adjustment/` | Adjust stock balance with signed delta and audit reason | Staff / Admin |
| `GET` | `/api/v1/inventory/summary/<product_id>/` | Ledger reconciliation summary comparing computed ledger to physical balance | Staff / Admin |

### Query Filter Parameters for Transactions:
- `product_id`: Filter by specific product ID.
- `type`: Filter by transaction type (`RESTOCK`, `SALE`, `ADJUSTMENT`, `RESTORATION`).
- `order_id`: Filter by associated reference order ID.
- `user_id`: Filter by creator user ID.
- `date_from`, `date_to`: Date range filtering (`YYYY-MM-DD`).

---

## 12. Frontend Integration

- **Admin Inventory Dashboard (`/admin/inventory`)**:
  - Connects directly to backend API `/api/v1/inventory/overview/`, `/api/v1/inventory/restock/`, and `/api/v1/inventory/adjustment/`.
  - Removed all optimistic mock fallbacks; errors from the backend are surfaced to the user.
  - Interactive modal dialogs for Restock and Adjust Stock include loading states (`isSaving`), input bounds validation, and clear error/success feedback banners.
- **Storefront & Product Detail (`/shop`, `/product/:slug`)**:
  - Displays qualitative availability (`In Stock` / `Out of Stock`) derived from public boolean flag.
  - Cart and checkout validate availability at the server level, preventing client-side stock tampering.

---

## 13. Test Coverage

The inventory domain is validated across the test pyramid:
- **Unit & Service Tests (`backend/tests/test_step6_inventory.py`)**: 20 tests covering:
  - Ledger immutability and deletion rejection.
  - Restock and adjustment boundary limits.
  - Non-negative stock protection.
  - Qualitative stock visibility for customers.
  - Order checkout deduction, payment retry idempotency, cancellation restoration.
  - Late webhook handling after cancellation.
  - Return lifecycle inventory boundaries.
  - True multi-connection concurrent checkout competition (10 threads, 5 stock).
  - Concurrent restock + purchase contention.
- **Full Backend Regression**: 303/303 tests passing.
- **Frontend Integration**: 17/17 live backend API integration tests passing.
- **Playwright E2E**: Comprehensive admin inventory management, catalog stock displays, and full checkout-to-order journeys verified.
