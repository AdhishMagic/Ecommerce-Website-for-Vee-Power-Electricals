# Vee Electricals — Database Financial & Historical Integrity Rules (Phase 2)

## 1. Absolute Financial Invariants

The database architecture for **Vee Power Electricals** enforces a strict separation between mutable catalog metadata and immutable financial history.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   FINANCIAL INTEGRITY INVARIANTS                       │
├────────────────────────────────────────────────────────────────────────┤
│ Invariant 1: Catalog mutations NEVER alter historical orders/invoices  │
│ Invariant 2: Configuration edits apply STRICTLY forward-in-time        │
│ Invariant 3: Financial totals stored in queryable DECIMAL columns      │
│ Invariant 4: Complete calculation context frozen in snapshot JSON      │
│ Invariant 5: Zero floating point arithmetic (FLOAT/DOUBLE prohibited)  │
│ Invariant 6: Inventory adjustments executed via compensating entries   │
│ Invariant 7: Audit ledgers are insert-only; updates/deletions blocked  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. In-Depth Historical Integrity Specifications

### 2.1 Historical Product Prices & Names
* **The Risk**: If an administrator renames a fan from *"Havells 1200mm Fan"* to *"Havells 1200mm Smart Fan"* or increases its price from `₹2,500.00` to `₹2,800.00`, past customer receipts and invoices must not retroactively change.
* **Database Guarantee**:
  * In `order_items`, `invoice_items`, and `quotation_items`, `product_name`, `sku`, `unit_price`, and `mrp` are **copied directly into the record** at insertion time.
  * Line item calculations use the copied row values: `subtotal = quantity * unit_price`.
  * If the catalog product is deleted or archived, `product_id` is set to `NULL` (`ON DELETE SET NULL`), leaving the frozen historical name and price completely intact.

---

### 2.2 Historical Tax Rates & Statutory GST Splits
* **The Risk**: If the statutory GST Council amends electrical fixtures from 18% to 12%, past invoices issued under the 18% regime must permanently preserve 18% GST (CGST 9% + SGST 9% or IGST 18%).
* **Database Guarantee**:
  * `orders` and `invoices` store structured, immutable columns: `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, and `tax_amount`.
  * `order_items` and `invoice_items` snapshot the exact statutory rate: `tax_percent` and `tax_rate`.
  * Financial reporting queries never rejoin `tax_configurations` to compute past tax; they aggregate the immutable structured columns directly.

---

### 2.3 Historical Delivery Rates & Distance Calculations
* **The Risk**: If the logistics base charge increases from `₹100.00` to `₹120.00` per slab, past checkouts and invoices must not recalculate shipping costs.
* **Database Guarantee**:
  * `orders` and `invoices` store `shipping_fee` and `shipping_discount` as immutable `DECIMAL(12, 2)` columns.
  * The exact distance (km), applied distance slab, origin hub, and free shipping qualification are captured inside `calculation_snapshot` JSON.

---

### 2.4 Immutable Stock Ledger Integrity (`stock_transactions`)
* **The Risk**: Deleting catalog products or allowing manual edits to historical inventory counts destroys warehouse audit trails.
* **Database Guarantee**:
  * Foreign key constraint: `stock_transactions.product_id -> products(id) ON DELETE RESTRICT` (Django `models.PROTECT`).
  * The MySQL engine strictly blocks physical deletion of any product with existing stock movements.
  * Catalog merchandise is deactivated via soft deletion (`products.active = FALSE`).
  * `stock_transactions` has no `updated_at` column. `UPDATE` and `DELETE` queries are prohibited.
  * Discrepancies are resolved strictly via compensating `ADJUSTMENT` transactions signed by warehouse personnel.

---

### 2.5 Dual Financial Storage Architecture: Why Both Columns & JSON Exist

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DUAL FINANCIAL STORAGE ARCHITECTURE                  │
├────────────────────────────────────────────────────────────────────────┤
│ 1. STRUCTURED INDEXED COLUMNS (DECIMAL)                                │
│    - subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount   │
│    - shipping_fee, total_amount                                        │
│    -> PURPOSE: High-performance SQL queries, indexing, date-range     │
│       aggregations (`SUM()`), P&L reporting, and tax audits.           │
├────────────────────────────────────────────────────────────────────────┤
│ 2. IMMUTABLE CALCULATION SNAPSHOT (JSON)                               │
│    - tax mode, active config version ID, distance slab step,           │
│      radial distance km, free delivery decision, coupon code           │
│    -> PURPOSE: Microsecond-precision audit replay; reconstructs the    │
│       exact mathematical formula applied at checkout.                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Normalization vs Intentional Denormalization Review

### 3.1 Third Normal Form (3NF) Compliance
All core entities are normalized to 3NF:
* `users` and `customer_addresses` are strictly separated (1:N).
* `categories`, `subcategories`, `brands`, and `products` eliminate transitive dependencies.
* `orders` and `order_items` separate purchase orders from individual merchandise quantities.
* `clients`, `quotations`, and `invoices` separate commercial estimates from statutory tax claims.

### 3.2 Justified Intentional Denormalization
* **Point-in-Time Historical Snapshots**: Denormalizing product names, prices, and tax rates into `order_items` and `invoice_items` is intentional and mandatory. Strict 3NF (pointing solely to mutable `products.price`) would violate accounting laws by causing past sales to fluctuate whenever catalog prices change.
* **Precomputed Order/Invoice Totals**: Storing `subtotal`, `tax_amount`, and `total_amount` directly on `orders` and `invoices` prevents expensive multi-table JOIN aggregations on high-frequency admin dashboard queries (`/admin/orders`, `/admin/finance/summary`). Invariants between line items and parent totals are guaranteed by atomic database service transactions.

---

## 4. Quotation Conversion & Inventory Separation Integrity

### 4.1 Unidirectional Quotation $\rightarrow$ Invoice Transition
* Quotation conversion is strictly unidirectional.
* Tracked via `quotations.status = 'Converted'`.
* The resulting `Invoice` references the source quotation via `invoices.quotation_id -> quotations(id)`.
* Quotations maintain no foreign key to invoices, ensuring an acyclic relationship.

### 4.2 Zero Inventory Impact for Commercial Quotations
* Creating, editing, approving, or converting a `Quotation` does **NOT** decrement physical inventory or generate any `StockTransaction` row.
* Commercial estimates represent proposals, not physical reservations.
* Physical warehouse stock is decremented strictly upon actual order placement or invoice dispatch.

---

## 5. Canonical 10-Step Checkout & Discount Calculation Sequence

To eliminate ambiguity and prevent accidental double-discounting or tax miscalculations, all calculation engines (frontend preview and backend validation) must execute the following sequential pipeline:

```
┌────────────────────────────────────────────────────────────────────────┐
│             CANONICAL 10-STEP FINANCIAL CALCULATION PIPELINE           │
├────────────────────────────────────────────────────────────────────────┤
│  1. Base Product Price     : Product.mrp and Product.price             │
│  2. Category/Promo Discount: Category/Product markdown applied         │
│  3. Effective Unit Price   : Resulting unit selling price (>= 0.00)    │
│  4. Order-Level Coupon     : Cart coupon evaluated on qualifying base  │
│  5. Discount Stacking Check: Governed by OrderDiscount.allow_stacking  │
│  6. Taxable Amount Base    : Subtotal minus applicable trade discounts │
│  7. Statutory GST (CGST/SGST/IGST): Applied based on Place of Supply   │
│  8. Shipping Logistics Fee : Distance slab / regional state rate       │
│  9. Free Shipping Concession: Checked against free_delivery_threshold   │
│ 10. Final Gross Payable    : Taxable + GST + Net Shipping (Rounded)    │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Pipeline Step Definitions
1. **Base Product Price**: Read `Product.mrp` and `Product.price`.
2. **Category / Product Promotional Markdown**: If category has `discount_enabled = 1`, compute promotional markdown (percentage or fixed).
3. **Effective Unit Price**: `effective_unit_price = max(0.00, price - promo_markdown)`. In `OrderItem`: `mrp`, `unit_price`, `subtotal = quantity * effective_unit_price`.
4. **Order-Level Coupon**: Verify `OrderDiscount.code` active status, date validity, minimum order qualification (`subtotal >= min_order_value`), and user usage limit.
5. **Discount Stacking Policy**:
   * If `allow_stacking = 0`: Coupon does not stack with items that already received category promotional discounts.
   * If `allow_stacking = 1`: Coupon applies across the entire qualifying subtotal, capped at `max_discount_cap`.
   * **BUSINESS DECISION REQUIRED**: *Executive confirmation required on whether promotional category sales can combine with cart-level coupons (current baseline: non-stacking `allow_stacking = 0`).*
6. **Taxable Amount Calculation**:
   * In `TAX_EXCLUSIVE` mode: `taxable_amount = subtotal - order_discount`.
   * In `TAX_INCLUSIVE` mode: `taxable_amount = (subtotal - order_discount) / (1 + (tax_rate / 100))`.
7. **Statutory GST Calculation**:
   * Intra-State (Tamil Nadu): `cgst_amount = ROUND(taxable_amount * 0.09, 2)`, `sgst_amount = ROUND(taxable_amount * 0.09, 2)`, `igst_amount = 0.00`.
   * Inter-State (Outside TN): `cgst_amount = 0.00`, `sgst_amount = 0.00`, `igst_amount = ROUND(taxable_amount * 0.18, 2)`.
8. **Shipping Logistics Fee**: Evaluated via continuous distance slabs `[min_distance_km, max_distance_km)` from Coimbatore hub (or Tier 5 regional fallback).
9. **Free Delivery Concession**: If `free_delivery_enabled = 1` and `subtotal >= free_delivery_threshold`: `shipping_discount = computed_shipping_fee`, charged `shipping_fee = 0.00`.
10. **Final Gross Total**: `total_amount = taxable_amount + tax_amount + shipping_fee`. Rounding applied per `CompanyStoreConfiguration.rounding_mode` (`ROUND_HALF_UP`).
