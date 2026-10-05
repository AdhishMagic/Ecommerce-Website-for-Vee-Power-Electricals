// Comprehensive Customer Management Integration & Regression Suite
// Tests live DRF endpoints, authentication, RBAC, search, filtering, sorting, pagination, CRUD, and data integrity

const API_BASE = 'http://127.0.0.1:8000/api/v1';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runCustomerTests() {
  console.log('====================================================');
  console.log(' STARTING CUSTOMER MANAGEMENT REGRESSION TESTS');
  console.log('====================================================\n');

  let adminToken = null;
  let customerToken = null;

  // 1. RBAC & Security Check: Unauthenticated request must return 401
  console.log('[Test 1] Security: Unauthenticated access to /customers/ must be rejected (401)');
  const unauthRes = await request('/customers/');
  assert(unauthRes.status === 401, `Status is 401 Unauthorized (got ${unauthRes.status})`);
  assert(unauthRes.data?.error?.code === 'NOT_AUTHENTICATED', 'Response contains canonical NOT_AUTHENTICATED code');

  // 2. Login as Administrator
  console.log('\n[Test 2] Admin Authentication: Logging in as admin@veepower.in');
  const adminLogin = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@veepower.in', password: 'AdminPass123!' }),
  });
  assert(adminLogin.status === 200, `Admin login successful (got ${adminLogin.status})`);
  assert(adminLogin.data?.user?.role === 'admin', 'Authenticated user role is admin');
  adminToken = adminLogin.data?.access;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // 3. Register and Login a regular Customer to verify non-admin 403 Forbidden
  console.log('\n[Test 3] Security & RBAC: Regular customer must receive 403 Forbidden');
  const randomSuffix = Math.floor(Math.random() * 90000) + 10000;
  const testCustomerEmail = `rbac_test_${randomSuffix}@veepower.com`;
  const regRes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      email: testCustomerEmail,
      password: 'SecureCustomer123!',
      first_name: 'RBAC',
      last_name: 'Tester',
      phone: `+9199999${randomSuffix}`,
    }),
  });
  assert(regRes.status === 201, `Test customer registered (status ${regRes.status})`);

  const custLogin = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: testCustomerEmail, password: 'SecureCustomer123!' }),
  });
  customerToken = custLogin.data?.access;
  const customerHeaders = { Authorization: `Bearer ${customerToken}` };

  const forbiddenList = await request('/customers/', { headers: customerHeaders });
  assert(forbiddenList.status === 403, `Customer list rejected with 403 Forbidden (got ${forbiddenList.status})`);

  const forbiddenSummary = await request('/customers/summary/', { headers: customerHeaders });
  assert(forbiddenSummary.status === 403, `Customer summary rejected with 403 Forbidden (got ${forbiddenSummary.status})`);

  // 4. Admin Customer Summary Endpoint
  console.log('\n[Test 4] Admin Customer Summary: GET /customers/summary/');
  const summaryRes = await request('/customers/summary/', { headers: adminHeaders });
  assert(summaryRes.status === 200, `Summary API returned 200 (got ${summaryRes.status})`);
  const s = summaryRes.data;
  assert(typeof s.total_customers === 'number' && s.total_customers > 0, `total_customers is positive number: ${s.total_customers}`);
  assert(typeof s.active_customers === 'number', `active_customers is valid number: ${s.active_customers}`);
  assert(typeof s.inactive_customers === 'number', `inactive_customers is valid number: ${s.inactive_customers}`);
  assert(typeof s.new_customers_30d === 'number', `new_customers_30d is valid number: ${s.new_customers_30d}`);
  assert(typeof s.total_spent === 'string', `total_spent is formatted string: ₹${s.total_spent}`);
  assert(typeof s.total_outstanding === 'string', `total_outstanding is formatted string: ₹${s.total_outstanding}`);

  // 5. Admin Customer List Endpoint (Default Pagination)
  console.log('\n[Test 5] Customer List & Pagination: GET /customers/');
  const listRes = await request('/customers/', { headers: adminHeaders });
  assert(listRes.status === 200, `Customer list returned 200 (got ${listRes.status})`);
  assert(typeof listRes.data.count === 'number', `count returned from server: ${listRes.data.count}`);
  assert(Array.isArray(listRes.data.results), 'results is an array');
  assert(listRes.data.results.length > 0, `Returned ${listRes.data.results.length} customer records on page 1`);
  assert(listRes.data.count === s.total_customers, `Pagination count matches database summary count (${listRes.data.count} == ${s.total_customers})`);

  // Inspect first record structure
  const first = listRes.data.results[0];
  assert(typeof first.id === 'number', `Customer record has numeric id: ${first.id}`);
  assert(typeof first.customer_id === 'string' && first.customer_id.startsWith('CUST-'), `Customer ID is formatted: ${first.customer_id}`);
  assert(typeof first.email === 'string', `Customer has email: ${first.email}`);
  assert(typeof first.name === 'string', `Customer has computed name: ${first.name}`);
  assert(['B2B', 'B2C'].includes(first.customer_type), `Customer has valid type: ${first.customer_type}`);
  assert(typeof first.orders_count === 'number', `Customer has orders_count: ${first.orders_count}`);
  assert(typeof first.total_spent === 'string', `Customer has total_spent: ₹${first.total_spent}`);
  assert(typeof first.outstanding_balance === 'string', `Customer has outstanding_balance: ₹${first.outstanding_balance}`);

  // 6. Server-Side Customer Search
  console.log('\n[Test 6] Server-Side Search: GET /customers/?search=...');
  const searchNameRes = await request(`/customers/?search=${encodeURIComponent(first.name.split(' ')[0])}`, { headers: adminHeaders });
  assert(searchNameRes.status === 200, 'Search by first name returned 200');
  assert(searchNameRes.data.count > 0, `Found ${searchNameRes.data.count} results matching '${first.name.split(' ')[0]}'`);

  const searchEmailRes = await request(`/customers/?search=${encodeURIComponent(first.email)}`, { headers: adminHeaders });
  assert(searchEmailRes.status === 200, 'Search by exact email returned 200');
  assert(searchEmailRes.data.count >= 1, `Found ${searchEmailRes.data.count} result(s) for email`);

  const searchIdRes = await request(`/customers/?search=${first.customer_id}`, { headers: adminHeaders });
  assert(searchIdRes.status === 200, 'Search by CUST-XXXXX ID format returned 200');
  assert(searchIdRes.data.results.some(c => c.id === first.id), 'Search results include the target customer');

  const emptySearchRes = await request('/customers/?search=nonexistent_xyz_999999', { headers: adminHeaders });
  assert(emptySearchRes.status === 200, 'Empty search returned 200');
  assert(emptySearchRes.data.count === 0 && emptySearchRes.data.results.length === 0, 'No-results search returns count 0');

  // 7. Filtering by Status and Customer Type
  console.log('\n[Test 7] Server-Side Filtering: Status and Customer Type');
  const activeRes = await request('/customers/?status=active', { headers: adminHeaders });
  assert(activeRes.status === 200, 'Status=active returned 200');
  assert(activeRes.data.results.every(c => c.is_active === true), 'All results have is_active === true');

  const b2cRes = await request('/customers/?customer_type=b2c', { headers: adminHeaders });
  assert(b2cRes.status === 200, 'Customer_type=b2c returned 200');
  assert(b2cRes.data.results.every(c => c.customer_type === 'B2C'), 'All results have customer_type === B2C');

  // 8. Server-Side Sorting
  console.log('\n[Test 8] Server-Side Sorting');
  const sortSpentDesc = await request('/customers/?ordering=spent_desc&page_size=5', { headers: adminHeaders });
  assert(sortSpentDesc.status === 200, 'ordering=spent_desc returned 200');
  const spentAmounts = sortSpentDesc.data.results.map(c => Number(c.total_spent));
  const isSortedDesc = spentAmounts.every((val, i, arr) => i === 0 || arr[i - 1] >= val);
  assert(isSortedDesc, `Highest spenders sorted descending: ${spentAmounts.join(', ')}`);

  const sortOrdersDesc = await request('/customers/?ordering=orders_desc&page_size=5', { headers: adminHeaders });
  assert(sortOrdersDesc.status === 200, 'ordering=orders_desc returned 200');
  const orderCounts = sortOrdersDesc.data.results.map(c => c.orders_count);
  const isOrdersSortedDesc = orderCounts.every((val, i, arr) => i === 0 || arr[i - 1] >= val);
  assert(isOrdersSortedDesc, `Most orders sorted descending: ${orderCounts.join(', ')}`);

  // 9. Customer Detail Endpoint: GET /customers/{id}/
  console.log('\n[Test 9] Customer Detail: GET /customers/{id}/');
  const detailRes = await request(`/customers/${first.id}/`, { headers: adminHeaders });
  assert(detailRes.status === 200, `Customer detail returned 200 (got ${detailRes.status})`);
  const det = detailRes.data;
  assert(det.id === first.id, `Detail ID matches: ${det.id}`);
  assert(Array.isArray(det.addresses), 'Detail includes addresses array');
  assert(det.order_summary && typeof det.order_summary.total_orders === 'number', 'Detail includes order_summary');
  assert(det.financial_summary && typeof det.financial_summary.total_invoiced === 'string', 'Detail includes financial_summary');
  assert(Array.isArray(det.recent_orders), 'Detail includes recent_orders array');

  // 10. Customer Creation: POST /customers/
  console.log('\n[Test 10] Admin Customer Creation: POST /customers/');
  const newEmail = `admin_created_${Math.floor(Math.random() * 90000) + 10000}@veepower.com`;
  const createPayload = {
    first_name: 'Anand',
    last_name: 'Electricals',
    email: newEmail,
    phone: '+919876543999',
    is_active: true,
    address_line1: '128 cross street',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    address_type: 'work',
  };
  const createRes = await request('/customers/', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(createPayload),
  });
  assert(createRes.status === 201, `Customer created successfully (status ${createRes.status})`);
  assert(createRes.data.email === newEmail, `Created customer email matches: ${createRes.data.email}`);
  assert(createRes.data.addresses?.length === 1, 'Initial shipping address attached to created customer');
  const createdId = createRes.data.id;

  // Duplicate email validation test
  const dupRes = await request('/customers/', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(createPayload),
  });
  assert(dupRes.status === 400, `Duplicate email rejected with 400 (got ${dupRes.status})`);

  // 11. Customer Profile Update: PATCH /customers/{id}/
  console.log(`\n[Test 11] Customer Profile Update: PATCH /customers/${createdId}/`);
  const updateRes = await request(`/customers/${createdId}/`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      first_name: 'Anand Updated',
      phone: '+919876543000',
    }),
  });
  assert(updateRes.status === 200, `Customer updated with 200 (got ${updateRes.status})`);
  assert(updateRes.data.first_name === 'Anand Updated', 'First name updated successfully');
  assert(updateRes.data.phone === '+919876543000', 'Phone number updated successfully');
  assert(updateRes.data.email === newEmail, 'Untouched email preserved intact');

  // 12. Customer Status Toggle: POST /customers/{id}/status/
  console.log(`\n[Test 12] Customer Status Toggle: POST /customers/${createdId}/status/`);
  const toggleInactive = await request(`/customers/${createdId}/status/`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ is_active: false }),
  });
  assert(toggleInactive.status === 200, 'Status update returned 200');
  assert(toggleInactive.data.is_active === false, 'Account status changed to inactive (false)');

  const toggleActive = await request(`/customers/${createdId}/status/`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ is_active: true }),
  });
  assert(toggleActive.status === 200, 'Re-activation returned 200');
  assert(toggleActive.data.is_active === true, 'Account status changed to active (true)');

  // 13. Customer Deletion Policy: DELETE /customers/{id}/
  console.log(`\n[Test 13] Safe Deletion Policy: DELETE /customers/${createdId}/`);
  const deleteRes = await request(`/customers/${createdId}/`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  assert(deleteRes.status === 200, `Delete returned 200 (got ${deleteRes.status})`);
  assert(deleteRes.data.action === 'deleted', 'Unconnected new customer deleted cleanly');

  // 14. Non-Existent Customer: 404 Not Found
  console.log('\n[Test 14] Invalid Customer ID: GET /customers/99999999/');
  const notFoundRes = await request('/customers/99999999/', { headers: adminHeaders });
  assert(notFoundRes.status === 404, `Missing customer returns 404 (got ${notFoundRes.status})`);

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCustomerTests().catch(err => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
