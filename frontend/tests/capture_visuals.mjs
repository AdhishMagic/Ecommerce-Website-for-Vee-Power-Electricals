import { chromium } from '@playwright/test';

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // Scroll to Why Choose Vee Power
  const whyChoose = page.locator('text=Why Choose Vee Power?');
  await whyChoose.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/screenshots/why-choose-desktop.png' });
  console.log('Saved why-choose-desktop.png');

  // Scroll to Bulk Electrical Supplies
  const bulk = page.locator('text=Need Bulk Electrical Supplies?');
  await bulk.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/screenshots/bulk-desktop.png' });
  console.log('Saved bulk-desktop.png');

  // Mobile 390px
  await page.setViewportSize({ width: 390, height: 844 });
  await whyChoose.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/screenshots/why-choose-mobile.png' });
  console.log('Saved why-choose-mobile.png');

  await bulk.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/screenshots/bulk-mobile.png' });
  console.log('Saved bulk-mobile.png');

  await browser.close();
}

capture().catch(console.error);
