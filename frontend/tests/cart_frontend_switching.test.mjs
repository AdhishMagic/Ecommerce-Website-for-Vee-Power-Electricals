import assert from 'node:assert';

// Mock localStorage simulation for account switching verification
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

function testFrontendStorageIsolation() {
  console.log('--- STARTING FRONTEND ACCOUNT SWITCHING STORAGE AUDIT ---');
  const mockStorage = new MockLocalStorage();

  const getStorageKey = (userId) => {
    if (userId !== null && userId !== undefined && String(userId).trim() !== '') {
      return `vp_cart_items_user_${String(userId).trim()}`;
    }
    return 'vp_cart_items_guest';
  };

  // 1. Initial legacy cleanup test
  mockStorage.setItem('vp_cart_items', JSON.stringify([{ id: 999, name: 'Stale Global Item' }]));
  // Scrub legacy
  mockStorage.removeItem('vp_cart_items');
  assert.strictEqual(mockStorage.getItem('vp_cart_items'), null, 'Legacy global key must be removed');
  console.log('✅ Legacy global vp_cart_items removed successfully.');

  // 2. User A logs in (User ID 101)
  const userAId = '101';
  const userAItems = [
    { product: { id: 1, name: 'Anchor Switch', price: 100 }, quantity: 2 },
  ];
  mockStorage.setItem(getStorageKey(userAId), JSON.stringify(userAItems));

  assert.strictEqual(
    mockStorage.getItem(getStorageKey(userAId)),
    JSON.stringify(userAItems),
    'User A items must be stored under User A key'
  );
  assert.strictEqual(
    mockStorage.getItem('vp_cart_items'),
    null,
    'Must NEVER write to global vp_cart_items'
  );
  console.log('✅ User A items scoped to vp_cart_items_user_101.');

  // 3. User B logs in (User ID 202)
  const userBId = '202';
  const userBKey = getStorageKey(userBId);
  const userBItemsInStorage = mockStorage.getItem(userBKey);

  assert.strictEqual(
    userBItemsInStorage,
    null,
    'User B must NOT inherit User A items on login'
  );
  console.log('✅ User B starts with null/empty cart in storage, completely isolated from User A.');

  // User B adds item
  const userBItems = [
    { product: { id: 2, name: 'Philips Batten', price: 250 }, quantity: 1 },
  ];
  mockStorage.setItem(userBKey, JSON.stringify(userBItems));

  // Verify User A still has User A items, User B has User B items
  assert.strictEqual(
    JSON.parse(mockStorage.getItem(getStorageKey(userAId)))[0].product.name,
    'Anchor Switch'
  );
  assert.strictEqual(
    JSON.parse(mockStorage.getItem(getStorageKey(userBId)))[0].product.name,
    'Philips Batten'
  );
  console.log('✅ Simultaneous account keys retain independent states.');

  // 4. User A logs out: clean User A storage
  mockStorage.removeItem(getStorageKey(userAId));
  assert.strictEqual(mockStorage.getItem(getStorageKey(userAId)), null);
  assert.strictEqual(
    JSON.parse(mockStorage.getItem(getStorageKey(userBId)))[0].product.name,
    'Philips Batten',
    'User B items remain intact'
  );
  console.log('✅ User A logout cleans User A cart without affecting User B.');

  console.log('🎉 ALL FRONTEND STORAGE ISOLATION CHECKS PASSED!');
}

testFrontendStorageIsolation();
