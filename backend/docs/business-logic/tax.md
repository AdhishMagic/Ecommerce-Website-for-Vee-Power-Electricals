# Tax Engine & Statutory GST Architecture

## 1. Overview
The **Tax Engine** (`TaxService` in `apps.commercial_config.services`) calculates statutory Indian Goods and Services Tax (GST) for retail consumer checkouts, administrative invoicing, and B2B quotation conversions.

---

## 2. Supported Tax Modes

The engine supports two primary pricing regimes:
1. **`TAX_EXCLUSIVE` (Default for Retail)**:
   - Prices in the catalog represent pre-tax amounts.
   - Statutory GST is added on top of the taxable amount at checkout.
   - Formula:
     $$\text{Total Tax} = \text{Taxable Amount} \times \left(\frac{\text{GST Rate}}{100}\right)$$
     $$\text{Final Total} = \text{Taxable Amount} + \text{Total Tax}$$

2. **`TAX_INCLUSIVE` (Backwards Extraction)**:
   - Catalog prices already incorporate statutory GST.
   - Tax is reverse-computed to extract the base taxable amount without altering the customer's displayed total.
   - Formula:
     $$\text{Taxable Base} = \frac{\text{Gross Amount}}{1 + \left(\frac{\text{GST Rate}}{100}\right)}$$
     $$\text{Total Tax} = \text{Gross Amount} - \text{Taxable Base}$$

---

## 3. Intra-State vs. Inter-State Resolution

Statutory tax distribution is determined by matching the dispatch origin against the recipient's delivery state:

| Transaction Nature | Origin State | Destination State | Statutory Components | Effective Formula |
|---|---|---|---|---|
| **INTRA_STATE** | Tamil Nadu | Tamil Nadu | **CGST** (50% of GST)<br>**SGST** (50% of GST) | $\text{CGST} = \text{Base} \times \text{CGST Rate}$<br>$\text{SGST} = \text{Base} \times \text{SGST Rate}$<br>$\text{IGST} = 0.00$ |
| **INTER_STATE** | Tamil Nadu | Outside Tamil Nadu (e.g., Karnataka, Kerala) | **IGST** (100% of GST) | $\text{IGST} = \text{Base} \times \text{IGST Rate}$<br>$\text{CGST} = 0.00$<br>$\text{SGST} = 0.00$ |

---

## 4. Authoritative Configuration Resolution
1. Origin state is authoritatively resolved from `TaxConfiguration.business_state` (defaulting to `'Tamil Nadu'`).
2. Current active tax rates and splits are loaded from the latest versioned `TaxConfiguration` record with `is_active=True`.
3. Rounding is strictly applied to each tax component using `Decimal('0.01')` and `ROUND_HALF_UP`.
4. In intra-state mode, rounding differences are resolved by ensuring `cgst_amount + sgst_amount == total_tax_amount`.

---

## 5. Historical Immutability
- Tax rates applied to an order or invoice are permanently recorded inside `calculation_snapshot`.
- Any subsequent change to `TaxConfiguration` rates or state rules will not alter the financial ledgers of past orders or invoices.
