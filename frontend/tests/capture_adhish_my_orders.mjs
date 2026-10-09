import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
fs.mkdirSync('tests/screenshots/adhish_orders', { recursive: true });

const CUSTOMER = { email: 'rajesh.kumar@example.com', password: 'CustomerPass123!' };

async function capture() {
  console.log('--- CAPTURING CUSTOMER MY ORDERS EXPERIENCE ---');

  const loginRes = await fetch('http://localhost:8000/api/v1/auth/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CUSTOMER),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`Customer login failed: ${JSON.stringify(loginData)}`);
  }

  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  });

  const injectAuth = ({ token, refresh, user }) => {
    const u = {
      id: user.id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      phone: user.phone || '',
      role: user.role,
    };
    localStorage.setItem('auth_access_token', token);
    localStorage.setItem('auth_token', token);
    sessionStorage.setItem('vp_token', token);
    if (refresh) {
      localStorage.setItem('auth_refresh_token', refresh);
      sessionStorage.setItem('vp_refresh_token', refresh);
    }
    localStorage.setItem('vp_user', JSON.stringify(u));
    sessionStorage.setItem('vp_user', JSON.stringify(u));
    localStorage.setItem('vp_role', user.role);
    sessionStorage.setItem('vp_role', user.role);
  };

  // 1. Desktop 1920x1080
  console.log('[1] Capturing Desktop 1920x1080...');
  const ctxDesktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctxDesktop.addInitScript(injectAuth, { token: loginData.access, refresh: loginData.refresh, user: loginData.user });

  const page = await ctxDesktop.newPage();
  await page.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
  await page.locator('article').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'tests/screenshots/adhish_orders/desktop_1920_my_orders.png' });
  console.log('  ✓ Saved: tests/screenshots/adhish_orders/desktop_1920_my_orders.png');

  // 2. Click "View Details" to capture Order Detail
  console.log('[2] Capturing Order Details View...');
  await page.locator('button:has-text("View Details")').first().click();
  await page.locator('button:has-text("Back to All Orders")').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/screenshots/adhish_orders/desktop_1920_order_details.png' });
  console.log('  ✓ Saved: tests/screenshots/adhish_orders/desktop_1920_order_details.png');

  // 3. Tablet (768x1024)
  console.log('[3] Capturing Tablet 768x1024...');
  const ctxTablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  await ctxTablet.addInitScript(injectAuth, { token: loginData.access, refresh: loginData.refresh, user: loginData.user });
  const pageTab = await ctxTablet.newPage();
  await pageTab.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
  await pageTab.locator('article').first().waitFor({ state: 'visible', timeout: 10000 });
  await pageTab.screenshot({ path: 'tests/screenshots/adhish_orders/tablet_768_my_orders.png' });
  console.log('  ✓ Saved: tests/screenshots/adhish_orders/tablet_768_my_orders.png');

  // 4. Mobile (390x844)
  console.log('[4] Capturing Mobile 390x844...');
  const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctxMobile.addInitScript(injectAuth, { token: loginData.access, refresh: loginData.refresh, user: loginData.user });
  const pageMob = await ctxMobile.newPage();
  await pageMob.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
  await pageMob.locator('article').first().waitFor({ state: 'visible', timeout: 10000 });
  await pageMob.screenshot({ path: 'tests/screenshots/adhish_orders/mobile_390_my_orders.png' });
  console.log('  ✓ Saved: tests/screenshots/adhish_orders/mobile_390_my_orders.png');

  await browser.close();
  console.log('--- ALL SCREENSHOTS CAPTURED SUCCESSFULLY ---');
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
