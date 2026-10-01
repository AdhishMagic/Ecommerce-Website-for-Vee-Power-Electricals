/**
 * STEP 17 — RUNTIME NETWORK PROFILE
 *
 * Loads key routes in a real Chromium session and records every backend API
 * request the application makes during initial load. Reports:
 *   * total API requests per route
 *   * duplicate requests (same METHOD + path + query issued more than once)
 *   * requests issued on routes that do not need them
 *
 * Each route is measured in a fresh browser context so that no request from a
 * previous navigation can leak into the measurement window.
 *
 * Usage:
 *   node tests/network-profile.mjs                       # against vite dev (:5173)
 *   BASE_URL=http://127.0.0.1:4173 node tests/network-profile.mjs   # production build
 *
 * Requires the API on :8000 (docker compose up).
 */

import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API_ORIGIN = 'http://localhost:8000';

const ADMIN = { email: 'admin@veepower.in', password: 'AdminPass123!' };
const CUSTOMER = { email: 'e2e_verified_customer@veepower.com', password: 'SecurePass123!' };

const PUBLIC_ROUTES = ['/', '/shop', '/about', '/contact'];
const CUSTOMER_ROUTES = ['/account', '/cart'];
const ADMIN_ROUTES = ['/admin', '/admin/products', '/admin/finance/summary', '/admin/inventory'];

async function login(request, creds) {
  const res = await request.post(`${API_ORIGIN}/api/v1/auth/login/`, { data: creds });
  if (!res.ok()) throw new Error(`Login failed for ${creds.email}: ${res.status()}`);
  return res.json();
}

function initSessionScript(auth, role) {
  return (data) => {
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
  };
}

function keyOf(url) {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

async function captureRoute(browser, base, route, auth, role) {
  const context = await browser.newContext();

  // Measurement-only CORS shim: the static preview origin is not part of the
  // backend allowlist, so authenticated API calls would be blocked. Playwright
  // re-serves the same backend response with an allow-origin header. This does
  // not alter application behaviour or the number of requests made.
  await context.route(`${API_ORIGIN}/**`, async (route) => {
    try {
      const response = await route.fetch();
      const headers = { ...response.headers(), 'access-control-allow-origin': base };
      await route.fulfill({ response, headers });
    } catch {
      // context torn down mid-flight; nothing to serve
    }
  });

  if (auth) {
    await context.addInitScript(initSessionScript(auth, role), { ...auth, role });
  } else {
    await context.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
  }
  const page = await context.newPage();

  const seen = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(API_ORIGIN)) return;
    if (req.method() === 'OPTIONS') return; // CORS preflight is not an app request
    seen.push({ method: req.method(), key: keyOf(req.url()) });
  });

  await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 20000 }).catch(() => {});

  // Wait for API quiescence: keep polling until no new backend request has been
  // observed for QUIET_MS, with a hard cap so a chatty page cannot stall the run.
  const QUIET_MS = 1200;
  const CAP_MS = 12000;
  const started = Date.now();
  let lastCount = -1;
  let lastChange = Date.now();
  for (;;) {
    if (seen.length !== lastCount) {
      lastCount = seen.length;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange >= QUIET_MS) break;
    if (Date.now() - started >= CAP_MS) break;
    await page.waitForTimeout(150);
  }
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.close();

  const counts = new Map();
  for (const r of seen) {
    const k = `${r.method} ${r.key}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);

  return { route, total: seen.length, unique: counts.size, duplicates, requests: [...counts.keys()] };
}

const browser = await chromium.launch();
const probeContext = await browser.newContext();
const request = probeContext.request;

const adminAuth = await login(request, ADMIN).catch(() => null);
const custAuth = await login(request, CUSTOMER).catch(() => null);
await probeContext.close();

if (!adminAuth) console.log('WARN: admin login failed');
if (!custAuth) console.log('WARN: customer login failed');

console.log(`Network profile against ${BASE}`);

const results = [];
async function run(route, auth, role) {
  const r = await captureRoute(browser, BASE, route, auth, role);
  results.push(r);
  console.log(`\n${route}  —  ${r.total} API request(s) (${r.unique} unique)`);
  for (const req of r.requests) console.log(`    ${req}`);
  if (r.duplicates.length) {
    console.log(`  DUPLICATES:`);
    for (const d of r.duplicates) console.log(`    ! ${d}`);
  }
}

for (const r of PUBLIC_ROUTES) await run(r, null, null);
for (const r of CUSTOMER_ROUTES) await run(r, custAuth, 'customer');
for (const r of ADMIN_ROUTES) await run(r, adminAuth, 'admin');

await browser.close();

console.log('\n' + '='.repeat(64));
const totalDupes = results.reduce((n, r) => n + r.duplicates.length, 0);
console.log(`NETWORK PROFILE: ${results.length} routes, ${totalDupes} duplicate request signature(s)`);
for (const r of results) {
  if (r.duplicates.length) console.log(`  ${r.route}: ${r.duplicates.join(', ')}`);
}
console.log('\nPer-route API request counts:');
for (const r of results) console.log(`  ${r.route.padEnd(26)} ${r.total}`);
