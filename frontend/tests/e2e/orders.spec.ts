import { test, expect } from '@playwright/test';

test.describe('Customer Order History & Detail E2E Flows', () => {
  const customer = {
    email: 'e2e_verified_customer@veepower.com',
    password: 'SecurePass123!',
  };

  test('Customer can view order history and open full order details', async ({ page }) => {
    // 1. Log in
    await page.goto('/login');
    await page.fill('input[type="email"]', customer.email);
    await page.fill('input[type="password"]', customer.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*account/, { timeout: 15000 });

    // 2. Verify Orders Tab is active
    await expect(page.locator('text=My Orders').first()).toBeVisible({ timeout: 10000 });

    // 3. Verify at least one order is in the list
    const viewDetailsButtons = page.locator('button', { hasText: /View Details/i });
    await expect(viewDetailsButtons.first()).toBeVisible({ timeout: 10000 });
    const count = await viewDetailsButtons.count();
    expect(count).toBeGreaterThan(0);

    // 4. Click "View Details" on the most recent order
    await viewDetailsButtons.first().click();

    // 5. Verify detailed order view renders
    await expect(page.locator('text=Order #ORD-').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Financial Snapshot').first()).toBeVisible();
    await expect(page.locator('text=Delivery Address').first()).toBeVisible();
    await expect(page.locator('text=Items Ordered').first()).toBeVisible();

    // 6. Back button returns to order list
    const backBtn = page.locator('button', { hasText: /Back to Orders/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Verify back on order list
    await expect(viewDetailsButtons.first()).toBeVisible({ timeout: 5000 });
  });
});
