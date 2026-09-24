# Delivery & Logistics Tariff Engine

## 1. Overview
The **Delivery Engine** (`DeliveryService` in `apps.commercial_config.services`) determines customer delivery fees using warehouse origin coordinates, road/radial distance slabs, state-level shipping fallbacks, and free delivery threshold policies.

---

## 2. Authoritative Distance Tariff Slabs (Phase 2.1 Reconciliation)
Per the Phase 2.1 design reconciliation, `DistanceSlab.rate` is the authoritative runtime distance tariff.

Distance slabs are evaluated as **continuous half-open intervals**:
$$[\text{min\_distance\_km}, \text{max\_distance\_km})$$

### Precedence Hierarchy:
1. **Tier 1: Granular Continuous Distance Slabs**:
   - If distance $D$ is provided:
     $$\text{min\_distance\_km} \le D < \text{max\_distance\_km}$$
   - The matching slab's `rate` is applied directly.
2. **Tier 2: Mathematical Step Slabs (Beyond configured discrete slabs)**:
   - If distance exceeds all discrete slabs, step-based mathematical calculations are applied:
     $$\text{Fee} = \text{Base Charge} + \left(\lceil D / \text{Slab Step}\rceil - 1\right) \times \text{Charge Per Slab}$$
3. **Tier 3: State-Specific Regional Shipping Rules**:
   - If distance cannot be geocoded or resolved, regional flat rates from `ShippingRule` matching the destination state are applied.
4. **Tier 4: Warehouse Base Delivery Charge Fallback**:
   - If no regional rule exists, `DeliveryConfiguration.base_delivery_charge` is applied.

---

## 3. Free Delivery Threshold
- When `free_delivery_enabled` is `True` on the active `DeliveryConfiguration`:
  - If taxable subtotal $\ge \text{free\_delivery\_threshold}$ (e.g. ₹999.00 or ₹1000.00):
    - `final_shipping_fee = Decimal('0.00')`
    - `shipping_discount = calculated_fee`
    - `is_free_delivery = True`
- The threshold is fully configurable in `DeliveryConfiguration`.

---

## 4. Open Business Decisions & Courier Integration
- **Live Courier APIs (Shiprocket / Delhivery)**: Production live carrier API calls are deferred to Phase 7. Current calculation uses authoritative database configuration slabs.
