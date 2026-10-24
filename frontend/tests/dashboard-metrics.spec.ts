import { test, expect, Page, APIRequestContext } from '@playwright/test';

/**
 * Admin Dashboard authoritative operational metrics suite.
 *
 * Verifies that the Admin Dashboard renders purely operational metrics
 * (Open Orders, Confirmed Orders, Out for Delivery, Returns, Delivery Hubs, Recent Orders)
 * and confirms that all revenue/monetary reporting widgets have been removed.
 */

const API_BASE = 'http://localhost:8000/api/v1';
const ADMIN_CREDENTIALS = { email: 'admin@veepower.in', password: 'AdminPass123!' };

async function establishAdminSession(page: Page, request: APIRequestContext) {
  const res = await request.post(`${API_BASE}/auth/login/`, { data: ADMIN_CREDENTIALS });
  const authData = await res.json();
  await page.goto('/');
  await page.evaluate((data) => {
    localStorage.setItem('auth_access_token', data.access);
    localStorage.setItem('auth_token', data.access);
    localStorage.setItem('vp_token', data.access);
    sessionStorage.setItem('vp_token', data.access);
    const userObj = {
      id: data.user.id,
      name: `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || data.user.email,
      email: data.user.email,
      role: 'admin',
      is_admin: true,
    };
    localStorage.setItem('vp_user', JSON.stringify(userObj));
    sessionStorage.setItem('vp_user', JSON.stringify(userObj));
  }, authData);
  return authData.access as string;
}

test.describe('Admin Dashboard authoritative operational metrics', () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    token = await establishAdminSession(page, request);
  });

  test('1. Renders operational KPI values and confirms revenue cards are removed', async ({ page, request }) => {
    const opRes = await request.get(`${API_BASE}/orders/operational-summary/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(opRes.ok(), 'operational summary endpoint must succeed').toBeTruthy();
    const opSummary = await opRes.json();

    await page.goto('/admin');
    await expect(page.getByTestId('kpi-open-orders')).toBeVisible({ timeout: 20000 });

    // Operational metrics match backend authoritative numbers
    await expect(page.getByTestId('kpi-open-orders')).toHaveText(opSummary.open_orders_count.toLocaleString('en-IN'));
    await expect(page.getByTestId('kpi-confirmed-orders')).toHaveText(opSummary.confirmed_orders_count.toLocaleString('en-IN'));
    await expect(page.getByTestId('kpi-out-for-delivery')).toHaveText(opSummary.out_for_delivery_count.toLocaleString('en-IN'));
    await expect(page.getByTestId('kpi-returns')).toHaveText(opSummary.returns_count.toLocaleString('en-IN'));
    await expect(page.getByTestId('delivery-active-shipments')).toHaveText(
      opSummary.out_for_delivery_count.toLocaleString('en-IN')
    );

    // Revenue KPI cards are completely removed
    await expect(page.getByTestId('kpi-total-sales')).toHaveCount(0);
    await expect(page.getByTestId('kpi-total-invoiced')).toHaveCount(0);
    await expect(page.getByTestId('kpi-total-outstanding')).toHaveCount(0);
    await expect(page.getByTestId('kpi-b2b-outstanding')).toHaveCount(0);
    await expect(page.locator('text=Revenue Overview')).toHaveCount(0);

    // Open Orders is a whole-database count, never the length of the recent-orders page.
    const ordersPage = await request.get(`${API_BASE}/orders/?page_size=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ordersJson = await ordersPage.json();
    await expect(page.getByTestId('recent-order-row')).toHaveCount(Math.min(5, ordersJson.count));
    expect(Number(opSummary.open_orders_count)).toBeLessThanOrEqual(Number(opSummary.total_orders_count));
  });

  test('2. View all link and recent orders table use backend pagination metadata', async ({ page, request }) => {
    const ordersPage = await request.get(`${API_BASE}/orders/?page_size=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ordersJson = await ordersPage.json();

    await page.goto('/admin');
    await expect(page.getByTestId('view-all-orders')).toBeVisible({ timeout: 20000 });

    await expect(page.getByTestId('view-all-orders')).toHaveText(
      `View all (${ordersJson.count.toLocaleString('en-IN')})`
    );
    // The table itself stays a small page, not the whole database.
    await expect(page.getByTestId('recent-order-row')).toHaveCount(Math.min(5, ordersJson.count));
  });

  test('3. Fulfillment pipeline renders operational stages', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('kpi-open-orders')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('h2:has-text("Fulfillment Pipeline")')).toBeVisible();
    await expect(page.locator('text=Pending Intake').first()).toBeVisible();
    await expect(page.locator('text=Packed & Staged').first()).toBeVisible();
    await expect(page.locator('text=Delivery Hubs').first()).toBeVisible();
  });

  test('4. Loading state shows a skeleton instead of false zero values', async ({ page }) => {
    await page.route('**/api/v1/orders/operational-summary/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto('/admin');
    await expect(page.getByTestId('dashboard-loading')).toBeVisible();
    await expect(page.getByTestId('kpi-open-orders')).toHaveCount(0);
    await expect(page.getByTestId('view-all-orders')).toHaveCount(0);

    // Real metrics replace the skeleton once the backend answers.
    await expect(page.getByTestId('kpi-open-orders')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('dashboard-loading')).toHaveCount(0);
  });

  test('5. Backend failure surfaces an explicit error and never fake zero metrics', async ({ page }) => {
    await page.route('**/api/v1/orders/operational-summary/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Synthetic dashboard failure' }),
      })
    );

    await page.goto('/admin');
    await expect(page.getByTestId('dashboard-error')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('dashboard-error')).toContainText(/Unable to Load Dashboard|Refresh failed/);
    await expect(page.getByTestId('kpi-open-orders')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-loading')).toHaveCount(0);
  });

  test('6. Refresh failure keeps the last authoritative values visible and flags the error', async ({ page, request }) => {
    const opRes = await request.get(`${API_BASE}/orders/operational-summary/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const opSummary = await opRes.json();

    await page.goto('/admin');
    await expect(page.getByTestId('kpi-open-orders')).toBeVisible({ timeout: 20000 });

    const openOrdersBefore = await page.getByTestId('kpi-open-orders').textContent();
    expect(Number(openOrdersBefore)).toBe(Number(opSummary.open_orders_count));

    await page.route('**/api/v1/orders/operational-summary/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Backend temporarily unavailable' }),
      })
    );

    await page.getByTitle('Refresh Live Data').click();

    // The failure is explicit and the previously loaded authoritative value stays visible.
    await expect(page.getByTestId('dashboard-error')).toContainText('Refresh failed');
    await expect(page.getByTestId('kpi-open-orders')).toHaveText(openOrdersBefore as string);
  });
});
