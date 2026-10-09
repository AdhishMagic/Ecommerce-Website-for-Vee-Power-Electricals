import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));
  page.on('response', res => {
    if (res.url().includes('/api/')) {
      console.log('API RESPONSE:', res.status(), res.url());
    }
  });

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@veepower.in');
  await page.fill('input[type="password"]', 'AdminPass123!');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('Current URL after 3s:', page.url());

  await page.waitForTimeout(4000);
  console.log('Current URL after 7s:', page.url());

  await page.screenshot({ path: 'tests/screenshots/debug-admin-login-2.png' });
  await browser.close();
}

main().catch(console.error);
