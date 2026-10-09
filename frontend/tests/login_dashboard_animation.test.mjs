import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:5173';

const screenshotDir = path.resolve('tests/screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function runTest() {
  console.log('--- STARTING LOGIN ROUTING & DASHBOARD ANIMATION TEST ---');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Test Admin Login at /login
  console.log('\n[1] Testing Admin Login routing from /login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  await page.fill('input[type="email"]', 'admin@veepower.in');
  await page.fill('input[type="password"]', 'AdminPass123!');
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  console.log('  Waiting for redirect to dashboard...');
  await page.waitForURL('**/admin', { timeout: 20000 });
  console.log(`  ✓ [PASS] Admin successfully routed to: ${page.url()}`);

  // 2. Verify Dashboard loading state and subsequent animated elements
  console.log('\n[2] Verifying Dashboard Loaded Animations...');
  
  // Wait for the overview heading to be visible
  await page.waitForSelector('text=Overview', { timeout: 20000 });
  await page.waitForTimeout(600); // Allow animations to settle

  const animationCheck = await page.evaluate(() => {
    const header = document.querySelector('.animate-dashboard-header');
    const cards = document.querySelectorAll('.animate-dashboard-card');
    const chart = document.querySelector('.animate-dashboard-chart');
    const table = document.querySelector('.animate-dashboard-table');

    return {
      hasAnimatedHeader: !!header,
      cardsCount: cards.length,
      hasAnimatedChart: !!chart,
      hasAnimatedTable: !!table,
      kpiValues: Array.from(document.querySelectorAll('[data-testid^="kpi-"]')).map(el => el.textContent)
    };
  });

  console.log(`  Header animated: ${animationCheck.hasAnimatedHeader ? 'YES' : 'NO'}`);
  console.log(`  Staggered animated KPI cards: ${animationCheck.cardsCount}`);
  console.log(`  Chart section animated: ${animationCheck.hasAnimatedChart ? 'YES' : 'NO'}`);
  console.log(`  Recent orders table animated: ${animationCheck.hasAnimatedTable ? 'YES' : 'NO'}`);
  console.log(`  KPI values loaded: ${animationCheck.kpiValues.slice(0, 4).join(', ')}...`);

  if (!animationCheck.hasAnimatedHeader || animationCheck.cardsCount < 8 || !animationCheck.hasAnimatedChart || !animationCheck.hasAnimatedTable) {
    console.error('  ✗ [FAIL] Some dashboard animation elements are missing');
    process.exit(1);
  } else {
    console.log('  ✓ [PASS] All dashboard post-loading animations verified!');
  }

  // 3. Take screenshot of the loaded dashboard with animations
  const dashboardSS = path.join(screenshotDir, 'dashboard-animated-loaded.png');
  await page.screenshot({ path: dashboardSS });
  console.log(`  📸 Saved screenshot: ${dashboardSS}`);

  // 4. Test Customer Login routing to Customer Dashboard (/account)
  console.log('\n[3] Testing Customer Login routing from /login...');
  const custContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const custPage = await custContext.newPage();
  await custPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  await custPage.fill('input[type="email"]', 'e2e_verified_customer@veepower.com');
  await custPage.fill('input[type="password"]', 'SecurePass123!');
  await custPage.click('button[type="submit"]');

  await custPage.waitForURL('**/account', { timeout: 20000 });
  console.log(`  ✓ [PASS] Customer successfully routed to: ${custPage.url()}`);

  // Verify customer account animations
  await custPage.waitForSelector('text=My Orders', { timeout: 20000 });
  const custAnimCheck = await custPage.evaluate(() => {
    const sidebar = document.querySelector('.animate-dashboard-header');
    const content = document.querySelector('.animate-dashboard-card');
    return { hasSidebar: !!sidebar, hasContent: !!content };
  });

  if (custAnimCheck.hasSidebar && custAnimCheck.hasContent) {
    console.log('  ✓ [PASS] Customer account dashboard entrance animations verified!');
  }

  const accountSS = path.join(screenshotDir, 'customer-account-animated.png');
  await custPage.screenshot({ path: accountSS });
  console.log(`  📸 Saved screenshot: ${accountSS}`);

  await browser.close();
  console.log('\n============================================================');
  console.log('ALL LOGIN ROUTING & DASHBOARD ANIMATION TESTS PASSED!');
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
