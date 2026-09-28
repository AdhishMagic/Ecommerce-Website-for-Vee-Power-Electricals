# B2B Corporate Client and Credit Engine Documentation

## Overview
This document specifies the authoritative architecture, data models, validation rules, credit calculation engine, concurrency controls, RBAC permissions, and API endpoints for the B2B Corporate Client and Credit domain in the Vee Power Electricals e-commerce platform.

---

## 1. B2B Client Domain & Model

The B2B Client model (`apps.finance.models.Client`) is separated from retail `Customer` user accounts. Retail accounts represent individual B2C consumers, whereas B2B `Client` entities represent verified corporate organizations, contractors, and institutional buyers eligible for credit-based procurement.

### Key Fields & Attributes
- **`company_name`**: Legal registered name of the business entity.
- **`client_code`**: Unique business identifier (e.g., `CLI-LT-001`, `CLI-CORP-XXXXXX`).
- **`contact_person`**: Name of primary corporate representative or procurement officer.
- **`email`**: Corporate email address for billing and quotation correspondence.
- **`phone`**: Contact telephone/mobile number.
- **`billing_address` / `shipping_address`**: Physical facility and tax jurisdiction addresses.
- **`gstin`**: 15-character statutory Goods and Services Tax Identification Number.
- **`pan`**: 10-character Permanent Account Number (derived from characters 3–12 of GSTIN or registered PAN).
- **`state`**: State of jurisdiction (validated against GST state code).
- **`customer_type`**: Corporate categorization (`CORPORATE`, `GOVERNMENT`, `SME`, etc.).
- **`credit_limit`**: Maximum allowable credit exposure (strictly non-negative `Decimal(12, 2)`).
- **`is_active`**: Boolean flag controlling account status. Inactive/frozen accounts are blocked from credit utilization and quotation conversions.
- **`created_at` / `updated_at`**: Audit timestamps.

---

## 2. Statutory GSTIN & Business Validation

All client creation and modification passes through model-level `clean()` validation and DRF serializer validation:

### Statutory Validation Rules
1. **GSTIN Regex & Format**:
   - Must match canonical Indian GSTIN pattern: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`.
   - Length must be exactly 15 alphanumeric characters.
2. **State Code Consistency**:
   - The first 2 digits of the GSTIN represent the official state code (e.g., `33` for Tamil Nadu, `29` for Karnataka, `27` for Maharashtra).
   - If the client's state is provided, the GSTIN prefix must match the statutory state code mapping.
3. **PAN Extraction**:
   - Characters 3 through 12 of a valid GSTIN represent the entity's 10-character PAN. If not explicitly provided, PAN is automatically derived from the GSTIN.
4. **Duplicate Protection**:
   - `client_code` is strictly unique (`unique=True`).
   - `gstin` is strictly unique across all active clients to prevent duplicate credit accounts.
5. **Credit Limit Safety**:
   - `credit_limit` cannot be negative (`MinValueValidator(Decimal('0.00'))`).
6. **Inactive Client Restrictions**:
   - Inactive clients cannot be approved for quotations or converted to invoices under credit terms.

---

## 3. Server-Authoritative Credit Calculation Engine

Credit calculations are **strictly server-authoritative** and performed inside `CreditService` (`apps.finance.services.credit_service.CreditService`). The frontend is never trusted for financial exposures or available credit balances.

### Core Mathematical Formulae
$$\text{available\_credit} = \max(0, \text{credit\_limit} - \text{credit\_exposure})$$

$$\text{credit\_exposure} = \sum_{\text{invoice} \in \text{Unpaid/Overdue}} \max(0, \text{invoice.total\_amount} - \sum \text{successful\_payments})$$

$$\text{outstanding\_balance} = \text{credit\_exposure}$$

### Financial Sources Contributing to Exposure
| Source Record | Contributes to Exposure? | Rationale |
| :--- | :--- | :--- |
| **Unpaid Tax Invoice (`UNPAID`)** | **YES** | Legally binding corporate liability awaiting settlement. |
| **Partially Paid Invoice** | **YES (Remaining Balance)** | `total_amount - sum(successful_payments)`. |
| **Overdue Invoice (`OVERDUE`)** | **YES** | Delinquent corporate liability. |
| **Paid Invoice (`PAID`)** | **NO** | Fully settled liability; zero remaining balance. |
| **Cancelled Invoice (`CANCELLED`)** | **NO** | Voided document; zero liability. |
| **Failed/Pending Payment** | **NO Reduction** | Only `PaymentTransaction.status == 'SUCCESS'` reduces unpaid exposure. |
| **Approved Quotation (Pre-Conversion)** | **Evaluated on Conversion** | Verified prior to invoice creation. |

---

## 4. Concurrency & Row-Level Locking

To eliminate race conditions and double-spending of credit:
1. **Row-Level Locking (`select_for_update`)**:
   - When verifying and consuming credit (e.g. during quotation approval or invoice conversion), `CreditService.verify_credit_availability(client, amount)` issues `Client.objects.select_for_update().get(pk=client.pk)` inside an atomic transaction (`@transaction.atomic`).
   - This serializes concurrent credit-consuming transactions against the specific client row without locking other clients or un-related database tables.
2. **Deterministic Rejection**:
   - If two simultaneous transactions attempt to consume credit (e.g., limit ₹100,000; tx1 requires ₹70,000, tx2 requires ₹50,000), tx1 locks the row, completes, and increases exposure to ₹70,000 (available: ₹30,000).
   - When tx2 acquires the lock, it calculates available credit as ₹30,000 against its required ₹50,000, and is deterministically rejected with an `InsufficientCreditError`.

---

## 5. Audit Logging & Credit Limit Modifications

All credit limit modifications must be performed by authorized administrators and are audited:
- Modifications are logged to `apps.core.models.AdminConfigAuditLog`.
- Captured metadata:
  - `admin_user`: The authenticated staff/admin executing the change.
  - `action`: `CREDIT_LIMIT_UPDATE`.
  - `entity_type`: `Client`.
  - `entity_id`: `client.id`.
  - `old_value`: Serialized prior limit.
  - `new_value`: Serialized new limit.
  - `reason`: Mandatory change rationale.
  - `timestamp`: UTC timestamp of update.
- Unauthorized users (retail customers, unauthenticated users, or staff lacking permissions) receive `403 Forbidden`.

---

## 6. B2B Quotation → Invoice Integration Workflow

1. **Quotation Creation**: Staff creates quotation for `Client`. Items, quantities, and GST rates are specified. Subtotal and tax are calculated server-side.
2. **Quotation Approval**: Staff moves quotation status to `APPROVED`.
3. **Credit Verification**: At conversion time, `CreditService` locks the client row, computes real-time `available_credit`, and asserts `available_credit >= quotation.total_amount`.
4. **Invoice Generation**: An immutable `Invoice` is generated with snapshot line items. Status set to `UNPAID`.
5. **Quotation FSM Transition**: Quotation status moves to `CONVERTED`. Duplicate conversions are strictly blocked (`QuotationAlreadyConvertedError`).

---

## 7. Performance & N+1 Query Elimination

In `ClientViewSet.get_queryset()`:
- `invoices` are prefetched with pre-filtered subqueries:
  - Filtered to `status__in=['UNPAID', 'OVERDUE']`.
  - Nested prefetch of `payments` filtered to `status='SUCCESS'`.
- `total_invoiced` is annotated at the database level:
  `annotated_total_invoiced = Coalesce(Sum('invoices__total_amount', filter=Q(invoices__status__in=['PAID', 'PARTIALLY_PAID', 'UNPAID', 'OVERDUE'])), Decimal('0.00'))`.
- This ensures listing `N` clients executes in **5 total queries** (including DRF count pagination), completely eliminating N+1 regressions.

---

## 8. REST API Endpoints (`/api/v1/finance/clients/`)

| Method | Endpoint | Description | Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/finance/clients/` | List corporate clients (with search, status filter, pagination) | Admin / Staff |
| `POST` | `/api/v1/finance/clients/` | Create corporate client | Admin / Staff |
| `GET` | `/api/v1/finance/clients/{id}/` | Retrieve client details with financial metrics | Admin / Staff |
| `PUT/PATCH` | `/api/v1/finance/clients/{id}/` | Update client profile details | Admin / Staff |
| `GET` | `/api/v1/finance/clients/{id}/credit/` | Get server-authoritative credit metrics | Admin / Staff |
| `POST` | `/api/v1/finance/clients/{id}/adjust-credit-limit/` | Adjust credit limit with audit logging | Admin / Staff |
| `POST` | `/api/v1/finance/clients/{id}/deactivate/` | Deactivate/freeze corporate client account | Admin / Staff |
| `POST` | `/api/v1/finance/clients/{id}/activate/` | Re-activate corporate client account | Admin / Staff |
| `GET` | `/api/v1/finance/clients/{id}/quotations/` | List quotations belonging to client | Admin / Staff |
| `GET` | `/api/v1/finance/clients/{id}/invoices/` | List invoices belonging to client | Admin / Staff |
| `GET` | `/api/v1/finance/clients/{id}/payments/` | List payment history for client | Admin / Staff |
| `GET` | `/api/v1/finance/clients/{id}/audit-history/` | View credit adjustment audit history | Admin / Staff |

---

## 9. Frontend B2B Client Interface

The B2B Client management interface is situated at `/admin/clients`:
- **Client List**: Table with search by name/code/GSTIN, filter tabs (`All`, `Active`, `Inactive`), credit limit, exposure, and available credit badges.
- **Client Modal**: Create and edit corporate clients with GSTIN format validation, address fields, and credit limit configuration with change justification.
- **Client View Modal**:
  - Financial KPI Cards: Credit Limit, Outstanding Exposure, Available Credit, and Total Invoiced.
  - Tabbed Views: Corporate Overview, Quotation Ledger, Invoice Ledger, and Credit Audit Trail.
  - Quick Account Freeze/Unfreeze toggle with immediate feedback.

---

## 10. Status & Scope Distinction

### Implemented
- [x] Canonical `Client` model with full statutory GSTIN validation and PAN derivation.
- [x] Server-authoritative `CreditService` with `available_credit = max(0, credit_limit - credit_exposure)`.
- [x] Concurrency-safe atomic credit verification using row-level `select_for_update()`.
- [x] Comprehensive audit isolation fix for `CLI-LT-001` preserving all production credit fixtures and rules.
- [x] Credit limit modification audit logging with previous/new limit tracking and reasons.
- [x] Inactive client transaction prevention.
- [x] Full N+1 query elimination on client list endpoints.
- [x] Comprehensive 25-case backend test suite in `backend/tests/test_step9_b2b_credit.py`.
- [x] Full UI dashboard integration with ledger tabs and audit history.

### Deferred
- Real-time GST API integration (deterministic local statutory validation is currently implemented; external third-party GST portal API hook is deferred to external provider onboarding).
- Automated credit score rating feeds (deferred to third-party credit bureau integration).

### Known Limitations
- Concurrency row-locking relies on database transactional semantics (`InnoDB` on MySQL). SQLite in-memory test runners may experience table locks rather than fine-grained row locks.
