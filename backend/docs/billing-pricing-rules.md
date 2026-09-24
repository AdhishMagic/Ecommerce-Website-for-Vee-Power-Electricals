# Vee Electricals — Canonical Billing, Tax, Discount & Delivery Pricing Rules (Phase 1.5)

## 1. Executive Summary & Monetary Principles

This document formalizes the canonical mathematical, statutory, and logistical rules governing order checkout, price computation, tax assessment, discount allocation, delivery tariffs, and accounting snapshots for **Vee Power Electricals**.

### 1.1 Fundamental Monetary Rules
1. **Strict Decimal Precision**: All monetary values, rates, discounts, taxes, and totals must be stored and calculated using fixed-point decimals (`DECIMAL(12, 2)` for currency fields, `DECIMAL(5, 2)` for percentages, and `DECIMAL(12, 4)` for internal calculation pipeline steps).
2. **Prohibition of Floating-Point Types**: Under no circumstances may `FLOAT` or `DOUBLE` (IEEE 754 floating-point) data types be used in database schemas, Python code, or serial calculations. Floating-point imprecision creates rounding errors that violate statutory Indian GST reporting.
3. **Half-Up Rounding**: When fractional currency arises at the final invoice/order stage, the standard commercial rounding rule is **Round Half-Up** (`Decimal.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)`), or rounded to the nearest integer Rupee if configured.
4. **Historical Point-in-Time Snapshotting**: Changing active configuration, tax slabs, or product prices must **never** alter the financial figures of previously created orders or invoices. Every financial transaction preserves an immutable snapshot of every component line item.

---

## 2. Canonical 14-Step Calculation Pipeline

Every checkout calculation, order placement, and tax invoice generation must strictly execute the canonical 14-step calculation flow defined below.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CANONICAL BILLING CALCULATION PIPELINE               │
├────────────────────────────────────────────────────────────────────────┤
│ Step 1: Product Validation (Active, In-Catalog, Price Check)           │
│ Step 2: Quantity Validation (Min/Max limit, Stock Availability)        │
│ Step 3: Base Line Item Subtotal (Quantity × Unit MRP/Catalog Price)    │
│ Step 4: Product-Level Discount Evaluation (Promotional Markdown)       │
│ Step 5: Order Line Subtotal (Sum of Net Item Prices)                   │
│ Step 6: Order-Level / Coupon Discount Evaluation                       │
│ Step 7: Total Discount Allocation across lines / order                 │
│ Step 8: Taxable Amount Determination (Subtotal − Allowable Discounts)  │
│ Step 9: Statutory Tax Calculation (Intra-state CGST+SGST vs Inter IGST)│
│ Step 10: Logistics & Delivery Tariff Calculation (Distance Slab Engine)│
│ Step 11: Free-Delivery Qualification Evaluation                        │
│ Step 12: Gross Payable Total Compilation (Taxable + Tax + Delivery)    │
│ Step 13: Currency Rounding & Floor Checks (Non-Negative Guarantee)     │
│ Step 14: Historical Billing Snapshot Generation & Record Freezing      │
└────────────────────────────────────────────────────────────────────────┘
```

### Detailed Pipeline Specification

#### Step 1: Product Validation
* Verify that each item in the cart corresponds to a valid `Product` record in the database.
* Ensure `is_active == TRUE`.
* Verify that the requested product is not archived or soft-deleted.

#### Step 2: Quantity Validation
* Ensure `quantity > 0` and is an integer.
* Check physical inventory: `product.stock >= quantity`. If insufficient stock, reject checkout with `400 Bad Request` ("Insufficient inventory for SKU: {sku}").

#### Step 3: Base Line Item Subtotal
* Extract the product's Maximum Retail Price (`mrp`) and standard catalog selling price (`price`).
* Invariant: `mrp >= price >= 0.00`.
* Gross Line Subtotal = `quantity * mrp`.

#### Step 4: Product-Level Discount
* Determine active product or category promotional discount (if enabled and within date window).
* If promotional discount applies:
  * For percentage: `unit_discount = round(mrp * (discount_percentage / 100), 2)`.
  * For fixed discount: `unit_discount = fixed_amount`.
* Effective Selling Price = `mrp - unit_discount` (or configured `price`).
* Net Line Subtotal = `quantity * Effective Selling Price`.
* Product Discount Total for line = `quantity * unit_discount`.

#### Step 5: Cart / Order Subtotal
* Aggregate the sum of all net line subtotals:
  $$\text{Subtotal} = \sum_{i=1}^{n} \text{Net Line Subtotal}_i$$

#### Step 6: Order-Level / Global Discount Evaluation
* Evaluate promo code / coupon or automatic volume threshold:
  * If valid and `Subtotal >= min_order_value`:
    * If percentage: `raw_order_discount = Subtotal * (order_discount_pct / 100)`.
    * If `max_discount_cap` is set: `order_discount = min(raw_order_discount, max_discount_cap)`.
    * If fixed: `order_discount = min(fixed_order_discount, Subtotal)`.
  * If stacking policy is `FALSE` and items already have product-level discounts: see Section 5 (Discount Stacking).

#### Step 7: Discount Total Aggregation
* Aggregate total commercial discount:
  $$\text{Total Discount} = \text{Product Discount Total} + \text{Order Discount}$$

#### Step 8: Taxable Amount Determination
* Under Indian GST, GST is charged on the **transaction value after deducting trade discounts**:
  $$\text{Taxable Value} = \text{Subtotal} - \text{Order Discount}$$
* If catalog pricing is **Tax-Exclusive**:
  * Taxable Amount = $\text{Subtotal} - \text{Order Discount}$.
* If catalog pricing is **Tax-Inclusive**:
  * Taxable Amount = $\frac{\text{Net Subtotal after Discounts}}{1 + (\text{Tax Rate} / 100)}$.

#### Step 9: Statutory GST Calculation
* Determine Place of Supply:
  * Compare `business_origin_state` (Default: `'Tamil Nadu'`) with customer `shipping_address.state`.
  * **Case A: Intra-State Supply** (Shipping address is in Tamil Nadu):
    * Central GST: $\text{CGST Amount} = \text{round}(\text{Taxable Value} \times \frac{\text{CGST Rate}}{100}, 2)$ (e.g., 9%).
    * State GST: $\text{SGST Amount} = \text{round}(\text{Taxable Value} \times \frac{\text{SGST Rate}}{100}, 2)$ (e.g., 9%).
    * $\text{Total GST} = \text{CGST Amount} + \text{SGST Amount}$.
  * **Case B: Inter-State Supply** (Shipping address is outside Tamil Nadu, e.g. Karnataka, Kerala, Maharashtra):
    * Integrated GST: $\text{IGST Amount} = \text{round}(\text{Taxable Value} \times \frac{\text{IGST Rate}}{100}, 2)$ (e.g., 18%).
    * $\text{Total GST} = \text{IGST Amount}$ (CGST = 0.00, SGST = 0.00).

#### Step 10: Logistics & Delivery Calculation
* Execute Delivery Precedence Engine (Section 6).
* Calculate raw shipping fee based on distance from Coimbatore or state fallback rate.

#### Step 11: Free-Delivery Evaluation
* If `free_delivery_enabled == TRUE` and `Taxable Value >= free_delivery_threshold`:
  * `shipping_fee = 0.00`.
  * Record `free_shipping_applied = TRUE`.

#### Step 12: Final Payable Total Compilation
* Aggregate payable monetary components:
  $$\text{Gross Total} = \text{Taxable Value} + \text{Total GST} + \text{Shipping Fee}$$
* (If tax-inclusive mode, Gross Total = $\text{Net Subtotal after Discounts} + \text{Shipping Fee}$).

#### Step 13: Currency Rounding & Floor Guarantee
* Apply rounding rule: `final_total = round_half_up(Gross Total)`.
* Invariant Check: `final_total >= 0.00`. (Negative totals are strictly forbidden).

#### Step 14: Historical Billing Snapshot Freezing
* Assemble the point-in-time snapshot dictionary and persist it permanently inside the `Order` and `Invoice` records.

---

## 3. Statutory Tax Architecture & GST Specification

### 3.1 Statutory Rates & Place of Supply
Standard electrical merchandise in India falls primarily under the **18% GST** bracket (covering wires, cables, switches, lighting fixtures, distribution boards, and ceiling fans).

| Supply Type | Origin State | Destination State | GST Type | CGST Rate | SGST Rate | IGST Rate | Total Tax Rate |
|---|---|---|---|---|---|---|---|
| **Intra-State** | Tamil Nadu | Tamil Nadu (Coimbatore, Chennai, Madurai, etc.) | CGST + SGST | 9.00% | 9.00% | 0.00% | **18.00%** |
| **Inter-State** | Tamil Nadu | Outside TN (Bengaluru, Mumbai, Kochi, Delhi, etc.) | IGST | 0.00% | 0.00% | 18.00% | **18.00%** |

### 3.2 Product-Specific & Category-Specific Tax Extensibility
While 18% is the current default for electrical goods, certain specialized electrical lines may fall under 5% (e.g., solar panels/cells), 12% (e.g., certain LED lamps/fixtures), or 28% (e.g., certain luxury smart automation/air treatment equipment).

* **Design Extensibility**: The architecture assigns tax rates at the **Tax Configuration** level with optional overrides at `Category.tax_rate` or `Product.tax_rate`.
* If `product.tax_rate` is specified, it overrides `category.tax_rate`, which in turn overrides `default_tax_rate`.
* Phase 2 model will support nullable foreign keys or rate references to allow per-product tax compliance without code modifications.

### 3.3 Reconciling Tax-Inclusive vs Tax-Exclusive Conflict

#### The Existing Phase 1 Conflict
* `frontend/src/pages/customer/ProductDetail.tsx` (Line 87) renders:
  ```html
  <p>Price inclusive of all taxes. Free shipping on orders above ₹999.</p>
  ```
* `frontend/src/pages/customer/Checkout.tsx` (Lines 48–49) executes:
  ```typescript
  const tax = Math.round(checkoutSubtotal * 0.18);
  const total = checkoutSubtotal + shipping + tax;
  ```
* `frontend/src/components/admin/GenerateInvoiceModal.tsx` requires:
  `taxPercent: 18` per item added on top.

#### Legal & E-Commerce Analysis
* **Indian Consumer Protection & E-Commerce Rules (2020)** require that B2C retail prices displayed to end consumers must clearly state the Maximum Retail Price (MRP) inclusive of all taxes.
* **B2B Commercial Contracting**, conversely, operates on **tax-exclusive quotes**, where rates are quoted net of GST, and CGST/SGST/IGST are charged on top of the taxable supply.

#### Phase 1.5 Target Architecture
The backend calculation engine will support a configurable `tax_calculation_mode`:
1. `TAX_EXCLUSIVE` (Current Checkout behavior): Displayed price is net; 18% GST added at checkout.
2. `TAX_INCLUSIVE` (Consumer Protection compliant behavior): Displayed price includes 18% GST; checkout decomposes the price into:
   $$\text{Taxable Base} = \frac{\text{Price}}{1.18}, \quad \text{Tax Component} = \text{Price} - \text{Taxable Base}$$
3. **Provisional Strategy for Development**: Configure `tax_calculation_mode = TAX_EXCLUSIVE` initially to match `Checkout.tsx`, while flagging `DEC-1.5-02` for business approval before launch.

---

## 4. Product Discount Architecture

### 4.1 Relationship: MRP vs Selling Price vs Promotional Discount
To eliminate ambiguity and prevent accidental double-discounting:

1. **`mrp` (Maximum Retail Price)**:
   * Statutory manufacturer price printed on packaging.
   * Hard upper bound: `price <= mrp`.
2. **`price` (Standard Store Selling Price)**:
   * The baseline selling price configured in the store catalog.
   * Normal retail markdown from MRP: $\text{Normal Discount} = \text{mrp} - \text{price}$.
3. **`promotional_discount` (Time-Bound Special Promotion)**:
   * Additional promotional campaign applied by an administrator (e.g., Diwali Sale 10% off).
   * Can be configured at Category level (`Category.discount_value`) or Product level.

### 4.2 Preventing Double-Discounting
* **Anti-Pattern**: If an administrator sets `product.price = ₹800` (discounted from `mrp = ₹1000`), and also enables a category promotion of `20% OFF`, applying 20% to `₹800` results in `₹640` (a compounding 36% discount unintended by management).
* **Canonical Policy**:
  * The store catalog defines whether `price` is:
    * **Option A**: The final configured selling price (the current frontend behavior where `discount % = round((mrp - price)/mrp * 100)`).
    * **Option B**: A base selling price to which active promotional discounts apply.
  * In the Phase 1.5 architecture:
    * `Product.price` represents the **active regular selling price**.
    * An active promotional rule specifies a `discount_basis`: either `FROM_MRP` or `FROM_SELLING_PRICE`.
    * If `FROM_MRP` is selected, `Effective Price = mrp * (1 - pct/100)`.
    * Under no circumstances can the effective price drop below `0.00`.

---

## 5. Order-Level Discount & Stacking Policy

### 5.1 Order-Level Discounts (Coupons & Cart Rules)
* Applied to the entire cart subtotal rather than individual line items.
* Attributes:
  * `coupon_code` (e.g., `POWER10`, `WELCOME500`).
  * `discount_type`: `PERCENTAGE` or `FIXED_AMOUNT`.
  * `discount_value`: Value of markdown.
  * `min_order_value`: Cart subtotal qualification threshold.
  * `max_discount_cap`: Upper ceiling (e.g., 10% discount capped at max ₹1,000).
  * `validity_window`: `valid_from` to `valid_until`.

### 5.2 Discount Stacking Analysis
When an order contains products that already enjoy product-level discounts and the customer applies an order-level coupon, how should the system compute the total discount?

#### Stacking Policies
1. **Policy 1: No Stacking (Strict Mutual Exclusion)**:
   * Order discount applies ONLY to cart items that have no product-level discount.
   * If cart contains exclusively discounted items, coupon is rejected ("This coupon cannot be combined with existing product offers").
2. **Policy 2: Sequential Stacking (Compounding)**:
   * Product discounts are applied first to compute line subtotals.
   * Order discount is then calculated against the net subtotal of all items.
3. **Policy 3: Best Discount Wins**:
   * The system computes cart total with product discounts, then computes cart total with the coupon from MRP, and grants the customer whichever yields the lowest total.

#### Target Phase 1.5 Architecture
* Default engine configuration: **Policy 2 (Sequential Stacking)** with a mandatory **Maximum Combined Discount Cap** (e.g., total discount cannot exceed 50% of gross cart MRP, and total payable cannot drop below ₹1.00).
* Policy is configurable in `DiscountConfiguration.allow_stacking` (Decision Log `DEC-1.5-04`).

---

## 6. Distance-Based Delivery Pricing Engine

### 6.1 Dispatch Origin Specification
* **Business Origin**: Vee Power Electricals Dispatch Hub.
* **Origin City**: Configurable, initially seeded as `'Coimbatore'`.
* **Origin State**: `'Tamil Nadu'`.
* **Origin Pincode**: `'641031'`.
* **Origin Address**: `"No 28/1, 2nd floor, MTP Road, Muthu nagar, NSN palayam, Coimbatore, TamilNadu - 641031"`.
* *Design Integrity Note*: Coimbatore is stored as the active origin location in `DeliveryConfiguration`, allowing management to alter the warehouse dispatch origin if operations expand to other facilities without altering application code.

### 6.2 Distance Calculation & Slabs
* Delivery pricing is computed based on radial or road distance from the origin dispatch hub to the delivery destination PIN code.
* **Distance Pricing Formula**:
  $$\text{Distance Slabs} = \text{ceil}\left(\frac{\text{Distance (km)}}{\text{Distance Slab Step (km)}}\right)$$
  $$\text{Raw Delivery Charge} = \text{Base Delivery Charge} + \max(0, \text{Distance Slabs} - 1) \times \text{Charge Per Slab}$$

#### Provisional Development Default Matrix (Seed Only)
* **Base Delivery Charge**: `₹100.00` (Covers first 10 km).
* **Distance Slab Step**: `10 km`.
* **Additional Charge Per Slab**: `₹100.00`.

| Distance Range | Slab Step | Calculation | Provisional Tariff |
|---|---|---|---|
| **0.00 $\le$ distance $<$ 10.00 km** | Slab 1 | Base Charge (₹100) | **₹100.00** |
| **10.00 $\le$ distance $<$ 20.00 km** | Slab 2 | ₹100 + (1 × ₹100) | **₹200.00** |
| **20.00 $\le$ distance $<$ 30.00 km** | Slab 3 | ₹100 + (2 × ₹100) | **₹300.00** |
| **30.00 $\le$ distance $<$ 40.00 km** | Slab 4 | ₹100 + (3 × ₹100) | **₹400.00** |
| **40.00 $\le$ distance $<$ 50.00 km** | Slab 5 | ₹100 + (4 × ₹100) | **₹500.00** |
| **$\ge$ 50.00 km** | Beyond Slab 5 | Fallback regional state rate / capped | Dynamic / Fallback |

> [!IMPORTANT]
> The figures above are **provisional development defaults** for testing and integration. They are **not** business-approved production rates. The actual production tariff will be configured by business management based on commercial logistics contracts (e.g., Porter, DTDC, India Post).

### 6.3 Fallback Regional / State Rates
When geocoding or precise PIN-to-PIN distance calculation is unavailable (e.g., third-party API outage or remote non-geocoded rural PIN codes), the engine falls back to configured **State Shipping Rules**:
* Tamil Nadu: `₹50.00`
* Karnataka / Kerala: `₹80.00`
* Maharashtra: `₹100.00`
* Delhi / Northern States: `₹150.00`
* North-East / Special Territories: `₹250.00`

---

## 7. Free Delivery Rule Reconciliation

### 7.1 Reconciling the Checkout (₹999) vs Admin (₹3999) Discrepancy
* In `frontend/src/pages/customer/Checkout.tsx`:
  `const shipping = checkoutSubtotal >= 999 ? 0 : 99;`
* In `frontend/src/pages/admin/Shipping.tsx`:
  `freeShippingThreshold = 3999;`

### 7.2 Resolution Architecture
1. **Dynamic Configuration Value**: The free shipping threshold is completely decoupled from frontend source code. It is managed in `DeliveryConfiguration.free_delivery_threshold`.
2. **Seed Default**: In Phase 2 database seed fixtures, the default will be set to `₹999.00` for retail B2C checkouts, with administrative ability to change it to `₹3,999.00` or any other figure instantly via `/admin/orders/shipping`.
3. **Applicability Scope**:
   * Management can configure whether free shipping applies **globally**, or **only within local/intra-state zones** (e.g., Free delivery above ₹999 within Tamil Nadu; standard distance rates outside Tamil Nadu).

---

## 8. Historical Billing Snapshot Schema (JSON/Column Blueprint)

When an order is confirmed or an invoice is generated, the complete billing state is frozen. The snapshot captures the exact math applied at that microsecond:

```json
{
  "snapshot_version": "1.0",
  "calculated_at": "2026-09-24T10:15:30Z",
  "currency": "INR",
  "pricing_mode": "TAX_EXCLUSIVE",
  "origin_hub": {
    "city": "Coimbatore",
    "state": "Tamil Nadu",
    "pincode": "641031"
  },
  "destination": {
    "state": "Tamil Nadu",
    "pincode": "641001",
    "distance_km": 8.5
  },
  "subtotal_mrp": 15000.00,
  "product_discounts_total": 2500.00,
  "net_subtotal": 12500.00,
  "order_discount": {
    "code": "FESTIVE500",
    "type": "FIXED_AMOUNT",
    "amount": 500.00
  },
  "taxable_amount": 12000.00,
  "tax_breakdown": {
    "tax_type": "INTRA_STATE_GST",
    "total_rate_percent": 18.00,
    "cgst_rate_percent": 9.00,
    "cgst_amount": 1080.00,
    "sgst_rate_percent": 9.00,
    "sgst_amount": 1080.00,
    "igst_rate_percent": 0.00,
    "igst_amount": 0.00,
    "total_tax_amount": 2160.00
  },
  "delivery": {
    "rule_applied": "DISTANCE_SLAB",
    "distance_km": 8.5,
    "slab_step_km": 10.0,
    "calculated_fee": 100.00,
    "free_delivery_threshold": 999.00,
    "is_free_delivery": true,
    "final_shipping_fee": 0.00
  },
  "gross_total": 14160.00,
  "rounding_adjustment": 0.00,
  "final_payable_amount": 14160.00
}
```
