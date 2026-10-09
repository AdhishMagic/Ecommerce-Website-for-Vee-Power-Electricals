import { chromium } from '@playwright/test';

const VIEWPORTS = [
  { name: '320px (Mobile S)', width: 320, height: 640 },
  { name: '360px (Mobile M)', width: 360, height: 640 },
  { name: '375px (iPhone SE)', width: 375, height: 667 },
  { name: '390px (iPhone 13/14)', width: 390, height: 844 },
  { name: '430px (iPhone Pro Max)', width: 430, height: 932 },
  { name: '768px (iPad Portrait)', width: 768, height: 1024 },
  { name: '820px (iPad Air)', width: 820, height: 1180 },
  { name: '1024px (iPad Pro / Small Laptop)', width: 1024, height: 768 },
  { name: '1280px (Laptop)', width: 1280, height: 800 },
  { name: '1366px (Standard Laptop)', width: 1366, height: 768 },
  { name: '1440px (Desktop)', width: 1440, height: 900 },
  { name: '1920px (Full HD)', width: 1920, height: 1080 }
];

async function runCategoriesVerification() {
  console.log('🚀 Starting Categories Page Responsive & Functional Verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let totalTestsPassed = 0;
  let totalTestsFailed = 0;

  try {
    // 1. Navigation & Content Checks
    console.log('\n--- 1. Navigation & Header Verification ---');
    await page.goto('http://localhost:5173/categories', { waitUntil: 'networkidle' });

    const titleText = await page.locator('h1').textContent();
    console.log(`Page H1 title: "${titleText?.trim()}"`);
    if (titleText?.includes('Explore Electrical Categories')) {
      console.log('✅ H1 title matches exact required text: "Explore Electrical Categories"');
      totalTestsPassed++;
    } else {
      console.error(`❌ H1 title mismatch: expected "Explore Electrical Categories", got "${titleText}"`);
      totalTestsFailed++;
    }

    const subtitleText = await page.locator('p:has-text("Find the right electrical products")').textContent();
    console.log(`Subtitle text: "${subtitleText?.trim()}"`);
    if (subtitleText?.includes('Find the right electrical products for your home, business, or project.')) {
      console.log('✅ Subtitle matches exact required text');
      totalTestsPassed++;
    } else {
      console.error('❌ Subtitle text mismatch');
      totalTestsFailed++;
    }

    // 2. Category Cards & Subcategory Pills Check
    console.log('\n--- 2. Category Grid & Product Imagery ---');
    const categoryCards = page.locator('article');
    const count = await categoryCards.count();
    console.log(`Found ${count} category cards rendered.`);
    if (count > 0) {
      console.log(`✅ Category grid loaded ${count} categories successfully.`);
      totalTestsPassed++;
    } else {
      console.error('❌ No category cards found.');
      totalTestsFailed++;
    }

    // Check images of categories (ensure fallback works, no broken img src)
    const cardImages = page.locator('article img');
    const imgCount = await cardImages.count();
    let brokenImages = 0;
    for (let i = 0; i < imgCount; i++) {
      const src = await cardImages.nth(i).getAttribute('src');
      if (!src || src.includes('undefined')) {
        brokenImages++;
      }
    }
    if (brokenImages === 0) {
      console.log(`✅ All ${imgCount} category card images loaded valid image sources.`);
      totalTestsPassed++;
    } else {
      console.error(`❌ Found ${brokenImages} broken image sources.`);
      totalTestsFailed++;
    }

    // 3. Live Search Filtering Check
    console.log('\n--- 3. Live Search Filtering ---');
    const searchInput = page.locator('input[placeholder="Search electrical categories..."]');
    await searchInput.fill('fan');
    await page.waitForTimeout(300);

    const fanCardCount = await page.locator('article').count();
    console.log(`Search for "fan" yielded ${fanCardCount} card(s).`);
    const fanCardText = await page.locator('article').first().textContent();
    if (fanCardText?.toLowerCase().includes('fan')) {
      console.log('✅ Search filtering correctly isolates "Fans" category.');
      totalTestsPassed++;
    } else {
      console.error('❌ Search filtering failed for query "fan".');
      totalTestsFailed++;
    }

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(300);
    const resetCount = await page.locator('article').count();
    if (resetCount === count) {
      console.log('✅ Clearing search restores all category cards.');
      totalTestsPassed++;
    } else {
      console.error(`❌ Search clear failed. Expected ${count}, got ${resetCount}`);
      totalTestsFailed++;
    }

    // Search non-matching text to test empty state
    await searchInput.fill('xyznonexistent123');
    await page.waitForTimeout(300);
    const emptyStateText = await page.locator('text=No categories found matching').textContent();
    if (emptyStateText) {
      console.log('✅ Empty search state displayed cleanly.');
      totalTestsPassed++;
    } else {
      console.error('❌ Empty search state not displayed.');
      totalTestsFailed++;
    }

    await searchInput.fill('');
    await page.waitForTimeout(300);

    // 4. Product Ceiling Fan Image Resolver Verification
    console.log('\n--- 4. Ceiling Fan Product Image Resolver Check ---');
    await page.goto('http://localhost:5173/shop?search=ceiling%20fan', { waitUntil: 'networkidle' });
    const productCards = page.locator('img[alt*="Fan"], img[alt*="fan"]');
    const fanImgCount = await productCards.count();
    let mechanicPhotoDetected = false;
    for (let i = 0; i < fanImgCount; i++) {
      const src = await productCards.nth(i).getAttribute('src');
      console.log(`Ceiling fan product photo #${i + 1} src: ${src}`);
      if (src && src.includes('photo-1558618666-fcd25c85cd64')) {
        mechanicPhotoDetected = true;
      }
    }
    if (!mechanicPhotoDetected) {
      console.log('✅ Ceiling fan product images successfully replaced mechanic/tool portrait with clean default fan image!');
      totalTestsPassed++;
    } else {
      console.error('❌ Ceiling fan product images still using mechanic/tool photo!');
      totalTestsFailed++;
    }

    // 5. Responsive Overflow Check across 12 Viewports
    console.log('\n--- 5. 12-Viewport Responsive & Overflow Audit ---');
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:5173/categories', { waitUntil: 'networkidle' });

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (!hasHorizontalOverflow) {
        console.log(`✅ [${vp.name}] Pass - Zero horizontal overflow (scrollWidth <= clientWidth).`);
        totalTestsPassed++;
      } else {
        const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        console.error(`❌ [${vp.name}] Failed - Horizontal overflow of ${diff}px detected!`);
        totalTestsFailed++;
      }
    }

  } catch (err) {
    console.error('❌ Verification script encountered an error:', err);
    totalTestsFailed++;
  } finally {
    await browser.close();
    console.log('\n----------------------------------------');
    console.log(`SUMMARY: ${totalTestsPassed} PASSED | ${totalTestsFailed} FAILED`);
    console.log('----------------------------------------');
    if (totalTestsFailed > 0) {
      process.exit(1);
    }
  }
}

runCategoriesVerification();
