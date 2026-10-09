import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
fs.mkdirSync('tests/screenshots/adhish_orders', { recursive: true });

const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzkxNTQ5NDY2LCJpYXQiOjE3OTE1NDc2NjYsImp0aSI6IjY5YTJjNjNmYmEwZjQ0M2M5ODM4Zjk1NWVlZTJhYzQxIiwidXNlcl9pZCI6IjE5MSIsImlzcyI6InZlZXBvd2VyLWF1dGgifQ.IZnVGu0fbiO9MuT5TrU13R8rK29Srz7Uypzx1okMsVE';
const REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc5MjE1MjQ2NiwiaWF0IjoxNzkxNTQ3NjY2LCJqdGkiOiIxMjRjMmU0ZTZjYzk0MWYwYjY3OTQzZjhiNzMwYzE4MyIsInVzZXJfaWQiOiIxOTEiLCJpc3MiOiJ2ZWVwb3dlci1hdXRoIn0.pE98t7jmLtlL4GZLegIyULkxe21ViosrXngsFYCvwSQ';

const ADHISH_USER = {
  id: 191,
  name: 'Adhish User',
  email: 'adhish@example.com',
  phone: '',
  role: 'customer',
};

async function capture() {
  console.log('--- CAPTURING ADHISH USER MY ORDERS EXPERIENCE ---');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });

  // 1. Desktop 1920x1080 (Exact matching user screenshot resolution)
  console.log('[1] Capturing Desktop 1920x1080...');
  const ctxDesktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctxDesktop.addInitScript(({ token, refresh, user }) => {
    localStorage.setItem('auth_access_token', token);
    localStorage.setItem('auth_token', token);
    sessionStorage.setItem('vp_token', token);
    localStorage.setItem('auth_refresh_token', refresh);
    sessionStorage.setItem('vp_refresh_token', refresh);
    localStorage.setItem('vp_user', JSON.stringify(user));
    sessionStorage.setItem('vp_user', JSON.stringify(user));
    localStorage.setItem('vp_role', user.role);
    sessionStorage.setItem('vp_role', user.role);
  }, { token: ACCESS_TOKEN, refresh: REFRESH_TOKEN, user: ADHISH_USER });

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
  await ctxTablet.addInitScript(({ token, refresh, user }) => {
    localStorage.setItem('auth_access_token', token);
    localStorage.setItem('auth_token', token);
    sessionStorage.setItem('vp_token', token);
    localStorage.setItem('vp_user', JSON.stringify(user));
    sessionStorage.setItem('vp_user', JSON.stringify(user));
    localStorage.setItem('vp_role', user.role);
  }, { token: ACCESS_TOKEN, refresh: REFRESH_TOKEN, user: ADHISH_USER });
  const pageTab = await ctxTablet.newPage();
  await pageTab.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
  await pageTab.locator('article').first().waitFor({ state: 'visible', timeout: 10000 });
  await pageTab.screenshot({ path: 'tests/screenshots/adhish_orders/tablet_768_my_orders.png' });
  console.log('  ✓ Saved: tests/screenshots/adhish_orders/tablet_768_my_orders.png');

  // 4. Mobile (390x844)
  console.log('[4] Capturing Mobile 390x844...');
  const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctxMobile.addInitScript(({ token, refresh, user }) => {
    localStorage.setItem('auth_access_token', token);
    localStorage.setItem('auth_token', token);
    sessionStorage.setItem('vp_token', token);
    localStorage.setItem('vp_user', JSON.stringify(user));
    sessionStorage.setItem('vp_user', JSON.stringify(user));
    localStorage.setItem('vp_role', user.role);
  }, { token: ACCESS_TOKEN, refresh: REFRESH_TOKEN, user: ADHISH_USER });
  const pageMob = await ctxMobile.newPage();
  await pageMob.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
  await pageMob.locator('article').first().waitFor({ state: 'visible', timeout: 10000 });
  await pageMob.screenshot({ path: 'tests/screenshots/adhish_orders/mobile_390_my_orders.png' });
  console.log('  ✓ Saved: tests/screenshots/adhish_orders/mobile_390_my_orders.png');

  await browser.close();
  console.log('--- ALL SCREENSHOTS CAPTURED ---');
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
