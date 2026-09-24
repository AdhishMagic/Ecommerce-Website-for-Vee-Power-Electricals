# Order & Checkout APIs

Base URL: `/api/v1/orders/`

## 1. Customer Checkout
- **Endpoint**: `POST /api/v1/orders/checkout/`
- **Auth**: Customer (`IsAuthenticated`).
- **Description**: Atomic order placement foundation executing stock deduction and tax calculations.
- **Request Body**:
  ```json
  {
      "shipping_address_id": 1,
      "billing_address_id": null,
      "items": [
          {
              "product_id": 1,
              "quantity": 2
          }
      ],
      "payment_method": "UPI",
      "notes": "Please deliver before 5 PM"
  }
  ```
- **Execution & Validation Workflow**:
  1. Validates `shipping_address_id` belongs to `request.user`.
  2. Locks products via `select_for_update()`.
  3. Verifies all products exist, are active (`active=True`), and have available stock (`stock >= quantity`).
  4. Recalculates statutory GST split (intra-state Tamil Nadu 9% CGST + 9% SGST vs inter-state 18% IGST).
  5. Computes delivery charges against active `DeliveryConfiguration`.
  6. Creates `Order` in `PENDING` status and `PaymentStatus.PENDING`.
  7. Deducts product stock and writes immutable `StockTransaction` (type `SALE`).
  8. Records initial `OrderStatusHistory` entry (`PENDING`).
- **Response**: HTTP 201 Created with full `OrderDetailSerializer` payload.

---

## 2. Customer Order History
- **Endpoint**: `GET /api/v1/orders/my-orders/`
- **Auth**: Customer (`IsAuthenticated`).
- **Data Isolation**: Strictly scoped to `request.user`. A customer never sees other customers' orders.

---

## 3. Order Detail
- **Endpoint**: `GET /api/v1/orders/{id}/`
- **Auth**: Customer or Admin.
- **Access Control**:
  - Customers receive `404 Not Found` if the order belongs to another user.
  - Admins can inspect any order.

---

## 4. Admin Order Management
- **Endpoint**: `GET /api/v1/orders/`
- **Auth**: Admin (`IsAdminUser`).
- **Query Params**:
  - `status`: Filter by `OrderStatus` (`PENDING`, `CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, etc.).
  - `payment_status`: Filter by payment status (`Pending`, `Paid`, `Failed`, `Refunded`).
  - `search` / `q`: Keyword search in order number, customer name, or email.

---

## 5. Order State Machine Transition
- **Endpoint**: `PATCH /api/v1/orders/{id}/status/`
- **Auth**: Admin (`IsAdminUser`).
- **Request Body**:
  ```json
  {
      "status": "CONFIRMED",
      "reason": "Payment verified via RTGS / Gateway"
  }
  ```
- **10-State FSM Transition Rules**:
  - `PENDING` -> `CONFIRMED`, `CANCELLED`
  - `CONFIRMED` -> `PACKED`, `CANCELLED`
  - `PACKED` -> `SHIPPED`, `CANCELLED`
  - `SHIPPED` -> `DELIVERED`
  - `DELIVERED` -> `RETURN_REQUESTED`
  - `RETURN_REQUESTED` -> `RETURN_APPROVED`, `RETURN_REJECTED`
  - `RETURN_APPROVED` -> `RETURN_COMPLETED`
  - Terminal States: `CANCELLED`, `RETURN_REJECTED`, `RETURN_COMPLETED` (no outgoing transitions allowed).
- **Behavior**: Invalid transitions are rejected with HTTP 400 Bad Request. Valid transitions append an immutable audit record to `OrderStatusHistory`.

---

## 6. Order Audit Trail
- **Endpoint**: `GET /api/v1/orders/{id}/history/`
- **Auth**: Customer (own order) or Admin (any order).
- **Response**: Chronological transition logs with timestamps, performing actor, and reason notes.
