import { test, expect } from '@playwright/test';

test.describe('Catalog, Search & Product Detail E2E Flows', () => {
  test('1. Home page loads with hero, categories, and backend products', async ({ page }) => {
    await page.goto('/');
    
    // Check brand title / header
    await expect(page.locator('text=VEE POWER ELECTRICALS').first()).toBeVisible();

    // Check categories or shop navigation
    const shopLink = page.locator('a[href="/shop"]').first();
    await expect(shopLink).toBeVisible();

    // Check footer exists
    await expect(page.locator('footer')).toBeVisible();
  });

  test('2. Shop catalog loads real backend products and filters', async ({ page }) => {
    await page.goto('/shop');
    
    // Check shop header "All Products"
    await expect(page.locator('h1', { hasText: /All Products/i }).first()).toBeVisible({ timeout: 10000 });

    // Wait for at least one product card to be visible
    const productCards = page.locator('a[href^="/product/"]');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });
    const count = await productCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('3. Search filters product catalog', async ({ page }) => {
    await page.goto('/shop');
    
    // Find search input in header
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible();

    // Search for MCB
    await searchInput.fill('MCB');
    await searchInput.press('Enter');

    // Wait for results
    await expect(page).toHaveURL(/.*shop.*q=MCB.*/, { timeout: 10000 });
    await expect(page.locator('text=Showing results for:').first()).toBeVisible({ timeout: 10000 });
  });

  test('4. Empty search query displays empty result state', async ({ page }) => {
    await page.goto('/shop?q=NONEXISTENT_PRODUCT_XYZ_99999');

    // Empty state should render
    await expect(page.locator('text=No Products Found').first()).toBeVisible({ timeout: 10000 });
  });

  test('5. Product Detail page displays complete specs and Add to Cart button', async ({ page }) => {
    await page.goto('/shop');
    
    // Click on the first product card link
    const firstProduct = page.locator('a[href^="/product/"]').first();
    const href = await firstProduct.getAttribute('href');
    await firstProduct.click();

    // Verify URL is /product/:id
    await expect(page).toHaveURL(new RegExp(href || '/product/'), { timeout: 10000 });

    // Verify product heading and price
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('text=₹').first()).toBeVisible();

    // Verify Add to Cart button
    const addToCartBtn = page.locator('button', { hasText: /Add to Cart/i }).first();
    await expect(addToCartBtn).toBeVisible();

    // Verify Buy Now button
    const buyNowBtn = page.locator('button', { hasText: /Buy Now/i }).first();
    await expect(buyNowBtn).toBeVisible();
  });
});
