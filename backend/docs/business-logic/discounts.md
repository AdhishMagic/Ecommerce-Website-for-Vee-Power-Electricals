# Discount Engine & Stacking Rules

## 1. Overview
The **Discount Engine** (`DiscountService` in `apps.commercial_config.services`) evaluates promotional order-level coupons against order subtotal amounts while enforcing business rules for minimum spend, percentage caps, expiration, and multi-tier discount stacking.

---

## 2. Supported Discount Types

1. **`PERCENTAGE` Discount**:
   - Calculates a percentage of the eligible order subtotal.
   - Respects optional `max_discount_cap`:
     $$\text{Discount} = \min\left(\text{Subtotal} \times \frac{\text{Discount Value}}{100}, \text{Max Cap}\right)$$
2. **`FIXED` Discount**:
   - Applies a flat rupee discount to the subtotal:
     $$\text{Discount} = \min(\text{Discount Value}, \text{Subtotal})$$

---

## 3. Validation Pipeline
Before applying any promotional discount, the following rules are checked in sequence:
1. **Existence**: Coupon code exists in `order_discounts`.
2. **Active Status**: `is_active` must be `True`.
3. **Date Validity**: `valid_from <= current_time <= valid_until`.
4. **Minimum Order Spend**: `order_amount >= coupon.min_order_value`.
5. **Usage Limits**: Evaluates total and per-user usage limits where configured.

---

## 4. Stacking and Double-Discounting Protections
- **Combined Discount Ratio Cap**: Total cumulative discounts on an order (product-level catalog discounts + order-level promotional coupon) cannot exceed **50% of the gross MRP value** (`MAX_ORDER_DISCOUNT_RATIO = Decimal('0.50')`).
- If an order already features steep product discounts, the coupon's effective discount is automatically curtailed to ensure the store margin is protected:
  $$\text{Max Allowable Coupon} = \max\left(0, (\text{Order Amount} \times 0.50) - \text{Existing Product Discounts}\right)$$

---

## 5. Open Business Decisions & Production Configuration
- **Coupon Stacking with B2B Credit**: Commercial B2B contract purchases with custom project pricing currently do not accept consumer retail promotional coupons.
- **Multiple Simultaneous Coupons**: The current engine allows exactly 1 promotional coupon per order. Multi-coupon stacking is intentionally disabled pending business approval.
