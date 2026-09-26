# Vee Power Electricals — Quotation → Invoice Domain Specification

## 1. Domain Overview
The Quotation → Invoice domain models the commercial estimating and statutory billing lifecycle for B2B clients, building contractors, and corporate purchasers. It strictly enforces legal compliance, financial auditability, acyclic relational integrity, and authoritative backend accounting.

---

## 2. Canonical Database Relationship
The relationship between Quotations and Invoices is strictly **unidirectional and acyclic**:

```
Quotation (Parent / Origin)
   │
   ▼
Invoice (Statutory Tax Document)
```

- **Foreign Key**: `Invoice.quotation` (`ForeignKey(Quotation, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices')`).
- **No Reverse FK**: `Quotation` does **NOT** store an `invoice_id` foreign key.
- **Relational Integrity**: Deletion or deactivation of catalog items, clients, or quotations does not destroy historical financial records (`on_delete=SET_NULL` or `PROTECT`).

---

## 3. Quotation Finite State Machine (FSM)

### Canonical States
1. **DRAFT**: Newly drafted quotation; line items and terms may be updated.
2. **SENT**: Formal estimate dispatched to client for review.
3. **APPROVED**: Client accepted terms; quotation values and items are frozen.
4. **REJECTED**: Client rejected terms with documented reason; terminal non-billable state.
5. **CONVERTED**: Quotation successfully converted into a statutory GST Tax Invoice; terminal state.

### Allowed Status Transitions
```
   ┌─────────┐
   │  DRAFT  │
   └────┬────┘
        │ (transition_status)
        ▼
   ┌─────────┐
   │  SENT   │
   └──┬───┬──┘
      │   └──────────────┐
      │ (APPROVED)       │ (REJECTED)
      ▼                  ▼
┌───────────┐      ┌───────────┐
│ APPROVED  │      │ REJECTED  │
└─────┬─────┘      └───────────┘
      │ (convert_quotation_to_invoice)
      ▼
┌───────────┐
│ CONVERTED │
└───────────┘
```

- **Forbidden Transitions**:
  - `DRAFT -> CONVERTED` (Must go through approval).
  - `REJECTED -> APPROVED` (Rejected estimates are terminal).
  - `CONVERTED -> DRAFT` / `CONVERTED -> APPROVED` (Converted estimates cannot be un-converted).
  - Direct `PATCH /status/` to `CONVERTED` is forbidden; conversion requires `POST /finance/quotations/{id}/convert/`.

---

## 4. Quotation Item & Pricing Snapshot Immutability
All commercial figures on Quotations and Invoices are **backend-authoritative**:
- **Line Items**: `QuotationItem` captures `item_name`, `quantity`, `unit_price`, and `subtotal`.
- **Decoupled Snapshots**: Modifying the catalog `Product` (changing price, renaming, changing SKU, or deactivating product) leaves existing quotation line items and totals completely unchanged.
- **Decimal Precision**: All monetary fields use `Decimal(14, 2)` or `Decimal(12, 2)` to eliminate floating-point arithmetic errors.

---

## 5. Quotation → Invoice Conversion Process

The conversion process (`QuotationService.convert_quotation_to_invoice`) is wrapped in an atomic database transaction (`@transaction.atomic`) with pessimistic row-level locking (`select_for_update`):

1. **Lock & Verify**: Acquire row lock on `Quotation`. Verify `status == QuotationStatus.APPROVED`.
2. **Duplicate Conversion Guard**: If `status == QuotationStatus.CONVERTED` or an existing invoice already links to this quotation, safely return existing invoice or reject duplicate conversion with `ValidationError`.
3. **Line Items Validation**: Validate that quotation contains at least one line item.
4. **B2B Credit Limit Check**: Verify client outstanding exposure + quotation total <= credit limit.
5. **Invoice Generation (`InvoiceService.create_invoice_for_quotation`)**:
   - Generates sequential statutory invoice number: `INV-{YYYY}-{SEQ:04d}`.
   - Calculates GST breakdown:
     - Intra-state (Tamil Nadu, GSTIN prefix `33`): 50% CGST + 50% SGST.
     - Inter-state (all other states, e.g. Karnataka `29`): 100% IGST.
   - Creates `Invoice` with `InvoiceStatus.UNPAID` and `payment_status='Pending'`.
   - Creates `InvoiceItem` records copying rate, SKU, taxable amount, tax rates, and totals.
   - Stores complete calculation snapshot in `calculation_snapshot` JSON field.
6. **Quotation Transition**: Sets quotation status to `CONVERTED`.
7. **Statutory Communication**: Dispatches `INVOICE_GENERATED` notification via `CommunicationService`.

---

## 6. Duplicate Conversion Protection & Concurrency Safety
- **Row-Level Locking**: `Quotation.objects.select_for_update().get(pk=quotation_id)` guarantees serial execution when concurrent requests attempt to convert the same quotation.
- **Database Idempotency Guard**: `Invoice.objects.filter(quotation=quotation).first()` detects pre-existing invoices before generating new invoice records.
- **Multi-thread Safety**: Verified via `TransactionTestCase` concurrent worker threads.

---

## 7. GST / Tax Calculation Engine
Tax calculation is powered by the centralized `TaxService` and statutory GST rules:
- **Tax Mode**: Exclusive / Inclusive handling.
- **State Determination**: Derived from Client GSTIN prefix (State code `33` = Tamil Nadu, intra-state).
- **Tax Split**:
  - Intra-State: 9% CGST + 9% SGST (for standard 18% slab).
  - Inter-State: 18% IGST.
- **Snapshot Storage**: Both structured Decimal columns (`cgst_amount`, `sgst_amount`, `igst_amount`, `tax_amount`) and JSON snapshot (`calculation_snapshot`) are stored to preserve point-in-time statutory compliance.

---

## 8. Role-Based Access Control (RBAC) & Security
- **Admin / Staff Only**: Quotation and Invoice management requires `IsAdminUser` permission.
- **Customer Isolation**: Retail customers receive HTTP 403 Forbidden when accessing `/api/v1/finance/quotations/` or `/api/v1/finance/invoices/`.
- **Anonymous Protection**: Unauthenticated requests receive HTTP 401 Unauthorized.
- **Immutability of Invoices**: Statutory invoices in `PAID` status cannot be deleted (`destroy` returns HTTP 400).
- **Approved / Converted Quotations Protection**: Quotations in `APPROVED` or `CONVERTED` status cannot be modified or deleted.

---

## 9. Performance & Query Optimization
- ViewSets utilize `.select_related('client', 'created_by')` and `.prefetch_related('items__product')`.
- Fully prevents N+1 queries when rendering quotation and invoice item listings.
- Query count regression tested at 4 queries constant for paginated quotation listing with related clients, creators, items, and products.

---

## 10. Frontend Administration Interface
- **Quotations Page** (`frontend/src/pages/admin/Quotations.tsx`):
  - KPI cards (Total Quotes Issued, Pending Approval, Converted to Orders, Total Estimated Value).
  - Filter by status tab (`All`, `Draft`, `Sent`, `Approved`, `Rejected`, `Converted`).
  - Action buttons: Send (`Send`), Approve (`CheckCircle2`), Reject (`XCircle`), Convert (`ArrowRightCircle`), Edit (`Edit`), Print/Download (`Download`).
  - Dynamic client loading and real API submission (mock persistence removed).
- **Invoices Page** (`frontend/src/pages/admin/Invoices.tsx`):
  - KPI cards (Total Invoiced, Paid Invoices, Overdue Invoices, Settlements).
  - Tab filters (`All`, `Paid`, `Unpaid`, `Overdue`, `Cancelled`).
  - Mark as Paid action, Send Reminder, Print/Download statutory tax invoice PDF.
  - Dynamic client loading for manual invoice generation modal.

---

## 11. Known Limitations & Edge Cases
1. **Pre-existing B2B Audit Fixture Limit**: In `frontend/tests/comprehensive_audit.mjs` Section 6, the pre-seeded fixture for `L&T Construction (CLI-LT-001)` has an existing outstanding exposure of ₹477,900 against a ₹500,000 credit limit. Attempting to convert Quotation 1 (₹45,000) exceeds the remaining credit limit shortfall (₹22,900). Per specification, the business rule is strictly preserved and this is documented as an existing audit fixture condition.
2. **Order Partial Invoicing**: An Order can have multiple Invoices (1:N relationship via `Invoice.order_id`), supporting split dispatches.
