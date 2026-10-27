import assert from 'node:assert';

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

async function runLiveIsolationTests() {
  console.log('===========================================================');
  console.log('🚀 LIVE PER-USER STORE ISOLATION AND CART SECURITY AUDIT');
  console.log('===========================================================');

  const randSuffix = Math.floor(Math.random() * 900000) + 100000;
  const userA = {
    email: `iso_user_a_${randSuffix}@veepower.com`,
    password: 'SecurePassword123!',
    first_name: 'Alice',
    last_name: 'Customer',
    phone: `+9198711${randSuffix.toString().slice(0, 5)}`,
    role: 'customer',
  };
  const userB = {
    email: `iso_user_b_${randSuffix}@veepower.com`,
    password: 'SecurePassword123!',
    first_name: 'Bob',
    last_name: 'Customer',
    phone: `+9198722${randSuffix.toString().slice(0, 5)}`,
    role: 'customer',
  };

  // 1. Register User A
  console.log(`[1] Registering User A (${userA.email})...`);
  const regARes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify(userA),
  });
  assert(regARes.status === 201, `Failed to register User A: ${JSON.stringify(regARes.data)}`);
  const tokenA = regARes.data.access;
  const userAId = regARes.data.user.id;
  console.log(`    ✅ User A registered (ID: ${userAId}).`);

  // 2. Register User B
  console.log(`[2] Registering User B (${userB.email})...`);
  const regBRes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify(userB),
  });
  assert(regBRes.status === 201, `Failed to register User B: ${JSON.stringify(regBRes.data)}`);
  const tokenB = regBRes.data.access;
  const userBId = regBRes.data.user.id;
  console.log(`    ✅ User B registered (ID: ${userBId}).`);

  // 3. Fetch products from catalog
  console.log('[3] Fetching products from catalog...');
  const prodRes = await request('/catalog/products/?page_size=10');
  assert(prodRes.ok && prodRes.data.results.length >= 2, 'Need at least 2 products in catalog for test');
  const productX = prodRes.data.results[0];
  const productY = prodRes.data.results[1];
  console.log(`    ✅ Product X: "${productX.name}" (ID: ${productX.id}, Price: ₹${productX.price})`);
  console.log(`    ✅ Product Y: "${productY.name}" (ID: ${productY.id}, Price: ₹${productY.price})`);

  // 4. User A adds Product X to Cart
  console.log(`[4] User A adding Product X (qty 2) to Cart...`);
  const addARes = await request('/cart/items/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ product_id: productX.id, quantity: 2 }),
  });
  assert.strictEqual(addARes.status, 200, `Add to cart failed: ${JSON.stringify(addARes.data)}`);
  assert.strictEqual(addARes.data.total_items, 2, 'Total items should be 2');
  assert.strictEqual(addARes.data.items.length, 1);
  assert.strictEqual(addARes.data.items[0].product.id, productX.id);
  const cartItemA = addARes.data.items[0];
  console.log(`    ✅ User A cart updated: item ID ${cartItemA.id}, 2 units of "${productX.name}".`);

  // 5. User B logs in and fetches cart
  console.log(`[5] User B fetching cart (should be completely empty)...`);
  const cartBRes = await request('/cart/', {
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(cartBRes.status, 200);
  assert.strictEqual(cartBRes.data.total_items, 0, 'User B must NOT see User A items');
  assert.strictEqual(cartBRes.data.items.length, 0, 'User B cart items array must be empty');
  console.log(`    ✅ User B sees empty cart (0 items, isolated from User A).`);

  // 6. User B adds Product Y to Cart
  console.log(`[6] User B adding Product Y (qty 3) to Cart...`);
  const addBRes = await request('/cart/items/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ product_id: productY.id, quantity: 3 }),
  });
  assert.strictEqual(addBRes.status, 200);
  assert.strictEqual(addBRes.data.total_items, 3);
  assert.strictEqual(addBRes.data.items.length, 1);
  assert.strictEqual(addBRes.data.items[0].product.id, productY.id);
  const hasProductXInB = addBRes.data.items.some(i => i.product.id === productX.id);
  assert.strictEqual(hasProductXInB, false, 'User B cart must not contain Product X');
  console.log(`    ✅ User B cart contains only Product Y (qty 3).`);

  // 7. User A fetches cart again
  console.log(`[7] User A re-verifying their cart...`);
  const cartARefreshRes = await request('/cart/', {
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(cartARefreshRes.status, 200);
  assert.strictEqual(cartARefreshRes.data.total_items, 2, 'User A cart must remain 2');
  assert.strictEqual(cartARefreshRes.data.items.length, 1);
  assert.strictEqual(cartARefreshRes.data.items[0].product.id, productX.id);
  const hasProductYInA = cartARefreshRes.data.items.some(i => i.product.id === productY.id);
  assert.strictEqual(hasProductYInA, false, 'User A cart must not contain Product Y');
  console.log(`    ✅ User A still sees their original Product X (qty 2), isolated from User B.`);

  // 8. IDOR Attack: User B attempts to PATCH User A's cart item ID
  console.log(`[8] IDOR Defense: User B attempting to modify User A's cart item #${cartItemA.id}...`);
  const hackPatchRes = await request(`/cart/items/${cartItemA.id}/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ quantity: 99 }),
  });
  assert.strictEqual(hackPatchRes.status, 404, 'Direct object manipulation on another user item must return 404');
  console.log(`    ✅ User B patch rejected with 404 Not Found.`);

  // 9. IDOR Attack: User B attempts to DELETE User A's cart item ID
  console.log(`[9] IDOR Defense: User B attempting to delete User A's cart item #${cartItemA.id}...`);
  const hackDelRes = await request(`/cart/items/${cartItemA.id}/`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(hackDelRes.status, 404, 'Direct deletion on another user item must return 404');
  console.log(`    ✅ User B delete rejected with 404 Not Found.`);

  // Verify User A cart still has the item unchanged
  const cartAVerifyRes = await request('/cart/', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(cartAVerifyRes.data.items[0].quantity, 2, 'User A item quantity was corrupted');
  console.log(`    ✅ User A item remains intact with quantity 2.`);

  // 10. Address and Order Isolation
  console.log(`[10] Verifying address and order isolation...`);
  const addrARes = await request('/addresses/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      recipient_name: 'Alice Address',
      phone: '9876543210',
      address_line1: '100 Main St',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641001',
      address_type: 'home',
      is_default: true,
    }),
  });
  assert.strictEqual(addrARes.status, 201);
  const addressAId = addrARes.data.id;

  // User B tries to read User A address
  const addrBReadRes = await request(`/addresses/${addressAId}/`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(addrBReadRes.status, 404, 'User B must not read User A address');
  console.log(`    ✅ Address isolation: User B cannot access User A address (404 Not Found).`);

  // 11. Guest Cart Separation & Merge
  console.log(`[11] Testing Guest Cart isolation and authenticated merge...`);
  const guestSessionId = `test_guest_session_${randSuffix}`;
  const guestAddRes = await request('/cart/items/', {
    method: 'POST',
    headers: { 'X-Guest-Session-Id': guestSessionId },
    body: JSON.stringify({ product_id: productX.id, quantity: 1 }),
  });
  assert.strictEqual(guestAddRes.status, 200);
  assert.strictEqual(guestAddRes.data.total_items, 1);

  // User B merges guest cart
  const mergeRes = await request('/cart/merge/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ guest_session_id: guestSessionId }),
  });
  assert.strictEqual(mergeRes.status, 200);
  // User B had 3 of Product Y, now also has 1 of Product X -> total 4 items
  assert.strictEqual(mergeRes.data.total_items, 4);
  console.log(`    ✅ Guest cart merged safely into User B account (total items: 4).`);

  // 12. Cart clear isolation
  console.log(`[12] User B clearing cart...`);
  const clearBRes = await request('/cart/clear/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(clearBRes.status, 200);
  assert.strictEqual(clearBRes.data.cart.total_items, 0);

  // User A cart is unaffected by User B's clear
  const finalCartARes = await request('/cart/', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(finalCartARes.data.total_items, 2, 'User A cart should still have 2 items');
  console.log(`    ✅ User B cleared their cart (0 items). User A cart remains intact (2 items).`);

  console.log('===========================================================');
  console.log('🎉 ALL 12 STORE & CART ISOLATION AUDIT CHECKS PASSED!');
  console.log('===========================================================');
}

runLiveIsolationTests().catch((err) => {
  console.error('❌ ISOLATION TEST FAILED:', err);
  process.exit(1);
});
