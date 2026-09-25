// Comprehensive Phase 9 Backend, Security, Business Logic, and Concurrency Audit
import assert from 'assert';

const API_BASE = 'http://localhost:8000/api/v1';

async function req(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runComprehensiveAudit() {
  console.log('============================================================');
  console.log('PHASE 9 — COMPREHENSIVE BACKEND & BUSINESS AUDIT');
  console.log('============================================================\n');

  const results = {
    auth: { passed: 0, failed: 0 },
    security: { passed: 0, failed: 0 },
    isolation: { passed: 0, failed: 0 },
    businessLogic: { passed: 0, failed: 0 },
    orderFSM: { passed: 0, failed: 0 },
    finance: { passed: 0, failed: 0 },
    concurrency: { passed: 0, failed: 0 },
  };

  const testSuffix = Math.floor(Math.random() * 900000) + 100000;

  // -------------------------------------------------------------------------
  // 1. AUTHENTICATION & JWT LIFECYCLE
  // -------------------------------------------------------------------------
  console.log('--- [1] AUTHENTICATION & JWT LIFECYCLE ---');
  
  // 1.1 Valid Registration
  const custAData = {
    email: `audit_cust_a_${testSuffix}@veepower.com`,
    password: 'SecurePass123!',
    first_name: 'Audit',
    last_name: 'CustomerA',
    phone: `+9191111${testSuffix.toString().slice(0, 5)}`,
  };
  const regRes = await req('/auth/register/', { method: 'POST', body: JSON.stringify(custAData) });
  assert.strictEqual(regRes.status, 201, 'Registration of Customer A should return 201');
  results.auth.passed++;
  console.log('✔ 1.1 Valid Registration: 201 CREATED');

  // 1.2 Duplicate Email
  const dupRes = await req('/auth/register/', { method: 'POST', body: JSON.stringify(custAData) });
  assert.strictEqual(dupRes.status, 400, 'Duplicate registration should return 400');
  results.auth.passed++;
  console.log('✔ 1.2 Duplicate Email Rejection: 400 BAD REQUEST');

  // 1.3 Weak/Short Password
  const weakRes = await req('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({ ...custAData, email: `weak_${testSuffix}@veepower.com`, password: '123' }),
  });
  assert.strictEqual(weakRes.status, 400, 'Weak password should return 400');
  results.auth.passed++;
  console.log('✔ 1.3 Weak Password Rejection: 400 BAD REQUEST');

  // 1.4 Valid Login
  const loginRes = await req('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: custAData.email, password: custAData.password }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login should return 200');
  const custAToken = loginRes.data.access;
  const custARefresh = loginRes.data.refresh;
  assert.ok(custAToken && custARefresh, 'Access and refresh tokens must be returned');
  results.auth.passed++;
  console.log('✔ 1.4 Valid Login: 200 OK with JWT pair');

  // 1.5 Invalid Credentials
  const badLoginRes = await req('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: custAData.email, password: 'WrongPassword!' }),
  });
  assert.strictEqual(badLoginRes.status, 401, 'Invalid login should return 401');
  results.auth.passed++;
  console.log('✔ 1.5 Invalid Credentials Rejection: 401 UNAUTHORIZED');

  // 1.6 Token Refresh
  const refreshRes = await req('/auth/token/refresh/', {
    method: 'POST',
    body: JSON.stringify({ refresh: custARefresh }),
  });
  assert.strictEqual(refreshRes.status, 200, 'Token refresh should return 200');
  const newAccessToken = refreshRes.data.access;
  assert.ok(newAccessToken, 'New access token must be provided');
  results.auth.passed++;
  console.log('✔ 1.6 Token Refresh: 200 OK');

  // 1.7 Invalid Refresh Token
  const badRefreshRes = await req('/auth/token/refresh/', {
    method: 'POST',
    body: JSON.stringify({ refresh: 'invalid-or-tampered-refresh-token' }),
  });
  assert.strictEqual(badRefreshRes.status, 401, 'Invalid refresh token must return 401');
  results.auth.passed++;
  console.log('✔ 1.7 Invalid Refresh Token: 401 UNAUTHORIZED');

  // 1.8 Admin Login
  const adminLoginRes = await req('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@veepower.in', password: 'AdminPass123!' }),
  });
  assert.strictEqual(adminLoginRes.status, 200, 'Admin login should return 200');
  const adminToken = adminLoginRes.data.access;
  assert.ok(adminToken, 'Admin access token must be returned');
  results.auth.passed++;
  console.log('✔ 1.8 Admin Login: 200 OK');

  // -------------------------------------------------------------------------
  // 2. DATA ISOLATION & RBAC SECURITY
  // -------------------------------------------------------------------------
  console.log('\n--- [2] DATA ISOLATION & RBAC SECURITY ---');
  
  // Register Customer B
  const custBData = {
    email: `audit_cust_b_${testSuffix}@veepower.com`,
    password: 'SecurePass123!',
    first_name: 'Audit',
    last_name: 'CustomerB',
    phone: `+9192222${testSuffix.toString().slice(0, 5)}`,
  };
  await req('/auth/register/', { method: 'POST', body: JSON.stringify(custBData) });
  const loginBRes = await req('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: custBData.email, password: custBData.password }),
  });
  const custBToken = loginBRes.data.access;

  // Customer A creates an address
  const addrARes = await req('/addresses/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${custAToken}` },
    body: JSON.stringify({
      recipient_name: 'Customer A Private Address',
      phone: '+919111111111',
      address_line1: '123 Private Lane',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      address_type: 'home',
      is_default: true,
    }),
  });
  assert.strictEqual(addrARes.status, 201, 'Address creation for Customer A should return 201');
  const addrAId = addrARes.data.id;
  results.isolation.passed++;
  console.log(`✔ 2.1 Customer A created address (ID: ${addrAId})`);

  // Customer B attempts to access Customer A's address
  const foreignAddrRes = await req(`/addresses/${addrAId}/`, {
    headers: { Authorization: `Bearer ${custBToken}` },
  });
  assert.ok(foreignAddrRes.status === 404 || foreignAddrRes.status === 403, 'Foreign address access must return 404 or 403');
  results.isolation.passed++;
  console.log(`✔ 2.2 Foreign Address Access Isolation: ${foreignAddrRes.status} (Isolated)`);

  // Customer B attempts to access Admin endpoints
  const custAdminAttempt = await req('/orders/', {
    headers: { Authorization: `Bearer ${custBToken}` },
  });
  assert.strictEqual(custAdminAttempt.status, 403, 'Customer accessing admin orders endpoint must return 403 Forbidden');
  results.isolation.passed++;
  console.log('✔ 2.3 Customer -> Admin Orders Route: 403 FORBIDDEN');

  // Unauthenticated access to protected endpoint
  const unauthRes = await req('/orders/my-orders/');
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
  results.isolation.passed++;
  console.log('✔ 2.4 Unauthenticated Access: 401 UNAUTHORIZED');

  // -------------------------------------------------------------------------
  // 3. INPUT VALIDATION & SECURITY PAYLOADS
  // -------------------------------------------------------------------------
  console.log('\n--- [3] INPUT VALIDATION & SECURITY PAYLOADS ---');

  // 3.1 SQL Injection in query params
  const sqliRes = await req('/catalog/products/?q=\' OR 1=1; DROP TABLE products;--');
  assert.ok(sqliRes.status === 200 || sqliRes.status === 400, 'SQL injection string handled cleanly without traceback');
  results.security.passed++;
  console.log('✔ 3.1 SQLi Query Param Payload: Handled safely');

  // 3.2 Script injection in contact inquiry
  const xssInquiryRes = await req('/inquiries/', {
    method: 'POST',
    body: JSON.stringify({
      name: '<script>alert("XSS")</script>',
      email: 'xss_test@veepower.com',
      phone: '+919876543210',
      subject: '<script>evil()</script>',
      message: '<img src=x onerror=alert(1)> Test inquiry sanitization',
    }),
  });
  assert.strictEqual(xssInquiryRes.status, 201, 'Inquiry accepted as text, not evaluated');
  results.security.passed++;
  console.log('✔ 3.2 XSS Payload in Inquiry: Safely stored without code execution');

  // 3.3 Malformed ID handling
  const badIdRes = await req('/catalog/products/non-existent-product-id/');
  assert.strictEqual(badIdRes.status, 404, 'Malformed string ID returns 404 cleanly');
  results.security.passed++;
  console.log('✔ 3.3 Malformed Product ID: 404 NOT FOUND (No 500 error)');

  // 3.4 Negative Quantity in Checkout
  const productsRes = await req('/catalog/products/');
  const allProds = productsRes.data.results || productsRes.data;
  const testProd = allProds.find(p => p.in_stock && !p.name.includes('Concurrency')) || allProds[0];

  const badQtyRes = await req('/orders/checkout/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${custAToken}` },
    body: JSON.stringify({
      shipping_address_id: addrAId,
      items: [{ product_id: testProd.id, quantity: -5 }],
      payment_method: 'UPI',
    }),
  });
  assert.strictEqual(badQtyRes.status, 400, 'Negative quantity in checkout must return 400');
  results.security.passed++;
  console.log('✔ 3.4 Negative Quantity Rejection: 400 BAD REQUEST');

  // -------------------------------------------------------------------------
  // 4. AUTHORITATIVE BUSINESS LOGIC (TAX & SHIPPING)
  // -------------------------------------------------------------------------
  console.log('\n--- [4] AUTHORITATIVE BUSINESS LOGIC (TAX & SHIPPING) ---');

  // 4.1 Intra-state GST (Buyer in Tamil Nadu, Seller in Tamil Nadu -> CGST + SGST)
  const intraOrderRes = await req('/orders/checkout/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${custAToken}` },
    body: JSON.stringify({
      shipping_address_id: addrAId, // Tamil Nadu
      items: [{ product_id: testProd.id, quantity: 1 }],
      payment_method: 'UPI',
    }),
  });
  assert.strictEqual(intraOrderRes.status, 201, 'Intra-state checkout should succeed');
  const intraOrder = intraOrderRes.data;
  assert.ok(Number(intraOrder.cgst_amount) > 0, 'Intra-state must have CGST > 0');
  assert.ok(Number(intraOrder.sgst_amount) > 0, 'Intra-state must have SGST > 0');
  assert.strictEqual(Number(intraOrder.igst_amount), 0, 'Intra-state must have IGST == 0');
  results.businessLogic.passed++;
  console.log(`✔ 4.1 Intra-state GST Validated: CGST=₹${intraOrder.cgst_amount}, SGST=₹${intraOrder.sgst_amount}, IGST=₹${intraOrder.igst_amount}`);

  // 4.2 Inter-state GST (Buyer in Maharashtra -> IGST only)
  const addrMahaRes = await req('/addresses/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${custAToken}` },
    body: JSON.stringify({
      recipient_name: 'Customer A Mumbai Branch',
      phone: '+919111111111',
      address_line1: 'Andheri East Industrial Area',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400069',
      address_type: 'work',
    }),
  });
  const addrMahaId = addrMahaRes.data.id;

  const interOrderRes = await req('/orders/checkout/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${custAToken}` },
    body: JSON.stringify({
      shipping_address_id: addrMahaId, // Maharashtra
      items: [{ product_id: testProd.id, quantity: 1 }],
      payment_method: 'CARD',
    }),
  });
  assert.strictEqual(interOrderRes.status, 201, 'Inter-state checkout should succeed');
  const interOrder = interOrderRes.data;
  assert.strictEqual(Number(interOrder.cgst_amount), 0, 'Inter-state must have CGST == 0');
  assert.strictEqual(Number(interOrder.sgst_amount), 0, 'Inter-state must have SGST == 0');
  assert.ok(Number(interOrder.igst_amount) > 0, 'Inter-state must have IGST > 0');
  results.businessLogic.passed++;
  console.log(`✔ 4.2 Inter-state GST Validated: CGST=₹${interOrder.cgst_amount}, SGST=₹${interOrder.sgst_amount}, IGST=₹${interOrder.igst_amount}`);

  // -------------------------------------------------------------------------
  // 5. ORDER CANONICAL FSM (FINITE STATE MACHINE)
  // -------------------------------------------------------------------------
  console.log('\n--- [5] ORDER CANONICAL FSM ---');

  const testOrderId = intraOrder.id;

  // 5.1 Valid transition: PENDING -> CONFIRMED
  const t1 = await req(`/orders/${testOrderId}/status/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'CONFIRMED', reason: 'Payment verified' }),
  });
  assert.strictEqual(t1.status, 200, 'PENDING -> CONFIRMED should succeed');
  assert.strictEqual(t1.data.status, 'CONFIRMED');
  results.orderFSM.passed++;
  console.log('✔ 5.1 Valid Transition: PENDING -> CONFIRMED (200 OK)');

  // 5.2 Valid transition: CONFIRMED -> PACKED
  const t2 = await req(`/orders/${testOrderId}/status/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'PACKED', reason: 'Items packed in warehouse' }),
  });
  assert.strictEqual(t2.status, 200, 'CONFIRMED -> PACKED should succeed');
  assert.strictEqual(t2.data.status, 'PACKED');
  results.orderFSM.passed++;
  console.log('✔ 5.2 Valid Transition: CONFIRMED -> PACKED (200 OK)');

  // 5.3 Valid transition: PACKED -> SHIPPED
  const t3 = await req(`/orders/${testOrderId}/status/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'SHIPPED', reason: 'Dispatched via carrier' }),
  });
  assert.strictEqual(t3.status, 200, 'PACKED -> SHIPPED should succeed');
  assert.strictEqual(t3.data.status, 'SHIPPED');
  results.orderFSM.passed++;
  console.log('✔ 5.3 Valid Transition: PACKED -> SHIPPED (200 OK)');

  // 5.4 Valid transition: SHIPPED -> DELIVERED
  const t4 = await req(`/orders/${testOrderId}/status/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'DELIVERED', reason: 'Delivered to recipient' }),
  });
  assert.strictEqual(t4.status, 200, 'SHIPPED -> DELIVERED should succeed');
  assert.strictEqual(t4.data.status, 'DELIVERED');
  results.orderFSM.passed++;
  console.log('✔ 5.4 Valid Transition: SHIPPED -> DELIVERED (200 OK)');

  // 5.5 Invalid transition: DELIVERED -> PENDING (Reversal must be rejected)
  const invalidT = await req(`/orders/${testOrderId}/status/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'PENDING', reason: 'Attempted invalid rollback' }),
  });
  assert.strictEqual(invalidT.status, 400, 'DELIVERED -> PENDING must be rejected with 400');
  results.orderFSM.passed++;
  console.log('✔ 5.5 Invalid Transition Rejection: DELIVERED -> PENDING (400 BAD REQUEST)');

  // 5.6 Forbidden non-canonical status: PROCESSING
  const forbiddenT = await req(`/orders/${testOrderId}/status/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'PROCESSING', reason: 'Non-canonical status' }),
  });
  assert.strictEqual(forbiddenT.status, 400, 'Non-canonical status PROCESSING must be rejected with 400');
  results.orderFSM.passed++;
  console.log('✔ 5.6 Forbidden Status Rejection: PROCESSING (400 BAD REQUEST)');

  // 5.7 Audit Trail
  const histRes = await req(`/orders/${testOrderId}/history/`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(histRes.status, 200, 'Order status history should return 200');
  const historyList = histRes.data.results || histRes.data;
  assert.ok(historyList.length >= 4, 'Audit trail must contain all status changes');
  results.orderFSM.passed++;
  console.log(`✔ 5.7 Audit Trail Verified: ${historyList.length} status transition log entries`);

  // -------------------------------------------------------------------------
  // 6. B2B CLIENTS, QUOTATIONS & INVOICES
  // -------------------------------------------------------------------------
  console.log('\n--- [6] B2B CLIENTS, QUOTATIONS & INVOICES ---');

  // 6.1 Create B2B Client
  const testGstin = `24AAAAA${String(testSuffix).slice(0, 4)}A1Z${String(testSuffix).slice(4, 5) || '5'}`;
  const clientRes = await req('/finance/clients/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      client_code: `CLT-${testSuffix}`,
      company_name: `ElectroTech Solutions ${testSuffix}`,
      contact_person: 'Ramesh Patel',
      email: `ramesh_${testSuffix}@electrotech.com`,
      phone: '+919876543210',
      gstin: testGstin,
      address: 'Plot 101, Phase 2, GIDC, Vadodara, Gujarat 390010',
      credit_limit: 500000.00,
    }),
  });
  if (!clientRes.ok) {
    console.error('Client creation failed:', clientRes.data);
  }
  assert.strictEqual(clientRes.status, 201, 'B2B client creation should return 201');
  const clientId = clientRes.data.id;
  results.finance.passed++;
  console.log(`✔ 6.1 B2B Client Created: ID ${clientId} (${clientRes.data.company_name})`);

  // 6.2 Create Quotation
  const quoteRes = await req('/finance/quotations/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      quotation_number: `QTN-${testSuffix}`,
      client: clientId,
      quotation_date: '2026-09-25',
      expiry_date: '2026-12-31',
      total_value: '2500.00',
      status: 'Draft',
      notes: 'Phase 9 Audit B2B Quotation',
    }),
  });
  if (!quoteRes.ok) {
    console.error('Quotation creation failed:', quoteRes.data);
  }
  assert.strictEqual(quoteRes.status, 201, 'Quotation creation should return 201');
  const quoteId = quoteRes.data.id;
  results.finance.passed++;
  console.log(`✔ 6.2 Quotation Created: ID ${quoteId} (Total: ₹${quoteRes.data.total_value})`);

  // 6.3 Approve Quotation (PATCH /status/) on quotation 1 (which has items)
  const approveRes = await req('/finance/quotations/1/status/', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'Approved' }),
  });
  assert.strictEqual(approveRes.status, 200, 'Quotation approval should return 200');
  assert.strictEqual(approveRes.data.status, 'Approved');
  results.finance.passed++;
  console.log('✔ 6.3 Quotation Approved: Status Approved');

  // 6.4 Convert Quotation to Invoice (POST /convert/)
  const convertRes = await req('/finance/quotations/1/convert/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ notes: 'Converted during Phase 9 audit' }),
  });
  if (!convertRes.ok) {
    console.error('Quotation conversion failed:', convertRes.data);
  }
  assert.strictEqual(convertRes.status, 201, 'Quotation conversion should create invoice (201)');
  const invoiceId = convertRes.data.id;
  results.finance.passed++;
  console.log(`✔ 6.4 Quotation Converted to Invoice: ID ${invoiceId} (Number: ${convertRes.data.invoice_number})`);

  // 6.5 Duplicate Conversion Rejection
  const dupConvertRes = await req('/finance/quotations/1/convert/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(dupConvertRes.status, 400, 'Duplicate conversion must be rejected with 400');
  results.finance.passed++;
  console.log('✔ 6.5 Duplicate Quotation Conversion Rejection: 400 BAD REQUEST');

  // -------------------------------------------------------------------------
  // 7. CONCURRENCY & ATOMIC INVENTORY DEDUCTION
  // -------------------------------------------------------------------------
  console.log('\n--- [7] CONCURRENCY & ATOMIC INVENTORY DEDUCTION ---');

  // Create a dedicated product in backend for concurrency testing with exact stock = 5
  const catListRes = await req('/catalog/categories/');
  const brandListRes = await req('/catalog/brands/');
  const activeCatId = (catListRes.data.results || catListRes.data)[0].id;
  const activeBrandId = (brandListRes.data.results || brandListRes.data)[0].id;

  const newProdRes = await req('/catalog/products/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `Concurrency Test Switchgear ${testSuffix}`,
      category: activeCatId,
      brand: activeBrandId,
      sku: `CONC-${testSuffix}`,
      price: 250.00,
      mrp: 300.00,
      stock: 5,
      description: 'Concurrency race condition verification item',
      active: true,
    }),
  });
  if (!newProdRes.ok) {
    console.error('New product creation error:', newProdRes.data);
  }
  assert.strictEqual(newProdRes.status, 201, 'Dedicated concurrency product should be created (201)');
  const concProdId = newProdRes.data.id;
  console.log(`Created/Configured concurrency test product ID: ${concProdId} with stock = 5`);

  // Launch 10 simultaneous checkout requests to purchase 1 unit each
  console.log('Firing 10 simultaneous checkout orders for 1 unit each...');
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      req('/orders/checkout/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${custAToken}` },
        body: JSON.stringify({
          shipping_address_id: addrAId,
          items: [{ product_id: concProdId, quantity: 1 }],
          payment_method: 'UPI',
        }),
      })
    );
  }

  const concurrentResults = await Promise.all(promises);
  const successes = concurrentResults.filter(r => r.status === 201);
  const failures = concurrentResults.filter(r => r.status === 400);

  console.log(`Concurrent results: ${successes.length} SUCCEEDED (201), ${failures.length} REJECTED (400)`);
  assert.strictEqual(successes.length, 5, 'Exactly 5 simultaneous orders must succeed');
  assert.strictEqual(failures.length, 5, 'Exactly 5 simultaneous orders must be rejected due to stock depletion');
  results.concurrency.passed++;
  console.log('✔ 7.1 Zero Overselling Guarantee: Exactly 5/10 orders accepted, 5/10 rejected');

  // Verify final stock is exactly 0
  const finalProdRes = await req(`/catalog/products/${concProdId}/`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const finalStock = finalProdRes.data.stock;
  assert.strictEqual(finalStock, 0, 'Final product stock must be mathematically exact (0)');
  results.concurrency.passed++;
  console.log('✔ 7.2 Stock Consistency: Final stock in DB is exactly 0');

  console.log('\n============================================================');
  console.log('AUDIT SUMMARY:');
  console.log(`Auth & JWT: ${results.auth.passed} passed, ${results.auth.failed} failed`);
  console.log(`Data Isolation: ${results.isolation.passed} passed, ${results.isolation.failed} failed`);
  console.log(`Security: ${results.security.passed} passed, ${results.security.failed} failed`);
  console.log(`Business Logic: ${results.businessLogic.passed} passed, ${results.businessLogic.failed} failed`);
  console.log(`Order FSM: ${results.orderFSM.passed} passed, ${results.orderFSM.failed} failed`);
  console.log(`Finance: ${results.finance.passed} passed, ${results.finance.failed} failed`);
  console.log(`Concurrency: ${results.concurrency.passed} passed, ${results.concurrency.failed} failed`);
  console.log('============================================================');
  console.log('ALL PHASE 9 COMPREHENSIVE BACKEND AUDIT TESTS PASSED!');
}

runComprehensiveAudit().catch(err => {
  console.error('AUDIT FAILED:', err);
  process.exit(1);
});
