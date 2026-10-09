import { chromium } from '@playwright/test';

async function testAdminImagePreview() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));

  // 1. Login
  console.log('Logging in as admin...');
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'admin@veepower.in');
  await page.fill('input[type="password"]', 'AdminPass123!');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/admin', { timeout: 20000 });
  console.log('Navigated to:', page.url());

  // 2. Open Product Form (Add New Product)
  console.log('Navigating to Add Product form (/admin/products/add)...');
  await page.goto('http://localhost:5173/admin/products/add');
  await page.waitForSelector('text=Add New Product', { timeout: 20000 });
  console.log('Add New Product form loaded.');

  // Take screenshot of initial state
  await page.screenshot({ path: 'tests/screenshots/form-initial.png' });

  // 3. Inspect Category Dropdown
  const categorySelect = page.locator('select').nth(1); // Second select is Category in Section 0
  const options = await categorySelect.locator('option').allTextContents();
  console.log('Available Category options:', options);

  // 4. Select "MCB & Protection"
  console.log('Selecting "MCB & Protection"...');
  await categorySelect.selectOption({ label: 'MCB & Protection' });
  await page.waitForTimeout(500);

  // 5. Click "Product Image" tab
  console.log('Clicking "Product Image" section...');
  await page.click('button:has-text("Product Image")');
  await page.waitForSelector('text=Product Image Management', { timeout: 10000 });
  await page.waitForTimeout(800);

  // 6. Inspect Image element
  const imgLocator = page.locator('div.border.border-\\[\\#D9E1E8\\].rounded-2xl img');
  const count = await imgLocator.count();
  console.log('Found image elements in preview card:', count);

  if (count > 0) {
    const src = await imgLocator.first().getAttribute('src');
    const naturalWidth = await imgLocator.first().evaluate(el => el.naturalWidth);
    const naturalHeight = await imgLocator.first().evaluate(el => el.naturalHeight);
    const isComplete = await imgLocator.first().evaluate(el => el.complete);
    console.log('Preview Image details:');
    console.log('  src:', src);
    console.log('  naturalWidth:', naturalWidth);
    console.log('  naturalHeight:', naturalHeight);
    console.log('  complete:', isComplete);
  }

  await page.screenshot({ path: 'tests/screenshots/form-mcb-preview.png' });
  console.log('Saved screenshot to tests/screenshots/form-mcb-preview.png');

  await browser.close();
}

testAdminImagePreview().catch(console.error);
