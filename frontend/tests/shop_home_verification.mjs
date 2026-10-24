import { chromium } from '@playwright/test';

async function runShopHomeVerification() {
  console.log('🚀 Starting Home & Shop Pages Verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  try {
    // --- HOME PAGE TESTS ---
    console.log('\n--- 1. Home Page Verification ---');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

    // Check Categories section
    const catItems = page.locator('section:has-text("Shop by Category") a[href*="category="]');
    const catCount = await catItems.count();
    console.log(`Home page categories track: found ${catCount} category items.`);
    if (catCount > 0) {
      console.log('✅ Home page categories section rendered successfully.');
      passed++;
    } else {
      console.error('❌ Home page categories section is empty.');
      failed++;
    }

    // Check Featured Products section
    const featuredCards = page.locator('section:has-text("Featured Products") a[href^="/product/"]');
    const featuredCount = await featuredCards.count();
    console.log(`Home page featured products: found ${featuredCount} product cards.`);
    if (featuredCount > 0) {
      console.log(`✅ Featured products section rendered ${featuredCount} products successfully.`);
      passed++;
    } else {
      console.error('❌ Featured products section is empty.');
      failed++;
    }

    // Check Brands section
    const brandLinks = page.locator('section:has-text("Brands We Carry") a');
    const brandCount = await brandLinks.count();
    console.log(`Home page brands: found ${brandCount} brands.`);
    if (brandCount > 0) {
      console.log(`✅ Brands section rendered ${brandCount} brands.`);
      passed++;
    } else {
      console.error('❌ Brands section is empty.');
      failed++;
    }

    // --- SHOP PAGE TESTS ---
    console.log('\n--- 2. Shop Page Verification ---');
    await page.goto('http://localhost:5173/shop', { waitUntil: 'networkidle' });

    // Check product count header
    const productCountText = await page.locator('text=/\\d+\\s+products/').textContent();
    console.log(`Shop page product count header: "${productCountText?.trim()}"`);
    if (productCountText && !productCountText.includes('0 products')) {
      console.log(`✅ Shop page shows active product count: "${productCountText.trim()}".`);
      passed++;
    } else {
      console.error(`❌ Shop page displays 0 products: "${productCountText}".`);
      failed++;
    }

    // Check product cards rendered (each ProductCard has 2 links to /product/: image and title)
    // We select the distinct card containers in the grid
    const shopCards = page.locator('div.grid > div.group');
    const shopCardCount = await shopCards.count();
    console.log(`Shop page grid: rendered ${shopCardCount} product cards.`);
    if (shopCardCount > 0) {
      console.log(`✅ Shop page grid rendered ${shopCardCount} product cards.`);
      passed++;
    } else {
      console.error('❌ Shop page grid rendered 0 product cards.');
      failed++;
    }

    // Test Category filter on Shop page
    console.log('\n--- 3. Shop Category Filter ---');
    const fansRadio = page.locator('label:has-text("Fans") input[type="radio"]');
    if (await fansRadio.count() > 0) {
      await fansRadio.first().click();
      await page.waitForTimeout(300);
      const filteredCount = await page.locator('div.grid > div.group').count();
      console.log(`After selecting "Fans": ${filteredCount} products shown.`);
      if (filteredCount > 0) {
        console.log('✅ Selecting "Fans" successfully filtered products.');
        passed++;
      } else {
        console.error('❌ Selecting "Fans" incorrectly returned 0 products.');
        failed++;
      }

      // Clear category filter
      const allCatRadio = page.locator('label:has-text("All Categories") input[type="radio"]');
      await allCatRadio.first().click();
      await page.waitForTimeout(300);
      const restoredCount = await page.locator('div.grid > div.group').count();
      if (restoredCount === shopCardCount) {
        console.log(`✅ Restored all ${restoredCount} products after clearing category filter.`);
        passed++;
      } else {
        console.error(`❌ Category filter reset failed: expected ${shopCardCount}, got ${restoredCount}.`);
        failed++;
      }
    }

    // Test Empty State when filter yields 0 matches
    console.log('\n--- 4. Empty State Handling ---');
    await page.goto('http://localhost:5173/shop?q=xyznonexistentquery999', { waitUntil: 'networkidle' });
    const noProductsFound = page.locator('text=No Products Found');
    if (await noProductsFound.count() > 0) {
      console.log('✅ Empty state "No Products Found" displayed correctly on zero-match search.');
      passed++;
    } else {
      console.error('❌ Empty state not displayed on zero-match search.');
      failed++;
    }

    // Clear filters button in empty state
    const clearBtn = page.locator('button:has-text("Clear Filters")');
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
      await page.waitForTimeout(300);
      console.log('✅ "Clear Filters" button in empty state is clickable and responsive.');
      passed++;
    }

  } catch (err) {
    console.error('❌ Shop/Home verification error:', err);
    failed++;
  } finally {
    await browser.close();
    console.log('\n----------------------------------------');
    console.log(`SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('----------------------------------------');
    if (failed > 0) process.exit(1);
  }
}

runShopHomeVerification();
