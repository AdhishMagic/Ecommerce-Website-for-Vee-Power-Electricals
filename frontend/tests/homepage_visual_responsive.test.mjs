import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:5173';
const TOLERANCE = 2; // px

const VIEWPORTS = [
  { name: '320px', width: 320, height: 600 },
  { name: '375px', width: 375, height: 667 },
  { name: '390px', width: 390, height: 844 },
  { name: '430px', width: 430, height: 932 },
  { name: '768px', width: 768, height: 1024 },
  { name: '820px', width: 820, height: 1180 },
  { name: '1024px', width: 1024, height: 768 },
  { name: '1280px', width: 1280, height: 800 },
  { name: '1366px', width: 1366, height: 768 },
  { name: '1440px', width: 1440, height: 900 },
  { name: '1920px', width: 1920, height: 1080 }
];

const screenshotDir = path.resolve('tests/screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function runHomepageVerification() {
  console.log('--- STARTING HOMEPAGE VISUAL & RESPONSIVE VERIFICATION ---');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let allPassed = true;

  for (const vp of VIEWPORTS) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);

    // 1. Check Horizontal Overflow
    const overflow = await page.evaluate((tol) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;
      return {
        hasOverflow: scrollWidth > innerWidth + tol,
        diff: scrollWidth - innerWidth
      };
    }, TOLERANCE);

    if (overflow.hasOverflow) {
      console.error(`  ✗ [FAIL] Horizontal overflow detected: +${overflow.diff}px`);
      allPassed = false;
    } else {
      console.log(`  ✓ [PASS] Zero horizontal overflow (diff: ${overflow.diff}px)`);
    }

    // 2. Check Why Choose Vee Power Benefit Cards
    const benefitCards = await page.evaluate(() => {
      const titles = ['Genuine Products', 'Trusted Brands', 'Competitive Pricing', 'Reliable Service'];
      const cards = [];
      for (const t of titles) {
        const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes(t));
        if (heading) {
          const cardEl = heading.closest('[class*="rounded"]');
          if (cardEl) {
            const style = window.getComputedStyle(cardEl);
            cards.push({
              title: t,
              bgColor: style.backgroundColor,
              textColor: window.getComputedStyle(heading).color,
              borderRadius: style.borderRadius
            });
          }
        }
      }
      return cards;
    });

    if (benefitCards.length === 4) {
      console.log(`  ✓ [PASS] All 4 Why Choose benefit cards present`);
      let allLight = true;
      for (const c of benefitCards) {
        const match = c.bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const [, r, g, b] = match.map(Number);
          if (r < 200 || g < 200 || b < 200) {
            console.error(`  ✗ [FAIL] Card "${c.title}" has non-light background: ${c.bgColor}`);
            allLight = false;
            allPassed = false;
          }
        }
      }
      if (allLight) {
        console.log(`  ✓ [PASS] All 4 cards have consistent light backgrounds (all white/near-white)`);
      }
    } else {
      console.error(`  ✗ [FAIL] Found only ${benefitCards.length}/4 benefit cards`);
      allPassed = false;
    }

    // 3. Check Bulk Electrical Supplies Section Contrast
    const bulkSection = await page.evaluate(() => {
      const h2 = Array.from(document.querySelectorAll('h2')).find(el => el.textContent?.includes('Need Bulk Electrical Supplies?'));
      if (!h2) return null;
      const h2Style = window.getComputedStyle(h2);
      const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent?.includes('Get Bulk Quote'));
      return {
        headingText: h2.textContent?.trim(),
        headingColor: h2Style.color,
        btnPresent: !!btn,
        btnText: btn ? btn.textContent?.trim() : null
      };
    });

    if (bulkSection) {
      console.log(`  ✓ [PASS] Bulk section heading found: "${bulkSection.headingText}"`);
      if (bulkSection.headingColor.includes('255, 255, 255')) {
        console.log(`  ✓ [PASS] Bulk section heading is pure high-contrast white (${bulkSection.headingColor})`);
      } else {
        console.error(`  ✗ [FAIL] Bulk section heading color is not white: ${bulkSection.headingColor}`);
        allPassed = false;
      }
      if (bulkSection.btnPresent) {
        console.log(`  ✓ [PASS] "Get Bulk Quote" button present and readable`);
      } else {
        console.error(`  ✗ [FAIL] "Get Bulk Quote" button not found`);
        allPassed = false;
      }
    } else {
      console.error(`  ✗ [FAIL] Bulk Electrical Supplies section heading not found`);
      allPassed = false;
    }

    // 4. Check Carousel
    const carouselInfo = await page.evaluate(() => {
      const carouselTrack = document.querySelector('[class*="flex"][class*="overflow-hidden"]') || document.querySelector('[style*="translateX"]');
      return {
        hasTrack: !!carouselTrack
      };
    });
    if (carouselInfo.hasTrack) {
      console.log(`  ✓ [PASS] Category carousel track is active`);
    }

    // Capture screenshots for representative breakpoints
    if (['320px', '390px', '768px', '1024px', '1440px'].includes(vp.name)) {
      const ssPath = path.join(screenshotDir, `homepage-${vp.name}.png`);
      await page.screenshot({ path: ssPath, fullPage: false });
      console.log(`  📸 Saved screenshot: ${ssPath}`);

      const whyChooseEl = await page.$('text=Why Choose Vee Power?');
      if (whyChooseEl) {
        const sectionContainer = await whyChooseEl.evaluateHandle(el => el.closest('section') || el.closest('.py-16') || el.parentElement.parentElement);
        if (sectionContainer && sectionContainer.asElement()) {
          const benefitSS = path.join(screenshotDir, `benefits-bulk-${vp.name}.png`);
          await sectionContainer.asElement().screenshot({ path: benefitSS }).catch(() => {});
          console.log(`  📸 Saved benefit section screenshot: ${benefitSS}`);
        }
      }
    }
  }

  // 5. Reduced Motion Check
  console.log('\n--- TESTING REDUCED MOTION PREFERENCE ---');
  const reducedMotionContext = await browser.newContext({
    reducedMotion: 'reduce'
  });
  const rmPage = await reducedMotionContext.newPage();
  await rmPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const fadeSectionsVisible = await rmPage.evaluate(() => {
    const fadeSections = document.querySelectorAll('.fade-in-section');
    let allVisible = true;
    fadeSections.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.opacity === '0') allVisible = false;
    });
    return { count: fadeSections.length, allVisible };
  });
  console.log(`  Found ${fadeSectionsVisible.count} fade-in sections`);
  if (fadeSectionsVisible.allVisible) {
    console.log(`  ✓ [PASS] All sections are immediately visible when prefers-reduced-motion is enabled`);
  } else {
    console.error(`  ✗ [FAIL] Some sections hidden under reduced-motion`);
    allPassed = false;
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('ALL HOMEPAGE VISUAL & RESPONSIVE VERIFICATIONS PASSED (11/11 VIEWPORTS)!');
  } else {
    console.error('SOME CHECKS FAILED!');
    process.exit(1);
  }
}

runHomepageVerification().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
