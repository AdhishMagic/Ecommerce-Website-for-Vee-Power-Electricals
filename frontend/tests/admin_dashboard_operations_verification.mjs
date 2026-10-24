import { chromium } from '@playwright/test';

const API_BASE = 'http://localhost:8000/api/v1';
const FRONTEND_BASE = 'http://localhost:5173';
const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'admin@veepower.in',
  password: process.env.ADMIN_PASSWORD || 'AdminPass123!',
};

async function runDashboardVerification() {
  console.log('🚀 Starting Admin Dashboard Operational Verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate as Admin
    console.log('\n--- 1. Admin Authentication ---');
    const authRes = await fetch(`${API_BASE}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN_CREDENTIALS),
    });
    const authData = await authRes.json();
    assert(Boolean(authData.access), 'Admin login successful and returned JWT access token');

    // Fetch authoritative operational summary from backend
    const opRes = await fetch(`${API_BASE}/orders/operational-summary/`, {
      headers: { Authorization: `Bearer ${authData.access}` },
    });
    const opData = await opRes.json();
    console.log('Backend operational summary:', opData);
    assert(opRes.status === 200, 'GET /api/v1/orders/operational-summary/ returned 200 OK');

    // Set auth tokens in browser session
    await page.goto(`${FRONTEND_BASE}/`);
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

    // 2. Load Admin Dashboard
    console.log('\n--- 2. Admin Dashboard Verification ---');
    await page.goto(`${FRONTEND_BASE}/admin`, { waitUntil: 'networkidle' });

    // Verify REMOVAL of Revenue / Financial Elements
    console.log('Verifying removal of financial elements:');
    const totalSalesKpi = await page.locator('[data-testid="kpi-total-sales"]').count();
    assert(totalSalesKpi === 0, 'Total Sales KPI card is completely removed (count 0)');

    const totalInvoicedKpi = await page.locator('[data-testid="kpi-total-invoiced"]').count();
    assert(totalInvoicedKpi === 0, 'Total Invoiced KPI card is completely removed (count 0)');

    const totalOutstandingKpi = await page.locator('[data-testid="kpi-total-outstanding"]').count();
    assert(totalOutstandingKpi === 0, 'Total Outstanding KPI card is completely removed (count 0)');

    const b2bOutstandingKpi = await page.locator('[data-testid="kpi-b2b-outstanding"]').count();
    assert(b2bOutstandingKpi === 0, 'B2B Outstanding KPI card is completely removed (count 0)');

    const revenueOverviewHeading = await page.locator('text=Revenue Overview').count();
    assert(revenueOverviewHeading === 0, 'Revenue Overview chart heading is completely removed (count 0)');

    const rechartsArea = await page.locator('.recharts-area').count();
    assert(rechartsArea === 0, 'Revenue AreaChart SVG element is completely removed (count 0)');

    const filterPills = await page.locator('[data-testid^="dashboard-filter-"]').count();
    assert(filterPills === 0, 'Revenue date-range filter pills are completely removed (count 0)');

    // Verify PRESENCE and ACCURACY of Operational Widgets
    console.log('\nVerifying operational KPI cards and pipeline:');
    const openOrders = await page.locator('[data-testid="kpi-open-orders"]').textContent();
    assert(
      Number(openOrders?.trim()) === opData.open_orders_count,
      `Open Orders KPI matches backend count: ${openOrders?.trim()} === ${opData.open_orders_count}`
    );

    const confirmedOrders = await page.locator('[data-testid="kpi-confirmed-orders"]').textContent();
    assert(
      Number(confirmedOrders?.trim()) === opData.confirmed_orders_count,
      `Confirmed Orders KPI matches backend count: ${confirmedOrders?.trim()} === ${opData.confirmed_orders_count}`
    );

    const outForDelivery = await page.locator('[data-testid="kpi-out-for-delivery"]').textContent();
    assert(
      Number(outForDelivery?.trim()) === opData.out_for_delivery_count,
      `Out for Delivery KPI matches backend count: ${outForDelivery?.trim()} === ${opData.out_for_delivery_count}`
    );

    const returnsCount = await page.locator('[data-testid="kpi-returns"]').textContent();
    assert(
      Number(returnsCount?.trim()) === opData.returns_count,
      `Returns KPI matches backend count: ${returnsCount?.trim()} === ${opData.returns_count}`
    );

    const activeShipments = await page.locator('[data-testid="delivery-active-shipments"]').textContent();
    assert(
      Number(activeShipments?.trim()) === opData.out_for_delivery_count,
      `Delivery Hubs active shipments matches out_for_delivery count: ${activeShipments?.trim()}`
    );

    const pipelineHeading = await page.locator('h2:has-text("Fulfillment Pipeline")').count();
    assert(pipelineHeading > 0, 'Fulfillment Pipeline section is rendered');

    // 3. Verify Recent Orders Table
    console.log('\n--- 3. Recent Orders Table Verification ---');
    const viewAllOrders = await page.locator('[data-testid="view-all-orders"]').count();
    assert(viewAllOrders > 0, '"View all orders" link is present and visible');

    if (opData.total_orders_count === 0) {
      const emptyMsg = await page.locator('text=No customer orders recorded yet.').count();
      assert(emptyMsg > 0, 'Empty state "No customer orders recorded yet." is visible when orders=0');
      assert(openOrders?.trim() === "0", 'Open orders counter is explicitly 0');
      assert(confirmedOrders?.trim() === "0", 'Confirmed orders counter is explicitly 0');
      assert(outForDelivery?.trim() === "0", 'Out for delivery counter is explicitly 0');
      assert(returnsCount?.trim() === "0", 'Returns counter is explicitly 0');
      assert(activeShipments?.trim() === "0", 'Active shipments counter is explicitly 0');
    } else {
      const recentOrderRows = await page.locator('[data-testid="recent-order-row"]');
      const orderRowsCount = await recentOrderRows.count();
      assert(orderRowsCount > 0, `Recent Orders table rendered ${orderRowsCount} order rows`);

      // Verify no monetary symbols (₹) in recent orders table
      const tableText = await page.locator('table').textContent();
      const hasRupee = tableText?.includes('₹');
      assert(!hasRupee, 'Recent Orders table contains no monetary currency symbols (replaced with item counts)');
    }

    // 4. Verify Refresh Button
    console.log('\n--- 4. Refresh Button Interaction ---');
    const refreshBtn = page.locator('[data-testid="dashboard-refresh-btn"]');
    assert(await refreshBtn.count() > 0, 'Dashboard refresh button is present');
    await refreshBtn.click();
    await page.waitForTimeout(300);
    assert(await page.locator('[data-testid="kpi-open-orders"]').isVisible(), 'Dashboard reloaded cleanly after refresh click');

    // 5. Verify Products and Categories Administrative Pages
    console.log('\n--- 5. Products & Categories Admin Verification ---');
    await page.goto(`${FRONTEND_BASE}/admin/products`, { waitUntil: 'networkidle' });
    const productRows = await page.locator('table tr, [data-testid^="product-"]').count();
    assert(productRows > 0, 'Admin Products page loaded successfully with products');

    await page.goto(`${FRONTEND_BASE}/admin/categories`, { waitUntil: 'networkidle' });
    const categoryRows = await page.locator('table tr, [data-testid^="category-"], .card, h3').count();
    assert(categoryRows > 0, 'Admin Categories page loaded successfully with categories');

    // 6. Verify Storefront Pages
    console.log('\n--- 6. Customer Storefront Verification ---');
    await page.goto(`${FRONTEND_BASE}/shop`, { waitUntil: 'networkidle' });
    const shopProducts = await page.locator('a[href^="/product/"]').count();
    assert(shopProducts > 0, `Customer Shop page loaded ${shopProducts} products`);

    await page.goto(`${FRONTEND_BASE}/categories`, { waitUntil: 'networkidle' });
    const categoryCards = await page.locator('a[href*="/shop?category="]').count();
    assert(categoryCards > 0, `Customer Categories page loaded ${categoryCards} category cards`);

    // 7. Responsive Viewport Audit
    console.log('\n--- 7. Responsive Viewport & Overflow Audit ---');
    await page.goto(`${FRONTEND_BASE}/admin`, { waitUntil: 'networkidle' });
    const viewports = [
      { name: 'Desktop (1280px)', width: 1280, height: 800 },
      { name: 'Tablet (768px)', width: 768, height: 1024 },
      { name: 'Mobile (375px)', width: 375, height: 812 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      assert(!isOverflowing, `[${vp.name}] Zero horizontal page overflow`);
    }

  } catch (err) {
    console.error('❌ Verification script exception:', err);
    failed++;
  } finally {
    await browser.close();
    console.log('\n========================================');
    console.log(`SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('========================================');
    if (failed > 0) process.exit(1);
  }
}

runDashboardVerification();
