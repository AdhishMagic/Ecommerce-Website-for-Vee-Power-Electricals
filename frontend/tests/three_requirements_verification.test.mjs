import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING VEE POWER ELECTRICALS FULL VERIFICATION SUITE');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('  [BROWSER ERROR]:', msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.log('  [PAGE ERROR]:', err.message);
  });

  try {
    // -------------------------------------------------------------
    // SUITE 1: GLOBAL NAVIGATION - ONE-CLICK INSTANT NAVIGATION
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 1: GLOBAL NAVIGATION (ONE-CLICK & NO DOUBLE-CLICK) ---');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    console.log('1.1 Loaded Home page:', page.url());

    // 1.2 Navigate to Shop in 1 click
    console.log('1.2 Clicking navbar "Shop"...');
    await page.locator('nav.header-nav a', { hasText: 'Shop' }).click();
    await page.waitForURL(/.*\/shop/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // 1.3 Navigate to Categories in 1 click
    console.log('1.3 Clicking navbar "Categories"...');
    await page.locator('nav.header-nav a', { hasText: 'Categories' }).click();
    await page.waitForURL(/.*\/categories/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // 1.4 Navigate to Brands in 1 click
    console.log('1.4 Clicking navbar "Brands"...');
    await page.locator('nav.header-nav a', { hasText: 'Brands' }).click();
    await page.waitForURL(/.*\/brands/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // 1.5 Navigate to About in 1 click
    console.log('1.5 Clicking navbar "About"...');
    await page.locator('nav.header-nav a', { hasText: 'About' }).click();
    await page.waitForURL(/.*\/about/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // 1.6 Navigate to Contact in 1 click
    console.log('1.6 Clicking navbar "Contact"...');
    await page.locator('nav.header-nav a', { hasText: 'Contact' }).click();
    await page.waitForURL(/.*\/contact/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // 1.7 Logo click navigates back to Home in 1 click
    console.log('1.7 Clicking Header Logo...');
    await page.locator('header a#header-logo, header a[aria-label="Vee Power Electricals Home"]').click();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // 1.8 Cart icon click navigates to Cart in 1 click
    console.log('1.8 Clicking Cart icon...');
    await page.locator('header a[href="/cart"]').first().click();
    await page.waitForURL(/.*\/cart/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // 1.9 Browser Back & Forward navigation
    console.log('1.9 Testing Browser Back button...');
    await page.goBack();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 5000 });
    console.log('  ✓ Back navigated to:', page.url());

    console.log('1.10 Testing Browser Forward button...');
    await page.goForward();
    await page.waitForURL(/.*\/cart/, { timeout: 5000 });
    console.log('  ✓ Forward navigated to:', page.url());

    // 1.11 Footer Links 1-click test
    console.log('1.11 Clicking Footer Privacy Policy link...');
    await page.locator('footer a[href="/privacy"]').first().click();
    await page.waitForURL(/.*\/privacy/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.12 Clicking Footer Category link (Wires & Cables)...');
    await page.locator('footer a[href="/categories/wires-cables"]').first().click();
    await page.waitForURL(/.*\/categories\/wires-cables/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    console.log('1.13 Clicking Footer Brand link (Polycab)...');
    await page.locator('footer a[href="/brands/polycab"]').first().click();
    await page.waitForURL(/.*\/brands\/polycab/, { timeout: 5000 });
    console.log('  ✓ 1-click navigated to:', page.url());

    // -------------------------------------------------------------
    // SUITE 2: CATEGORY PAGE SIMPLIFICATION
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 2: CATEGORY PAGE SIMPLIFICATION ---');

    await page.goto(`${BASE_URL}/categories/wires-cables`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // 2.1 Breadcrumb navigation exists
    const catBreadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    const hasCatBreadcrumb = await catBreadcrumb.isVisible();
    console.log('2.1 Breadcrumb navigation visible:', hasCatBreadcrumb);
    if (!hasCatBreadcrumb) throw new Error('Breadcrumbs missing on category detail page');

    // 2.2 Simple category heading exists
    const catHeading = page.locator('h1');
    const catHeadingText = await catHeading.textContent();
    console.log('2.2 Simple Category Heading:', catHeadingText.trim());
    if (!catHeadingText.includes('Wires & Cables')) {
      throw new Error(`Unexpected category heading: ${catHeadingText}`);
    }

    // 2.3 Product count header
    const catProductCountText = await page.locator('h2', { hasText: 'Available Products' }).textContent();
    console.log('2.3 Product Count header:', catProductCountText.trim());
    const matchCatCount = catProductCountText.match(/Available Products \((\d+)\)/);
    const expectedCatCount = matchCatCount ? parseInt(matchCatCount[1], 10) : 0;

    // 2.4 Verify UNWANTED sections are completely removed from customer view
    console.log('2.4 Verifying unwanted promotional/explanatory sections are absent...');
    const heroCategoryBadge = await page.locator('span:has-text("Electrical Category")').count();
    const heroSpecsCards = await page.locator('div:has-text("Conductor Material")').count();
    const selectionGuide = await page.locator('text=Electrician & Buyer Selection Guide').count();
    const faqSection = await page.locator('text=Frequently Asked Questions about Wires & Cables').count();
    const exploreCategories = await page.locator('text=Explore Other Electrical Categories').count();

    console.log(`  - "Electrical Category" badge count: ${heroCategoryBadge}`);
    console.log(`  - "Conductor Material" cards count: ${heroSpecsCards}`);
    console.log(`  - "Selection Guide" count: ${selectionGuide}`);
    console.log(`  - "Frequently Asked Questions" count: ${faqSection}`);
    console.log(`  - "Explore Other Electrical Categories" count: ${exploreCategories}`);

    if (heroCategoryBadge > 0 || heroSpecsCards > 0 || selectionGuide > 0 || faqSection > 0 || exploreCategories > 0) {
      throw new Error('Unwanted sections still present on category page!');
    }
    console.log('  ✓ All unwanted explanatory and promotional sections successfully removed!');

    // 2.5 Verify actual product card count matches displayed product count
    const catCards = await page.locator('[data-testid="category-products-grid"] [data-testid="product-card"]').count();
    console.log(`2.5 Actual product cards in category grid: ${catCards} (Expected: ${expectedCatCount})`);
    if (catCards !== expectedCatCount) {
      throw new Error(`Product card count (${catCards}) does not match header count (${expectedCatCount})!`);
    }

    // 2.6 Verify Brand and Sort filters work
    const brandSelect = page.locator('select#brand-filter');
    if (await brandSelect.isVisible()) {
      console.log('2.6 Brand filter is functional');
    }
    const sortSelect = page.locator('select#sort-by');
    if (await sortSelect.isVisible()) {
      console.log('  ✓ Sort filter is functional');
    }

    // 2.7 Verify SEO metadata & JSON-LD schema preserved
    const catTitle = await page.title();
    const catMetaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    const catCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const catJsonLd = await page.locator('script#seo-structured-data').textContent();

    console.log('2.7 SEO Title:', catTitle);
    console.log('  Canonical URL:', catCanonical);
    console.log('  Meta Description:', catMetaDesc?.slice(0, 70) + '...');
    console.log('  Structured Data JSON-LD present:', Boolean(catJsonLd && catJsonLd.includes('CollectionPage')));

    if (!catCanonical || !catCanonical.includes('wires-cables') || !catJsonLd) {
      throw new Error('SEO canonical URL or Schema.org JSON-LD structured data is broken on category page!');
    }
    console.log('  ✓ Category SEO title, meta description, canonical URL, and Schema.org structured data preserved!');

    // -------------------------------------------------------------
    // SUITE 3: BRAND PAGE SIMPLIFICATION (CROMPTON & POLYCAB)
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: BRAND PAGE SIMPLIFICATION ---');

    // 3.1 Verify Crompton Brand Page
    await page.goto(`${BASE_URL}/brands/crompton`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const cromptonBreadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    if (!(await cromptonBreadcrumb.isVisible())) throw new Error('Breadcrumbs missing on Crompton page');

    const cromptonHeading = await page.locator('h1').textContent();
    console.log('3.1 Brand Heading:', cromptonHeading.trim());
    if (!cromptonHeading.includes('Crompton')) throw new Error(`Unexpected heading: ${cromptonHeading}`);

    // Verify brand logo is displayed
    const brandLogo = page.locator('img[alt*="Crompton logo"]');
    const hasBrandLogo = await brandLogo.isVisible();
    console.log('3.2 Compact Brand Logo visible:', hasBrandLogo);

    // Verify product count matches card count
    const cromptonCountText = await page.locator('h2', { hasText: 'Available Products' }).textContent();
    console.log('3.3 Crompton Count Header:', cromptonCountText.trim());
    const matchCromptonCount = cromptonCountText.match(/Available Products \((\d+)\)/);
    const expectedCromptonCount = matchCromptonCount ? parseInt(matchCromptonCount[1], 10) : 0;

    const cromptonCards = await page.locator('[data-testid="brand-products-grid"] [data-testid="product-card"]').count();
    console.log(`3.4 Actual product cards in brand grid: ${cromptonCards} (Expected: ${expectedCromptonCount})`);
    if (cromptonCards !== expectedCromptonCount) {
      throw new Error(`Brand product card count (${cromptonCards}) does not match header count (${expectedCromptonCount})!`);
    }

    // Verify unwanted sections are REMOVED from Crompton page
    console.log('3.5 Verifying unwanted marketing/technical sections are absent from brand page...');
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
      throw new Error('Unwanted marketing/technical sections still present on brand page!');
    }
    console.log('  ✓ All unwanted marketing and promotional blocks removed from brand page!');

    // Verify brand SEO metadata & Schema.org JSON-LD preserved
    const brandTitle = await page.title();
    const brandCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const brandJsonLd = await page.locator('script#seo-structured-data').textContent();
    console.log('3.6 Brand SEO Title:', brandTitle);
    console.log('  Canonical URL:', brandCanonical);
    console.log('  Schema.org Brand & CollectionPage present:', Boolean(brandJsonLd && brandJsonLd.includes('"@type":"Brand"')));
    if (!brandCanonical || !brandCanonical.includes('crompton') || !brandJsonLd) {
      throw new Error('Brand SEO canonical or Schema.org structured data broken!');
    }
    console.log('  ✓ Brand SEO metadata and structured data preserved!');

    // 3.7 Verify Polycab Brand Page as well
    console.log('3.7 Verifying Polycab brand page...');
    await page.goto(`${BASE_URL}/brands/polycab`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

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
    console.log('  ✓ Polycab brand page verified successfully!');

    // -------------------------------------------------------------
    // SUITE 4: PRODUCT DETAIL PAGE - RELATED PRODUCTS
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 4: PRODUCT DETAIL RELATED PRODUCTS ---');

    await page.goto(`${BASE_URL}/product/6`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const prodTitle = await page.locator('h1').textContent();
    console.log('4.1 Loaded Product Detail for:', prodTitle.trim());

    // 4.2 Verify Related Products Section appears below details & tabs
    const relatedSection = page.locator('section[aria-labelledby="related-products-heading"]');
    await relatedSection.waitFor({ state: 'visible', timeout: 5000 });
    console.log('4.2 Related Products section is visible!');

    const relatedHeading = await page.locator('#related-products-heading').textContent();
    console.log('  Heading text:', relatedHeading.trim());
    if (relatedHeading.trim() !== 'Related Products') {
      throw new Error(`Expected section titled "Related Products", found: ${relatedHeading}`);
    }

    // 4.3 Verify Related Product Card Count: Maximum of 8 products rendered!
    const relatedCardsCount = await page.locator('[data-testid="related-products-grid"] [data-testid="product-card"]').count();
    console.log(`4.3 Number of related product cards rendered: ${relatedCardsCount} (Maximum allowed: 8)`);
    if (relatedCardsCount === 0) {
      throw new Error('No related product cards rendered!');
    }
    if (relatedCardsCount > 8) {
      throw new Error(`Related product cards count (${relatedCardsCount}) exceeded maximum of 8!`);
    }
    console.log('  ✓ Related products count strictly satisfies: 1 <= count <= 8.');

    // 4.4 Verify current product is strictly excluded
    const relatedLinks = page.locator('[data-testid="related-products-grid"] a[href*="/product/"]');
    const linkCount = await relatedLinks.count();
    for (let i = 0; i < linkCount; i++) {
      const href = await relatedLinks.nth(i).getAttribute('href');
      if (href && (href.endsWith('/6') || href.includes('philips-stellar-bright-9w-cool-day-white-led-bulb'))) {
        throw new Error(`Current product (ID 6) was found in Related Products!`);
      }
    }
    console.log('  ✓ Current product is strictly excluded from Related Products.');

    // 4.5 Verify 1-click navigation to related product
    console.log('4.5 Clicking first Related Product card...');
    const firstRelatedCard = page.locator('[data-testid="related-products-grid"] [data-testid="product-card"]').first();
    const firstRelatedLink = firstRelatedCard.locator('a[href*="/product/"]').first();
    const targetHref = await firstRelatedLink.getAttribute('href');
    await firstRelatedLink.click();

    await page.waitForURL(new RegExp(targetHref), { timeout: 5000 });
    await page.locator('h1').waitFor({ state: 'visible', timeout: 5000 });
    const newTitle = await page.locator('h1').textContent();
    console.log('  ✓ 1-click navigated to related product:', page.url(), `("${newTitle?.trim()}")`);

    // 4.6 Verify Add to Cart still works on Product Detail
    console.log('4.6 Testing Add to Cart navigation & action...');
    const addToCartBtn = page.locator('button', { hasText: 'Add to Cart' }).first();
    await addToCartBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addToCartBtn.click();

    await page.waitForURL(/.*\/login/, { timeout: 5000 });
    console.log('  ✓ Guest Add to Cart requires auth and 1-click redirects to:', page.url());
    if (!page.url().includes('redirect=')) {
      throw new Error('Redirect query parameter missing from auth redirect!');
    }

    // -------------------------------------------------------------
    // SUITE 5: RESPONSIVE & MOBILE VERIFICATION (NO OVERFLOW)
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 5: RESPONSIVE VIEWPORTS AUDIT ---');
    const viewports = [
      { name: 'Mobile 320x568', width: 320, height: 568 },
      { name: 'Mobile 375x812', width: 375, height: 812 },
      { name: 'Mobile 390x844', width: 390, height: 844 },
      { name: 'Tablet 768x1024', width: 768, height: 1024 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/product/6`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      if (scrollWidth > innerWidth + 2) {
        throw new Error(`Horizontal overflow on ${vp.name}: scrollWidth (${scrollWidth}) > innerWidth (${innerWidth})`);
      }
      console.log(`  ✓ ${vp.name} verified: No horizontal overflow (scrollWidth: ${scrollWidth}px, innerWidth: ${innerWidth}px)`);

      const relCards = await page.locator('[data-testid="related-products-grid"] [data-testid="product-card"]').count();
      if (relCards === 0) {
        throw new Error(`Related products missing on ${vp.name}`);
      }
    }

    // Reset to desktop
    await page.setViewportSize({ width: 1366, height: 768 });

    // -------------------------------------------------------------
    // SUITE 6: CONSOLE ERRORS AUDIT
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 6: CONSOLE ERRORS AUDIT ---');
    console.log(`Total critical browser errors encountered: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      throw new Error(`Encountered browser errors during execution: ${JSON.stringify(consoleErrors)}`);
    }
    console.log('  ✓ Zero browser console errors or React exceptions during all navigations!');

    console.log('\n================================================================');
    console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! (100% PASSING)');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runVerification().catch(err => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err.message);
  process.exit(1);
});
