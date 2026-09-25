# Expense API Specification

## Vee Power Electricals E-Commerce Platform

---

### 1. Overview & Architecture

The Expense API provides administrative tracking for internal operational, procurement, and capital expenses. It exposes full CRUD capabilities for authorized administrative personnel while enforcing strict role-based access control (RBAC), data isolation, decimal financial precision, and auditability.

- **Endpoint:** `/api/v1/expenses/`
- **Controller:** `ExpenseViewSet` (`apps.finance.views`)
- **Model:** `Expense` (`apps.finance.models`)
- **Serializer:** `ExpenseSerializer` (`apps.finance.serializers`)
- **Authentication:** SimpleJWT Bearer Token

---

### 2. Authorization & RBAC Rules

| User Role | List | Retrieve | Create | Update | Delete | Status Code on Violation |
|---|---|---|---|---|---|---|
| **Anonymous / Unauthenticated** | ❌ | ❌ | ❌ | ❌ | ❌ | `401 Unauthorized` |
| **Customer (`role='customer'`)** | ❌ | ❌ | ❌ | ❌ | ❌ | `403 Forbidden` |
| **Admin (`role='admin'`)** | ✅ | ✅ | ✅ | ✅ | ✅ | N/A (Allowed) |
| **Staff (`is_staff=True`)** | ✅ | ✅ | ✅ | ✅ | ✅ | N/A (Allowed) |
| **Super Admin (`is_superuser=True`)** | ✅ | ✅ | ✅ | ✅ | ✅ | N/A (Allowed) |

---

### 3. API Contract & Endpoints

#### 3.1 List Expenses
- **Method:** `GET /api/v1/expenses/`
- **Query Parameters:**
  - `category`: Filter by category (`Logistics`, `Marketing`, `Software`, `Inventory`, `Utilities`, `Operations`).
  - `status`: Filter by status (`Paid` or `Pending`).
  - `search` or `q`: Case-insensitive substring match across description, vendor, and category.
  - `start_date`: Inclusive start date (`YYYY-MM-DD`).
  - `end_date`: Inclusive end date (`YYYY-MM-DD`).
  - `page`: Page number (default: 1).
  - `page_size`: Page size limit (default: 20, max: 100).
- **Response `200 OK`:**
```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "page": 1,
  "total_pages": 1,
  "results": [
    {
      "id": 1,
      "expense_date": "2026-09-19",
      "date": "2026-09-19",
      "category": "Utilities",
      "description": "Warehouse Electricity Bill - Coimbatore Hub",
      "vendor": "TNEB Coimbatore",
      "amount": "8450.00",
      "status": "Paid",
      "payment_mode": "Bank Transfer",
      "receipt_url": null,
      "created_by": 14,
      "created_by_email": "admin@veepower.in",
      "created_at": "2026-09-24T06:49:10.651926Z",
      "updated_at": "2026-09-24T06:49:10.652065Z"
    }
  ]
}
```

#### 3.2 Retrieve Single Expense
- **Method:** `GET /api/v1/expenses/{id}/`
- **Response `200 OK`:** Returns individual expense object.
- **Response `404 Not Found`:** Returned if `{id}` does not exist.

#### 3.3 Create Expense
- **Method:** `POST /api/v1/expenses/`
- **Request Body:**
```json
{
  "expense_date": "2026-09-24",
  "category": "Software",
  "description": "AWS Cloud Hosting Monthly Subscription",
  "vendor": "Amazon Web Services",
  "amount": "12499.75",
  "status": "Paid",
  "payment_mode": "Corporate Credit Card",
  "receipt_url": "https://s3.amazonaws.com/receipts/aws-sep26.pdf"
}
```
*Note: Clients may send either `expense_date` or `date`. Both are accepted.*
- **Response `201 Created`:** Returns created expense with `created_by` assigned to the authenticated user.
- **Response `400 Bad Request`:** Returned if required fields are missing, `amount <= 0`, or invalid category/status is provided.

#### 3.4 Partial Update (PATCH)
- **Method:** `PATCH /api/v1/expenses/{id}/`
- **Request Body:** Any subset of mutable fields (e.g. `{"status": "Paid", "payment_mode": "NEFT"}`).
- **Response `200 OK`:** Returns updated expense object.

#### 3.5 Full Update (PUT)
- **Method:** `PUT /api/v1/expenses/{id}/`
- **Request Body:** Complete representation of expense fields.
- **Response `200 OK`:** Returns updated expense object.

#### 3.6 Delete Expense
- **Method:** `DELETE /api/v1/expenses/{id}/`
- **Response `204 No Content`:** Permanently deletes expense record from the ledger.

---

### 4. Financial Precision & Integrity
- **Decimal Precision:** Financial amounts use `DecimalField(max_digits=12, decimal_places=2)`. Floating-point conversion is strictly prohibited.
- **Audit Attribution:** When an expense is created, `created_by` is automatically set to `request.user` on the server.
- **Model Check Constraints:**
  - `chk_exp_amount`: `amount > 0`
  - `chk_exp_status`: `status in ['Paid', 'Pending']`
  - `chk_exp_cat`: `category in ['Logistics', 'Marketing', 'Software', 'Inventory', 'Utilities', 'Operations']`

---

### 5. Frontend Integration
The frontend admin page at `/admin/finance/expenses` (`frontend/src/pages/admin/Expenses.tsx`) integrates directly with `financeApi` in `frontend/src/api/finance.ts`, rendering live database records, dynamic KPI metrics, and category filtering.
