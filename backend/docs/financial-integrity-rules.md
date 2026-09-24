# Vee Electricals — Financial & Stock Ledger Integrity Rules (Phase 1.5)

## 1. Core Financial Principles

Financial credibility, statutory compliance with Indian GST regulations, and internal audit controls demand strict architectural guarantees across **Vee Power Electricals**.

### 1.1 Invariant Architectural Tenets
1. **The Immutability of Financial History**: Once an order is confirmed or a tax invoice is issued, its monetary values, line item rates, tax components, and totals are **frozen permanently**.
2. **Forward-Only Configuration Application**: Any administrative change to tax rates, shipping slabs, discount rules, or business details applies strictly to future transactions. The backend must **never** recalculate historical orders or invoices using updated configuration.
3. **No Destructive Database Updates on Financial Ledgers**: Stock adjustments, payment reconciliations, and order cancellations are executed through **compensating accounting transactions**, never by editing or deleting historical ledger rows.
4. **Zero IEEE 754 Floating-Point Tolerated**: Every financial column is typed as `DECIMAL` with fixed precision. `FLOAT` and `DOUBLE` are strictly prohibited.

---

## 2. Stock Ledger Integrity & Conflict Resolution

### 2.1 The Phase 1 Stock Ledger Conflict
In the Phase 1 documentation:
* `backend/docs/backend-requirements.md` defines `StockTransaction` as an **immutable audit ledger**.
* However, `backend/docs/entity-relationships.md` (Line 28) specifies:
  ```
  | products | stock_transactions | product_id | 1 to Many | CASCADE | Mandatory |
  ```
* **The Fatal Flaw**: If a product is hard-deleted from the store catalog, MySQL `CASCADE` will silently destroy every historical stock transaction, sale record, and warehouse audit entry associated with that merchandise!

### 2.2 Phase 1.5 Target Resolution Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   STOCK LEDGER INTEGRITY ARCHITECTURE                  │
├────────────────────────────────────────────────────────────────────────┤
│ 1. CHANGE FOREIGN KEY FROM CASCADE TO RESTRICT                         │
│    `stock_transactions.product_id` -> `products.id` ON DELETE RESTRICT  │
│    (Database forbids physical deletion of any product with history)    │
├────────────────────────────────────────────────────────────────────────┤
│ 2. MANDATORY CATALOG SOFT DELETION                                     │
│    Products are deactivated via `active = FALSE` or `is_deleted = TRUE` │
│    Deactivated products remain in DB forever to preserve ledger links  │
├────────────────────────────────────────────────────────────────────────┤
│ 3. IMMUTABILITY OF STOCK TRANSACTION ENTRIES                           │
│    `stock_transactions` table has NO `updated_at` column               │
│    Rows are INSERT-ONLY; UPDATE and DELETE queries are blocked         │
├────────────────────────────────────────────────────────────────────────┤
│ 4. COMPENSATING ENTRIES ONLY                                           │
│    Warehouse inventory errors are corrected by appending an            │
│    `ADJUSTMENT` transaction with positive/negative quantity and notes │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Historical Billing Snapshot Specification

### 3.1 Why Dynamic Recalculation is a Dangerous Anti-Pattern
Consider what occurs if an application calculates invoice totals dynamically using:
```python
# DANGEROUS ANTI-PATTERN:
def calculate_invoice_total(invoice):
    tax_rate = TaxConfig.get_current_rate()  # Fetches current live rate!
    return invoice.subtotal * (1 + tax_rate / 100)
```
If `TaxConfig` is updated from 18% to 12% three months later, every past invoice generated during the 18% era will suddenly display illegal 12% totals during an audit, destroying tax reconciliation.

### 3.2 Canonical Snapshot Strategy
Every `Order` and `Invoice` captures an exact **point-in-time calculation snapshot**:
1. **Denormalized Structural Columns**: Core financial figures (`subtotal`, `discount_amount`, `taxable_amount`, `tax_amount`, `shipping_fee`, `total_amount`) are stored in explicit, indexed `DECIMAL(12, 2)` columns.
2. **Immutable JSON Calculation Payload**: The complete calculation context (applied tax rate, CGST share, SGST share, IGST share, distance slab applied, free shipping qualification, and active configuration version ID) is stored in an immutable `calculation_snapshot` JSON column.
3. **OrderItem / InvoiceItem Snapshots**: Each child line item copies the product name, SKU, unit MRP, unit selling price, applied discount, and tax rate directly into its row upon creation.

---

## 4. Order and Invoice Relationship Reconciliation

### 4.1 The Phase 1 Multiplicity Ambiguity
* `entity-relationships.md` describes `orders` to `invoices` as `1 to 1 / Many`.
* `data-model.md` describes `orders` as having `one or more linked Invoice records`.

### 4.2 Reconciled Operational Model
1. **B2C Retail Orders**: Standard retail e-commerce follows a strict **1:1 relationship**. When a customer order is confirmed, exactly one legal tax invoice is generated.
2. **B2B Contractor Contracts & Partial Fulfillments**: Corporate client orders may involve staged dispatches or milestone billings. The database relationship is therefore architected as **1 Order to Many Invoices (1:N)**, with a unique constraint on `order_id` in the retail pipeline.
3. **Credit Notes & Adjustments (Future Extension)**: When goods are returned or price adjustments are granted, the system does not delete or overwrite the original invoice; it issues a linked **Credit Note** (`credit_notes` table referencing `invoice_id`).

---

## 5. Invoice Integrity & Sequential Numbering Rules

### 5.1 Sequential Financial Year Numbering
* Indian Goods and Services Tax Rules require that tax invoices be consecutive, unique, and sequential within each financial year (April 1st to March 31st).
* **Format**: `INV-YYYY-XXXX` (e.g., `INV-2026-0001`, `INV-2026-0002`).
* **Concurrency Protection**: To prevent numbering gaps or race conditions during concurrent checkouts, invoice numbers must be generated using database row locks or atomic sequence generators, never simple `count() + 1` queries.

### 5.2 Invoice Lifecycle & Status Invariants
* `Unpaid` $\rightarrow$ `Paid` (When payment is confirmed).
* `Unpaid` $\rightarrow$ `Overdue` (Automatically triggered when `CURRENT_DATE > due_date`).
* `Paid` $\rightarrow$ Immutable terminal state (Cannot be reverted to `Unpaid`).
* `Cancelled` $\rightarrow$ Only allowed if cancelled prior to dispatch; once paid and filed for GST, a Credit Note must be issued rather than cancelling the invoice.

---

## 6. Monetary Precision & Rounding Standards

| Financial Entity | Column Type | Rounding Strategy | Rationale |
|---|---|---|---|
| Product MRP / Price | `DECIMAL(10, 2)` | Exact 2 decimal places | Catalog presentation |
| Product Tax Rate % | `DECIMAL(5, 2)` | Exact 2 decimal places | Statutory rate (e.g., `18.00`, `9.00`) |
| Calculation Intermediates | `DECIMAL(12, 4)` | Internal 4 decimal places | Mitigates cascading rounding drift |
| Tax Amounts (CGST/SGST/IGST)| `DECIMAL(12, 2)` | `ROUND_HALF_UP` to paise | Statutory tax component split |
| Delivery Charges | `DECIMAL(10, 2)` | `ROUND_HALF_UP` | Slab computation |
| Final Order / Invoice Total | `DECIMAL(12, 2)` | `ROUND_HALF_UP` | Commercial payable figure |

---

## 7. Administrative Financial Configuration Audit Trail

Any modification to financial, tax, or pricing configuration records must be permanently captured in `AdminConfigAuditLog`:
* The administrator's user ID and IP address are captured.
* The pre-change state (`old_value`) and post-change state (`new_value`) are recorded as serialized JSON.
* A mandatory business justification comment is required from the administrator before saving.
* Direct SQL updates or manual script updates in production are strictly forbidden.
