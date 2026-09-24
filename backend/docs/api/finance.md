# B2B Finance & Invoicing APIs

Base URL: `/api/v1/finance/`

All endpoints in the finance domain are restricted to administrative and staff accounts (`IsAdminUser`). Customers are strictly forbidden from accessing financial entities.

## 1. B2B Corporate Clients
- **Base Endpoint**: `/api/v1/finance/clients/`
- **Supported Methods**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- **Fields**:
  - `client_code`, `company_name`, `contact_person`, `gstin`, `email`, `phone`, `credit_limit`, `address`, `is_active`.
- **Validation**:
  - `gstin`: Validates 15-character statutory Indian format (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`).
  - `credit_limit >= 0`.

---

## 2. Commercial Quotations
- **Base Endpoint**: `/api/v1/finance/quotations/`
- **Supported Methods**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- **Fields**:
  - `quotation_number`, `client`, `client_name`, `quotation_date`, `expiry_date`, `total_value`, `status`, `notes`, `created_by`, `created_by_email`, `items`.
- **Status Choices**: `Draft`, `Sent`, `Approved`, `Rejected`, `Converted`.
- **Status Transition Action**:
  - `PATCH /api/v1/finance/quotations/{id}/status/`
  - Body: `{"status": "Sent"}`

---

## 3. GST Tax Invoices
- **Base Endpoint**: `/api/v1/finance/invoices/`
- **Supported Methods**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- **Architecture Integrity**:
  - Adheres strictly to the **1:N relationship** between `orders` and `invoices` (one order can produce multiple partial dispatches/invoices).
  - Unidirectional reference to `quotations` (acyclic).
- **Fields**:
  - `invoice_number`, `invoice_date`, `due_date`, `order`, `quotation`, `client`, `subtotal`, `discount_amount`, `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `tax_amount`, `shipping_fee`, `total_amount`, `status`, `payment_status`, `notes`, `calculation_snapshot`, `items`.
- **Status Choices**: `Paid`, `Unpaid`, `Overdue`, `Cancelled`.
- **Status Transition Action**:
  - `PATCH /api/v1/finance/invoices/{id}/status/`

---

## 4. Payment Transactions & Settlements
- **Payment Transactions Endpoint**: `GET /api/v1/finance/payments/`
  - Read-only audit visibility over customer transaction attempts.
  - Fields: `order`, `invoice`, `gateway`, `gateway_transaction_id`, `gateway_order_id`, `gateway_signature`, `payment_method`, `amount`, `currency`, `status`, `error_code`, `error_message`, `metadata`.
- **Payout Settlements Endpoint**: `GET /api/v1/finance/settlements/`
  - Read-only audit log of merchant bank payouts received from payment aggregators.
  - Fields: `settlement_id`, `gateway`, `settlement_date`, `gross_amount`, `gateway_fee`, `tax_on_fee`, `net_amount`, `status`, `utr`, `notes`.
