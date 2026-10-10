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

async function run() {
  console.log('=== TEST: ADMIN DATA CREATION & CUSTOMER REFLECTION ===\n');

  // Step 1: Admin Login
  console.log('[Step 1] Logging in as Admin (admin@veepower.in)...');
  const adminLogin = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@veepower.in',
      password: 'AdminPass123!',
    }),
  });
  assert(adminLogin.ok, `Admin login failed: ${JSON.stringify(adminLogin.data)}`);
  const adminToken = adminLogin.data.access;
  console.log('✓ Admin authenticated successfully. Role:', adminLogin.data.user.role);

  // Step 2: Create Data in Admin Side
  const sku = `VP-TEST-${Date.now()}`;
  const productName = 'VeePower Ultra Pro Modular Switch 16A';
  console.log(`\n[Step 2] Creating product in Admin side (SKU: ${sku})...`);

  // First fetch categories and brands to get valid IDs/names
  const catsRes = await request('/catalog/categories/');
  const cats = Array.isArray(catsRes.data) ? catsRes.data : catsRes.data.results || [];
  const switchCat = cats.find(c => c.name.toLowerCase().includes('switch')) || cats[0];

  const brandsRes = await request('/catalog/brands/');
  const brands = Array.isArray(brandsRes.data) ? brandsRes.data : brandsRes.data.results || [];
  const brand = brands.find(b => b.name.toLowerCase().includes('havells')) || brands[0];

  console.log(`Using Category: "${switchCat?.name}" (ID: ${switchCat?.id}), Brand: "${brand?.name}" (ID: ${brand?.id})`);

  const createRes = await request('/catalog/products/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: productName,
      sku: sku,
      category: switchCat?.id,
      brand: brand?.id,
      price: '349.00',
      mrp: '450.00',
      stock: 25,
      active: true,
      description: 'Premium modular switch tested for live customer synchronization.',
    }),
  });

  assert(createRes.ok, `Failed to create product via admin: ${JSON.stringify(createRes.data)}`);
  const createdProduct = createRes.data;
  console.log('✓ Product created in Admin successfully! Product ID:', createdProduct.id);
  console.log(`  Name: ${createdProduct.name}`);
  console.log(`  Price: ₹${createdProduct.price}`);
  console.log(`  Stock: ${createdProduct.stock}`);

  // Step 3: Check Customer Side View
  console.log('\n[Step 3] Querying Customer Storefront API (unauthenticated public customer view)...');
  const customerListRes = await request(`/catalog/products/?search=${encodeURIComponent(sku)}`);
  assert(customerListRes.ok, 'Failed to fetch customer products list');
  const customerItems = Array.isArray(customerListRes.data) ? customerListRes.data : customerListRes.data.results || [];
  const foundInCustomerView = customerItems.find(p => p.sku === sku || p.id === createdProduct.id);

  assert(foundInCustomerView, 'Created product NOT found in customer catalog search!');
  console.log('✓ Created product confirmed visible on Customer Storefront:');
  console.log(`  Customer visible ID: ${foundInCustomerView.id}`);
  console.log(`  Customer visible Name: ${foundInCustomerView.name}`);
  console.log(`  Customer visible Price: ₹${foundInCustomerView.price}`);

  // Check Product Detail page customer endpoint
  const customerDetailRes = await request(`/catalog/products/${createdProduct.id}/`);
  assert(customerDetailRes.ok, `Failed to fetch customer product detail for ID ${createdProduct.id}`);
  console.log('✓ Customer Product Detail view loaded successfully:');
  console.log(`  Name matches: ${customerDetailRes.data.name === productName}`);
  console.log(`  Price: ₹${customerDetailRes.data.price}`);
  console.log(`  In Stock: ${customerDetailRes.data.in_stock}`);

  // Step 4: Admin Updates Data (Change Price & Stock)
  console.log('\n[Step 4] Admin updates product (Price: 399.00, Stock: 50)...');
  const updateRes = await request(`/catalog/products/${createdProduct.id}/`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      price: '399.00',
      stock: 50,
      name: 'VeePower Ultra Pro Modular Switch 16A (Updated)',
    }),
  });
  assert(updateRes.ok, `Failed to update product: ${JSON.stringify(updateRes.data)}`);
  console.log('✓ Admin update applied successfully.');

  // Step 5: Verify Changes Applied to Customer Side
  console.log('\n[Step 5] Checking if Admin changes are immediately applied on Customer side...');
  const updatedCustomerDetail = await request(`/catalog/products/${createdProduct.id}/`);
  assert(updatedCustomerDetail.ok, 'Failed to re-fetch customer product detail');
  assert(
    updatedCustomerDetail.data.name === 'VeePower Ultra Pro Modular Switch 16A (Updated)',
    `Updated name mismatch: ${updatedCustomerDetail.data.name}`
  );
  assert(
    Number(updatedCustomerDetail.data.price) === 399,
    `Updated price mismatch. Expected 399, got ${updatedCustomerDetail.data.price}`
  );
  console.log('✓ Customer side reflects Admin changes in real-time!');
  console.log(`  Customer saw updated name: "${updatedCustomerDetail.data.name}"`);
  console.log(`  Customer saw updated price: ₹${updatedCustomerDetail.data.price}`);

  console.log('\n=== ALL ADMIN-TO-CUSTOMER SYNC TESTS PASSED! ===');
}

run().catch((err) => {
  console.error('\n❌ Test Error:', err);
  process.exit(1);
});
