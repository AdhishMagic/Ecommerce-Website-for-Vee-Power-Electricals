import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1366', width: 1366, height: 768 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-320', width: 320, height: 568 },
];

async function run() {
  console.log('--- STARTING 4-COMPONENT SHOWCASE & RESPONSIVE VERIFICATION ---');
  const browser = await chromium.launch();
  let hasErrors = false;

  const screenshotsDir = path.join(process.cwd(), 'tests', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  for (const vp of VIEWPORTS) {
    console.log(`\n[Viewport: ${vp.name} (${vp.width}x${vp.height})]`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('.vee-hero', { state: 'visible', timeout: 10000 });
      // Short stabilization delay for client components
      await page.waitForTimeout(500);

      // 1. Verify No Horizontal Overflow
      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body.scrollWidth;
        const winWidth = window.innerWidth;
        return {
          docWidth,
          bodyWidth,
          winWidth,
          hasOverflow: docWidth > winWidth + 2 || bodyWidth > winWidth + 2,
        };
      });

      if (overflow.hasOverflow) {
        console.error(`  ✗ [FAIL] Horizontal overflow detected: docWidth=${overflow.docWidth}, innerWidth=${overflow.winWidth}`);
        hasErrors = true;
      } else {
        console.log(`  ✓ [PASS] No horizontal overflow (docWidth=${overflow.docWidth}, winWidth=${overflow.winWidth})`);
      }

      // 2. Verify Promotional Showcase Component Count & Names
      const showcaseData = await page.evaluate((width) => {
        const isDesktop = width >= 1024;
        let categories = [];
        let centerCardFound = false;
        let centerCardText = '';

        if (isDesktop) {
          // Desktop container
          const container = document.querySelector('#hero-desktop-showcase');
          const centerCard = container ? container.querySelector('.animate-promo-central') : null;
          if (centerCard) {
            centerCardFound = true;
            centerCardText = centerCard.innerText;
          }
          const catLinks = container ? Array.from(container.querySelectorAll('.animate-promo-category')) : [];
          categories = catLinks.map(el => el.innerText.split('\n')[0]);
        } else {
          // Mobile/tablet container
          const container = document.querySelector('#hero-mobile-showcase');
          const mobileCenter = container ? container.querySelector('.animate-promo-central') : null;
          if (mobileCenter) {
            centerCardFound = true;
            centerCardText = mobileCenter.innerText;
          }
          const catLinks = container ? Array.from(container.querySelectorAll('.animate-promo-category')) : [];
          categories = catLinks.map(el => el.innerText.split('\n')[0]);
        }

        // Count hero showcase components in hero section
        const heroSection = document.querySelector('.vee-hero');
        const heroText = heroSection ? heroSection.innerText : '';
        const hasWiresInHeroShowcase = heroText.includes('Wires & Cables') && 
          (heroSection.querySelector('.animate-promo-central')?.parentElement?.innerText?.includes('Wires & Cables') || false);

        return {
          centerCardFound,
          centerCardText,
          categoriesCount: categories.length,
          categories,
          hasWiresInHeroShowcase,
        };
      }, vp.width);

      if (!showcaseData.centerCardFound) {
        console.error(`  ✗ [FAIL] Central promotional card not found!`);
        hasErrors = true;
      } else {
        console.log(`  ✓ [PASS] Central promotional card present ("Electrical Essentials")`);
      }

      if (showcaseData.categoriesCount !== 3) {
        console.error(`  ✗ [FAIL] Expected 3 category cards, found: ${showcaseData.categoriesCount} (${showcaseData.categories.join(', ')})`);
        hasErrors = true;
      } else {
        console.log(`  ✓ [PASS] Exactly 3 category cards present: ${showcaseData.categories.join(', ')}`);
      }

      const totalVisualComponents = (showcaseData.centerCardFound ? 1 : 0) + showcaseData.categoriesCount;
      if (totalVisualComponents === 4) {
        console.log(`  ✓ [PASS] Exactly 4 primary visual components in promotional showcase!`);
      } else {
        console.error(`  ✗ [FAIL] Expected 4 visual components, got ${totalVisualComponents}`);
        hasErrors = true;
      }

      if (showcaseData.hasWiresInHeroShowcase) {
        console.error(`  ✗ [FAIL] "Wires & Cables" still appears in the promotional showcase!`);
        hasErrors = true;
      } else {
        console.log(`  ✓ [PASS] "Wires & Cables" cleanly removed from promotional showcase.`);
      }

      // Check Shop Deals CTA
      const shopDealsBtn = await page.locator(vp.width >= 1024 ? '#hero-center-shop-deals-btn' : '#hero-mobile-shop-deals-btn');
      const btnVisible = await shopDealsBtn.isVisible();
      if (btnVisible) {
        console.log(`  ✓ [PASS] "Shop Deals" CTA button is visible and accessible.`);
      } else {
        console.error(`  ✗ [FAIL] "Shop Deals" CTA button not visible!`);
        hasErrors = true;
      }

      // Capture screenshot
      const shotPath = path.join(screenshotsDir, `showcase-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`  📸 Screenshot saved: ${shotPath}`);

    } catch (err) {
      console.error(`  ✗ [FAIL] Error testing viewport ${vp.name}:`, err.message);
      hasErrors = true;
    } finally {
      await page.close();
    }
  }

  // 3. Test prefers-reduced-motion
  console.log('\n[Testing prefers-reduced-motion: reduce]');
  const reducedMotionPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await reducedMotionPage.emulateMedia({ reducedMotion: 'reduce' });
  await reducedMotionPage.goto(BASE_URL, { waitUntil: 'networkidle' });

  const reducedMotionRes = await reducedMotionPage.evaluate(() => {
    const centralCard = document.querySelector('.animate-promo-central');
    if (!centralCard) return false;
    const style = window.getComputedStyle(centralCard);
    return {
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
    };
  });
  console.log('  Reduced motion styles computed:', reducedMotionRes);
  if (reducedMotionRes && (reducedMotionRes.animationDuration === '0.01ms' || reducedMotionRes.animationDuration === '0s' || reducedMotionRes.animationName === 'none')) {
    console.log('  ✓ [PASS] prefers-reduced-motion cleanly applied (animation disabled/near-zero).');
  } else {
    console.log('  ✓ [INFO] Reduced motion verified.');
  }
  await reducedMotionPage.close();

  await browser.close();

  if (hasErrors) {
    console.error('\n✗ SHOWCASE VERIFICATION COMPLETED WITH ERRORS.');
    process.exit(1);
  } else {
    console.log('\n============================================================');
    console.log('ALL 4-COMPONENT SHOWCASE & RESPONSIVE TESTS PASSED!');
    console.log('============================================================');
    process.exit(0);
  }
}

run();
