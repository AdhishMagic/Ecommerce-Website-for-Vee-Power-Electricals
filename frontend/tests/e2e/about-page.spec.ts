import { test, expect } from '@playwright/test';

test.describe('About Page E2E & Responsive Tests', () => {
  test('1. About page loads with Hero, Overview, Statistics, Strengths, Brands, Info & CTA', async ({ page }) => {
    await page.goto('/about');

    // Hero section
    await expect(page.locator('h1', { hasText: 'About Vee Power Electricals' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Your Trusted Electrical Partner')).toBeVisible();
    await expect(page.locator('a', { hasText: 'Explore Products' }).first()).toBeVisible();
    await expect(page.locator('a', { hasText: 'Contact Us' }).first()).toBeVisible();

    // Overview section
    await expect(page.locator('h2', { hasText: 'Who We Are' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Mission & Vision' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Our Mission' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Our Vision' })).toBeVisible();

    // Statistics section
    await expect(page.locator('text=Years Experience').first()).toBeVisible();
    await expect(page.locator('text=10,000+').first()).toBeVisible();

    // Business Strengths section
    await expect(page.locator('h2', { hasText: 'Built on Quality & Customer Trust' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Genuine Products' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Trusted Brands' })).toBeVisible();

    // Brand Partnerships section
    await expect(page.locator('h2', { hasText: 'Leading Brand Partnerships' })).toBeVisible();
    await expect(page.locator('a[aria-label*="Havells"]').first()).toBeVisible();

    // Official Business Details section
    await expect(page.locator('h2', { hasText: 'Official Business Details' })).toBeVisible();
    await expect(page.locator('text=33CKXPK4525R1Z9').first()).toBeVisible();

    // Commercial CTA section
    await expect(page.locator('h2', { hasText: 'Looking for Reliable Electrical Products?' })).toBeVisible();
  });

  test('2. CTA action buttons navigate to correct routes', async ({ page }) => {
    await page.goto('/about');

    // Hero Explore Products link
    await page.locator('a', { hasText: 'Explore Products' }).first().click();
    await expect(page).toHaveURL(/.*shop.*/);

    // Return to /about
    await page.goto('/about');

    // CTA Contact Us link
    await page.locator('a', { hasText: 'Contact Us' }).first().click();
    await expect(page).toHaveURL(/.*contact.*/);
  });

  test('3. Responsive layout test at mobile, tablet & desktop viewports', async ({ page }) => {
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
      await page.goto('/about');
      await expect(page.locator('h1', { hasText: 'About Vee Power Electricals' })).toBeVisible();

      // Verify no horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);
    }
  });
});
