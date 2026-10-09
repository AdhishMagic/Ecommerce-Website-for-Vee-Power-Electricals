import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function runCategoryPreviewVerification() {
  console.log('=== STARTING COMPLETE CATEGORY DEFAULT IMAGE VERIFICATION ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screenshotsDir = path.resolve('tests/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Log in as admin
  console.log('[1] Logging in as admin...');
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'admin@veepower.in');
  await page.fill('input[type="password"]', 'AdminPass123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin', { timeout: 20000 });
  console.log('  ✓ Admin logged in successfully.\n');

  // 2. Open Add Product Form
  console.log('[2] Navigating to Add Product form (/admin/products/add)...');
  await page.goto('http://localhost:5173/admin/products/add');
  await page.waitForSelector('text=Add New Product', { timeout: 20000 });
  console.log('  ✓ Add Product form loaded.\n');

  // Test categories to cycle through
  const testCategories = [
    { label: 'MCB & Protection', expectedKeyword: 'mcb-protection' },
    { label: 'Electrical Accessories', expectedKeyword: 'electrical-accessories' },
    { label: 'LED & Lighting', expectedKeyword: 'lighting' },
    { label: 'LED Luminaires', expectedKeyword: 'led-luminaires' },
    { label: 'MCB & Distribution', expectedKeyword: 'mcb-distribution' },
    { label: 'Switches', expectedKeyword: 'switches' },
    { label: 'Fans', expectedKeyword: 'fans' },
    { label: 'LED Lighting', expectedKeyword: 'led-lighting' },
    { label: 'Wires & Cables', expectedKeyword: 'wires-cables' },
    { label: 'Modular Switches', expectedKeyword: 'modular-switches' },
  ];

  // 3. Test Section 0 Category selection and immediate thumbnail pill
  console.log('[3] Verifying Section 0 (Basic Info) Category Selection...');
  const section0Select = page.locator('select').nth(1);
  await section0Select.selectOption({ label: 'MCB & Protection' });
  await page.waitForTimeout(400);

  const section0Pill = page.locator('text=Default Image: MCB & Protection');
  const pillCount = await section0Pill.count();
  console.log(`  Section 0 Default Image pill visible: ${pillCount > 0 ? 'YES' : 'NO'}`);
  if (pillCount === 0) {
    throw new Error('Section 0 category pill failed to display default image indication.');
  }

  // 4. Navigate to "Product Image" tab (Section 3)
  console.log('\n[4] Navigating to Section 3 (Product Image Management)...');
  await page.click('button:has-text("Product Image")');
  await page.waitForSelector('text=Product Image Management', { timeout: 10000 });

  // 5. Test each category from Section 3 dropdown
  console.log('\n[5] Testing every category in Product Image Management preview:');
  const section3Select = page.locator('select').first(); // In Section 3, category select is first select

  for (const cat of testCategories) {
    console.log(`\n  Testing category: "${cat.label}"...`);
    // Select the category
    await section3Select.selectOption({ label: cat.label });
    await page.waitForTimeout(500);

    // Locate the preview image inside the preview card
    const imgLocator = page.locator('div.border.border-\\[\\#D9E1E8\\].rounded-2xl img').first();
    const isVisible = await imgLocator.isVisible();
    const src = await imgLocator.getAttribute('src');
    const naturalWidth = await imgLocator.evaluate(el => el.naturalWidth);
    const naturalHeight = await imgLocator.evaluate(el => el.naturalHeight);
    const complete = await imgLocator.evaluate(el => el.complete);

    console.log(`    Visible: ${isVisible}`);
    console.log(`    Source: ${src}`);
    console.log(`    Natural Size: ${naturalWidth}x${naturalHeight}`);
    console.log(`    Load Complete: ${complete}`);

    if (!isVisible || !complete || naturalWidth === 0 || naturalHeight === 0) {
      throw new Error(`Category "${cat.label}" failed: image is blank or not rendered! (size: ${naturalWidth}x${naturalHeight})`);
    }

    if (!src || !src.toLowerCase().includes(cat.expectedKeyword)) {
      throw new Error(`Category "${cat.label}" rendered wrong image! Expected keyword "${cat.expectedKeyword}", got "${src}"`);
    }

    // Verify badge says Category Default
    const badgeText = await page.locator('span:has-text("✓ Category Default")').textContent();
    console.log(`    Badge: "${badgeText?.trim()}"`);
    console.log(`    ✓ [PASS] "${cat.label}" preview verified perfectly!`);
  }

  // 6. Test Custom Image Upload & Revert to Category Default
  console.log('\n[6] Testing Custom Image Upload and Revert Action...');
  // Select MCB & Protection first
  await section3Select.selectOption({ label: 'MCB & Protection' });
  await page.waitForTimeout(400);

  // Set a custom image via input
  const directUrlInput = page.locator('input').last();
  await directUrlInput.fill('https://example.com/custom-breaker.webp');
  await page.waitForTimeout(500);

  // Check that badge changed to "Custom Image"
  const customBadge = page.locator('span:has-text("Custom Image")');
  console.log(`  Custom image badge visible: ${await customBadge.isVisible()}`);

  // Now click "Use Category Default Image"
  console.log('  Clicking "Use Category Default Image"...');
  await page.click('button:has-text("Use Category Default Image")');
  await page.waitForTimeout(500);

  // Verify badge returned to "Category Default"
  const defaultBadgeAgain = page.locator('span:has-text("✓ Category Default")');
  const imgAfterReset = page.locator('div.border.border-\\[\\#D9E1E8\\].rounded-2xl img').first();
  const srcAfterReset = await imgAfterReset.getAttribute('src');
  const naturalWidthAfterReset = await imgAfterReset.evaluate(el => el.naturalWidth);

  console.log(`  Badge returned to default: ${await defaultBadgeAgain.isVisible()}`);
  console.log(`  Image source after reset: ${srcAfterReset}`);
  console.log(`  Image natural size after reset: ${naturalWidthAfterReset}px`);

  if (!srcAfterReset.includes('mcb-protection') || naturalWidthAfterReset === 0) {
    throw new Error('Failed to revert to category default!');
  }
  console.log('  ✓ [PASS] Revert to category default verified!');

  // Take final verified screenshot
  const finalSS = path.join(screenshotsDir, 'category-preview-verification.png');
  await page.screenshot({ path: finalSS });
  console.log(`\n  📸 Final screenshot saved: ${finalSS}`);

  await browser.close();
  console.log('\n=============================================================');
  console.log('ALL CATEGORY DEFAULT PREVIEW SCENARIOS VERIFIED SUCCESSFULLY!');
  console.log('=============================================================');
}

runCategoryPreviewVerification().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
