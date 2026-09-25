import { test, expect } from '@playwright/test';

test.describe('Admin Workflows E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@veepower.in');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*admin/, { timeout: 15000 });
  });

  test('1. Admin Dashboard loads with key metrics and KPI cards', async ({ page }) => {
    await expect(page.locator('text=Total Sales').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Open Orders').first()).toBeVisible();
    await expect(page.locator('text=Conversion Rate').first()).toBeVisible();
  });

  test('2. Admin Order Management loads orders list and supports filtering', async ({ page }) => {
    await page.goto('/admin/orders');
    
    // Check header
    await expect(page.locator('h1', { hasText: /All Orders/i })).toBeVisible({ timeout: 10000 });

    // Check status filter tabs
    await expect(page.locator('button', { hasText: 'All' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'CONFIRMED' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'DELIVERED' }).first()).toBeVisible();

    // Verify orders are listed
    const orderElements = page.locator('h3', { hasText: /ORD-/ });
    await expect(orderElements.first()).toBeVisible({ timeout: 10000 });
    const count = await orderElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('3. Admin Inventory Management displays product stock levels', async ({ page }) => {
    await page.goto('/admin/inventory');

    // Check header
    await expect(page.locator('h1', { hasText: /Inventory Management/i })).toBeVisible({ timeout: 10000 });

    // Check overview cards (In Stock, Low Stock, Out of Stock)
    await expect(page.locator('text=In Stock').first()).toBeVisible();

    // Verify inventory table contains items
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('4. Admin Shipping Settings loads threshold and rules', async ({ page }) => {
    await page.goto('/admin/orders/shipping');

    // Check shipping settings header
    await expect(page.locator('h1', { hasText: /Delivery & Shipping Configuration|Shipping Settings/i }).first()).toBeVisible({ timeout: 10000 });

    // Check threshold input
    await expect(page.locator('input[type="number"]').first()).toBeVisible();
  });
});
