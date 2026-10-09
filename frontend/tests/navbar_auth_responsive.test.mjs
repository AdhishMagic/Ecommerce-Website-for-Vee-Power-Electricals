import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const TOLERANCE = 2; // px

fs.mkdirSync('tests/screenshots/navbar', { recursive: true });

const VIEWPORTS = [
  { name: '1920x1080 (Desktop Large)', width: 1920, height: 1080 },
  { name: '1366x768 (Desktop Standard)', width: 1366, height: 768 },
  { name: '1024x768 (Desktop Compact / Tablet Landscape)', width: 1024, height: 768 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '390x844 (Mobile iPhone 12/13/14)', width: 390, height: 844 },
  { name: '375x812 (Mobile Standard)', width: 375, height: 812 },
  { name: '320x568 (Mobile Small)', width: 320, height: 568 },
];

const ADMIN = { email: 'admin@veepower.in', password: 'AdminPass123!' };
const CUSTOMER = { email: 'e2e_verified_customer@veepower.com', password: 'SecurePass123!' };

async function checkNoHorizontalOverflow(page, label) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  if (scrollWidth > innerWidth + TOLERANCE) {
    throw new Error(`[OVERFLOW] at ${label}: scrollWidth (${scrollWidth}) > innerWidth (${innerWidth})`);
  }
}

async function runTests() {
  console.log('--- STARTING NAVBAR AUTH & RESPONSIVE VALIDATION SUITE ---');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });

  try {
    // ----------------------------------------------------
    // TEST 1: Logged-out Navbar on Desktop (1366x768)
    // ----------------------------------------------------
    console.log('\n[1] Testing Logged-out Desktop Navbar...');
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/shop`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Check Login action is visible and labeled 'Login'
    const loginLink = page.locator('header a[href*="/login"]');
    await loginLink.first().waitFor({ state: 'visible', timeout: 5000 });
    const loginText = await loginLink.first().textContent();
    console.log(`  ✓ Login action visible with text: "${loginText.trim()}"`);
    if (!loginText.includes('Login')) {
      throw new Error(`Expected login action to have 'Login', found: ${loginText}`);
    }

    // Check return URL preserved in login link
    const loginHref = await loginLink.first().getAttribute('href');
    console.log(`  ✓ Login link href: ${loginHref}`);
    if (!loginHref.includes('redirect=')) {
      throw new Error(`Expected login href to contain return URL redirect, got: ${loginHref}`);
    }

    // Check search bar width
    const searchForm = page.locator('header form.search');
    const searchBox = await searchForm.boundingBox();
    console.log(`  ✓ Search bar width: ${searchBox.width.toFixed(1)}px (Bounded and balanced)`);
    if (searchBox.width > 500) {
      throw new Error(`Search bar too wide on 1366px desktop: ${searchBox.width}px`);
    }

    // Check Cart is accessible
    const cartLink = page.locator('header a[href="/cart"]').first();
    await cartLink.waitFor({ state: 'visible' });
    console.log('  ✓ Guest cart is accessible');

    await page.locator('header').screenshot({ path: 'tests/screenshots/navbar/desktop_logged_out.png' });
    await checkNoHorizontalOverflow(page, 'Logged-out Shop 1366x768');
    await context.close();

    // ----------------------------------------------------
    // TEST 2: Customer Login and Auth-Aware Navbar
    // ----------------------------------------------------
    console.log('\n[2] Testing Customer Login & Auth Navbar...');
    const custContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const custPage = await custContext.newPage();

    await custPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await custPage.fill('input[type="email"]', CUSTOMER.email);
    await custPage.fill('input[type="password"]', CUSTOMER.password);
    await custPage.click('button[type="submit"]');

    await custPage.waitForURL(/.*account/, { timeout: 15000 });
    console.log('  ✓ Successfully logged in as customer');

    // Go to homepage to check navbar in authenticated customer state
    await custPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await custPage.waitForTimeout(1000);

    // Verify account menu button displays customer name
    const accountBtn = custPage.locator('header button[aria-haspopup="menu"]');
    await accountBtn.waitFor({ state: 'visible', timeout: 5000 });
    const accountText = await accountBtn.textContent();
    console.log(`  ✓ Authenticated account button text: "${accountText.trim()}"`);

    // Click to open account dropdown
    await accountBtn.click();
    const dropdown = custPage.locator('header div[role="menu"]');
    await dropdown.waitFor({ state: 'visible', timeout: 3000 });
    console.log('  ✓ Dropdown opened on click');
    await custPage.locator('header').screenshot({ path: 'tests/screenshots/navbar/desktop_customer_dropdown.png' });

    // Verify Customer specific options
    const myAccountLink = dropdown.locator('a[href="/account"]');
    const myOrdersLink = dropdown.locator('a[href="/account/orders"]');
    const adminLink = dropdown.locator('a[href="/admin"]');

    if (!(await myAccountLink.isVisible())) throw new Error('My Account link not visible in customer menu');
    if (!(await myOrdersLink.isVisible())) throw new Error('My Orders link not visible in customer menu');
    if (await adminLink.isVisible()) throw new Error('Admin link should NOT be visible to customer');
    console.log('  ✓ Customer dropdown links verified: My Account, My Orders (No admin links exposed)');

    // Verify dropdown dismissal via outside click
    await custPage.mouse.click(10, 10);
    await custPage.waitForTimeout(300);
    const isClosed = !(await dropdown.isVisible());
    console.log(`  ✓ Outside-click dismissal: ${isClosed ? 'PASSED' : 'FAILED'}`);
    if (!isClosed) throw new Error('Dropdown did not close on outside click');

    // Verify Logout
    await accountBtn.click();
    await dropdown.waitFor({ state: 'visible' });
    const logoutBtn = dropdown.locator('button', { hasText: 'Logout' });
    await logoutBtn.click();

    await custPage.waitForURL(/.*login/, { timeout: 10000 });
    console.log('  ✓ Customer logout successful, redirected to login');

    // Navigate to /shop and verify navbar shows Login again
    await custPage.goto(`${BASE_URL}/shop`, { waitUntil: 'domcontentloaded' });
    await custPage.waitForTimeout(1000);
    const reloginLink = custPage.locator('header a[href*="/login"]');
    await reloginLink.first().waitFor({ state: 'visible' });
    console.log('  ✓ Navbar immediately updated to logged-out state (Login displayed)');

    await custContext.close();

    // ----------------------------------------------------
    // TEST 3: Admin Login and Role-Aware Navbar
    // ----------------------------------------------------
    console.log('\n[3] Testing Admin Login & Auth Navbar...');
    const adminContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const adminPage = await adminContext.newPage();

    await adminPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await adminPage.fill('input[type="email"]', ADMIN.email);
    await adminPage.fill('input[type="password"]', ADMIN.password);
    await adminPage.click('button[type="submit"]');

    await adminPage.waitForURL(/.*admin/, { timeout: 15000 });
    console.log('  ✓ Successfully logged in as admin');

    // Visit public shop page with admin session to verify admin navbar controls
    await adminPage.goto(`${BASE_URL}/shop`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(1000);

    const adminAccountBtn = adminPage.locator('header button[aria-haspopup="menu"]');
    await adminAccountBtn.waitFor({ state: 'visible', timeout: 5000 });
    const adminAccountText = await adminAccountBtn.textContent();
    console.log(`  ✓ Admin account button text: "${adminAccountText.trim()}"`);

    await adminAccountBtn.click();
    const adminDropdown = adminPage.locator('header div[role="menu"]');
    await adminDropdown.waitFor({ state: 'visible' });

    const adminDashLink = adminDropdown.locator('a[href="/admin"]');
    const adminSettingsLink = adminDropdown.locator('a[href="/admin/settings"]');
    const customerAccountLink = adminDropdown.locator('a[href="/account"]');

    if (!(await adminDashLink.isVisible())) throw new Error('Admin Dashboard link not visible in admin menu');
    if (!(await adminSettingsLink.isVisible())) throw new Error('Settings link not visible in admin menu');
    if (await customerAccountLink.isVisible()) throw new Error('Customer account link should not be in admin menu');
    console.log('  ✓ Admin dropdown links verified: Admin Dashboard, Settings');
    await adminPage.locator('header').screenshot({ path: 'tests/screenshots/navbar/desktop_admin_dropdown.png' });

    await adminContext.close();

    // ----------------------------------------------------
    // TEST 4: Search Form Functionality
    // ----------------------------------------------------
    console.log('\n[4] Testing Search Functionality...');
    const searchContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const sPage = await searchContext.newPage();
    await sPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await sPage.waitForTimeout(1000);

    const searchInput = sPage.locator('header form.search input[type="text"]');
    await searchInput.fill('switch');
    await sPage.locator('header form.search button[type="submit"]').click();

    await sPage.waitForURL(/.*shop\?q=switch.*/, { timeout: 5000 });
    console.log('  ✓ Search correctly navigates to /shop?q=switch');
    await searchContext.close();

    // ----------------------------------------------------
    // TEST 5: Responsive & Overflow Matrix across all Viewports
    // ----------------------------------------------------
    console.log('\n[5] Testing Viewport Matrix & Overflow Checks...');
    for (const vp of VIEWPORTS) {
      const vpContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const vpPage = await vpContext.newPage();
      await vpPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await vpPage.waitForSelector('header', { timeout: 10000 });
      await vpPage.waitForTimeout(800);

      await checkNoHorizontalOverflow(vpPage, vp.name);

      if (vp.width >= 1024) {
        // Desktop nav visible
        const nav = vpPage.locator('header nav.header-nav');
        if (!(await nav.isVisible())) throw new Error(`Desktop nav missing at ${vp.name}`);
        const search = vpPage.locator('header form.search');
        if (!(await search.isVisible())) throw new Error(`Search missing at ${vp.name}`);
        const sBox = await search.boundingBox();
        console.log(`  ✓ ${vp.name}: Desktop nav & Search visible (Search width: ${sBox.width.toFixed(1)}px, no overflow)`);
      } else if (vp.width >= 640) {
        // Tablet: Search visible, Hamburger visible, Header nav in hamburger
        const hamburger = vpPage.locator('header button[class*="lg:hidden"]');
        if (!(await hamburger.isVisible())) throw new Error(`Hamburger missing at ${vp.name}`);
        const search = vpPage.locator('header form.search');
        if (!(await search.isVisible())) throw new Error(`Search missing at ${vp.name}`);
        const sBox = await search.boundingBox();
        console.log(`  ✓ ${vp.name}: Tablet header balanced (Search width: ${sBox.width.toFixed(1)}px, no overflow)`);
        if (vp.width === 768) {
          await vpPage.locator('header').screenshot({ path: 'tests/screenshots/navbar/tablet_768.png' });
        }
      } else {
        // Mobile: Mobile search row visible, Hamburger visible, no overflow
        const hamburger = vpPage.locator('header button[class*="lg:hidden"]');
        if (!(await hamburger.isVisible())) throw new Error(`Hamburger missing at ${vp.name}`);
        const mobileSearch = vpPage.locator('header .sm\\:hidden form');
        if (!(await mobileSearch.isVisible())) throw new Error(`Mobile search row missing at ${vp.name}`);
        console.log(`  ✓ ${vp.name}: Mobile header compact & overflow-free`);
        if (vp.width === 375) {
          await vpPage.locator('header').screenshot({ path: 'tests/screenshots/navbar/mobile_375.png' });
          await hamburger.click();
          await vpPage.waitForTimeout(300);
          await vpPage.locator('header').screenshot({ path: 'tests/screenshots/navbar/mobile_drawer_375.png' });
        } else if (vp.width === 320) {
          await vpPage.locator('header').screenshot({ path: 'tests/screenshots/navbar/mobile_320.png' });
        }
      }

      await vpContext.close();
    }

    console.log('\n--- ALL NAVBAR AUTH & RESPONSIVE VALIDATION TESTS PASSED! ---');
  } finally {
    await browser.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ VALIDATION TEST FAILED:', err);
  process.exit(1);
});
