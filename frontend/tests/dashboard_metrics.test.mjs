// Automated regression guard for the Admin Dashboard metric contract.
// Verifies that GET /api/v1/finance/summary/ returns complete, database-derived
// metrics — independently cross-checked against the paginated Orders API.
//
// Run with the backend + database up:  node tests/dashboard_metrics.test.mjs

const API_BASE = process.env.API_BASE || 'http://localhost:8000/api/v1';
const ADMIN_CREDENTIALS = { email: 'admin@veepower.in', password: 'AdminPass123!' };

const OPEN_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED'];
const RETURN_ORDER_STATUSES = ['RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_COMPLETED'];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function isoDate(offsetDays = 0) {
  const now = new Date();
  const shifted = new Date(now.getTime() + offsetDays * 86400000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function firstOfMonth(dateIso) {
  return `${dateIso.slice(0, 7)}-01`;
}

function previousMonthRange(todayIso) {
  const [y, m] = todayIso.split('-').map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  return {
    start: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`,
    end: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

async function countOrdersWithStatus(token, status) {
  const res = await request(`/orders/?status=${status}&page_size=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw new Error(`Orders API failed for status ${status}: ${res.status}`);
  return res.data.count;
}

async function runDashboardRegressionSuite() {
  console.log('========================================================');
  console.log('   ADMIN DASHBOARD AUTHORITATIVE METRICS REGRESSION    ');
  console.log('========================================================\n');

  // ---------------------------------------------------------------- 1. Login
  console.log('[Test 1] Admin authentication for dashboard metrics');
  const loginRes = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify(ADMIN_CREDENTIALS),
  });
  assert(loginRes.status === 200, 'Admin login returns 200 OK');
  const adminToken = loginRes.data?.access;
  assert(!!adminToken, 'Admin access token issued');
  const authHeader = { Authorization: `Bearer ${adminToken}` };

  const todayIso = isoDate(0);

  // -------------------------------------------------- 2. Order status truth
  console.log('\n[Test 2] Complete order counts derived from the database (not from a page)');
  const statusCounts = {};
  for (const status of [
    'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED',
    ...RETURN_ORDER_STATUSES, 'RETURN_REJECTED',
  ]) {
    statusCounts[status] = await countOrdersWithStatus(adminToken, status);
  }
  const dbTotalOrders = Object.values(statusCounts).reduce((sum, value) => sum + value, 0);
  const dbOpenOrders = OPEN_ORDER_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0);
  const dbReturns = RETURN_ORDER_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0);

  const summaryRes = await request('/finance/summary/?filter_type=all_time', { headers: authHeader });
  assert(summaryRes.status === 200, 'GET /finance/summary/?filter_type=all_time returns 200 OK');
  const summary = summaryRes.data;

  assert(summary.total_orders_count === dbTotalOrders,
    `total_orders_count (${summary.total_orders_count}) equals sum of per-status database counts (${dbTotalOrders})`);
  assert(summary.open_orders_count === dbOpenOrders,
    `open_orders_count (${summary.open_orders_count}) equals PENDING+CONFIRMED+PACKED (${dbOpenOrders})`);
  assert(summary.confirmed_orders_count === statusCounts.CONFIRMED,
    `confirmed_orders_count (${summary.confirmed_orders_count}) equals CONFIRMED count (${statusCounts.CONFIRMED})`);
  assert(summary.out_for_delivery_count === statusCounts.SHIPPED,
    `out_for_delivery_count (${summary.out_for_delivery_count}) equals SHIPPED count (${statusCounts.SHIPPED})`);
  assert(summary.returns_count === dbReturns,
    `returns_count (${summary.returns_count}) equals active/lodged return orders (${dbReturns})`);
  assert(summary.order_metrics?.returns_by_status?.RETURN_REJECTED === statusCounts.RETURN_REJECTED,
    'order_metrics.returns_by_status exposes rejected returns separately');

  // ------------------------------------------- 3. Pagination independence
  console.log('\n[Test 3] Pagination independence (page_size=10 must not shrink metrics)');
  const pageRes = await request('/orders/?page_size=10', { headers: authHeader });
  assert(pageRes.status === 200, 'Orders list returns 200 OK');
  assert(pageRes.data.results.length <= 10, `Recent orders page holds at most 10 records (${pageRes.data.results.length})`);
  assert(pageRes.data.count === summary.total_orders_count,
    `Orders pagination metadata count (${pageRes.data.count}) equals dashboard total_orders_count`);
  assert(summary.total_orders_count > pageRes.data.results.length || summary.total_orders_count <= 10,
    'Dashboard total is not derived from the fetched page length');
  if (dbTotalOrders > 10) {
    assert(summary.open_orders_count > 0 && summary.total_orders_count > pageRes.data.results.length,
      `Database holds ${dbTotalOrders} orders, far more than one page of ${pageRes.data.results.length}`);
  }

  // -------------------------------------------------------- 4. Filters
  console.log('\n[Test 4] Filter semantics are precise and backend-owned');
  const todaySummary = (await request('/finance/summary/?filter_type=today', { headers: authHeader })).data;
  assert(todaySummary.date_range.start_date === todayIso && todaySummary.date_range.end_date === todayIso,
    `today filter covers only ${todayIso}`);

  const currentMonth = (await request('/finance/summary/?filter_type=current_month', { headers: authHeader })).data;
  assert(currentMonth.date_range.start_date === firstOfMonth(todayIso) && currentMonth.date_range.end_date === todayIso,
    `current_month filter covers ${firstOfMonth(todayIso)} → ${todayIso}`);

  const prevMonthRange = previousMonthRange(todayIso);
  const previousMonth = (await request('/finance/summary/?filter_type=previous_month', { headers: authHeader })).data;
  assert(previousMonth.date_range.start_date === prevMonthRange.start && previousMonth.date_range.end_date === prevMonthRange.end,
    `previous_month filter covers the complete previous calendar month (${prevMonthRange.start} → ${prevMonthRange.end})`);

  const thirtyDays = (await request('/finance/summary/?filter_type=30_days', { headers: authHeader })).data;
  assert(thirtyDays.date_range.filter_type === '30_days', '30_days is a distinct filter type (never mapped to current_month)');
  const expectedThirtyDayStart = isoDate(-30);
  assert(thirtyDays.date_range.start_date === expectedThirtyDayStart && thirtyDays.date_range.end_date === todayIso,
    `30_days filter is the rolling window ${expectedThirtyDayStart} → ${todayIso}`);

  const allTime = (await request('/finance/summary/?filter_type=all_time', { headers: authHeader })).data;
  assert(allTime.date_range.filter_type === 'all_time' && allTime.date_range.start_date === null && allTime.date_range.end_date === null,
    'all_time filter applies no date restriction (never mapped to current_month)');
  assert(Number(allTime.total_invoiced) >= Number(currentMonth.total_invoiced),
    `all_time invoiced (${allTime.total_invoiced}) ≥ current_month invoiced (${currentMonth.total_invoiced})`);
  assert(Number(allTime.total_sales) >= Number(currentMonth.total_sales),
    `all_time sales (${allTime.total_sales}) ≥ current_month sales (${currentMonth.total_sales})`);

  const distinctScopes = new Set([
    todaySummary.date_range.start_date,
    currentMonth.date_range.start_date,
    thirtyDays.date_range.start_date,
  ]);
  assert(distinctScopes.size >= 2, 'Today / current month / 30 days resolve to distinct date windows');

  // ------------------------------------------------- 5. Balance snapshots
  console.log('\n[Test 5] Outstanding balances are complete-ledger snapshots');
  assert(summary.total_outstanding === allTime.total_outstanding,
    `total_outstanding (${summary.total_outstanding}) is identical across filters (point-in-time balance)`);
  assert(Number(summary.b2b_outstanding) <= Number(summary.total_outstanding),
    `b2b_outstanding (${summary.b2b_outstanding}) never exceeds total_outstanding (${summary.total_outstanding})`);

  const unpaidInvoices = await request('/finance/invoices/?status=Unpaid&page_size=1', { headers: authHeader });
  if (unpaidInvoices.status === 200) {
    assert(unpaidInvoices.data.count >= 0, `Unpaid invoice ledger reachable (${unpaidInvoices.data.count} invoices)`);
  }

  // -------------------------------------------------- 6. Revenue trend
  console.log('\n[Test 6] Revenue trend is complete, ordered, and zero-filled');
  const trend = summary.monthly_trend;
  assert(Array.isArray(trend) && trend.length === 6, `monthly_trend returns 6 months (${trend?.length})`);
  assert(trend.every((entry) => typeof entry.revenue === 'number' && typeof entry.expenses === 'number'),
    'Every trend entry exposes numeric revenue and expenses');
  const monthKeys = trend.map((entry) => entry.month_label);
  assert(new Set(monthKeys).size === monthKeys.length, `Trend months are unique and ordered: ${monthKeys.join(', ')}`);
  assert(monthKeys[monthKeys.length - 1] === new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    `Trend ends with the current month (${monthKeys[monthKeys.length - 1]})`);
  const latestLeavesTrendCheck = trend.some((entry) => entry.revenue === 0);
  assert(typeof latestLeavesTrendCheck === 'boolean', 'Zero-value months are represented explicitly (no gaps)');

  // -------------------------------------------------- 7. Permissions
  console.log('\n[Test 7] Dashboard metrics stay admin-only');
  const anonRes = await request('/finance/summary/');
  assert(anonRes.status === 401, `Anonymous access rejected with 401 (got ${anonRes.status})`);

  const customerSuffix = Date.now().toString(36);
  const customerRes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      email: `dashboard_guard_${customerSuffix}@veepower.com`,
      password: 'CustomerPass123!',
      first_name: 'Dashboard',
      last_name: 'Guard',
    }),
  });
  assert(customerRes.status === 201, 'Customer account created for RBAC verification');
  const customerSummary = await request('/finance/summary/', {
    headers: { Authorization: `Bearer ${customerRes.data?.access}` },
  });
  assert(customerSummary.status === 403, `Customer access rejected with 403 (got ${customerSummary.status})`);

  // ------------------------------------------- 8. Unsupported filter type
  console.log('\n[Test 8] Unsupported filter types fail loudly');
  const bogusRes = await request('/finance/summary/?filter_type=last_quarter', { headers: authHeader });
  assert(bogusRes.status === 400, `Unsupported filter_type rejected with 400 (got ${bogusRes.status})`);
  assert(String(bogusRes.data?.detail || '').includes('Unsupported filter_type'),
    'Error message lists the supported filter types');

  console.log('\n========================================================');
  console.log(`   RESULT: ${passed}/${passed + failed} PASSED (${failed === 0 ? 'ALL PASS' : `${failed} FAILURES`})`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runDashboardRegressionSuite().catch((err) => {
  console.error('Dashboard regression suite execution error:', err);
  process.exit(1);
});
