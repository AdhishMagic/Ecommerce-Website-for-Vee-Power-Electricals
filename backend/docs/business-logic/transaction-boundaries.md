# Transaction Boundaries & Concurrency Safety

## 1. Overview
Financial transactions and stock ledger mutations require strict database atomicity and concurrency control to avoid race conditions, deadlocks, and ledger drift.

---

## 2. Concurrency Controls & Row-Level Locking
All critical domain services use row-level locking (`select_for_update()`) inside atomic transactions:

| Domain Service | Operation | Locked Tables / Rows | Concurrency Protection |
|---|---|---|---|
| **`CheckoutService`** | Order placement | `Product.objects.select_for_update().filter(id__in=product_ids)` | Prevents overselling during high-traffic checkout spikes. |
| **`InventoryService`** | Restock & Adjustment | `Product.objects.select_for_update().get(id=product_id)` | Prevents race conditions during concurrent stock updates. |
| **`InventoryService`** | Duplicate Restock Guard | `StockTransaction.objects.filter(order=order, transaction_type='RETURN')` | Prevents double restoration of inventory upon order cancellation. |
| **`OrderWorkflowService`** | Status Transition | `Order.objects.select_for_update().get(pk=order_id)` | Prevents simultaneous conflicting status updates. |
| **`QuotationService`** | Quotation Conversion | `Quotation.objects.select_for_update().get(pk=quotation_id)` | Prevents duplicate generation of tax invoices from the same quote. |

---

## 3. Transaction Boundary Invariants

1. **All-or-Nothing Atomicity**:
   - If any step in `CheckoutService.process_checkout` fails (e.g. stock deficit on item 3 of 4), the entire database transaction is rolled back.
   - No orphan `Order`, no partial line items, and no rogue `StockTransaction` records can ever be committed.
2. **Lock Order Consistency**:
   - Product rows in checkout are locked in deterministic order (by sorted primary key `id__in=product_ids`) to eliminate database deadlock risks.
3. **Ledger Immutability**:
   - `StockTransaction`, `OrderStatusHistory`, and `PaymentTransaction` tables are append-only.
   - Direct updates or deletions are prohibited.
