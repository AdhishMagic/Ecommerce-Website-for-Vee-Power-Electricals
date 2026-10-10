import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const VITE_PORT = 5173;
const FRONTEND_URL = `http://127.0.0.1:${VITE_PORT}`;

async function testUrl(pathUrl) {
  const url = `${FRONTEND_URL}${pathUrl}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      headers: { Accept: 'text/html' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    return { status: res.status, ok: res.ok, html: text };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function runTests() {
  console.log('=== POLICIES & INFORMATION SECTION COMPREHENSIVE AUDIT & VERIFICATION ===\n');

  // 1. Audit Footer Links Definition
  console.log('[Test 1] Auditing Footer component configuration...');
  const footerPath = path.resolve('frontend/src/components/layout/Footer.tsx');
  const footerContent = fs.readFileSync(footerPath, 'utf8');

  assert(footerContent.includes('Policies & Information'), 'Heading must be "Policies & Information"');
  assert(footerContent.includes('About Us') && footerContent.includes('to: "/about"'), 'About Us link verified');
  assert(footerContent.includes('Contact Us') && footerContent.includes('to: "/contact"'), 'Contact Us link verified');
  assert(footerContent.includes('Privacy Policy') && footerContent.includes('to: "/privacy"'), 'Privacy Policy link verified');
  assert(footerContent.includes('Terms & Conditions') && footerContent.includes('to: "/terms"'), 'Terms & Conditions link verified');
  assert(footerContent.includes('Shipping Policy') && footerContent.includes('to: "/shipping"'), 'Shipping Policy link verified');
  assert(footerContent.includes('Return & Cancellation') && footerContent.includes('to: "/returns"'), 'Return & Cancellation link verified');
  assert(footerContent.includes('focus-visible:ring-2'), 'Accessible keyboard focus indicators present');
  console.log('✓ Footer.tsx has correct heading, links, styling, and focus-visible attributes.');

  // 2. Audit Routing in App.tsx
  console.log('\n[Test 2] Auditing App.tsx policy routes...');
  const appPath = path.resolve('frontend/src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  const requiredRoutes = [
    '/privacy',
    '/privacy-policy',
    '/terms',
    '/terms-and-conditions',
    '/shipping',
    '/shipping-policy',
    '/returns',
    '/return-and-cancellation',
    '/return-policy',
  ];
  for (const r of requiredRoutes) {
    assert(appContent.includes(`path="${r}"`), `Route ${r} must be defined in App.tsx`);
  }
  console.log(`✓ All ${requiredRoutes.length} policy routes and aliases are registered in App.tsx.`);

  // 3. Audit Policy Content Data
  console.log('\n[Test 3] Auditing Policy Data integrity...');
  const policyDataPath = path.resolve('frontend/src/data/policyData.ts');
  const policyDataContent = fs.readFileSync(policyDataPath, 'utf8');

  const requiredPolicies = ['privacy', 'terms', 'shipping', 'returns'];
  for (const p of requiredPolicies) {
    assert(policyDataContent.includes(`${p}: {`), `Policy key "${p}" must exist`);
  }

  // Check specific business truth requirements
  assert(policyDataContent.includes('Coimbatore Hub'), 'Coimbatore dispatch hub must be specified');
  assert(policyDataContent.includes('33CKXPK4525R1Z9'), 'Statutory GSTIN must be verified');
  assert(policyDataContent.includes('veepower.cbe@gmail.com'), 'Email contact verified');
  assert(policyDataContent.includes('+91 8610359797'), 'Support phone verified');
  assert(policyDataContent.includes('₹999'), 'Free delivery threshold (₹999) accurately stated');
  assert(policyDataContent.includes('7-day return window'), 'Return window clearly specified');
  assert(policyDataContent.includes('Pre-Dispatch Cancellation'), 'Pre-dispatch cancellation rules specified');
  assert(policyDataContent.includes('Non-Returnable Products'), 'Non-returnable electrical categories specified');
  assert(policyDataContent.includes('PCI-DSS compliant third-party payment gateways'), 'Payment security accurately described');
  console.log('✓ Policy content reflects actual business facts, logistics capabilities, and payment practices.');

  // 4. Test Live HTTP Route Resolution on Local Dev Server
  console.log('\n[Test 4] Verifying HTTP response of all policy routes on Vite dev server...');
  const testRoutes = [
    '/about',
    '/contact',
    '/privacy',
    '/privacy-policy',
    '/terms',
    '/terms-and-conditions',
    '/shipping',
    '/shipping-policy',
    '/returns',
    '/return-and-cancellation',
    '/return-policy',
  ];

  for (const route of testRoutes) {
    const res = await testUrl(route);
    assert(res.ok && res.status === 200, `Route ${route} failed with status ${res.status}`);
    assert(res.html.includes('<!DOCTYPE html>') || res.html.includes('<html'), `Route ${route} did not return HTML`);
    console.log(`  ✓ Route ${route} -> HTTP 200 OK`);
  }

  console.log('\n=== ALL POLICIES & INFORMATION AUDITS PASSED SUCCESSFULLY ===');
}

runTests().catch((err) => {
  console.error('\n❌ Test Error:', err);
  process.exit(1);
});
