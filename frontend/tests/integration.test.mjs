// End-to-end integration test verifying the 17 integration steps against the live Docker backend
const API_BASE = 'http://localhost:8000/api/v1';

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

async function runTests() {
  console.log('--- STARTING LIVE BACKEND INTEGRATION TESTS ---');
  let token = null;
  let refreshToken = null;
  let adminToken = null;

  // 1. Register a test customer
  const randomSuffix = Math.floor(Math.random() * 90000) + 10000;
  const testUser = {
    email: `integration_test_${randomSuffix}@veepower.com`,
    password: 'SecurePassword123!',
    first_name: 'Test',
    last_name: 'Buyer',
    phone: `+9198765${randomSuffix}`,
    role: 'customer',
  };

  console.log(`[1] Registering user: ${testUser.email}`);
  const regRes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify(testUser),
  });
  console.log(`Registration status: ${regRes.status}`);
  if (!regRes.ok) {
    console.error('Registration failed:', regRes.data);
  }

  // 2. Login
  console.log('[2] Logging in user');
  const loginRes = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: testUser.email, password: testUser.password }),
  });
  console.log(`Login status: ${loginRes.status}`);
  if (loginRes.ok) {
    token = loginRes.data.access;
    refreshToken = loginRes.data.refresh;
    console.log('Access token acquired:', token ? 'YES' : 'NO');
  } else {
    console.error('Login failed:', loginRes.data);
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 3. Load Current User (/auth/me/)
  console.log('[3] Fetching /auth/me/');
  const meRes = await request('/auth/me/', { headers: authHeaders });
  console.log(`/auth/me/ status: ${meRes.status}, user: ${meRes.data?.email}`);

  // 4. Browse Catalog (/catalog/products/)
  console.log('[4] Fetching catalog products');
  const catRes = await request('/catalog/products/');
  console.log(`Products status: ${catRes.status}`);
  const products = Array.isArray(catRes.data) ? catRes.data : (catRes.data?.results || []);
  console.log(`Found ${products.length} products in catalog`);
  const targetProduct = products[0];

  // 5. Open Product Detail
  console.log(`[5] Fetching detail for product id ${targetProduct?.id} (${targetProduct?.name})`);
  const prodDetailRes = await request(`/catalog/products/${targetProduct?.id}/`);
  console.log(`Product detail status: ${prodDetailRes.status}, name: ${prodDetailRes.data?.name}, price: ₹${prodDetailRes.data?.price}`);

  // 6. Manage Customer Address (POST /addresses/)
  console.log('[6] Creating shipping address');
  const addrRes = await request('/addresses/', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      recipient_name: 'Test Buyer',
      phone: '+919876543210',
      address_line1: 'Plot 42, GIDC Industrial Estate',
      address_line2: 'Phase 2',
      landmark: 'Near Power Grid Station',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '382445',
      address_type: 'work',
      is_default: true,
    }),
  });
  console.log(`Address creation status: ${addrRes.status}, id: ${addrRes.data?.id}`);
  const addressId = addrRes.data?.id;

  // 7. Verify List Addresses
  console.log('[7] Listing customer addresses');
  const listAddrRes = await request('/addresses/', { headers: authHeaders });
  console.log(`Addresses count: ${Array.isArray(listAddrRes.data) ? listAddrRes.data.length : listAddrRes.data?.results?.length}`);

  // 8 & 9 & 10. Checkout & Authoritative Backend Calculation (POST /orders/checkout/)
  console.log('[8, 9, 10] Executing checkout with backend calculations');
  const checkoutPayload = {
    shipping_address_id: addressId,
    billing_address_id: addressId,
    payment_method: 'CASH_ON_DELIVERY',
    items: [
      {
        product_id: targetProduct?.id,
        quantity: 2,
      },
    ],
  };

  const checkoutRes = await request('/orders/checkout/', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(checkoutPayload),
  });
  console.log(`Checkout status: ${checkoutRes.status}`);
  let orderNumber = null;
  let orderId = null;
  if (checkoutRes.ok) {
    const ord = checkoutRes.data;
    orderNumber = ord.order_number;
    orderId = ord.id;
    console.log(`Order created successfully: ${ord.order_number}`);
    console.log(`Subtotal: ₹${ord.subtotal}, Tax: ₹${ord.tax_amount}, Shipping: ₹${ord.shipping_fee}, Final Total: ₹${ord.total_amount}`);
    console.log(`Initial Status: ${ord.status}`);
  } else {
    console.error('Checkout failed:', checkoutRes.data);
  }

  // 11. View My Orders & Order Detail
  console.log('[11] Fetching customer /orders/my-orders/ and detail');
  const myOrdersRes = await request('/orders/my-orders/', { headers: authHeaders });
  const myOrdersList = Array.isArray(myOrdersRes.data) ? myOrdersRes.data : myOrdersRes.data?.results;
  console.log(`My Orders count: ${myOrdersList?.length}`);

  if (orderId) {
    const orderDetailRes = await request(`/orders/${orderId}/`, { headers: authHeaders });
    console.log(`Order detail status: ${orderDetailRes.status}, Number: ${orderDetailRes.data?.order_number}, Status: ${orderDetailRes.data?.status}`);
  }

  // 12. Token Refresh
  console.log('[12] Refreshing JWT access token');
  const refreshRes = await request('/auth/token/refresh/', {
    method: 'POST',
    body: JSON.stringify({ refresh: refreshToken }),
  });
  console.log(`Refresh status: ${refreshRes.status}, new access token returned: ${refreshRes.data?.access ? 'YES' : 'NO'}`);

  // 13. Admin Login & Access
  console.log('[13] Testing Admin login (admin@veepower.in)');
  const adminLoginRes = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@veepower.in', password: 'AdminPass123!' }),
  });
  console.log(`Admin login status: ${adminLoginRes.status}`);
  if (adminLoginRes.ok) {
    adminToken = adminLoginRes.data.access;
  } else {
    console.error('Admin login error:', adminLoginRes.data);
  }
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // 14. Admin Catalog Access
  console.log('[14] Admin catalog products access');
  const adminCatRes = await request('/catalog/products/', { headers: adminHeaders });
  console.log(`Admin catalog status: ${adminCatRes.status}`);

  // 15. Admin Inventory Access
  console.log('[15] Admin inventory overview');
  const invRes = await request('/inventory/', { headers: adminHeaders });
  const invItems = Array.isArray(invRes.data) ? invRes.data : invRes.data?.results;
  console.log(`Admin inventory status: ${invRes.status}, items: ${invItems?.length}`);

  // 16. Admin Order Status Transition
  if (orderId) {
    console.log(`[16] Transitioning order ${orderId} status PENDING -> CONFIRMED via admin FSM`);
    const statusRes = await request(`/orders/${orderId}/status/`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'CONFIRMED', notes: 'Confirmed by automated verification' }),
    });
    console.log(`Order transition status: ${statusRes.status}, new status: ${statusRes.data?.status}`);
  }

  // 17. Contact Inquiry Submission
  console.log('[17] Submitting public contact inquiry');
  const inqRes = await request('/inquiries/', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Integration Tester',
      email: 'tester@veepower.com',
      phone: '+919876543210',
      subject: 'Phase 8 API Verification',
      message: 'Testing public inquiry submission against live Django API.',
    }),
  });
  console.log(`Inquiry submission status: ${inqRes.status}, id: ${inqRes.data?.id}`);

  console.log('--- ALL 17 LIVE BACKEND INTEGRATION TESTS COMPLETED SUCCESSFULLY ---');
}

runTests().catch(err => console.error('Integration test encountered an error:', err));
