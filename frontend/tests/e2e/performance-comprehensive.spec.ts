import { test, expect, type Page } from '@playwright/test';

/**
 * STEP 17 — PERFORMANCE VALIDATION SUITE
 *
 * Structural performance regression checks. These deliberately avoid
 * wall-clock thresholds (which are unstable in a shared dev environment) and
 * instead assert *what the application loads and requests*:
 *
 *   * customer routes do not fetch data that only admin screens consume
 *   * the chart library and the admin layout are only loaded on admin routes
 *   * route-level code splitting keeps navigation working
 *   * images below the fold are lazily decoded
 *
 * Counts are compared as *distinct endpoint sets* rather than raw request
 * counts, because React StrictMode double-invokes mount effects in the Vite
 * dev server (a development-only behaviour) and would double every count.
 */

test.describe('Step 17: Performance Validation', () => {
  // Two-settle tests can spend up to 2 x the settle cap in a stalled environment.
  test.setTimeout(120_000);

  const ADMIN = { email: 'admin@veepower.in', password: 'AdminPass123!' };
  const CUSTOMER = { email: 'e2e_verified_customer@veepower.com', password: 'SecurePass123!' };

  const API_ORIGIN = 'http://localhost:8000';

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  async function apiLogin(request: any, creds: { email: string; password: string }) {
    const res = await request.post(`${API_ORIGIN}/api/v1/auth/login/`, { data: creds });
    expect(res.status()).toBe(200);
    return res.json();
  }

  function injectSession(page: Page, auth: any, role: 'admin' | 'customer') {
    return page.addInitScript(
      (data: any) => {
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
      },
      { ...auth, role }
    );
  }

  async function loginAsAdmin(page: Page, request: any) {
    await injectSession(page, await apiLogin(request, ADMIN), 'admin');
  }

  async function loginAsCustomer(page: Page, request: any) {
    await injectSession(page, await apiLogin(request, CUSTOMER), 'customer');
  }

  /**
   * Records every request the page makes from the moment this is called.
   * Returns an accessor plus a helper that waits until no new request has been
   * observed for a short quiet period (so late lazy-chunk loads are included).
   */
  function trackRequests(page: Page) {
    const urls: string[] = [];
    const listener = (req: any) => urls.push(req.url());
    page.on('request', listener);

    // The cap only applies to a *stalled* window. A cold Vite dev-server boot can
    // take longer than the old 15s cap under load, which closed the window before the
    // app had issued its first API request and made the request-set assertions fail on
    // an empty list. Waiting longer does not hide a genuinely missing request — the
    // quiet window still ends as soon as the network goes idle.
    const settle = async (quietMs = 1200, capMs = 30000) => {
      const started = Date.now();
      let last = -1;
      let lastChange = Date.now();
      for (;;) {
        if (urls.length !== last) {
          last = urls.length;
          lastChange = Date.now();
        }
        if (Date.now() - lastChange >= quietMs) break;
        if (Date.now() - started >= capMs) break;
        await page.waitForTimeout(150);
      }
    };

    // Only API endpoints count. Product imagery is served from the same origin as
    // the API (http://localhost:8000/media/...), and whether the browser gets round to
    // requesting those lazy images inside the settle window is pure timing — that
    // made "the endpoints the route needs" flaky. Static assets are not endpoints.
    const apiPaths = () =>
      urls
        .filter((u) => u.startsWith(`${API_ORIGIN}/api/`))
        .map((u) => {
          const url = new URL(u);
          return `${url.pathname}${url.search}`;
        });

    return { urls, settle, apiPaths };
  }

  const PRODUCT_LIST = '/api/v1/catalog/products/';

  // ------------------------------------------------------------------
  // [1-2] Customer routes must not fetch the admin catalog payload
  // ------------------------------------------------------------------

  test('PERF-customer: homepage does not request the unfiltered catalog list', async ({ page }) => {
    const tracker = trackRequests(page);
    await page.goto('/');
    await tracker.settle();

    const paths = tracker.apiPaths();
    // The homepage needs featured products, categories and brands — but the
    // bare product list is admin-screen data and must not be fetched.
    expect(paths).toContain('/api/v1/catalog/products/?featured=true');
    expect(paths).not.toContain(PRODUCT_LIST);
  });

  test('PERF-customer: content-only pages issue no catalog product request', async ({ page }) => {
    for (const route of ['/about', '/contact']) {
      const tracker = trackRequests(page);
      await page.goto(route);
      await tracker.settle();
      const productRequests = tracker.apiPaths().filter((p) => p.startsWith(PRODUCT_LIST));
      expect(productRequests, `${route} should not fetch catalog products`).toEqual([]);
    }
  });

  test('PERF-customer: exactly the endpoints the route needs are requested', async ({ page }) => {
    const tracker = trackRequests(page);
    await page.goto('/shop');
    await tracker.settle();

    const distinct = [...new Set(tracker.apiPaths())].sort();
    // Shop needs the product list, categories and brands — and nothing else.
    expect(distinct).toEqual([
      '/api/v1/catalog/brands/',
      '/api/v1/catalog/categories/',
      PRODUCT_LIST,
    ]);
  });

  // ------------------------------------------------------------------
  // [3] Critical content still becomes available
  // ------------------------------------------------------------------

  test('PERF-critical-content: homepage and shop render their primary content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h2', { hasText: /Featured Products/i })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 20000 });

    await page.goto('/shop');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 20000 });
  });

  // ------------------------------------------------------------------
  // [4-5] Code splitting — chart library and admin layout isolation
  // ------------------------------------------------------------------

  const CHART_RE = /recharts|CartesianChart/i;
  const ADMIN_LAYOUT_RE = /AdminLayout/i;

  test('PERF-splitting: chart library and admin layout are absent from customer routes', async ({ page }) => {
    const tracker = trackRequests(page);
    await page.goto('/');
    await tracker.settle();
    await page.goto('/shop');
    await tracker.settle();

    const chart = tracker.urls.filter((u) => CHART_RE.test(u));
    const adminLayout = tracker.urls.filter((u) => ADMIN_LAYOUT_RE.test(u));
    expect(chart, 'recharts must not load on customer routes').toEqual([]);
    expect(adminLayout, 'AdminLayout must not load on customer routes').toEqual([]);
  });

  test('PERF-splitting: analytics route loads the chart library and admin layout on demand', async ({ page, request }) => {
    await loginAsAdmin(page, request);
    const tracker = trackRequests(page);
    await page.goto('/admin/finance/summary');
    await tracker.settle();

    expect(tracker.urls.some((u) => ADMIN_LAYOUT_RE.test(u)), 'AdminLayout should load on an admin route').toBe(true);
    expect(tracker.urls.some((u) => CHART_RE.test(u)), 'chart library should load on the analytics route').toBe(true);

    // The chart surface itself renders
    await expect(page.locator('.recharts-responsive-container').first()).toBeVisible({ timeout: 25000 });
  });

  test('PERF-splitting: admin product management still loads the catalog (behaviour preserved)', async ({ page, request }) => {
    await loginAsAdmin(page, request);
    const tracker = trackRequests(page);
    await page.goto('/admin/products');
    await tracker.settle();

    expect(tracker.apiPaths()).toContain(PRODUCT_LIST);
    await expect(page.locator('main').getByRole('heading', { name: /Products/i }).first()).toBeVisible({ timeout: 20000 });
  });

  // ------------------------------------------------------------------
  // [6] Navigation after code splitting
  // ------------------------------------------------------------------

  test('PERF-navigation: SPA navigation across split routes works without a reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      (window as any).__navMarker = 'preserved';
    });

    // Client-side navigation to the lazily-loaded shop route
    await page.locator('nav.header-nav a', { hasText: /^Shop$/ }).first().click();
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 20000 });

    // A full page reload would have discarded the marker
    const marker = await page.evaluate(() => (window as any).__navMarker);
    expect(marker, 'navigation should be client-side, not a full page load').toBe('preserved');
  });

  test('PERF-navigation: direct deep-link to a lazy admin route renders and survives refresh', async ({ page, request }) => {
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/summary');
    await expect(page.locator('h1', { hasText: /Finance Summary/i })).toBeVisible({ timeout: 25000 });

    await page.reload();
    await expect(page.locator('h1', { hasText: /Finance Summary/i })).toBeVisible({ timeout: 25000 });
  });

  // ------------------------------------------------------------------
  // [7] Image loading strategy
  // ------------------------------------------------------------------

  test('PERF-images: product grid images are lazily loaded and asynchronously decoded', async ({ page }) => {
    await page.goto('/shop');
    const image = page.locator('a[href^="/product/"] img').first();
    await expect(image).toBeVisible({ timeout: 20000 });

    const attrs = await image.evaluate((el) => ({
      loading: el.getAttribute('loading'),
      decoding: el.getAttribute('decoding'),
      width: el.getAttribute('width'),
      height: el.getAttribute('height'),
    }));

    expect(attrs.loading).toBe('lazy');
    expect(attrs.decoding).toBe('async');
    // Explicit intrinsic dimensions prevent layout shift
    expect(Number(attrs.width)).toBeGreaterThan(0);
    expect(Number(attrs.height)).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // [8] Large admin page rendering stability
  // ------------------------------------------------------------------

  test('PERF-stability: dense admin list pages render fully and stay contained', async ({ page, request }) => {
    await loginAsAdmin(page, request);
    for (const route of ['/admin/orders', '/admin/finance/invoices', '/admin/finance/clients']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const metrics = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const rect = main.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          height: rect.height,
        };
      });
      expect(metrics.overflow, `${route} overflows horizontally`).toBeLessThanOrEqual(2);
      expect(metrics.height, `${route} failed to render content`).toBeGreaterThan(100);
    }
  });

  // ------------------------------------------------------------------
  // [9] Shell renders independently of slower data requests
  // ------------------------------------------------------------------

  test('PERF-resilience: customer shell renders while catalog data is delayed', async ({ page }) => {
    // Delay the catalog list; the header/footer shell must still render.
    await page.route('**/api/v1/catalog/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });

    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('footer')).toBeVisible({ timeout: 20000 });
    // And the data eventually arrives and renders
    await expect(page.locator('h2', { hasText: /Featured Products/i })).toBeVisible({ timeout: 25000 });
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 25000 });
  });

  test('PERF-resilience: admin dashboard renders KPIs and trend chart', async ({ page, request }) => {
    await loginAsAdmin(page, request);
    await page.goto('/admin');
    await expect(page.locator('main').getByRole('heading', { name: /Overview/i }).first()).toBeVisible({ timeout: 20000 });
    // Dashboard aggregates order + finance data without blocking the shell
    const mainHeight = await page.evaluate(() => (document.querySelector('main') || document.body).getBoundingClientRect().height);
    expect(mainHeight).toBeGreaterThan(100);
  });
});
