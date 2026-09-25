import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'Desktop 1920px', width: 1920, height: 1080 },
  { name: 'Desktop 1440px', width: 1440, height: 900 },
  { name: 'Desktop 1280px', width: 1280, height: 800 },
  { name: 'Tablet 1024px', width: 1024, height: 768 },
  { name: 'Tablet 768px', width: 768, height: 1024 },
  { name: 'Mobile 430px', width: 430, height: 932 },
  { name: 'Mobile 390px', width: 390, height: 844 },
  { name: 'Mobile 375px', width: 375, height: 667 },
];

test.describe('Responsive E2E Layout Validation', () => {
  for (const vp of VIEWPORTS) {
    test(`Verify layout integrity at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Home Page
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      let hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(hasOverflow).toBeFalsy();

      // 2. Catalog Page
      await page.goto('/catalog');
      await page.waitForLoadState('networkidle');
      hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(hasOverflow).toBeFalsy();

      // 3. Cart Page
      await page.goto('/cart');
      await page.waitForLoadState('networkidle');
      hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(hasOverflow).toBeFalsy();
    });
  }
});
