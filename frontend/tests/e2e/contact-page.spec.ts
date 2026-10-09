import { test, expect } from '@playwright/test';

test.describe('Contact Page E2E & Responsive Tests', () => {
  test('1. Contact page loads with Hero, Visit Us, Call Us, Email Us, and Message Form', async ({ page }) => {
    await page.goto('/contact');

    // Page header
    await expect(page.locator('h1', { hasText: 'Contact Us' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=product enquiries, bulk orders')).toBeVisible();

    // Contact info cards
    await expect(page.locator('h3', { hasText: 'Visit Us' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Call Us' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Email Us' })).toBeVisible();

    // Verify links
    const telLink1 = page.locator('a[href="tel:+918610359797"]').first();
    await expect(telLink1).toBeVisible();

    const mailLink = page.locator('a[href="mailto:veepower.cbe@gmail.com"]').first();
    await expect(mailLink).toBeVisible();

    const directionsLink = page.locator('a[aria-label="Get directions on Google Maps"]');
    await expect(directionsLink).toBeVisible();

    // Form title
    await expect(page.locator('h2', { hasText: 'Send a Message' })).toBeVisible();
  });

  test('2. Form validation displays errors for missing required fields', async ({ page }) => {
    await page.goto('/contact');

    // Click submit without filling form
    const submitBtn = page.getByRole('button', { name: 'Send Message' });
    await submitBtn.click();

    // Required field validation messages should be displayed
    await expect(page.locator('text=Full name is required.')).toBeVisible();
    await expect(page.locator('text=Phone number is required.')).toBeVisible();
    await expect(page.locator('text=Please select a subject for your enquiry.')).toBeVisible();
    await expect(page.locator('text=Message content is required.')).toBeVisible();
  });

  test('3. Valid form submission sends payload and displays success confirmation', async ({ page }) => {
    await page.goto('/contact');

    // Fill form
    await page.fill('#contact-name', 'Test Customer');
    await page.fill('#contact-phone', '+919876543210');
    await page.fill('#contact-email', 'testcustomer@example.com');
    await page.selectOption('#contact-subject', 'Product Inquiry');
    await page.fill('#contact-message', 'Hello, I would like to inquire about bulk pricing for modular switches.');

    // Mock API response
    await page.route('**/api/v1/inquiries/', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 999,
          name: 'Test Customer',
          email: 'testcustomer@example.com',
          phone: '+919876543210',
          subject: 'Product Inquiry',
          message: 'Hello, I would like to inquire about bulk pricing for modular switches.',
          status: 'New',
          created_at: new Date().toISOString(),
        }),
      });
    });

    const submitBtn = page.getByRole('button', { name: 'Send Message' });
    await submitBtn.click();

    // Success banner should appear
    await expect(page.locator('text=Message Submitted Successfully!')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Our support team will get back to you')).toBeVisible();

    // Clicking "Send Another Message" resets form
    const resetBtn = page.locator('button', { hasText: 'Send Another Message' });
    await resetBtn.click();

    await expect(page.locator('#contact-name')).toBeVisible();
  });

  test('4. Responsive layout test across mobile, tablet & desktop viewports', async ({ page }) => {
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
      await page.goto('/contact');
      await expect(page.locator('h1', { hasText: 'Contact Us' })).toBeVisible();

      // Ensure no horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);
    }
  });
});
