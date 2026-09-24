# Contact Inquiry APIs

Base URL: `/api/v1/inquiries/`

Handles public customer contact requests, quotation solicitations, and administrative ticket tracking.

## 1. Public Inquiry Submission
- **Endpoint**: `POST /api/v1/inquiries/`
- **Auth**: Public (`AllowAny`).
- **Request Body**:
  ```json
  {
      "name": "Praveen Chandran",
      "email": "praveen@example.com",
      "phone": "+919876543222",
      "subject": "Bulk Order for 500m Armoured Cable",
      "message": "Please provide discount estimate for commercial construction project."
  }
  ```
- **Validation**:
  - `name`, `phone`, `subject`, `message` are strictly required and sanitized.
  - Automatically initializes `status = 'New'`.
- **Response**: HTTP 201 Created with submitted inquiry summary.

---

## 2. Admin Inquiry Management
- **Endpoints**:
  - `GET /api/v1/inquiries/` (also available via `/api/v1/inquiries/admin/`)
  - `GET /api/v1/inquiries/{id}/`
  - `PATCH /api/v1/inquiries/{id}/`
  - `DELETE /api/v1/inquiries/{id}/`
- **Auth**: Admin (`IsAdminUser`). Customers receive HTTP 403 Forbidden.
- **Query Params**:
  - `status`: Filter by `New`, `In Progress`, `Resolved`, `Closed`.
  - `search` / `q`: Keyword search in name, email, phone, or subject.
- **Admin Status Update Body**:
  ```json
  {
      "status": "Resolved",
      "admin_notes": "Spoke to customer; sent bulk price sheet."
  }
  ```
