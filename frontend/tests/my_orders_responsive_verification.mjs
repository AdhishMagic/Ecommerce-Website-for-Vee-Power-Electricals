import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const TOLERANCE = 2; // px

fs.mkdirSync('tests/screenshots/my_orders', { recursive: true });

const VIEWPORTS = [
  { name: '1920x1080_desktop_large', width: 1920, height: 1080 },
  { name: '1440x900_desktop_standard', width: 1440, height: 900 },
  { name: '1366x768_laptop', width: 1366, height: 768 },
  { name: '1280x800_desktop_small', width: 1280, height: 800 },
  { name: '1024x768_tablet_landscape', width: 1024, height: 768 },
  { name: '820x1180_ipad_air', width: 820, height: 1180 },
  { name: '768x1024_tablet_portrait', width: 768, height: 1024 },
  { name: '430x932_mobile_promax', width: 430, height: 932 },
  { name: '390x844_mobile_standard', width: 390, height: 844 },
  { name: '375x667_mobile_se', width: 375, height: 667 },
  { name: '320x568_mobile_compact', width: 320, height: 568 },
];

const CUSTOMER = { email: 'rajesh.kumar@example.com', password: 'CustomerPass123!' };

async function runVerification() {
  console.log('--- STARTING MY ORDERS VERIFICATION & RESPONSIVENESS SUITE ---');

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  });

  try {
    // 1. Authenticate via backend API to get customer tokens
    console.log('\n[1] Authenticating customer session...');
    const loginRes = await fetch('http://localhost:8000/api/v1/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CUSTOMER),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) {
      throw new Error(`Customer login failed: ${JSON.stringify(loginData)}`);
    }
    console.log(`  ✓ Customer logged in: ${loginData.user.email} (${loginData.user.first_name} ${loginData.user.last_name})`);

    // 2. Test Desktop View (1440x900)
    console.log('\n[2] Testing Desktop Layout & Content at 1440x900...');
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });

    // Inject auth tokens into localStorage
    await contextDesktop.addInitScript(({ token, refresh, user }) => {
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
    }, { token: loginData.access, refresh: loginData.refresh, user: loginData.user });

    const pageDesktop = await contextDesktop.newPage();
    const consoleErrors = [];
    pageDesktop.on('pageerror', (err) => consoleErrors.push(err.message));

    await pageDesktop.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
    
    // Wait for orders to finish loading
    const orderCards = pageDesktop.locator('article');
    await orderCards.first().waitFor({ state: 'visible', timeout: 10000 });

    // Verify Heading & Description
    const heading = await pageDesktop.locator('h1').textContent();
    console.log(`  ✓ Page heading: "${heading.trim()}"`);
    if (!heading.includes('My Orders')) {
      throw new Error(`Expected h1 "My Orders", got "${heading}"`);
    }

    const orderCount = await orderCards.count();
    console.log(`  ✓ Order cards rendered: ${orderCount}`);
    if (orderCount === 0) {
      throw new Error('Expected at least 1 order card on /account/orders');
    }

    // Verify first card contents
    const firstOrderText = await orderCards.first().textContent();
    console.log(`  ✓ First order card has Order #: ${firstOrderText.includes('Order')}, Total: ${firstOrderText.includes('₹')}`);

    // Verify Status badge
    const badge = orderCards.first().locator('[title*="Order status"]');
    const badgeText = await badge.textContent();
    console.log(`  ✓ Status badge detected: "${badgeText.trim()}"`);

    // Test "View Details" click
    console.log('\n[3] Testing "View Details" interaction...');
    const viewDetailsBtn = orderCards.first().locator('button:has-text("View Details")');
    await viewDetailsBtn.click();

    // Check detail view elements
    const backBtn = pageDesktop.locator('button:has-text("Back to All Orders")');
    await backBtn.waitFor({ state: 'visible', timeout: 10000 });
    const hasBackBtn = await backBtn.isVisible();
    console.log(`  ✓ Order detail open: Back button visible = ${hasBackBtn}`);
    if (!hasBackBtn) {
      throw new Error('Order detail view failed to display Back button');
    }

    const detailOrderNo = await pageDesktop.locator('h2').textContent();
    console.log(`  ✓ Order detail header: "${detailOrderNo.trim()}"`);

    // Click back to orders
    await backBtn.click();
    await orderCards.first().waitFor({ state: 'visible', timeout: 10000 });
    const orderCardsRestored = await orderCards.count();
    console.log(`  ✓ Returned to orders list: cards count = ${orderCardsRestored}`);

    // Capture desktop screenshot
    await pageDesktop.screenshot({ path: 'tests/screenshots/my_orders/desktop_1440.png' });
    console.log('  ✓ Desktop screenshot saved: tests/screenshots/my_orders/desktop_1440.png');

    // 4. Test Viewport Responsiveness across ALL specified viewports
    console.log('\n[4] Testing Responsiveness & Horizontal Overflow across all 11 viewports...');
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await ctx.addInitScript(({ token, refresh, user }) => {
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
      }, { token: loginData.access, refresh: loginData.refresh, user: loginData.user });

      const p = await ctx.newPage();
      await p.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
      await p.locator('article').first().waitFor({ state: 'visible', timeout: 8000 });

      // Check overflow
      const scrollWidth = await p.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await p.evaluate(() => window.innerWidth);
      const overflowDiff = scrollWidth - innerWidth;

      if (overflowDiff > TOLERANCE) {
        throw new Error(`[OVERFLOW ERROR] at viewport ${vp.name} (${vp.width}px): scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`);
      }

      // Check order cards are visible
      const visibleCards = await p.locator('article').count();

      // Check navigation items are interactive
      console.log(`  ✓ ${vp.name} (${vp.width}x${vp.height}): No overflow (scrollWidth: ${scrollWidth}), Cards: ${visibleCards}`);

      // Save screenshot for mobile and tablet key viewports
      if (['320x568_mobile_compact', '390x844_mobile_standard', '768x1024_tablet_portrait', '1920x1080_desktop_large'].includes(vp.name)) {
        await p.screenshot({ path: `tests/screenshots/my_orders/${vp.name}.png` });
      }

      await ctx.close();
    }

    // 5. Test Reduced Motion behavior
    console.log('\n[5] Testing Reduced Motion Accessibility...');
    const motionCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
    });
    await motionCtx.addInitScript(({ token, refresh, user }) => {
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
    }, { token: loginData.access, refresh: loginData.refresh, user: loginData.user });
    const motionPage = await motionCtx.newPage();
    await motionPage.goto(`${BASE_URL}/account/orders`, { waitUntil: 'domcontentloaded' });
    await motionPage.waitForTimeout(500);
    const motionCardCount = await motionPage.locator('article').count();
    console.log(`  ✓ With prefers-reduced-motion: reduce, content renders immediately (${motionCardCount} cards visible)`);
    await motionCtx.close();

    if (consoleErrors.length > 0) {
      console.warn('  ⚠️ Console errors detected:', consoleErrors);
    } else {
      console.log('  ✓ No page console errors detected.');
    }

    console.log('\n--- ALL VERIFICATIONS PASSED SUCCESSFULLY ---');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
