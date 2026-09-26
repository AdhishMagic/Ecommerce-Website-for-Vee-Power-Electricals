# Orders & Return Lifecycle Domain Specification

## Vee Power Electricals — Step 7 Finalization

This document provides the authoritative domain specification, finite state machine (FSM), business rules, API boundaries, and historical snapshot guarantees for the Vee Power Electricals order and return lifecycle.

---

## 1. Canonical 10-State Order FSM

The application enforces a strictly defined 10-state finite state machine. Any legacy states (`PROCESSING`, `OUT_FOR_DELIVERY`, `RETURNED`) are non-canonical, obsolete, and rejected with validation errors.

| Status Code | Display Name | Category | Description |
|---|---|---|---|
| `PENDING` | Pending Payment | Initial | Order created by checkout engine; stock reserved; waiting for payment confirmation. |
| `CONFIRMED` | Confirmed | Fulfillment | Payment verified by backend or approved by staff; ready for warehouse picking. |
| `PACKED` | Packed | Warehouse | Items boxed, verified, and sealed in the warehouse facility. |
| `SHIPPED` | Shipped & In Transit | Carrier | Order dispatched with tracking number / AWB via logistics carrier. |
| `DELIVERED` | Delivered | Terminal (Fulfillment) | Carrier confirms physical delivery to customer destination address. |
| `CANCELLED` | Cancelled | Terminal | Order terminated prior to shipment; stock restored via authoritative ledger. |
| `RETURN_REQUESTED` | Return Requested | RMA Initial | Customer or staff initiated return request for delivered goods. |
| `RETURN_APPROVED` | Return Approved | RMA Processing | Warehouse/staff verified return request; customer requested to dispatch goods. |
| `RETURN_REJECTED` | Return Rejected | Terminal (RMA) | Return request rejected due to policy, damage, or warranty terms. |
| `RETURN_COMPLETED` | Return Completed | Terminal (RMA) | Returned goods physically received and inspected; inventory restocked. |

---

## 2. State Transition Matrix

The `OrderWorkflowService` enforces authoritative state transition rules:

```
[PENDING] --------> [CONFIRMED] --------> [PACKED] --------> [SHIPPED] --------> [DELIVERED]
   |                     |                   |                                        |
   |                     |                   |                                        v
   +---------------------+-------------------+                               [RETURN_REQUESTED]
                         |                                                            |
                         v                                                            v
                    [CANCELLED]                                              +--------+--------+
                                                                             |                 |
                                                                             v                 v
                                                                    [RETURN_APPROVED]   [RETURN_REJECTED]
                                                                             |
                                                                             v
                                                                    [RETURN_COMPLETED]
```

### Transition Matrix Table

| Current Status | Permitted Target Statuses | Prohibited Transitions (Examples) |
|---|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` | `PACKED`, `SHIPPED`, `DELIVERED`, `RETURN_*` |
| `CONFIRMED` | `PACKED`, `CANCELLED` | `SHIPPED`, `DELIVERED`, `RETURN_*` |
| `PACKED` | `SHIPPED`, `CANCELLED` | `CONFIRMED`, `DELIVERED`, `RETURN_*` |
| `SHIPPED` | `DELIVERED` | `CANCELLED`, `CONFIRMED`, `PACKED`, `RETURN_*` |
| `DELIVERED` | `RETURN_REQUESTED` | `CANCELLED`, `CONFIRMED`, `PACKED`, `SHIPPED` |
| `RETURN_REQUESTED` | `RETURN_APPROVED`, `RETURN_REJECTED` | `RETURN_COMPLETED`, `CANCELLED`, `DELIVERED` |
| `RETURN_APPROVED` | `RETURN_COMPLETED` | `RETURN_REJECTED`, `CANCELLED`, `CONFIRMED` |
| `CANCELLED` | *None (Terminal)* | Any attempt to transition raises `ValidationError` |
| `RETURN_REJECTED` | *None (Terminal)* | Any attempt to transition raises `ValidationError` |
| `RETURN_COMPLETED` | *None (Terminal)* | Any attempt to transition raises `ValidationError` |

---

## 3. Order Status History & Audit Trail

Every legitimate transition produces exactly one audit record in `OrderStatusHistory`:
- `previous_status`: Previous canonical state (null on order creation).
- `new_status`: Target canonical state.
- `changed_by`: Foreign key to user (customer or admin actor).
- `reason`: Explanation or automated event trigger notes.
- `created_at`: UTC timestamp.

### History Guarantees
1. **Append-Only:** Historical records cannot be modified or deleted.
2. **Idempotency:** Re-invoking transition to the same status is an idempotent no-op and produces no duplicate history entry.
3. **Atomicity:** Transition, stock effects, and history logging execute within an atomic transaction.

---

## 4. Customer Ownership & Data Isolation

Server-side ownership verification is strictly enforced:
- **Order Retrieval:** `OrderDetailView` queries `Order.objects.filter(user=request.user)` for customers. Non-owners receive HTTP 404.
- **Order History:** `OrderStatusHistoryListView` checks `Order.objects.filter(id=order_id, user=request.user)`. Non-owners receive HTTP 404.
- **Cancellation:** `OrderCancelView` verifies `order.user == request.user` (or admin). Foreign cancellation attempts return HTTP 403.
- **Return Request:** `OrderReturnRequestView` verifies `order.user == request.user` (or admin). Foreign return attempts return HTTP 403.
- **Invoices / Transactions:** Invoices and payment transaction records are admin-only or scoped to authenticated customer sessions.

---

## 5. Authoritative Order Creation

Customer checkout (`CheckoutService.process_checkout`) guarantees server-authoritative calculations:
- Product prices are retrieved directly from locked database rows (`select_for_update()`).
- Taxes (CGST, SGST, IGST) are calculated dynamically via `BillingService` and `TaxService` based on shipping state.
- Shipping fees and free-delivery thresholds are calculated server-side.
- Any client-submitted prices, subtotals, tax figures, or customer IDs in the request body are ignored.

---

## 6. Historical Snapshot Guarantees

### Order Line Items (`OrderItem`)
Line items freeze critical product data at the exact moment of checkout:
- `product_name`: Historical snapshot of name.
- `sku`: Historical snapshot of SKU.
- `mrp` and `unit_price`: Locked transaction prices.
- `line_discount`: Applicable line discount.
- `tax_rate`, `taxable_amount`, `tax_amount`, `subtotal`, `total_amount`.

**Immutability Guarantee:** Subsequent changes to the catalog Product (name changes, price updates, SKU modifications, category reassignment, or deactivation) do not affect historical orders or recalculate order totals.

### Addresses (`Order.shipping_address` & `Order.billing_address`)
Addresses are snapshotted into JSONFields during checkout. Modifying, deleting, or changing default addresses in the customer profile does not alter past order address records.

---

## 7. Order Cancellation Workflow

Cancellation is supported for orders in `PENDING`, `CONFIRMED`, or `PACKED` status.
- Once an order is `SHIPPED` or `DELIVERED`, cancellation is prohibited; customers must request a return post-delivery.
- **Inventory Restoration:** Calling `OrderWorkflowService.cancel_order()` delegates to `InventoryService.restore_order_stock()`, which:
  1. Serializes execution using row-level locking on the `Order`.
  2. Inspects `StockTransaction` for existing `RETURN` transactions to prevent duplicate restocking.
  3. Increments product stock and records an immutable `StockTransaction` with type `RETURN`.
- **Payment Protection:** A cancelled order cannot be paid or confirmed via late Razorpay webhook / verification.

---

## 8. Return Lifecycle & Physical Inventory Boundary

Returns follow a strict 4-step pipeline:

1. **`DELIVERED -> RETURN_REQUESTED`**:
   - Customer or staff submits RMA request with a required reason.
   - **No inventory restoration** (goods are still with the customer).
   - Customer communication dispatched (`ORDER_RETURN_REQUESTED`).

2. **`RETURN_REQUESTED -> RETURN_APPROVED`**:
   - Authorized admin/staff approves return inspection.
   - **No inventory restoration** (goods have not arrived at warehouse).
   - Customer communication dispatched (`ORDER_RETURN_APPROVED`).

3. **`RETURN_REQUESTED -> RETURN_REJECTED`**:
   - Staff rejects return (e.g. policy breach, damaged warranty).
   - **No inventory restoration**.
   - Terminal state.

4. **`RETURN_APPROVED -> RETURN_COMPLETED`**:
   - Warehouse confirms physical receipt and inspection.
   - **Inventory Restoration Boundary:** `InventoryService.restore_order_stock()` restores physical stock and writes `StockTransaction(type=RETURN)`.
   - Customer communication dispatched (`ORDER_RETURN_COMPLETED`).

---

## 9. Refund Boundary & Payment Consistency

- Automated Razorpay gateway refund execution is currently decoupled and outside the automated payment scope.
- `RETURN_COMPLETED` does **not** simulate or synthesize fake gateway refund transactions.
- Payment refund operations must follow the verified accounting boundary or manual settlement review.

---

## 10. Concurrency & Row-Level Locking

Concurrent operations (e.g., simultaneous cancellation requests or simultaneous return completion calls) are protected by:
- `select_for_update()` row-level locks on the `Order` model.
- Idempotency guards in `OrderWorkflowService` and `InventoryService`.
- Guarantees that stock is restored exactly once, regardless of thread or worker concurrency.

---

## 11. Customer & Admin API Endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/orders/checkout/` | Customer | Place retail order with atomic stock deduction |
| `GET` | `/api/v1/orders/my-orders/` | Customer | List own orders with item counts |
| `GET` | `/api/v1/orders/{id}/` | Customer / Admin | Retrieve full order detail with items & history |
| `POST` | `/api/v1/orders/{id}/cancel/` | Customer / Admin | Cancel eligible order (`PENDING`, `CONFIRMED`, `PACKED`) |
| `POST` | `/api/v1/orders/{id}/return/` | Customer / Admin | Submit return request for `DELIVERED` order |
| `GET` | `/api/v1/orders/{id}/history/` | Customer / Admin | List status audit history for order |
| `GET` | `/api/v1/orders/` | Admin | Administrative listing with status, customer, date filters |
| `PATCH` | `/api/v1/orders/{id}/status/` | Admin | Advance order through canonical state machine |
