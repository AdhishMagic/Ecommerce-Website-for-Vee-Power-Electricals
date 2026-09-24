# Vee Power Electricals — REST API Documentation (v1)

## 1. Overview & Architecture

The Vee Power Electricals REST API provides programmatic access to catalog merchandise, customer ordering, warehouse inventory tracking, B2B finance, and commercial store configuration.

### 1.1 Base URL
All API endpoints are strictly versioned:
```
/api/v1/
```

### 1.2 Authentication
Authentication uses JSON Web Tokens (SimpleJWT HS256):
- **Header**: `Authorization: Bearer <access_token>`
- **Token Lifespans**:
  - Access Token: 30 minutes
  - Refresh Token: 7 days (with persistent rotation and blacklisting)
- **Endpoints**:
  - `POST /api/v1/auth/login/`
  - `POST /api/v1/auth/register/`
  - `POST /api/v1/auth/refresh/`
  - `POST /api/v1/auth/logout/`
  - `GET /api/v1/auth/me/`

---

## 2. API Response Standard

### 2.1 Collection Pagination Envelope
All listing endpoints return data enclosed within standard DRF page envelopes:
```json
{
    "count": 42,
    "next": "http://localhost:8000/api/v1/catalog/products/?page=2",
    "previous": null,
    "page": 1,
    "total_pages": 3,
    "results": [
        { ... }
    ]
}
```
Query parameters:
- `page`: Page index (1-based, default: 1)
- `page_size`: Records per page (default: 20, max: 100)

### 2.2 Error Response Envelope
Handled by `apps.common.exceptions.custom_exception_handler`. Raw database exceptions, stack traces, and filesystem paths are masked:
```json
{
    "detail": "Validation failed.",
    "errors": {
        "price": [
            "Selling price cannot exceed Maximum Retail Price (MRP)."
        ]
    }
}
```

---

## 3. Domain Modules

| Domain | Base Path | Access Level | Description |
|---|---|---|---|
| [Catalog](catalog.md) | `/api/v1/catalog/` | Public Read / Admin Write | Categories, Brands, Products, Gallery Images, Specifications |
| [Inventory](inventory.md) | `/api/v1/inventory/` | Admin Only | Stock ledger journal, restock, adjustments |
| [Addresses](addresses.md) | `/api/v1/addresses/` | Authenticated Customer | Customer address management, single-default switching |
| [Orders](orders.md) | `/api/v1/orders/` | Authenticated / Admin | Checkout, customer order history, admin 10-state FSM fulfillment |
| [Finance](finance.md) | `/api/v1/finance/` | Admin Only | B2B clients, quotations, 1:N tax invoices, payment transaction audits |
| [Inquiries](inquiries.md) | `/api/v1/inquiries/` | Public Create / Admin Manage | Contact leads and procurement inquiry tickets |
| [Configuration](config.md) | `/api/v1/config/` | Public Read / Admin Write | Store profile, delivery tariffs, and coupon pre-validation |
