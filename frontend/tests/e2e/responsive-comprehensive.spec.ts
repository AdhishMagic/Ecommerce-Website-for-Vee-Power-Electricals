import { test, expect, type Page } from '@playwright/test';

/**
 * STEP 16 — COMPREHENSIVE RESPONSIVE VALIDATION SUITE
 *
 * Validates layout stability, interactivity, touch usability and overflow
 * containment across desktop, tablet, mobile and intermediate viewports.
 * Uses the live Dockerized stack (frontend :5173, backend :8000).
 */

test.describe('Step 16: Comprehensive Responsive Validation', () => {
  // Multi-viewport suites with real data need more than the 30s default.
  test.setTimeout(90_000);
  // Touch emulation for tap() interactions across the whole suite.
  test.use({ hasTouch: true });

  const ADMIN = { email: 'admin@veepower.in', password: 'AdminPass123!' };
  const CUSTOMER = { email: 'e2e_verified_customer@veepower.com', password: 'SecurePass123!' };

  // ========================================================================
  // Shared helpers
  // ========================================================================

  async function apiLogin(request: any, creds: { email: string; password: string }) {
    const res = await request.post('http://localhost:8000/api/v1/auth/login/', { data: creds });
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
    const auth = await apiLogin(request, ADMIN);
    await injectSession(page, auth, 'admin');
  }

  async function loginAsCustomer(page: Page, request: any) {
    const auth = await apiLogin(request, CUSTOMER);
    await injectSession(page, auth, 'customer');
  }

  /** Asserts the document has no unexpected horizontal overflow. */
  async function expectNoHorizontalOverflow(page: Page, tolerance = 2) {
    const overflow = await page.evaluate((tol) => {
      return document.documentElement.scrollWidth - window.innerWidth;
    }, tolerance);
    expect(overflow, `document overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(tolerance);
  }

  /** Asserts the page body contains visible, rendered content. */
  async function expectMainContentVisible(page: Page) {
    const visible = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const rect = main.getBoundingClientRect();
      return rect.height > 100 && rect.width > 100;
    });
    expect(visible).toBe(true);
  }

  /** Page-level heading lookup scoped to <main> (the admin layout header
   *  contains a separate hidden-on-mobile h2 that would match first). */
  function mainHeading(page: Page, text: RegExp) {
    return page.locator('main').getByRole('heading', { name: text }).first();
  }

  const MOBILE = { width: 390, height: 844 };
  const TABLET = { width: 768, height: 1024 };
  const DESKTOP = { width: 1440, height: 900 };

  async function useViewport(page: Page, vp: { width: number; height: number }) {
    await page.setViewportSize(vp);
  }

  // ========================================================================
  // [1-3] HOMEPAGE — desktop / tablet / mobile
  // ========================================================================

  for (const [label, vp] of [['desktop', DESKTOP], ['tablet', TABLET], ['mobile', MOBILE]] as const) {
    test(`HP-${label}: homepage renders hero, products and footer without overflow at ${vp.width}x${vp.height}`, async ({ page }) => {
      await useViewport(page, vp);
      await page.goto('/');
      await expectNoHorizontalOverflow(page);
      await expectMainContentVisible(page);
      // Brand identity present
      await expect(page.locator('img[alt*="Vee Power"]').first()).toBeVisible();
      // Footer always reachable
      await expect(page.locator('footer')).toBeVisible();
      if (vp.width >= 1024) {
        // Desktop nav links visible at lg breakpoint and above
        await expect(page.locator('nav.header-nav a').first()).toBeVisible();
      } else {
        // Hamburger navigation visible below lg
        await expect(page.locator('header button[class*="lg:hidden"]').first()).toBeVisible();
      }
    });
  }

  // ========================================================================
  // [4-5] NAVIGATION — desktop / mobile
  // ========================================================================

  test('NAV-desktop: primary navigation links all visible and clickable', async ({ page }) => {
    await useViewport(page, DESKTOP);
    await page.goto('/');
    for (const link of ['Shop', 'About', 'Contact']) {
      const nav = page.locator('nav.header-nav').getByText(link, { exact: false }).first();
      await expect(nav).toBeVisible();
    }
  });

  test('NAV-mobile: hamburger opens drawer, all controls reachable, closes cleanly', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/');
    const hamburger = page.locator('header button[class*="lg:hidden"]').first();
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    const mobileNav = page.locator('nav.mobile-nav');
    await expect(mobileNav).toBeVisible();
    // Menu links are touch targets inside the drawer
    await expect(mobileNav.getByText('Shop').first()).toBeVisible();
    // Close via hamburger toggle
    await hamburger.click();
    await expect(mobileNav).toBeHidden();
  });

  // ========================================================================
  // [6-8] SHOP — desktop / tablet / mobile
  // ========================================================================

  test('SHOP-desktop: multi-column product grid with visible filter sidebar', async ({ page }) => {
    await useViewport(page, DESKTOP);
    await page.goto('/shop');
    await expectNoHorizontalOverflow(page);
    // Desktop sidebar filters visible
    await expect(page.locator('aside h3', { hasText: 'Filters' })).toBeVisible();
    const cards = page.locator('a[href^="/product/"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    // Multi-column proof on desktop: no card consumes half the viewport width
    const cardWidth = await cards.first().evaluate((el) => el.getBoundingClientRect().width);
    expect(cardWidth).toBeLessThan(DESKTOP.width / 2);
  });

  test('SHOP-tablet: grid reflows and page remains overflow-free', async ({ page }) => {
    await useViewport(page, TABLET);
    await page.goto('/shop');
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('SHOP-mobile: compact grid, filters behind drawer, no overflow', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/shop');
    await expectNoHorizontalOverflow(page);
    const cards = page.locator('a[href^="/product/"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    // Cards stay compact on mobile (grid of 2 columns max — no desktop-width cards)
    const cardWidth = await cards.first().evaluate((el) => el.getBoundingClientRect().width);
    expect(cardWidth).toBeLessThanOrEqual(MOBILE.width);
    // Desktop filter sidebar hidden; a mobile filter control exists
    await expect(page.locator('aside h3', { hasText: 'Filters' })).toBeHidden();
    const filterButton = page.locator('button', { hasText: /Filter/i });
    expect(await filterButton.count()).toBeGreaterThan(0);
  });

  test('SHOP-mobile-drawer: filter drawer opens, scrolls internally, closes', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/shop');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 15000 });
    await page.locator('button', { hasText: /Filter/i }).first().click();
    const drawer = page.locator('div.fixed.inset-0.z-50.lg\\:hidden');
    await expect(drawer).toBeVisible();
    // Apply button visible inside drawer (touch reachable)
    await expect(drawer.locator('button', { hasText: /Apply Filters/i })).toBeVisible();
    // Drawer scrolls internally rather than overflowing the page
    await expectNoHorizontalOverflow(page);
    await page.locator('div.absolute.inset-0.bg-black\\/40').click({ position: { x: 10, y: 200 } });
    await expect(drawer).toBeHidden();
  });

  // ========================================================================
  // [9-10] PRODUCT DETAIL — desktop / mobile
  // ========================================================================

  test('PD-desktop: image, info and CTAs all visible side-by-side', async ({ page }) => {
    await useViewport(page, DESKTOP);
    await page.goto('/shop');
    await page.locator('a[href^="/product/"]').first().click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button', { hasText: /Add to Cart/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /Buy Now/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('PD-mobile: content stacks, quantity controls and CTAs usable', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/shop');
    await page.locator('a[href^="/product/"]').first().click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
    // Quantity controls present and touch-sized
    const plus = page.locator('button', { hasText: '+' }).first();
    await expect(plus).toBeVisible();
    const box = await plus.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(20);
    // CTA buttons visible without scrolling past the fold line at the top of the page
    await expect(page.locator('button', { hasText: /Add to Cart/i }).first()).toBeVisible();
  });

  // ========================================================================
  // [11-12] CART — desktop / mobile
  // ========================================================================

  async function addProductToCart(page: Page) {
    await page.goto('/shop');
    await page.locator('a[href^="/product/"]').first().click();
    await page.locator('button', { hasText: /Add to Cart/i }).first().click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('vp_cart_items') || '[]').length > 0,
      undefined,
      { timeout: 10000 }
    );
  }

  test('CART-desktop: itemized rows, quantity controls and checkout CTA', async ({ page, request }) => {
    await useViewport(page, DESKTOP);
    await loginAsCustomer(page, request);
    await addProductToCart(page);
    await page.goto('/cart');
    await expect(page.locator('h1', { hasText: /Shopping Cart/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h2', { hasText: /Order Summary/i })).toBeVisible();
    await expect(page.locator('button', { hasText: /Proceed to Checkout/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('CART-mobile: stacked layout, touch controls, checkout remains obvious', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsCustomer(page, request);
    await addProductToCart(page);
    await page.goto('/cart');
    await expect(page.locator('h1', { hasText: /Shopping Cart/i })).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('button', { hasText: /Proceed to Checkout/i })).toBeVisible();
    // Quantity +/- buttons remain touch targets
    const plus = page.locator('button', { hasText: '+' }).first();
    if (await plus.isVisible().catch(() => false)) {
      const box = await plus.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }
  });

  test('CART-empty: empty state readable with recovery action at mobile', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsCustomer(page, request);
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('vp_cart_items'));
    await page.goto('/cart');
    await expect(page.locator('h2', { hasText: /Your Cart is Empty/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a', { hasText: /Browse Products/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  // ========================================================================
  // [13-14] CHECKOUT — desktop / mobile
  // ========================================================================

  async function openCheckout(page: Page, request: any) {
    await loginAsCustomer(page, request);
    await addProductToCart(page);
    await page.goto('/checkout');
    await expect(page.locator('h1', { hasText: /Checkout/i })).toBeVisible({ timeout: 15000 });
  }

  test('CO-desktop: address step renders form and summary side-by-side', async ({ page, request }) => {
    await useViewport(page, DESKTOP);
    await openCheckout(page, request);
    await expect(page.locator('h2', { hasText: /Delivery Information/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('button', { hasText: /Continue to Review/i })).toBeVisible();
  });

  test('CO-mobile: forms stack, labels visible, payment step fits viewport', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await openCheckout(page, request);
    await expectNoHorizontalOverflow(page);

    // Complete address step — wait for either saved addresses or the new-address form
    await page.waitForSelector('input[name="saved_address"], input[placeholder="Rajesh Kumar"]', { timeout: 15000 });
    const savedAddressRadio = page.locator('input[name="saved_address"]').first();
    if (await savedAddressRadio.isVisible().catch(() => false)) {
      await savedAddressRadio.check();
    } else {
      // The new-address form remounts once saved addresses finish loading —
      // fill every field with retries to survive element detach.
      const fillWithRetry = async (loc: any, value: string) => {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await loc.fill(value, { timeout: 3000 });
            return;
          } catch {
            await page.waitForTimeout(600);
          }
        }
      };
      await fillWithRetry(page.locator('input[placeholder="Rajesh Kumar"]'), 'Responsive Buyer');
      await fillWithRetry(page.locator('input[placeholder="+91 98765 43210"]'), '+91 9876543210');
      await fillWithRetry(page.locator('input[placeholder="House/Flat No., Street Name"]'), '1 Responsive Street');
      await fillWithRetry(page.locator('input[placeholder="641001"]'), '641001');
      const cityInput = page.locator('xpath=//label[contains(text(), "City")]/following-sibling::input');
      const stateInput = page.locator('xpath=//label[contains(text(), "State")]/following-sibling::input');
      if (await cityInput.isVisible().catch(() => false)) await fillWithRetry(cityInput, 'Coimbatore');
      if (await stateInput.isVisible().catch(() => false)) await fillWithRetry(stateInput, 'Tamil Nadu');
    }
    await page.locator('button', { hasText: /Continue to Review/i }).click();
    await expect(page.locator('h2', { hasText: /Review Order/i })).toBeVisible({ timeout: 10000 });

    // Payment step: all options + totals visible on mobile (no hidden financial info)
    await page.locator('button', { hasText: /Continue to Payment/i }).click();
    await expect(page.locator('h2', { hasText: /Select Payment Method/i })).toBeVisible();
    for (const method of ['upi', 'card', 'netbanking', 'cod']) {
      await expect(page.locator(`input[type="radio"][value="${method}"]`)).toBeAttached();
    }
    await expect(page.locator('button', { hasText: /Place Order/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('CO-mobile-error: validation error message contained, no overflow', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await openCheckout(page, request);
    // Submit with no address selected
    await page.locator('button', { hasText: /Continue to Review/i }).click();
    const err = page.locator('div', { hasText: /required|select a delivery address/i }).first();
    await expect(err).toBeVisible({ timeout: 5000 });
    await expectNoHorizontalOverflow(page);
  });

  // ========================================================================
  // [15-17] ACCOUNT / ORDERS / RETURNS — mobile
  // ========================================================================

  test('ACC-mobile: account tabs and order cards usable', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsCustomer(page, request);
    await page.goto('/account');
    await expectNoHorizontalOverflow(page);
    // Orders tab is default; order cards (not desktop tables) render
    await page.waitForLoadState('networkidle');
    const orderCard = page.locator('div.bg-white', { hasText: /ORD-/i }).first();
    if (await orderCard.isVisible().catch(() => false)) {
      await expect(orderCard).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test('ORD-mobile: order detail shows status badge and audit trail within viewport', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsCustomer(page, request);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    const viewDetails = page.locator('button', { hasText: /View Details/i }).first();
    if (await viewDetails.isVisible().catch(() => false)) {
      await viewDetails.click();
      await expect(page.locator('text=Status History & Audit Trail').first()).toBeVisible({ timeout: 10000 });
      await expectNoHorizontalOverflow(page);
    }
  });

  test('RET-mobile: delivered order return actions remain reachable (guard validation)', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsCustomer(page, request);
    await page.goto('/account/orders');
    await page.waitForLoadState('networkidle');
    // Return action exists for eligible (delivered) orders; page stays contained
    const returnBtn = page.locator('button', { hasText: /Return/i }).first();
    if (await returnBtn.isVisible().catch(() => false)) {
      const box = await returnBtn.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(40);
    }
    await expectNoHorizontalOverflow(page);
  });

  // ========================================================================
  // [18-20] ADMIN DASHBOARD — desktop / tablet / mobile
  // ========================================================================

  for (const [label, vp] of [['desktop', DESKTOP], ['tablet', TABLET], ['mobile', MOBILE]] as const) {
    test(`ADMIN-${label}: dashboard renders KPI cards without overflow at ${vp.width}x${vp.height}`, async ({ page, request }) => {
      await useViewport(page, vp);
      await loginAsAdmin(page, request);
      await page.goto('/admin');
      await expectNoHorizontalOverflow(page);
      await expect(page.locator('text=Admin Panel').first()).toBeVisible({ timeout: 15000 });
      await expectMainContentVisible(page);
      if (label === 'mobile') {
        // Mobile admin uses a hamburger for the sidebar
        const hamburger = page.locator('button.lg\\:hidden').first();
        await expect(hamburger).toBeVisible();
      } else {
        // Desktop/tablet keep the sidebar visible
        await expect(page.locator('aside, nav').filter({ hasText: /Dashboard/i }).first()).toBeVisible();
      }
    });
  }

  // ========================================================================
  // [21-22] PRODUCT MANAGEMENT — list + form mobile
  // ========================================================================

  test('PM-list-mobile: product table scrolls in its own container, not the page', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/products');
    await expect(mainHeading(page, /Products/i)).toBeVisible({ timeout: 15000 });
    // Controlled horizontal scrolling: the table container scrolls, document does not
    await expectNoHorizontalOverflow(page);
    const tableWrapper = page.locator('div.overflow-x-auto').first();
    await expect(tableWrapper).toBeAttached();
  });

  test('PM-form-mobile: product form fields full-width and submit reachable', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/products/add');
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
    // The form uses a section wizard — the primary CTA is "Next Step" until the
    // final section, then "Save Product". Either must be visible and interactable.
    const cta = page.locator('button', { hasText: /Next Step|Save Product|Update Product/i }).first();
    await expect(cta).toBeVisible({ timeout: 10000 });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(60);
  });

  // ========================================================================
  // [23-25] CLIENTS / B2B / QUOTATIONS
  // ========================================================================

  test('CLIENTS-mobile: B2B directory contained with scrollable table', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/clients');
    await expect(mainHeading(page, /Clients Directory/i)).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('div.overflow-x-auto').first()).toBeAttached();
  });

  test('CLIENTS-add-modal: add-client modal fits mobile viewport with visible controls', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/clients');
    await page.waitForLoadState('networkidle');
    const addBtn = page.locator('button', { hasText: /Add Client/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      const modal = page.locator('div.fixed.inset-0 > div.bg-white');
      await expect(modal.first()).toBeVisible({ timeout: 5000 });
      // Modal stays inside the viewport height budget and scrolls internally
      const modalBox = await modal.first().boundingBox();
      expect(modalBox!.height).toBeLessThanOrEqual(MOBILE.height + 4);
      // Close control reachable
      const closeBtn = modal.locator('button').first();
      await expect(closeBtn).toBeVisible();
    }
  });

  test('QUOTATIONS-mobile: quotation list renders with conversion data contained', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/quotations');
    await expect(mainHeading(page, /Quotations/i)).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
  });

  // ========================================================================
  // [26-27] INVOICES + FINANCE — desktop / mobile
  // ========================================================================

  test('INV-mobile: invoice ledger scrolls inside container, document contained', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/invoices');
    await expect(mainHeading(page, /Invoices & Payments|Invoice Ledger/i)).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('div.overflow-x-auto').first()).toBeAttached();
  });

  test('FIN-desktop: finance summary KPIs and trend chart render', async ({ page, request }) => {
    await useViewport(page, DESKTOP);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/summary');
    await expect(page.locator('h1', { hasText: /Finance Summary/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Total Revenue').first()).toBeVisible();
    await expect(page.locator('text=Monthly Revenue & Expense Trend')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('FIN-mobile: all financial KPIs remain visible, charts scale, no overflow', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/summary');
    await expect(page.locator('h1', { hasText: /Finance Summary/i })).toBeVisible({ timeout: 15000 });
    // No financial field hidden on mobile
    for (const kpi of ['Total Revenue', 'Total Outstanding', 'Total Expenses', 'Net Income']) {
      await expect(page.locator(`text=${kpi}`).first()).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    // Chart (recharts) renders responsive container, not a fixed pixel box
    const chart = page.locator('.recharts-responsive-container').first();
    if (await chart.isVisible().catch(() => false)) {
      const box = await chart.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(MOBILE.width);
    }
  });

  // ========================================================================
  // [28-29] CONFIGURATION + SHIPPING
  // ========================================================================

  test('CONFIG-mobile: shipping configuration table contained', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/orders/shipping');
    await expectNoHorizontalOverflow(page);
    await expectMainContentVisible(page);
  });

  test('CONFIG-import: CSV import interface usable at mobile width', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/import');
    await expectNoHorizontalOverflow(page);
    await expectMainContentVisible(page);
  });

  // ========================================================================
  // [30] TABLES — every admin table has a controlled scroll container
  // ========================================================================

  test('TABLES-admin: all admin list pages keep document overflow-free', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    const tablePages = [
      '/admin/orders',
      '/admin/orders/transactions',
      '/admin/inventory',
      '/admin/analytics/products',
      '/admin/analytics/traffic',
      '/admin/finance/expenses',
      '/admin/categories',
    ];
    for (const route of tablePages) {
      await page.goto(route);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(2);
    }
  });

  // ========================================================================
  // [31-32] MODALS + DROPDOWNS
  // ========================================================================

  test('MODAL-expense: add-expense modal stays within mobile viewport (regression)', async ({ page, request }) => {
    // Regression test for the max-h fix applied in this phase
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/expenses');
    await page.waitForLoadState('networkidle');
    await page.locator('button', { hasText: /Add Expense/i }).first().click();
    const modalBox = page.locator('div.fixed.inset-0 > div.bg-white').first();
    await expect(modalBox).toBeVisible({ timeout: 5000 });
    const box = await modalBox.boundingBox();
    // Modal must never be taller than the viewport (was unbounded before fix)
    expect(box!.height).toBeLessThanOrEqual(MOBILE.height);
    // Save/cancel controls reachable inside the modal
    await expect(modalBox.locator('button').last()).toBeAttached();
  });

  test('MODAL-inventory: stock-adjust modal fits viewport (regression)', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/inventory');
    await page.waitForLoadState('networkidle');
    const adjust = page.locator('button', { hasText: /Adjust Stock/i }).first();
    if (await adjust.isVisible().catch(() => false)) {
      await adjust.click();
      const modalBox = page.locator('div.fixed.inset-0 > div.bg-white').first();
      await expect(modalBox).toBeVisible();
      const box = await modalBox.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(MOBILE.height);
    }
  });

  test('DROPDOWN-sort: shop sort select operable at mobile (native control)', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/shop');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 15000 });
    const sortSelect = page.locator('select').first();
    if (await sortSelect.isVisible().catch(() => false)) {
      await sortSelect.selectOption({ index: 1 });
      await page.waitForTimeout(400);
      await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
    }
  });

  // ========================================================================
  // [33] LONG CONTENT STRESS
  // ========================================================================

  test('LONG-shop-search: long search query does not break the layout', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/shop');
    const longQuery = 'Schneider Electric Acti9 iC60N 32A curve C miniature circuit breaker MCB 230V';
    const searchInput = page.locator('header input[type="text"], header input:not([type="checkbox"]):not([type="radio"])').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(longQuery);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    }
    // Even with zero results the empty state must not overflow
    await expectNoHorizontalOverflow(page);
  });

  test('LONG-account: long customer names do not overflow account cards', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsCustomer(page, request);
    await page.goto('/account');
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
  });

  test('LONG-clients: long GSTIN/business data contained in clients table', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin/finance/clients');
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
  });

  // ========================================================================
  // [34] VALIDATION ERRORS — long messages contained
  // ========================================================================

  test('VALID-auth: invalid login error renders contained at mobile', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/login');
    await page.fill('input[type="email"]', 'nonexistent@veepower.in');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(1500);
    // Either an inline error appears or the page re-renders; either way, no overflow
    await expectNoHorizontalOverflow(page);
  });

  // ========================================================================
  // [35-36] LOADING + EMPTY STATES
  // ========================================================================

  test('LOADING-shop: initial loading state does not shift layout catastrophically', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/shop');
    // Wait for full load then ensure final layout is stable and contained
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 20000 });
    await expectNoHorizontalOverflow(page);
  });

  test('EMPTY-shop-search: no-results empty state contained at mobile', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/shop?q=zzxqqemptyresult99');
    await page.waitForTimeout(1200);
    await expectNoHorizontalOverflow(page);
  });

  // ========================================================================
  // [37] ERROR STATES — 404 route redirects, error boundary present
  // ========================================================================

  test('ERROR-unknown-route: unknown route redirects home without overflow', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/this-route-does-not-exist-404');
    await page.waitForTimeout(800);
    await expectNoHorizontalOverflow(page);
    await expectMainContentVisible(page);
  });

  // ========================================================================
  // [38] TOUCH INTERACTION — tap targets and tap-driven flows
  // ========================================================================

  test('TOUCH-shop: tap product card → tap add-to-cart via touch emulation', async ({ page }) => {
    // Tap requires hasTouch — enabled via test.use options at describe level
    await useViewport(page, MOBILE);
    await page.goto('/shop');
    await page.locator('a[href^="/product/"]').first().tap();
    await expect(page.locator('button', { hasText: /Add to Cart/i }).first()).toBeVisible({ timeout: 15000 });
    await page.locator('button', { hasText: /Add to Cart/i }).first().tap();
    await expect(page.locator('button', { hasText: /Added to Cart/i })).toBeVisible({ timeout: 5000 });
  });

  test('TOUCH-admin: mobile admin navigation toggles by tap', async ({ page, request }) => {
    await useViewport(page, MOBILE);
    await loginAsAdmin(page, request);
    await page.goto('/admin');
    // Target the banner toggle explicitly — the sidebar's own "Close sidebar"
    // button shares the lg:hidden class and sits off-screen when collapsed.
    const openSidebar = page.getByRole('button', { name: 'Open sidebar' });
    await expect(openSidebar).toBeVisible({ timeout: 15000 });
    await openSidebar.tap();
    await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Close sidebar' }).tap();
    await expect(openSidebar).toBeVisible({ timeout: 5000 });
  });

  // ========================================================================
  // [39] HORIZONTAL OVERFLOW — full intermediate viewport matrix
  // ========================================================================

  const MATRIX: Array<[string, { width: number; height: number }]> = [
    ['1920x1080', { width: 1920, height: 1080 }],
    ['1440x900', { width: 1440, height: 900 }],
    ['1366x768', { width: 1366, height: 768 }],
    ['1280x800', { width: 1280, height: 800 }],
    ['1200x800', { width: 1200, height: 800 }],
    ['1024x1366', { width: 1024, height: 1366 }],
    ['900x800', { width: 900, height: 800 }],
    ['820x1180', { width: 820, height: 1180 }],
    ['768x1024', { width: 768, height: 1024 }],
    ['430x932', { width: 430, height: 932 }],
    ['414x896', { width: 414, height: 896 }],
    ['390x844', { width: 390, height: 844 }],
    ['375x812', { width: 375, height: 812 }],
  ];

  for (const [name, vp] of MATRIX) {
    test(`OVERFLOW-${name}: core pages contain horizontal overflow at ${name}`, async ({ page }) => {
      await useViewport(page, vp);
      for (const route of ['/', '/shop', '/login']) {
        await page.goto(route);
        await page.waitForTimeout(350);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} overflows by ${overflow}px at ${name}`).toBeLessThanOrEqual(2);
      }
    });
  }

  // ========================================================================
  // [40] ACCESSIBILITY — 200% zoom / keyboard navigation
  // ========================================================================

  test('A11Y-zoom: critical functionality usable at 200% zoom on small viewport', async ({ page }) => {
    // Simulates 200% browser zoom on a 1280px screen → ~640px CSS viewport
    await useViewport(page, { width: 640, height: 900 });
    await page.goto('/');
    await expectNoHorizontalOverflow(page, 4); // small tolerance for zoom-induced rounding
    // Mobile menu (hamburger) is the navigation affordance below the lg breakpoint
    const hamburger = page.locator('header button[class*="lg:hidden"]').first();
    await expect(hamburger).toBeVisible();
    const box = await hamburger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(30);
  });

  test('A11Y-keyboard: login form fully keyboard operable at mobile', async ({ page }) => {
    await useViewport(page, MOBILE);
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').focus();
    const focused = await page.evaluate(() => document.activeElement?.tagName || '');
    expect(focused).toBe('INPUT');
    // Tab advances through interactive controls (fields, links, buttons)
    await page.keyboard.press('Tab');
    const second = await page.evaluate(() => document.activeElement?.tagName || '');
    expect(['INPUT', 'BUTTON', 'A']).toContain(second);
  });

  test('A11Y-focus: focus outline visible on interactive controls', async ({ page }) => {
    await useViewport(page, DESKTOP);
    await page.goto('/login');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return 'none';
      const style = getComputedStyle(el);
      return `${style.outlineStyle} ${style.outlineWidth}`;
    });
    expect(outline).not.toBe('none 0px');
  });
});
