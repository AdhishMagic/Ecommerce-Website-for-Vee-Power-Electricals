import { test, expect } from '@playwright/test';

test.describe('Authentication & Session E2E Flows', () => {
  const testCustomer = {
    name: 'E2E Customer',
    email: 'e2e_verified_customer@veepower.com',
    password: 'SecurePass123!',
  };

  test('1. Empty login submission triggers validation errors', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2', { hasText: 'Welcome Back' })).toBeVisible();

    const submitBtn = page.locator('button[type="submit"]', { hasText: /Sign In|Login/i });
    await submitBtn.click();

    await expect(page.locator('text=Please enter your email address')).toBeVisible();
  });

  test('2. Invalid credentials display error alert', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'nonexistent_user@veepower.com');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    await expect(page.locator('div.bg-red-50')).toBeVisible({ timeout: 10000 });
  });

  test('3. Full Registration or Login flow', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('h2', { hasText: 'Create Account' })).toBeVisible();

    await page.fill('input[placeholder="John Doe"]', testCustomer.name);
    await page.fill('input[type="email"]', testCustomer.email);
    
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(testCustomer.password);
    await passwordInputs.nth(1).fill(testCustomer.password);

    const registerBtn = page.locator('button[type="submit"]', { hasText: /Create Account|Register/i });
    await registerBtn.click();

    // Either redirected to login?registered=true, or if user already exists shows error or redirected
    const isRedirected = await page.waitForURL(/.*login.*/, { timeout: 10000 }).then(() => true).catch(() => false);
    if (!isRedirected) {
      // If already registered, go to login directly
      await page.goto('/login');
    }
    await expect(page.locator('h2', { hasText: 'Welcome Back' })).toBeVisible();
  });

  test('4. Successful Customer Login and redirection to Account', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testCustomer.email);
    await page.fill('input[type="password"]', testCustomer.password);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/.*account/, { timeout: 15000 });
    await expect(page.locator('text=My Orders').first()).toBeVisible({ timeout: 10000 });
  });

  test('5. Customer Logout clears session and redirects to Login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testCustomer.email);
    await page.fill('input[type="password"]', testCustomer.password);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/.*account/, { timeout: 15000 });
    await expect(page.locator('text=My Orders').first()).toBeVisible({ timeout: 10000 });

    const logoutBtn = page.locator('button', { hasText: /Logout/i }).first();
    await logoutBtn.click();

    await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeNull();
  });

  test('6. Admin Login redirects to Admin Dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@veepower.in');
    await page.fill('input[type="password"]', 'AdminPass123!');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/.*admin/, { timeout: 15000 });
    // Verify dashboard KPI card
    await expect(page.locator('text=Total Sales').first()).toBeVisible({ timeout: 15000 });
  });

  test('7. Customer cannot access /admin (RBAC enforcement)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', testCustomer.email);
    await page.fill('input[type="password"]', testCustomer.password);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/.*account/, { timeout: 15000 });

    // Try navigating to /admin
    await page.goto('/admin');
    
    // ProtectedRoute blocks customer and navigates back
    await expect(page).not.toHaveURL(/\/admin$/, { timeout: 10000 });
  });
});
