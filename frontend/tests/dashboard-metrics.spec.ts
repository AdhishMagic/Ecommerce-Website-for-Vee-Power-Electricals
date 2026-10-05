import { test, expect, Page, APIRequestContext } from '@playwright/test';

/**
 * Admin Dashboard data-accuracy suite.
 *
 * Every assertion compares what the dashboard renders with the authoritative value
 * returned by the backend API, so the suite stays valid as the database changes.
 */

const API_BASE = 'http://localhost:8000/api/v1';
const ADMIN_CREDENTIALS = { email: 'admin@veepower.in', password: 'AdminPass123!' };

const numberFromCurrency = (text: string | null): number => {
  if (!text || text.includes('—')) return NaN;
  return Number(text.replace(/[^0-9.]/g, ''));
};

async function loginAdminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/login/`, { data: ADMIN_CREDENTIALS });
  expect(res.ok(), 'admin login must succeed for dashboard tests').toBeTruthy();
  const body = await res.json();
  return body.access as string;
}

async function fetchSummary(request: APIRequestContext, token: string, filterType: string) {
  const res = await request.get(`${API_BASE}/finance/summary/?filter_type=${filterType}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `summary API must answer for filter ${filterType}`).toBeTruthy();
  return res.json();
}

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

test.describe('Admin Dashboard authoritative metrics', () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    token = await establishAdminSession(page, request);
  });

  test('1. Renders KPI values that match the authoritative backend summary', async ({ page, request }) => {
    const summary = await fetchSummary(request, token, '30_days');

    await page.goto('/admin');
    await expect(page.getByTestId('kpi-open-orders')).toBeVisible({ timeout: 20000 });

    await expect(page.getByTestId('kpi-open-orders')).toHaveText(summary.open_orders_count.toLocaleString('en-IN'));
    await expect(page.getByTestId('kpi-confirmed-orders')).toHaveText(summary.confirmed_orders_count.toLocaleString('en-IN'));
    await expect(page.getByTestId('kpi-out-for-delivery')).toHaveText(summary.out_for_delivery_count.toLocaleString('en-IN'));
    await expect(page.getByTestId('kpi-returns')).toHaveText(summary.returns_count.toLocaleString('en-IN'));

    expect(numberFromCurrency(await page.getByTestId('kpi-total-sales').textContent())).toBe(Number(summary.total_sales));
    expect(numberFromCurrency(await page.getByTestId('kpi-total-invoiced').textContent())).toBe(Number(summary.total_invoiced));
    expect(numberFromCurrency(await page.getByTestId('kpi-total-outstanding').textContent())).toBe(Number(summary.total_outstanding));
    expect(numberFromCurrency(await page.getByTestId('kpi-b2b-outstanding').textContent())).toBe(Number(summary.b2b_outstanding));
    expect(await page.getByTestId('delivery-active-shipments').textContent()).toBe(
      summary.out_for_delivery_count.toLocaleString('en-IN')
    );

    // Open Orders is a whole-database count, never the length of the recent-orders page.
    const ordersPage = await request.get(`${API_BASE}/orders/?page_size=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ordersJson = await ordersPage.json();
    await expect(page.getByTestId('recent-order-row')).toHaveCount(Math.min(5, ordersJson.count));
    expect(Number(summary.open_orders_count)).toBeLessThanOrEqual(Number(summary.total_orders_count));
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
    // The table itself must stay a small page, not the whole database.
    await expect(page.getByTestId('recent-order-row')).toHaveCount(Math.min(5, ordersJson.count));
    expect(ordersJson.count).toBeGreaterThan(5);
  });

  test('3. Period filters update every date-scoped metric from the same filter state', async ({ page, request }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('kpi-total-invoiced')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('dashboard-period')).toContainText('30_days');

    // 30 days is a rolling window, never the current calendar month.
    const rolling = await fetchSummary(request, token, '30_days');
    expect(numberFromCurrency(await page.getByTestId('kpi-total-sales').textContent())).toBe(Number(rolling.total_sales));

    await page.getByTestId('dashboard-filter-all_time').click();
    await expect(page.getByTestId('dashboard-period')).toContainText('all time');
    const allTime = await fetchSummary(request, token, 'all_time');
    expect(numberFromCurrency(await page.getByTestId('kpi-total-invoiced').textContent())).toBe(Number(allTime.total_invoiced));
    expect(numberFromCurrency(await page.getByTestId('kpi-total-sales').textContent())).toBe(Number(allTime.total_sales));

    await page.getByTestId('dashboard-filter-current_month').click();
    await expect(page.getByTestId('dashboard-period')).toContainText('current_month');
    const currentMonth = await fetchSummary(request, token, 'current_month');
    expect(numberFromCurrency(await page.getByTestId('kpi-total-invoiced').textContent())).toBe(Number(currentMonth.total_invoiced));
    expect(numberFromCurrency(await page.getByTestId('kpi-total-sales').textContent())).toBe(Number(currentMonth.total_sales));

    await page.getByTestId('dashboard-filter-previous_month').click();
    await expect(page.getByTestId('dashboard-period')).toContainText('previous_month');
    const previousMonth = await fetchSummary(request, token, 'previous_month');
    expect(numberFromCurrency(await page.getByTestId('kpi-total-invoiced').textContent())).toBe(Number(previousMonth.total_invoiced));

    await page.getByTestId('dashboard-filter-today').click();
    await expect(page.getByTestId('dashboard-period')).toContainText('today');
    const todaySummary = await fetchSummary(request, token, 'today');
    expect(numberFromCurrency(await page.getByTestId('kpi-total-invoiced').textContent())).toBe(Number(todaySummary.total_invoiced));
    // Snapshot metrics stay complete-database values for every filter.
    expect(numberFromCurrency(await page.getByTestId('kpi-total-outstanding').textContent())).toBe(
      Number(todaySummary.total_outstanding)
    );
  });

  test('4. Revenue graph renders backend trend months including zero-value months', async ({ page, request }) => {
    const summary = await fetchSummary(request, token, '30_days');
    await page.goto('/admin');
    await expect(page.getByTestId('kpi-total-sales')).toBeVisible({ timeout: 20000 });

    const tickLabels = page.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value');
    await expect(tickLabels.first()).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => tickLabels.count()).toBe(summary.monthly_trend.length);
    const chartLabels = await tickLabels.allTextContents();
    for (const trend of summary.monthly_trend) {
      expect(chartLabels).toContain(trend.month);
    }
    // Zero-revenue months are drawn, not skipped.
    const zeroMonths = summary.monthly_trend.filter((entry: any) => Number(entry.revenue) === 0);
    if (zeroMonths.length > 0) {
      expect(chartLabels).toContain(zeroMonths[0].month);
    }
  });

  test('5. Loading state shows a skeleton instead of false zero values', async ({ page }) => {
    await page.route('**/api/v1/finance/summary/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto('/admin');
    await expect(page.getByTestId('dashboard-loading')).toBeVisible();
    await expect(page.getByTestId('kpi-total-sales')).toHaveCount(0);
    await expect(page.getByTestId('view-all-orders')).toHaveCount(0);

    // Real metrics replace the skeleton once the backend answers.
    await expect(page.getByTestId('kpi-total-sales')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('dashboard-loading')).toHaveCount(0);
  });

  test('6. Backend failure surfaces an explicit error and never fake zero metrics', async ({ page }) => {
    await page.route('**/api/v1/finance/summary/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Synthetic dashboard failure' }),
      })
    );

    await page.goto('/admin');
    await expect(page.getByTestId('dashboard-error')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('dashboard-error')).toContainText(/Unable to Load Dashboard|Refresh failed/);
    await expect(page.getByTestId('kpi-total-sales')).toHaveCount(0);
    await expect(page.getByTestId('kpi-open-orders')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-loading')).toHaveCount(0);
  });

  test('7. Refresh failure keeps the last authoritative values visible and flags the error', async ({ page, request }) => {
    const summary = await fetchSummary(request, token, '30_days');
    await page.goto('/admin');
    await expect(page.getByTestId('kpi-total-invoiced')).toBeVisible({ timeout: 20000 });

    const invoicedBefore = await page.getByTestId('kpi-total-invoiced').textContent();
    expect(numberFromCurrency(invoicedBefore)).toBe(Number(summary.total_invoiced));

    await page.route('**/api/v1/finance/summary/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Backend temporarily unavailable' }),
      })
    );

    await page.getByTitle('Refresh Live Data').click();

    // The failure is explicit and the previously loaded authoritative value stays visible.
    await expect(page.getByTestId('dashboard-error')).toContainText('Refresh failed');
    await expect(page.getByTestId('kpi-total-invoiced')).toHaveText(invoicedBefore as string);
  });
});
