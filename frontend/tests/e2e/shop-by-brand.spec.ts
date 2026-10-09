import { test, expect } from '@playwright/test';

test.describe('Shop by Brand Page E2E & Responsive Tests', () => {
  test('1. Shop by Brand page loads with header, logo cards, count badge & search', async ({ page }) => {
    await page.goto('/shop?view=brands');

    // Heading and supporting text
    await expect(page.locator('h1', { hasText: 'Shop by Brand' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Explore trusted electrical brands')).toBeVisible();
    await expect(page.locator('text=Authorized Brands')).toBeVisible();

    // Brand cards check
    const cards = page.locator('a[aria-label^="Explore products from"]');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(5);

    // Verify key brand names exist
    await expect(page.locator('h3', { hasText: 'Anchor' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Havells' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Polycab' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Finolex' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Crompton' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Schneider Electric' })).toBeVisible();

    // Verify product count text format (e.g., "0 products" or "1 product" or "2 products")
    await expect(page.locator('text=/\\d+ product(s)?/i').first()).toBeVisible();

    // Verify Explore Products CTA
    await expect(page.locator('text=Explore Products').first()).toBeVisible();
  });

  test('2. Brand search filters brands list', async ({ page }) => {
    await page.goto('/shop?view=brands');

    const searchInput = page.locator('#brand-search-input');
    await expect(searchInput).toBeVisible();

    // Search for Finolex
    await searchInput.fill('Finolex');

    // Finolex should remain visible, Anchor should disappear
    await expect(page.locator('h3', { hasText: 'Finolex' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Anchor' })).not.toBeVisible();

    // Clear search
    const clearBtn = page.locator('button[aria-label="Clear search"]');
    await clearBtn.click();
    await expect(page.locator('h3', { hasText: 'Anchor' })).toBeVisible();
  });

  test('3. Empty search result shows empty state with clear search button', async ({ page }) => {
    await page.goto('/shop?view=brands');

    const searchInput = page.locator('#brand-search-input');
    await searchInput.fill('NonExistentBrand12345');

    await expect(page.locator('text=No brands found')).toBeVisible();
    const clearBtn = page.locator('button', { hasText: 'Clear Search' });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    await expect(page.locator('h3', { hasText: 'Havells' })).toBeVisible();
  });

  test('4. Brand card click navigates to brand-filtered shop route', async ({ page }) => {
    await page.goto('/shop?view=brands');

    const havellsCard = page.locator('a[aria-label*="Havells"]').first();
    await havellsCard.click();

    await expect(page).toHaveURL(/.*shop.*brand=havells.*/i, { timeout: 10000 });
  });

  test('5. Responsive layout verification at mobile, tablet, desktop viewports', async ({ page }) => {
    const viewports = [
      { width: 320, height: 600 },
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1920, height: 1080 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/shop?view=brands');
      await expect(page.locator('h1', { hasText: 'Shop by Brand' })).toBeVisible();
      
      // Ensure horizontal overflow does not occur
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test('6. Direct /brands route renders the Shop by Brand page', async ({ page }) => {
    await page.goto('/brands');

    await expect(page.locator('h1', { hasText: 'Shop by Brand' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Havells' })).toBeVisible();
  });
});
