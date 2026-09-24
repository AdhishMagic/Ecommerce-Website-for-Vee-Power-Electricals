# Vee Electricals — Comprehensive Business Rules Registry (Phase 1.5)

## 1. Classification Methodology

To prevent premature hardcoding and maintain a crystal-clear boundary between invariant software logic and flexible commercial strategy, all business logic across **Vee Power Electricals** is formally categorized into five operational classes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLASSIFICATION TAXONOMY                         │
├────────────────────────────────────────────────────────────────────────┤
│ [A] FIXED SYSTEM VALUE: Invariant logic enforced by software           │
│     (e.g., mathematical formulas, password hashes, foreign key rules)  │
│ [B] ADMIN CONFIGURABLE: Business parameters editable by store admins   │
│     (e.g., GST rate, distance slabs, free shipping thresholds)         │
│ [C] DERIVED / CALCULATED: Dynamically computed by deterministic logic  │
│     (e.g., line subtotal, CGST share, distance slab step, net profit)  │
│ [D] BUSINESS DECISION REQUIRED: Ambiguities needing executive sign-off │
│     (e.g., tax-inclusive vs exclusive catalog, stacking policy)        │
│ [E] FUTURE EXTENSION: Planned architecture deferred past MVP           │
│     (e.g., credit notes, multi-warehouse, custom telemetry pipeline)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Master Business Rules Registry

| Rule ID | Domain | Business Rule / Parameter | Classification | Description & Technical Boundary | Default / Current Value |
|---|---|---|---|---|---|
| **BR-01** | Tax | GST Calculation Enabled | **[B] ADMIN CONFIGURABLE** | Master toggle to enable/disable tax computation across all transactions. | `True` |
| **BR-02** | Tax | Statutory GST Rate | **[B] ADMIN CONFIGURABLE** | Default Goods and Services Tax rate applied to electrical goods. | `18.00%` (Provisional Seed) |
| **BR-03** | Tax | Tax Calculation Mode | **[D] BUSINESS DECISION REQUIRED** | Dictates whether catalog retail price is tax-inclusive or tax-exclusive. | `TAX_EXCLUSIVE` (Checkout default) |
| **BR-04** | Tax | Intra-State GST Breakdown | **[C] DERIVED / CALCULATED** | Computed when customer delivery state matches business origin (`Tamil Nadu`): CGST (9%) + SGST (9%). | `Taxable Amount * 9%` each |
| **BR-05** | Tax | Inter-State GST Breakdown | **[C] DERIVED / CALCULATED** | Computed when customer delivery state is outside `Tamil Nadu`: IGST (18%). | `Taxable Amount * 18%` |
| **BR-06** | Tax | Category / Product Tax Override | **[E] FUTURE EXTENSION** | Extensibility allowing specific items (e.g. solar panels 5%) to override store default. | Null (Uses store default) |
| **BR-07** | Pricing | MRP vs Selling Price Invariant | **[A] FIXED SYSTEM VALUE** | Standard selling price can never exceed Maximum Retail Price: `price <= mrp`. | Enforced by Model/Validator |
| **BR-08** | Pricing | Product Discount Markdown | **[B] ADMIN CONFIGURABLE** | Promotional percentage or fixed discount applied to product/category. | Configurable via Admin |
| **BR-09** | Pricing | Regular Displayed Discount % | **[C] DERIVED / CALCULATED** | Computed catalog percentage markdown: `round(((mrp - price) / mrp) * 100)`. | Calculated dynamically |
| **BR-10** | Pricing | Order-Level Discount / Coupon | **[B] ADMIN CONFIGURABLE** | Cart-level promotional code with minimum cart value and maximum discount ceiling. | Configurable via Admin |
| **BR-11** | Pricing | Discount Stacking Policy | **[D] BUSINESS DECISION REQUIRED** | Whether order coupons can stack on items already having promotional product markdowns. | Sequential with cap (Proposed) |
| **BR-12** | Pricing | Non-Negative Total Invariant | **[A] FIXED SYSTEM VALUE** | After all discounts and deductions, payable total cannot drop below zero (`total >= 0.00`). | Enforced by Pipeline |
| **BR-13** | Delivery | Business Dispatch Origin | **[B] ADMIN CONFIGURABLE** | Origin hub used for distance calculation. Defaults to Coimbatore warehouse (`641031`). | `'Coimbatore'`, `'Tamil Nadu'` |
| **BR-14** | Delivery | Base Delivery Charge | **[B] ADMIN CONFIGURABLE** | Initial shipping fee charged for the first distance slab (provisional development default). | `₹100.00` (Provisional Seed) |
| **BR-15** | Delivery | Distance Slab Step | **[B] ADMIN CONFIGURABLE** | Radial/route distance step (in km) triggering incremental shipping fees. | `10.00 km` (Provisional Seed) |
| **BR-16** | Delivery | Charge per Distance Slab | **[B] ADMIN CONFIGURABLE** | Additional delivery cost incurred for each subsequent distance slab. | `₹100.00` per 10 km (Provisional) |
| **BR-17** | Delivery | Free Delivery Master Toggle | **[B] ADMIN CONFIGURABLE** | Enables or disables free shipping qualification across store checkouts. | `True` |
| **BR-18** | Delivery | Free Delivery Threshold | **[B] ADMIN CONFIGURABLE** | Minimum net cart subtotal required to qualify for free shipping. | `₹999.00` (Dev Seed) / `₹3999` (Admin) |
| **BR-19** | Delivery | State Shipping Rule Fallback | **[B] ADMIN CONFIGURABLE** | Fixed flat regional rates used when destination distance cannot be geocoded. | TN ₹50, MH ₹100, DL ₹150 |
| **BR-20** | Delivery | Delivery Precedence Order | **[A] FIXED SYSTEM VALUE** | Hierarchy: Promo Override -> Free Threshold -> Zone/Pincode -> Distance Slab -> State Fallback. | Enforced by Engine |
| **BR-21** | Inventory | Negative Inventory Prevention | **[A] FIXED SYSTEM VALUE** | Warehouse stock cannot drop below zero (`stock >= 0`). | Enforced by DB & Serializer |
| **BR-22** | Inventory | Low Stock Alert Threshold | **[B] ADMIN CONFIGURABLE** | Stock count threshold triggering "Low Stock" warnings on customer/admin screens. | Default `5` units (Product override) |
| **BR-23** | Inventory | Immutable Stock Ledger | **[A] FIXED SYSTEM VALUE** | Every inventory addition, deduction, or adjustment creates an immutable `StockTransaction`. | Write-only audit log |
| **BR-24** | Orders | Canonical Order State Machine | **[A] FIXED SYSTEM VALUE** | Allowed state transitions: `PENDING` -> `CONFIRMED` -> `PACKED` -> `SHIPPED` -> `DELIVERED`. | Enforced by State Engine |
| **BR-25** | Orders | Order Number Format | **[A] FIXED SYSTEM VALUE** | Unique generated order identifier: `VPE-XXXXXX` (6-digit alphanumeric / numeric). | `VPE-` + random/sequential |
| **BR-26** | Orders | Guest Checkout Policy | **[D] BUSINESS DECISION REQUIRED** | Whether guests can complete checkout without account creation. Backend supports; UI currently requires login. | `user_id` nullable (DB ready) |
| **BR-27** | Orders | Historical Snapshot Freezing | **[A] FIXED SYSTEM VALUE** | Orders snapshot product names, prices, tax rates, and delivery charges at creation. | Immutable point-in-time JSON |
| **BR-28** | Invoices | Invoice Numbering Format | **[B] ADMIN CONFIGURABLE** | Sequential statutory GST invoice numbers: `INV-YYYY-XXXX` reset annually on April 1. | `INV-2026-XXXX` |
| **BR-29** | Invoices | Invoice Due Date Offset | **[B] ADMIN CONFIGURABLE** | Credit period allowed before invoice transitions to `Overdue` (B2C: 0 days; B2B: 15–30 days). | B2C: 0, B2B: 15 days |
| **BR-30** | Invoices | Order to Invoice Multiplicity | **[A] FIXED SYSTEM VALUE** | 1:1 primary relation for standard retail; 1:N capability supported for B2B contract milestones. | Optional 1:1 / 1:N extensible |
| **BR-31** | B2B | Statutory GSTIN Validation | **[A] FIXED SYSTEM VALUE** | Format regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` (15 characters). | Statutory Indian format |
| **BR-32** | B2B | Corporate Credit Limit Check | **[A] FIXED SYSTEM VALUE** | Outstanding unpaid invoices for a B2B client cannot exceed allocated `credit_limit`. | Validated on Invoice create |
| **BR-33** | Quotations | Quotation Expiration Window | **[B] ADMIN CONFIGURABLE** | Number of days a commercial quote remains valid before shifting to expired/invalid. | Default `30` days |
| **BR-34** | Quotations | Quotation Conversion Rule | **[A] FIXED SYSTEM VALUE** | Converted quotation shifts status to `Converted`, locks line items, and links to created `Invoice`. | One-way conversion |
| **BR-35** | Payment | Supported Payment Rails | **[B] ADMIN CONFIGURABLE** | Admin toggles for UPI/QR, Credit/Debit Cards, NetBanking, and Cash on Delivery. | UPI, Card, NetBanking, COD |
| **BR-36** | Payment | Payment Gateway Scope | **[D] BUSINESS DECISION REQUIRED** | Razorpay live webhook/signature verification (Phase 2 stub vs Phase 3 live production). | Phase 2 Mock / Phase 3 Live |
| **BR-37** | Finance | Separation: Transaction vs Payout | **[A] FIXED SYSTEM VALUE** | `PaymentTransaction` records customer collections; `PayoutSettlement` records bank transfers. | Distinct financial entities |
| **BR-38** | Analytics | Store Traffic Data Source | **[D] BUSINESS DECISION REQUIRED** | Funnel & session telemetry: custom internal DB tables vs Google Analytics / Plausible API. | Internal sales vs External traffic |
| **BR-39** | Auth | User Identification & Credentials | **[A] FIXED SYSTEM VALUE** | Primary login identifier is `email`; passwords hashed using PBKDF2/Argon2. | Django standard |
| **BR-40** | Auth | Role-Based Access Differentiation | **[A] FIXED SYSTEM VALUE** | System recognizes `customer` and `admin` roles, mapped to Django `is_staff`/`is_superuser`. | RBAC middleware |
| **BR-41** | Company | Legal Profile & Bank Coordinates | **[B] ADMIN CONFIGURABLE** | Legal entity name, GSTIN, registered address, telephone, and bank IFSC details on invoices. | Configurable via Admin |
| **BR-42** | Billing | Currency Specification | **[A] FIXED SYSTEM VALUE** | Base transaction currency is Indian Rupee (`INR`, `₹`). | Hardcoded `INR` |
| **BR-43** | Billing | Currency Rounding Rule | **[B] ADMIN CONFIGURABLE** | Rounding method: `ROUND_HALF_UP` to nearest whole Rupee vs 2 decimal places. | `ROUND_HALF_UP` |

---

## 3. Summary of Rules by Classification

```
┌───────────────────────────────────────┬────────────┬─────────────┐
│ Category                              │ Count      │ Percentage  │
├───────────────────────────────────────┼────────────┼─────────────┤
│ [A] Fixed System Value (Code logic)   │ 19 Rules   │ 44.2%       │
│ [B] Admin Configurable (Customizable) │ 16 Rules   │ 37.2%       │
│ [C] Derived / Calculated (Dynamic)    │ 3 Rules    │ 7.0%        │
│ [D] Business Decision Required (Open) │ 4 Rules    │ 9.3%        │
│ [E] Future Extension (Deferred)       │ 1 Rule     │ 2.3%        │
├───────────────────────────────────────┼────────────┼─────────────┤
│ TOTAL REGISTERED BUSINESS RULES       │ 43 Rules   │ 100.0%      │
└───────────────────────────────────────┴────────────┴─────────────┘
```
