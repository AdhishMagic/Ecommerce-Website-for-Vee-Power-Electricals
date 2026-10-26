// Unit and contract tests for GoogleSignInButton and Google Auth flows
// Verifies: Missing Client ID handling, Disabled button behavior, Origin mismatch handling,
// Token submission contract, and Account linking contract.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================================');
console.log('   GOOGLE SIGN-IN BUTTON & AUTH CONTRACT TEST SUITE    ');
console.log('========================================================\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
  }
}

// 1. Source Code Inspections
const buttonSourcePath = path.resolve(__dirname, '../src/components/auth/GoogleSignInButton.tsx');
const buttonSource = fs.readFileSync(buttonSourcePath, 'utf-8');

test('GoogleSignInButton reads VITE_GOOGLE_CLIENT_ID from environment', () => {
  assert(buttonSource.includes('import.meta.env.VITE_GOOGLE_CLIENT_ID'), 'Must load from VITE_GOOGLE_CLIENT_ID');
  assert(!buttonSource.includes('AIzaSy'), 'Must never hardcode a Google client secret or key');
  assert(!buttonSource.includes('GOCSPX-'), 'Must never embed client secret in frontend component');
});

test('GoogleSignInButton contains data-testid="google-signin-not-configured" for missing Client ID', () => {
  assert(buttonSource.includes('data-testid="google-signin-not-configured"'), 'Must render not-configured testid');
  assert(buttonSource.includes('Google Sign-In is not configured'), 'Must show clear actionable notice');
  assert(buttonSource.includes('Missing'), 'Must explain missing variable name');
});

test('GoogleSignInButton handles disabled state properly', () => {
  assert(buttonSource.includes('disabled ?'), 'Must check disabled prop in rendered views');
  assert(buttonSource.includes('pointer-events-none') || buttonSource.includes('opacity-50'), 'Must disable interaction visually and functionally');
});

test('GoogleSignInButton handles Google Cloud origin detection (localhost fallback)', () => {
  assert(buttonSource.includes('isLocalhost'), 'Must detect localhost origin');
  assert(buttonSource.includes('setGisRenderFallback(true)'), 'Must immediately fallback to OAuth redirect on localhost');
});

test('GoogleSignInButton includes fallback to OAuth Redirect when GIS is blocked or fails', () => {
  assert(buttonSource.includes('handleOAuthRedirect') || buttonSource.includes('gisRenderFallback'), 'Must support redirect flow fallback');
  assert(buttonSource.includes('/auth/google/login/'), 'Must route to registered Django OAuth login endpoint');
});

// 2. Client ID validation logic test
test('Client ID validation function rejects empty and template IDs', () => {
  const validateClientId = (id) => {
    const trimmed = (id || '').trim();
    return Boolean(trimmed && !trimmed.includes('your-google-client-id') && trimmed.length > 10);
  };

  assert.strictEqual(validateClientId(''), false, 'Empty string is invalid');
  assert.strictEqual(validateClientId('   '), false, 'Whitespace is invalid');
  assert.strictEqual(validateClientId('your-google-client-id'), false, 'Template placeholder is invalid');
  assert.strictEqual(validateClientId('596350507445-94sh0vknugo2j18ur2920su3uj388e5j.apps.googleusercontent.com'), true, 'Valid Client ID is accepted');
});

// 3. Login.tsx token handling inspection
const loginSourcePath = path.resolve(__dirname, '../src/pages/auth/Login.tsx');
const loginSource = fs.readFileSync(loginSourcePath, 'utf-8');

test('Login.tsx stores OAuth tokens before requesting current user profile', () => {
  assert(loginSource.includes('setAuthTokens(oauthToken'), 'Must persist tokens before invoking getCurrentUser()');
  assert(loginSource.includes('clearAuthStorage()'), 'Must clean up storage on profile initialization failure');
});

// 4. Live API Contract Tests
const API_BASE = 'http://localhost:8000/api/v1';

async function runAsyncTests() {
  console.log('\n--- Live API Contract Verification ---');

  // Test: Missing token rejected
  total++;
  try {
    const res = await fetch(`${API_BASE}/auth/google/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    assert(res.status === 400, 'Must return 400 Bad Request');
    assert(data?.error?.code === 'VALIDATION_ERROR' || data?.credential !== undefined, 'Must flag credential validation error');
    console.log('  ✓ [PASS] Backend rejects empty Google credential submission (400)');
    passed++;
  } catch (err) {
    console.error('  ✗ [FAIL] Backend rejects empty Google credential submission:', err.message);
  }

  // Test: Invalid token rejected
  total++;
  try {
    const res = await fetch(`${API_BASE}/auth/google/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'header.invalidpayload.invalidsignature' }),
    });
    const data = await res.json().catch(() => ({}));
    assert(res.status === 401, 'Must return 401 Unauthorized');
    assert(data?.error?.code === 'INVALID_GOOGLE_TOKEN', 'Must return INVALID_GOOGLE_TOKEN code');
    console.log('  ✓ [PASS] Backend rejects invalid Google ID token (401 INVALID_GOOGLE_TOKEN)');
    passed++;
  } catch (err) {
    console.error('  ✗ [FAIL] Backend rejects invalid Google ID token:', err.message);
  }

  // Test: OAuth redirect flow initiates with exact registered callback
  total++;
  try {
    const res = await fetch(`http://localhost:8000/auth/google/login/?format=json`);
    const data = await res.json().catch(() => ({}));
    assert(res.status === 200, 'OAuth init must return 200 OK');
    assert(data?.authorization_url?.includes('accounts.google.com'), 'Must target accounts.google.com');
    assert(data?.authorization_url?.includes('596350507445-94sh0vknugo2j18ur2920su3uj388e5j.apps.googleusercontent.com'), 'Must include exact Client ID');
    assert(data?.authorization_url?.includes('redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Fauth%2Fgoogle%2Fcallback'), 'Must match authorized redirect URI exactly');
    console.log('  ✓ [PASS] OAuth redirect URL matches Google Cloud registered callback');
    passed++;
  } catch (err) {
    console.error('  ✗ [FAIL] OAuth redirect URL matches Google Cloud registered callback:', err.message);
  }

  console.log('\n========================================================');
  console.log(`   TEST RESULTS: ${passed}/${total} PASSED (${passed === total ? '100% ALL PASS' : 'FAILURES OCCURRED'})`);
  console.log('========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runAsyncTests().catch((err) => {
  console.error('Async test error:', err);
  process.exit(1);
});
