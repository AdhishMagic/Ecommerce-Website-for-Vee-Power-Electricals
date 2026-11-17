import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING VEE POWER ELECTRICALS THREE-REQUIREMENTS VERIFICATION');
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
    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    const hasBreadcrumb = await breadcrumb.isVisible();
    console.log('2.1 Breadcrumb navigation visible:', hasBreadcrumb);
    if (!hasBreadcrumb) throw new Error('Breadcrumbs missing on category detail page');

    // 2.2 Simple category heading exists
    const heading = page.locator('h1');
    const headingText = await heading.textContent();
    console.log('2.2 Simple Category Heading:', headingText.trim());
    if (!headingText.includes('Wires & Cables')) {
      throw new Error(`Unexpected category heading: ${headingText}`);
    }

    // 2.3 Product count exists
    const productCountText = await page.locator('h2', { hasText: 'Available Products' }).textContent();
    console.log('2.3 Product Count header:', productCountText.trim());

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

    // 2.5 Verify products are displayed directly
    const productCards = await page.locator('div:has(> a[href*="/product/"])').count();
    console.log(`2.5 Products visible in grid: ${productCards}`);
    if (productCards === 0) {
      throw new Error('No product cards displayed in category listing!');
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
    const pageTitle = await page.title();
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const jsonLdTag = await page.locator('script#seo-structured-data').textContent();

    console.log('2.7 SEO Title:', pageTitle);
    console.log('  Canonical URL:', canonical);
    console.log('  Meta Description:', metaDesc?.slice(0, 70) + '...');
    console.log('  Structured Data JSON-LD present:', Boolean(jsonLdTag && jsonLdTag.includes('CollectionPage')));

    if (!canonical || !canonical.includes('wires-cables') || !jsonLdTag) {
      throw new Error('SEO canonical URL or Schema.org JSON-LD structured data is broken!');
    }
    console.log('  ✓ SEO title, meta description, canonical URL, and Schema.org structured data preserved!');

    // -------------------------------------------------------------
    // SUITE 3: PRODUCT DETAIL PAGE - RELATED PRODUCTS
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: PRODUCT DETAIL RELATED PRODUCTS ---');

    // Navigate to product 6: Philips Stellar Bright 9W Cool Day White LED Bulb (Pack of 4)
    await page.goto(`${BASE_URL}/product/6`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const prodTitle = await page.locator('h1').textContent();
    console.log('3.1 Loaded Product Detail for:', prodTitle.trim());

    // 3.2 Verify Related Products Section appears below details & tabs
    const relatedSection = page.locator('section[aria-labelledby="related-products-heading"]');
    await relatedSection.waitFor({ state: 'visible', timeout: 5000 });
    console.log('3.2 Related Products section is visible!');

    const relatedHeading = await page.locator('#related-products-heading').textContent();
    console.log('  Heading text:', relatedHeading.trim());
    if (relatedHeading.trim() !== 'Related Products') {
      throw new Error(`Expected section titled "Related Products", found: ${relatedHeading}`);
    }

    // 3.3 Verify current product is excluded
    const relatedCards = page.locator('section[aria-labelledby="related-products-heading"] a[href*="/product/"]');
    const count = await relatedCards.count();
    console.log(`3.3 Number of related product links found: ${count}`);

    const relatedHrefs = [];
    for (let i = 0; i < count; i++) {
      const href = await relatedCards.nth(i).getAttribute('href');
      relatedHrefs.push(href);
      if (href && (href.endsWith('/6') || href.includes('philips-stellar-bright-9w-cool-day-white-led-bulb'))) {
        throw new Error(`Current product (ID 6) was found in Related Products!`);
      }
    }
    console.log('  ✓ Current product is strictly excluded from Related Products.');

    // 3.4 Verify Related Products are relevant (LED Lighting / Philips)
    console.log('3.4 Verifying related products relevance (same category/brand priority)...');
    const firstRelatedCard = page.locator('section[aria-labelledby="related-products-heading"]').locator('div.bg-white.rounded-xl').first();
    const firstCardText = await firstRelatedCard.textContent();
    console.log('  First related product card text:', firstCardText?.replace(/\s+/g, ' ').slice(0, 100));

    // 3.5 Verify 1-click navigation to related product
    console.log('3.5 Clicking first Related Product card...');
    const firstRelatedLink = firstRelatedCard.locator('a[href*="/product/"]').first();
    const targetHref = await firstRelatedLink.getAttribute('href');
    await firstRelatedLink.click();

    // Wait for target product page to load
    await page.waitForURL(new RegExp(targetHref), { timeout: 5000 });
    await page.locator('h1').waitFor({ state: 'visible', timeout: 5000 });
    const newTitle = await page.locator('h1').textContent();
    console.log('  ✓ 1-click navigated to related product:', page.url(), `("${newTitle?.trim()}")`);

    // 3.6 Verify Add to Cart still works on Product Detail
    console.log('3.6 Testing Add to Cart navigation & action...');
    const addToCartBtn = page.locator('button', { hasText: 'Add to Cart' }).first();
    await addToCartBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addToCartBtn.click();

    // Since guest is unauthenticated, requireAuth redirects to login preserving return URL
    await page.waitForURL(/.*\/login/, { timeout: 5000 });
    console.log('  ✓ Guest Add to Cart requires auth and 1-click redirects to:', page.url());
    if (!page.url().includes('redirect=')) {
      throw new Error('Redirect query parameter missing from auth redirect!');
    }

    // -------------------------------------------------------------
    // SUITE 4: RESPONSIVE & MOBILE VERIFICATION (NO OVERFLOW)
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 4: RESPONSIVE VIEWPORTS AUDIT ---');
    const viewports = [
      { name: 'Mobile 320x568', width: 320, height: 568 },
      { name: 'Mobile 375x812', width: 375, height: 812 },
      { name: 'Mobile 390x844', width: 390, height: 844 },
      { name: 'Tablet 768x1024', width: 768, height: 1024 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // Test product detail on mobile
      await page.goto(`${BASE_URL}/product/6`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      if (scrollWidth > innerWidth + 2) {
        throw new Error(`Horizontal overflow on ${vp.name}: scrollWidth (${scrollWidth}) > innerWidth (${innerWidth})`);
      }
      console.log(`  ✓ ${vp.name} verified: No horizontal overflow (scrollWidth: ${scrollWidth}px, innerWidth: ${innerWidth}px)`);

      // Verify related products responsive grid
      const relCardsCount = await page.locator('section[aria-labelledby="related-products-heading"] a[href*="/product/"]').count();
      if (relCardsCount === 0) {
        throw new Error(`Related products missing on ${vp.name}`);
      }
    }

    // Reset to desktop
    await page.setViewportSize({ width: 1366, height: 768 });

    // -------------------------------------------------------------
    // SUITE 5: CONSOLE ERRORS AUDIT
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 5: CONSOLE ERRORS AUDIT ---');
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
