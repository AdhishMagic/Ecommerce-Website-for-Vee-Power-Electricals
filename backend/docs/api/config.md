# Commercial Configuration APIs

Base URL: `/api/v1/config/`

Exposes read-only commercial settings to customers while requiring `IsAdminUser` for administrative writes.

## 1. Company Store Profile
- **Endpoint**: `GET /api/v1/config/store/` (Public)
  - Returns legal company name, GSTIN, store address, phone, email, and currency symbol.
- **Endpoint**: `PUT / PATCH /api/v1/config/store/` (Admin only)
  - Updates store metadata.

---

## 2. Delivery Configuration & Tariff Slabs
- **Endpoint**: `GET /api/v1/config/delivery/`
  - Public users see active delivery configurations and nested distance slabs.
- **Endpoint**: `GET /api/v1/config/slabs/`
  - Returns active continuous half-open distance tariff slabs `[min_distance_km, max_distance_km)`.
- **Validation**: Enforces check constraint `max_distance_km > min_distance_km`.

---

## 3. Shipping Rules
- **Endpoint**: `GET /api/v1/config/shipping-rules/`
  - Public users see active regional state fallback flat shipping rates.

---

## 4. Tax Configuration
- **Endpoint**: `/api/v1/config/tax/`
- **Auth**: Admin (`IsAdminUser`).
- **Fields**: `tax_name`, `default_tax_rate`, `cgst_rate`, `sgst_rate`, `igst_rate`, `version_number`, `is_active`.

---

## 5. Coupon Pre-Validation Service
- **Endpoint**: `POST /api/v1/config/coupons/validate/`
- **Auth**: Public (`AllowAny`).
- **Description**: Purely informational pre-validation service for shopping carts. Does not modify or lock database records.
- **Request Body**:
  ```json
  {
      "code": "WELCOME10",
      "order_amount": "1000.00"
  }
  ```
- **Validation Checks**:
  1. Checks if coupon exists (case-insensitive).
  2. Verifies coupon is currently active (`is_active = True`).
  3. Checks `valid_from` and `valid_until` date ranges against current timestamp.
  4. Checks `order_amount >= min_order_value`.
  5. Computes discount calculation:
     - Percentage discounts capped at `max_discount_cap` if defined.
     - Flat discounts capped at `order_amount`.
- **Success Response (HTTP 200)**:
  ```json
  {
      "valid": true,
      "code": "WELCOME10",
      "discount_type": "PERCENTAGE",
      "discount_value": "10.00",
      "calculated_discount": "100.00",
      "description": "Welcome discount"
  }
  ```
- **Rejection Response (HTTP 400)**:
  ```json
  {
      "valid": false,
      "detail": "Minimum order amount of ₹500.00 required to use coupon 'WELCOME10'."
  }
  ```
