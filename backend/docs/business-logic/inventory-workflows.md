# Inventory Workflow Engine & Ledger Integrity

## 1. Overview
The **Inventory Workflow Engine** (`InventoryService` in `apps.inventory.services`) governs all physical stock mutations across the catalog. It enforces row-level locking (`select_for_update`), non-negative balance invariants, and immutable append-only ledger transaction logging.

---

## 2. Core Operations

### 2.1 Restock Workflow
- **Trigger**: Inbound warehouse shipments, factory arrivals.
- **Mechanism**:
  1. Transaction lock on product row via `select_for_update()`.
  2. Validate positive integer quantity ($Q > 0$).
  3. Increment stock: `product.stock += Q`.
  4. Create immutable `StockTransaction` of type `RESTOCK` with `+Q`.
  5. Commit atomically.

### 2.2 Sale Deduction Workflow
- **Trigger**: Customer order checkout completion.
- **Mechanism**:
  1. Lock product row via `select_for_update()`.
  2. Verify product is `active=True`.
  3. Verify `product.stock >= requested_quantity`. If insufficient, raise `ValidationError`.
  4. Decrement stock: `product.stock -= Q`.
  5. Create immutable `StockTransaction` of type `SALE` with `-Q` and foreign key to `Order`.
  6. Commit atomically.

### 2.3 Audit Adjustment Workflow
- **Trigger**: Periodic physical warehouse audits, breakage, damage write-offs.
- **Mechanism**:
  1. Lock product row via `select_for_update()`.
  2. Verify resulting stock: `product.stock + change_amount >= 0`. Negative stock balances are strictly prohibited.
  3. Update stock: `product.stock += change_amount`.
  4. Create immutable `StockTransaction` of type `ADJUSTMENT`.
  5. Commit atomically.

### 2.4 Cancellation / Return Stock Restoration Workflow
- **Trigger**: Order cancelled in `PENDING`, `CONFIRMED`, `PACKED`, or returned upon physical inspection (`RETURN_COMPLETED`).
- **Mechanism**:
  1. **Duplicate Restoration Prevention**: Query `StockTransaction` for existing `RETURN` entries attached to this order. If already present, restoration exits immediately as a safe no-op.
  2. Lock product rows via `select_for_update()`.
  3. Restore quantity for each order item: `product.stock += item.quantity`.
  4. Create immutable `StockTransaction` of type `RETURN` with `+item.quantity`.
  5. Commit atomically.

---

## 3. Ledger Immutability & Concurrency
- `StockTransaction` records are strictly append-only.
- Updates and deletions on `stock_transactions` table are blocked by application design and DB foreign key constraints.
- Product deletion respects `models.PROTECT` on foreign key relations.
