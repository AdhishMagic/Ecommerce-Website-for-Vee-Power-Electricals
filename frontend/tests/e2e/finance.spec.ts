import { test, expect } from '@playwright/test';

test.describe('B2B & Finance E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@veepower.in');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/.*admin/, { timeout: 15000 });
  });

  test('1. B2B Client Directory loads real clients from backend', async ({ page }) => {
    await page.goto('/admin/finance/clients');

    // Check heading
    await expect(page.locator('h1', { hasText: /Clients Directory/i })).toBeVisible({ timeout: 10000 });

    // Verify KPI card
    await expect(page.locator('text=Total Clients').first()).toBeVisible();

    // Verify client table rows exist
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('2. Quotations list displays commercial estimates with action buttons', async ({ page }) => {
    await page.goto('/admin/finance/quotations');

    // Check heading
    await expect(page.locator('h1', { hasText: /Quotations/i }).first()).toBeVisible({ timeout: 10000 });

    // Verify quotation cards or table exist
    await expect(page.locator('text=Total Quoted Value').first()).toBeVisible();
    
    // Verify Create Quotation button exists
    const createBtn = page.locator('button', { hasText: /Create Quotation/i }).first();
    await expect(createBtn).toBeVisible();
  });

  test('3. Tax Invoices list displays generated GST invoices', async ({ page }) => {
    await page.goto('/admin/finance/invoices');

    // Check heading
    await expect(page.locator('h1', { hasText: /Invoices & Payments/i })).toBeVisible({ timeout: 10000 });

    // Verify invoice table renders
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('4. Finance Summary page loads revenue overview metrics', async ({ page }) => {
    await page.goto('/admin/finance/summary');

    // Check heading
    await expect(page.locator('h1', { hasText: /Finance Summary/i })).toBeVisible({ timeout: 10000 });

    // Verify summary metric cards
    await expect(page.locator('text=Total Revenue').first()).toBeVisible();
  });

  test('5. Expenses Page verification (Documented Known Gap)', async ({ page }) => {
    await page.goto('/admin/finance/expenses');

    // Check heading
    await expect(page.locator('h1', { hasText: /Expenses Management/i })).toBeVisible({ timeout: 10000 });

    // Verify table renders client-side entries safely without crashing
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });
});
