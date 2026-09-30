/**
 * STEP 16 — VISUAL REGRESSION CAPTURE
 *
 * Captures baseline screenshots of critical pages at desktop / tablet /
 * mobile. Screenshots are stored under tests/screenshots/ for manual
 * comparison and future automated diffing. Dynamic data areas are masked
 * (timestamps, live counters) to avoid noise.
 *
 * Usage: node tests/visual-capture.mjs [--compare]
 * Requires the dev server on :5173.
 */

import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT_DIR = 'tests/screenshots';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const ADMIN = { email: 'admin@veepower.in', password: 'AdminPass123!' };
const CUSTOMER = { email: 'e2e_verified_customer@veepower.com', password: 'SecurePass123!' };

const PUBLIC_PAGES = [
  { path: '/', name: 'homepage' },
  { path: '/shop', name: 'shop' },
  { path: '/login', name: 'login' },
];

const ADMIN_PAGES = [
  { path: '/admin', name: 'admin-dashboard' },
  { path: '/admin/finance/summary', name: 'finance-summary' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();

async function captureFor(auth, pages, session) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (auth) {
    const res = await page.request.post(`${BASE.replace('5173', '8000')}/api/v1/auth/login/`, {
      data: auth,
    });
    const data = await res.json();
    await page.addInitScript((d) => {
      localStorage.setItem('auth_access_token', d.access);
      localStorage.setItem('vp_token', d.access);
      sessionStorage.setItem('vp_token', d.access);
      const u = { id: d.user.id, name: d.user.first_name || d.user.email, email: d.user.email, role: d.role, is_admin: d.role === 'admin' };
      localStorage.setItem('vp_user', JSON.stringify(u));
      sessionStorage.setItem('vp_user', JSON.stringify(u));
    }, { ...data, role: session });
  }
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const p of pages) {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1200);
      // Mask dynamic content: clocks, dates, order counters
      await page.evaluate(() => {
        document.querySelectorAll('time, [class*="timestamp"]').forEach((el) => {
          el.textContent = '00:00:00';
        });
      });
      const file = `${OUT_DIR}/${p.name}-${vp.name}.png`;
      await page.screenshot({ path: file, fullPage: false });
      console.log(`captured ${file}`);
    }
  }
  await ctx.close();
}

await captureFor(null, PUBLIC_PAGES, null);
await captureFor(CUSTOMER, [{ path: '/cart', name: 'cart' }], 'customer');
await captureFor(ADMIN, ADMIN_PAGES, 'admin');

await browser.close();
console.log('Visual capture complete.');
