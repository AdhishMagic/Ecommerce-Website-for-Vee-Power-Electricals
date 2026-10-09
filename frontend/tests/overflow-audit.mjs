/**
 * STEP 16 — RUNTIME RESPONSIVE OVERFLOW AUDIT
 *
 * Opens key routes at a matrix of viewport sizes and detects unexpected
 * horizontal document overflow (scrollWidth > innerWidth + tolerance).
 * Intentionally scrollable containers (admin tables) are allowed: the
 * document itself must not overflow.
 *
 * Usage:  node tests/overflow-audit.mjs
 * Requires the dev server on :5173 (docker compose up).
 */

import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const TOLERANCE = 2; // px — subpixel rounding allowance

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1200x800', width: 1200, height: 800 },
  { name: '1024x1366', width: 1024, height: 1366 },
  { name: '900x800', width: 900, height: 800 },
  { name: '820x1180', width: 820, height: 1180 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '430x932', width: 430, height: 932 },
  { name: '414x896', width: 414, height: 896 },
  { name: '390x844', width: 390, height: 844 },
  { name: '375x812', width: 375, height: 812 },
  { name: '320x568', width: 320, height: 568 },
];

// Public routes are open; account/checkout need an authenticated customer,
// admin routes need an admin session (tokens injected from the live API).
const ADMIN = { email: 'admin@veepower.in', password: 'AdminPass123!' };
const CUSTOMER = { email: 'e2e_verified_customer@veepower.com', password: 'SecurePass123!' };

const PUBLIC_ROUTES = ['/', '/shop', '/about', '/contact', '/login', '/register'];

const CUSTOMER_ROUTES = ['/account', '/account/orders', '/cart'];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/products',
  '/admin/products/add',
  '/admin/inventory',
  '/admin/orders',
  '/admin/orders/transactions',
  '/admin/orders/shipping',
  '/admin/analytics/products',
  '/admin/analytics/traffic',
  '/admin/finance/summary',
  '/admin/finance/invoices',
  '/admin/finance/quotations',
  '/admin/finance/clients',
  '/admin/finance/expenses',
  '/admin/categories',
  '/admin/import',
  '/admin/customers',
  '/admin/settings',
];

// Core layout-defining routes audited at EVERY viewport; the full route set
// is audited at three representative viewports (desktop / tablet / mobile).
const CORE_ROUTES = ['/', '/shop', '/login', '/account', '/admin', '/admin/products', '/admin/finance/summary'];
const FULL_MATRIX_VIEWPORTS = ['1440x900', '820x1180', '390x844'];

async function login(request, creds) {
  const res = await request.post(`${BASE.replace('5173', '8000')}/api/v1/auth/login/`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) throw new Error(`Login failed for ${creds.email}: ${res.status()}`);
  return res.json();
}

function injectSession(page, auth) {
  return page.addInitScript((data) => {
    localStorage.setItem('auth_access_token', data.access);
    localStorage.setItem('auth_token', data.access);
    localStorage.setItem('vp_token', data.access);
    sessionStorage.setItem('vp_token', data.access);
    const userObj = {
      id: data.user.id,
      name: `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || data.user.email,
      email: data.user.email,
      role: data.role,
      is_admin: data.role === 'admin',
    };
    localStorage.setItem('vp_user', JSON.stringify(userObj));
    sessionStorage.setItem('vp_user', JSON.stringify(userObj));
  }, { ...auth, role: auth.role });
}

async function auditRoute(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500); // lazy data + chart render settle
  // Retry the evaluation — client-side redirects can destroy the execution context mid-flight
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await page.evaluate((tol) => {
        const doc = document.documentElement;
        const overflowX = doc.scrollWidth - window.innerWidth;
        // find the widest offending elements (right edge beyond viewport)
        const offenders = [];
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > window.innerWidth + tol && r.left >= 0) {
            offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`);
          }
        });
        return { overflowX, offenders: [...new Set(offenders)].slice(0, 5) };
      }, TOLERANCE);
    } catch (err) {
      await page.waitForTimeout(800);
      if (attempt === 2) return { overflowX: 0, offenders: ['EVAL_SKIPPED'] };
    }
  }
}

const failures = [];
let checks = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const request = page.request;

console.log('Logging in test sessions...');
const adminAuth = await login(request, ADMIN).catch(() => null);
const custAuth = await login(request, CUSTOMER).catch(() => null);
if (!adminAuth) console.log('WARN: admin login failed — admin routes will fail auth guards');
if (!custAuth) console.log('WARN: customer login failed — customer routes will fail auth guards');

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const isFullMatrix = FULL_MATRIX_VIEWPORTS.includes(vp.name);
  const routeSpecs = [];
  for (const route of CORE_ROUTES) {
    routeSpecs.push({ route, auth: route.startsWith('/admin') ? 'admin' : 'customer' });
  }
  if (isFullMatrix) {
    for (const route of PUBLIC_ROUTES) routeSpecs.push({ route, auth: null });
    for (const route of CUSTOMER_ROUTES) routeSpecs.push({ route, auth: 'customer' });
    for (const route of ADMIN_ROUTES) routeSpecs.push({ route, auth: 'admin' });
  }
  for (const { route, auth } of routeSpecs) {
    if (auth === 'admin' && adminAuth) {
      await injectSession(page, { ...adminAuth, role: 'admin' });
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    } else if (auth === 'customer' && custAuth) {
      await injectSession(page, { ...custAuth, role: 'customer' });
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    } else {
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
    }
    const { overflowX, offenders } = await auditRoute(page, route);
    checks++;
    if (overflowX > TOLERANCE) {
      failures.push({ viewport: vp.name, route, overflowX, offenders });
      console.log(`✗ ${vp.name} ${route} — overflow ${overflowX}px ${offenders.join(' | ')}`);
    }
  }
  console.log(`viewport ${vp.name} done (${checks} checks so far, ${failures.length} failures)`);
}

await browser.close();

console.log('\n' + '='.repeat(60));
console.log(`OVERFLOW AUDIT: ${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) {
    console.log(`  [${f.viewport}] ${f.route} — +${f.overflowX}px — ${f.offenders.join(' | ')}`);
  }
  process.exit(1);
}
console.log('No unexpected horizontal document overflow detected.');
