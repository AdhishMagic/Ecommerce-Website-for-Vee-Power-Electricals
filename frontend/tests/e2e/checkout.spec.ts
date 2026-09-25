import { test, expect } from '@playwright/test';

test.describe('End-to-End Customer Checkout Journey', () => {
  const customer = {
    email: 'e2e_verified_customer@veepower.com',
    password: 'SecurePass123!',
  };

  test('Complete Customer Checkout: Shop -> Cart -> Address -> Payment -> Order Success', async ({ page }) => {
    // 1. Log in as Customer
    await page.goto('/login');
    await page.fill('input[type="email"]', customer.email);
    await page.fill('input[type="password"]', customer.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*account/, { timeout: 15000 });

    // 2. Browse Shop and navigate to first product
    await page.goto('/shop');
    const firstProduct = page.locator('a[href^="/product/"]').first();
    await expect(firstProduct).toBeVisible({ timeout: 10000 });
    await firstProduct.click();

    // 3. Add to Cart
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    const addToCartBtn = page.locator('button', { hasText: /Add to Cart/i }).first();
    await addToCartBtn.click();
    await expect(page.locator('button', { hasText: /Added to Cart/i })).toBeVisible({ timeout: 5000 });

    // 4. View Cart
    await page.goto('/cart');
    await expect(page.locator('h1', { hasText: /Shopping Cart/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Order Summary')).toBeVisible();

    // 5. Proceed to Checkout
    const checkoutBtn = page.locator('button', { hasText: /Proceed to Checkout/i });
    await checkoutBtn.click();
    await expect(page).toHaveURL(/.*checkout/, { timeout: 10000 });
    await expect(page.locator('h1', { hasText: /Checkout/i })).toBeVisible();

    // 6. Step 0: Delivery Address
    // Wait for networkidle so saved addresses load from backend API
    await page.waitForLoadState('networkidle');
    const savedAddressRadio = page.locator('input[name="saved_address"]').first();
    const isSavedAddressPresent = await savedAddressRadio.isVisible().catch(() => false);
    if (isSavedAddressPresent) {
      await savedAddressRadio.check();
    } else {
      await page.fill('input[placeholder="Rajesh Kumar"]', 'Verified Buyer');
      await page.fill('input[placeholder="+91 98765 43210"]', '+91 9876543210');
      await page.fill('input[placeholder="House/Flat No., Street Name"]', '42, Industrial Area');
      await page.fill('input[placeholder="641001"]', '641001');
    }

    // Click Continue to Review
    const toReviewBtn = page.locator('button', { hasText: /Continue to Review/i });
    await toReviewBtn.click();

    // 7. Step 1: Review Order
    await expect(page.locator('h2', { hasText: /Review Order/i })).toBeVisible({ timeout: 5000 });
    const toPaymentBtn = page.locator('button', { hasText: /Continue to Payment/i });
    await toPaymentBtn.click();

    // 8. Step 2: Select Payment Method & Place Order
    await expect(page.locator('h2', { hasText: /Select Payment Method/i })).toBeVisible({ timeout: 5000 });
    
    // Choose Cash on Delivery
    const codRadio = page.locator('input[type="radio"][value="cod"]');
    await codRadio.check();

    // Submit authoritative order
    const placeOrderBtn = page.locator('button', { hasText: /Place Order/i });
    await placeOrderBtn.click();

    // 9. Order Success Verification
    await expect(page).toHaveURL(/.*order-success/, { timeout: 15000 });
    await expect(page.locator('h1', { hasText: /Order Placed!/i })).toBeVisible();
    await expect(page.locator('text=Order Number')).toBeVisible();

    // Verify order number pattern (e.g. ORD-...)
    const orderNumberEl = page.locator('span.font-mono');
    await expect(orderNumberEl).toBeVisible();
    const orderNumText = await orderNumberEl.textContent();
    expect(orderNumText).toMatch(/ORD-\d{8}-[A-F0-9]+/);
  });
});
