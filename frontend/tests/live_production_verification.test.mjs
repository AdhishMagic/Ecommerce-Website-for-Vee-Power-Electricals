import { chromium } from '@playwright/test';

const PROD_URL = 'https://veepowerelectricals.com';

async function runLiveProductionVerification() {
  console.log('================================================================');
  console.log('STARTING LIVE PRODUCTION VERIFICATION (https://veepowerelectricals.com)');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 LiveVerificationBot/1.0',
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('  [LIVE BROWSER ERROR]:', msg.text());
    }
  });

  page.on('response', resp => {
    if (resp.status() >= 500) {
      failedRequests.push({ url: resp.url(), status: resp.status() });
      console.log(`  [SERVER 500 ERROR]: ${resp.status()} on ${resp.url()}`);
    }
  });

  try {
    // -------------------------------------------------------------
    // LIVE SUITE 1: HOMEPAGE & 1-CLICK GLOBAL NAVIGATION
    // -------------------------------------------------------------
    console.log('--- LIVE TEST SUITE 1: 1-CLICK NAVIGATION ON PRODUCTION ---');

    await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle' });
    console.log('1.1 Loaded Live Homepage:', page.url());

    console.log('1.2 Clicking navbar "Shop"...');
    await page.locator('nav.header-nav a', { hasText: 'Shop' }).click();
    await page.waitForURL(/.*\/shop/, { timeout: 8000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.3 Clicking navbar "Categories"...');
    await page.locator('nav.header-nav a', { hasText: 'Categories' }).click();
    await page.waitForURL(/.*\/categories/, { timeout: 8000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.4 Clicking navbar "Brands"...');
    await page.locator('nav.header-nav a', { hasText: 'Brands' }).click();
    await page.waitForURL(/.*\/brands/, { timeout: 8000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.5 Clicking navbar "About"...');
    await page.locator('nav.header-nav a', { hasText: 'About' }).click();
    await page.waitForURL(/.*\/about/, { timeout: 8000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.6 Clicking navbar "Contact"...');
    await page.locator('nav.header-nav a', { hasText: 'Contact' }).click();
    await page.waitForURL(/.*\/contact/, { timeout: 8000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.7 Clicking Header Logo...');
    await page.locator('header a#header-logo, header a[aria-label="Vee Power Electricals Home"]').click();
    await page.waitForURL(`${PROD_URL}/`, { timeout: 8000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.8 Clicking Cart icon...');
    await page.locator('header a[href="/cart"]').first().click();
    await page.waitForURL(/.*\/cart/, { timeout: 8000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.9 Testing Browser Back button...');
    await page.goBack();
    await page.waitForURL(`${PROD_URL}/`, { timeout: 8000 });
    console.log('  ✓ Back navigated to:', page.url());

    console.log('1.10 Testing Browser Forward button...');
    await page.goForward();
    await page.waitForURL(/.*\/cart/, { timeout: 8000 });
    console.log('  ✓ Forward navigated to:', page.url());

    // -------------------------------------------------------------
    // LIVE SUITE 2: CATEGORY PAGE SIMPLIFICATION ON PRODUCTION
    // -------------------------------------------------------------
    console.log('\n--- LIVE TEST SUITE 2: CATEGORY PAGE SIMPLIFICATION ---');

    await page.goto(`${PROD_URL}/categories/wires-cables`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const catBreadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    if (!(await catBreadcrumb.isVisible())) throw new Error('Breadcrumbs missing on live category page');

    const catHeading = await page.locator('h1').textContent();
    console.log('2.1 Category Heading:', catHeading.trim());
    if (!catHeading.includes('Wires & Cables')) throw new Error(`Unexpected category heading: ${catHeading}`);

    const catProductCountText = await page.locator('h2', { hasText: 'Available Products' }).textContent();
    console.log('2.2 Product Count Header:', catProductCountText.trim());
    const matchCatCount = catProductCountText.match(/Available Products \((\d+)\)/);
    const expectedCatCount = matchCatCount ? parseInt(matchCatCount[1], 10) : 0;

    // Verify unwanted sections are absent
    console.log('2.3 Verifying unwanted marketing/explanatory sections are absent...');
    const heroCategoryBadge = await page.locator('span:has-text("Electrical Category")').count();
    const heroSpecsCards = await page.locator('div:has-text("Conductor Material")').count();
    const selectionGuide = await page.locator('text=Electrician & Buyer Selection Guide').count();
    const faqSection = await page.locator('text=Frequently Asked Questions about Wires & Cables').count();
    const exploreCategories = await page.locator('text=Explore Other Electrical Categories').count();

    console.log(`  - "Electrical Category" badge: ${heroCategoryBadge}`);
    console.log(`  - "Conductor Material" cards: ${heroSpecsCards}`);
    console.log(`  - "Selection Guide": ${selectionGuide}`);
    console.log(`  - "FAQs": ${faqSection}`);
    console.log(`  - "Explore Categories": ${exploreCategories}`);

    if (heroCategoryBadge > 0 || heroSpecsCards > 0 || selectionGuide > 0 || faqSection > 0 || exploreCategories > 0) {
      throw new Error('Unwanted sections still present on live category page!');
    }
    console.log('  ✓ All unwanted sections absent from customer view!');

    const catCards = await page.locator('[data-testid="category-products-grid"] [data-testid="product-card"]').count();
    console.log(`2.4 Actual product cards in category grid: ${catCards} (Expected: ${expectedCatCount})`);
    if (catCards !== expectedCatCount) {
      throw new Error(`Live category product card count (${catCards}) does not match header count (${expectedCatCount})!`);
    }

    const catTitle = await page.title();
    const catCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const catJsonLd = await page.locator('script#seo-structured-data').textContent();
    console.log('2.5 Category SEO Title:', catTitle);
    console.log('  Canonical URL:', catCanonical);
    console.log('  CollectionPage Schema present:', Boolean(catJsonLd && catJsonLd.includes('CollectionPage')));

    // -------------------------------------------------------------
    // LIVE SUITE 3: BRAND PAGES SIMPLIFICATION (CROMPTON & POLYCAB)
    // -------------------------------------------------------------
    console.log('\n--- LIVE TEST SUITE 3: BRAND PAGES SIMPLIFICATION ---');

    // 3.1 Crompton
    await page.goto(`${PROD_URL}/brands/crompton`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const cromptonHeading = await page.locator('h1').textContent();
    console.log('3.1 Crompton Heading:', cromptonHeading.trim());
    const hasBrandLogo = await page.locator('img[alt*="Crompton logo"]').isVisible();
    console.log('3.2 Compact Brand Logo visible:', hasBrandLogo);

    const cromptonCountText = await page.locator('h2', { hasText: 'Available Products' }).textContent();
    console.log('3.3 Crompton Count Header:', cromptonCountText.trim());
    const matchCromptonCount = cromptonCountText.match(/Available Products \((\d+)\)/);
    const expectedCromptonCount = matchCromptonCount ? parseInt(matchCromptonCount[1], 10) : 0;

    const cromptonCards = await page.locator('[data-testid="brand-products-grid"] [data-testid="product-card"]').count();
    console.log(`3.4 Actual product cards in Crompton grid: ${cromptonCards} (Expected: ${expectedCromptonCount})`);
    if (cromptonCards !== expectedCromptonCount) {
      throw new Error(`Crompton card count (${cromptonCards}) does not match header count (${expectedCromptonCount})!`);
    }

    // Verify unwanted sections absent
    console.log('3.5 Verifying unwanted marketing/technical sections are absent from Crompton page...');
    const certMfrBadge = await page.locator('span:has-text("Certified Electrical Manufacturer")').count();
    const originText = await page.locator('text=Origin:').count();
    const strengthsSection = await page.locator('text=Key Engineering Strengths').count();
    const popularLinesSection = await page.locator('text=Popular Product Lines').count();
    const crossBrandSection = await page.locator('text=Certified Electrical Brands at Vee Power').count();

    console.log(`  - "Certified Electrical Manufacturer" count: ${certMfrBadge}`);
    console.log(`  - "Origin" block count: ${originText}`);
    console.log(`  - "Key Engineering Strengths" count: ${strengthsSection}`);
    console.log(`  - "Popular Product Lines" count: ${popularLinesSection}`);
    console.log(`  - "Cross-Brand Linking" count: ${crossBrandSection}`);

    if (certMfrBadge > 0 || originText > 0 || strengthsSection > 0 || popularLinesSection > 0 || crossBrandSection > 0) {
      throw new Error('Unwanted sections still present on live Crompton page!');
    }
    console.log('  ✓ All unwanted marketing and technical blocks successfully removed from Crompton page!');

    const cromptonTitle = await page.title();
    const cromptonCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const cromptonJsonLd = await page.locator('script#seo-structured-data').textContent();
    console.log('3.6 Crompton SEO Title:', cromptonTitle);
    console.log('  Canonical URL:', cromptonCanonical);
    console.log('  Schema.org Brand & CollectionPage present:', Boolean(cromptonJsonLd && cromptonJsonLd.includes('"@type":"Brand"')));

    // 3.2 Polycab
    console.log('3.7 Verifying Polycab brand page on production...');
    await page.goto(`${PROD_URL}/brands/polycab`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const polycabHeading = await page.locator('h1').textContent();
    console.log('  Polycab Heading:', polycabHeading.trim());
    const polycabCountText = await page.locator('h2', { hasText: 'Available Products' }).textContent();
    console.log('  Polycab Count Header:', polycabCountText.trim());
    const matchPolycabCount = polycabCountText.match(/Available Products \((\d+)\)/);
    const expectedPolycabCount = matchPolycabCount ? parseInt(matchPolycabCount[1], 10) : 0;
    const polycabCards = await page.locator('[data-testid="brand-products-grid"] [data-testid="product-card"]').count();
    console.log(`  Actual Polycab cards: ${polycabCards} (Expected: ${expectedPolycabCount})`);
    if (polycabCards !== expectedPolycabCount) {
      throw new Error(`Polycab card count (${polycabCards}) does not match header count (${expectedPolycabCount})!`);
    }
    console.log('  ✓ Polycab live brand page verified successfully!');

    // -------------------------------------------------------------
    // LIVE SUITE 4: PRODUCT DETAIL PAGE & RELATED PRODUCTS
    // -------------------------------------------------------------
    console.log('\n--- LIVE TEST SUITE 4: PRODUCT DETAIL RELATED PRODUCTS ---');

    await page.goto(`${PROD_URL}/product/6`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const prodTitle = await page.locator('h1').textContent();
    console.log('4.1 Loaded Product Detail for:', prodTitle.trim());

    const relatedSection = page.locator('section[aria-labelledby="related-products-heading"]');
    await relatedSection.waitFor({ state: 'visible', timeout: 8000 });
    console.log('4.2 Related Products section is visible on production!');

    const relatedCardsCount = await page.locator('[data-testid="related-products-grid"] [data-testid="product-card"]').count();
    console.log(`4.3 Number of related product cards rendered: ${relatedCardsCount} (Maximum allowed: 8)`);
    if (relatedCardsCount === 0) {
      throw new Error('No related product cards rendered on live product page!');
    }
    if (relatedCardsCount > 8) {
      throw new Error(`Related product cards count (${relatedCardsCount}) exceeded maximum of 8!`);
    }
    console.log('  ✓ Related products count strictly satisfies: 1 <= count <= 8.');

    // Verify current product excluded
    const relatedLinks = page.locator('[data-testid="related-products-grid"] a[href*="/product/"]');
    const linkCount = await relatedLinks.count();
    for (let i = 0; i < linkCount; i++) {
      const href = await relatedLinks.nth(i).getAttribute('href');
      if (href && (href.endsWith('/6') || href.includes('philips-stellar-bright-9w-cool-day-white-led-bulb'))) {
        throw new Error('Current product (ID 6) was found in Related Products!');
      }
    }
    console.log('  ✓ Current product is strictly excluded from Related Products.');

    // 4.5 1-click navigation to related product
    console.log('4.5 Clicking first Related Product card on live site...');
    const firstRelatedCard = page.locator('[data-testid="related-products-grid"] [data-testid="product-card"]').first();
    const firstRelatedLink = firstRelatedCard.locator('a[href*="/product/"]').first();
    const targetHref = await firstRelatedLink.getAttribute('href');
    await firstRelatedLink.click();

    await page.waitForURL(new RegExp(targetHref), { timeout: 8000 });
    await page.locator('h1').waitFor({ state: 'visible', timeout: 8000 });
    const newTitle = await page.locator('h1').textContent();
    console.log('  ✓ 1-click navigated to related product on production:', page.url(), `("${newTitle?.trim()}")`);

    // 4.6 Add to Cart requires auth and redirects cleanly
    console.log('4.6 Testing Add to Cart navigation...');
    const addToCartBtn = page.locator('button', { hasText: 'Add to Cart' }).first();
    await addToCartBtn.waitFor({ state: 'visible', timeout: 8000 });
    await addToCartBtn.click();

    await page.waitForURL(/.*\/login/, { timeout: 8000 });
    console.log('  ✓ Guest Add to Cart requires auth and 1-click redirects to:', page.url());

    // -------------------------------------------------------------
    // LIVE SUITE 5: RESPONSIVE VIEWPORTS AUDIT
    // -------------------------------------------------------------
    console.log('\n--- LIVE TEST SUITE 5: RESPONSIVE VIEWPORTS AUDIT ---');
    const viewports = [
      { name: 'Mobile 320x568', width: 320, height: 568 },
      { name: 'Mobile 375x812', width: 375, height: 812 },
      { name: 'Mobile 390x844', width: 390, height: 844 },
      { name: 'Tablet 768x1024', width: 768, height: 1024 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${PROD_URL}/product/6`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      if (scrollWidth > innerWidth + 2) {
        throw new Error(`Horizontal overflow on live site for ${vp.name}: scrollWidth (${scrollWidth}) > innerWidth (${innerWidth})`);
      }
      console.log(`  ✓ ${vp.name} verified: No horizontal overflow (scrollWidth: ${scrollWidth}px, innerWidth: ${innerWidth}px)`);
    }

    // Reset to desktop
    await page.setViewportSize({ width: 1366, height: 768 });

    // -------------------------------------------------------------
    // LIVE SUITE 6: SERVER 500 & BROWSER CONSOLE ERRORS AUDIT
    // -------------------------------------------------------------
    console.log('\n--- LIVE TEST SUITE 6: SERVER & CONSOLE ERROR AUDIT ---');
    console.log(`Total 500 server errors encountered: ${failedRequests.length}`);
    if (failedRequests.length > 0) {
      throw new Error(`Server 500 errors detected on production: ${JSON.stringify(failedRequests)}`);
    }
    console.log('  ✓ Zero 500 server errors on live production!');

    console.log(`Total critical browser errors encountered: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      throw new Error(`Encountered browser errors on live production: ${JSON.stringify(consoleErrors)}`);
    }
    console.log('  ✓ Zero browser console errors or React exceptions on live production!');

    console.log('\n================================================================');
    console.log('ALL LIVE PRODUCTION VERIFICATIONS COMPLETED SUCCESSFULLY! (100% PASSING)');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runLiveProductionVerification().catch(err => {
  console.error('\n❌ LIVE PRODUCTION VERIFICATION FAILED:', err.message);
  process.exit(1);
});
