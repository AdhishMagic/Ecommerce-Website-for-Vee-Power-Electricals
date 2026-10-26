// Automated regression test suite for Vee Power Electricals Authentication System
// Tests live Django + DRF backend & Frontend API contract

const API_BASE = 'http://localhost:8000/api/v1';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runRegressionSuite() {
  console.log('========================================================');
  console.log('   AUTHENTICATION REGRESSION & END-TO-END TEST SUITE   ');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
    }
  }

  // 1. Health check
  console.log('[Test 1] Backend Health Endpoint');
  const healthRes = await request('/health/');
  assert(healthRes.status === 200 && healthRes.data?.status === 'healthy', 'Health check is 200 OK and healthy');

  // 2. Admin Login Success
  console.log('\n[Test 2] Admin Account Login (admin@veepower.in)');
  const adminLoginRes = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@veepower.in',
      password: 'AdminPass123!',
    }),
  });
  assert(adminLoginRes.status === 200, 'Admin login returns 200 OK');
  assert(adminLoginRes.data?.user?.email === 'admin@veepower.in', 'Admin email matches');
  assert(adminLoginRes.data?.user?.role === 'admin', 'Admin role is "admin"');
  assert(adminLoginRes.data?.user?.is_staff === true, 'Admin has is_staff = true');
  assert(adminLoginRes.data?.user?.is_superuser === true, 'Admin has is_superuser = true');
  assert(!!adminLoginRes.data?.access, 'Access token is returned');
  assert(!!adminLoginRes.data?.refresh, 'Refresh token is returned');

  const adminAccessToken = adminLoginRes.data?.access;
  const adminRefreshToken = adminLoginRes.data?.refresh;

  // 3. /me Endpoint Authenticated
  console.log('\n[Test 3] /me Authenticated Profile (GET /auth/me/)');
  const meRes = await request('/auth/me/', {
    headers: { Authorization: `Bearer ${adminAccessToken}` },
  });
  assert(meRes.status === 200, '/auth/me/ returns 200 OK for admin');
  assert(meRes.data?.email === 'admin@veepower.in', '/auth/me/ returns admin profile');
  assert(meRes.data?.role === 'admin', '/auth/me/ indicates role is admin');

  // 4. /me Endpoint Unauthenticated
  console.log('\n[Test 4] /me Unauthenticated Request (GET /auth/me/ with no token)');
  const meUnauthRes = await request('/auth/me/');
  assert(meUnauthRes.status === 401, 'Unauthenticated /auth/me/ returns 401 Unauthorized');
  assert(meUnauthRes.data?.success === false, 'Error response follows canonical structure');

  // 5. Invalid Password Login
  console.log('\n[Test 5] Login with Incorrect Password');
  const badPassRes = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@veepower.in',
      password: 'WrongPassword999!',
    }),
  });
  assert(badPassRes.status === 401, 'Invalid password returns 401 Unauthorized');
  assert(badPassRes.data?.detail?.includes('Invalid email or password') || badPassRes.data?.error?.message?.includes('Invalid email or password'), 'Useful error message returned');

  // 6. Unknown Email Login
  console.log('\n[Test 6] Login with Non-Existent Email');
  const badEmailRes = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({
      email: 'nonexistent_user_999@veepower.in',
      password: 'SomePassword123!',
    }),
  });
  assert(badEmailRes.status === 401, 'Non-existent email returns 401 Unauthorized');
  assert(badEmailRes.data?.detail?.includes('Invalid email or password') || badEmailRes.data?.error?.message?.includes('Invalid email or password'), 'Prevents user enumeration');

  // 7. Missing Fields Login
  console.log('\n[Test 7] Login with Missing Fields');
  const missingLoginRes = await request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email: '' }),
  });
  assert(missingLoginRes.status === 400, 'Missing fields returns 400 Bad Request');

  // 8. Registration Success
  console.log('\n[Test 8] Customer Registration Success');
  const testSuffix = Date.now().toString(36);
  const newEmail = `customer_${testSuffix}@veepower.com`;
  const regRes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      email: newEmail,
      password: 'CustomerPass123!',
      first_name: 'Regression',
      last_name: 'Tester',
      phone: '+919876500000',
    }),
  });
  assert(regRes.status === 201, 'Valid registration returns 201 Created');
  assert(regRes.data?.user?.email === newEmail, 'Registered user email matches');
  assert(regRes.data?.user?.role === 'customer', 'Registered user role is customer');
  assert(regRes.data?.user?.is_staff === false, 'Customer is not staff');
  assert(!!regRes.data?.access, 'Registration returns access token');

  // 9. Duplicate Email Registration
  console.log('\n[Test 9] Duplicate Email Registration Failure');
  const dupRegRes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      email: newEmail,
      password: 'CustomerPass123!',
      first_name: 'Duplicate',
      last_name: 'Tester',
    }),
  });
  assert(dupRegRes.status === 400, 'Duplicate registration returns 400 Bad Request');
  assert(dupRegRes.data?.error?.details?.email !== undefined || dupRegRes.data?.errors?.email !== undefined, 'Specific email field validation error returned');

  // 10. Short Password Registration Validation
  console.log('\n[Test 10] Short Password Registration Validation');
  const shortPassRes = await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      email: `shortpass_${testSuffix}@veepower.com`,
      password: '123',
      first_name: 'Short',
      last_name: 'Password',
    }),
  });
  assert(shortPassRes.status === 400, 'Short password returns 400 Bad Request');
  assert(shortPassRes.data?.error?.details?.password !== undefined || shortPassRes.data?.errors?.password !== undefined, 'Specific password field validation error returned');

  // 11. Token Refresh
  console.log('\n[Test 11] JWT Token Refresh');
  const refreshRes = await request('/auth/token/refresh/', {
    method: 'POST',
    body: JSON.stringify({ refresh: adminRefreshToken }),
  });
  assert(refreshRes.status === 200, 'Token refresh returns 200 OK');
  assert(!!refreshRes.data?.access, 'New access token returned');
  const activeRefresh = refreshRes.data?.refresh || adminRefreshToken;

  // 12. Logout
  console.log('\n[Test 12] Logout and Token Blacklist');
  const logoutRes = await request('/auth/logout/', {
    method: 'POST',
    body: JSON.stringify({ refresh: activeRefresh }),
  });
  assert(logoutRes.status === 200, 'Logout returns 200 OK');

  // 13. Google Sign-In Validation (Empty Credential)
  console.log('\n[Test 13] Google Sign-In API with Empty Credential (POST /auth/google/)');
  const googleEmptyRes = await request('/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ credential: '' }),
  });
  assert(googleEmptyRes.status === 400, 'Empty credential returns 400 Bad Request');
  assert(googleEmptyRes.data?.error?.code === 'VALIDATION_ERROR' || googleEmptyRes.data?.credential !== undefined, 'Validation error details returned for credential');

  // 14. Google Sign-In Validation (Invalid / Fake Credential)
  console.log('\n[Test 14] Google Sign-In API with Invalid Credential (POST /auth/google/)');
  const googleInvalidRes = await request('/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ credential: 'fake_invalid_google_jwt_token' }),
  });
  assert(googleInvalidRes.status === 401, 'Invalid Google token returns 401 Unauthorized');
  assert(googleInvalidRes.data?.error?.code === 'INVALID_GOOGLE_TOKEN', 'Canonical error code is INVALID_GOOGLE_TOKEN');

  // 15. Google OAuth Init Endpoint (GET /auth/google/login/?format=json)
  console.log('\n[Test 15] Google OAuth Init Endpoint (GET /auth/google/login/?format=json)');
  const googleInitRes = await request('/auth/google/login/?format=json');
  assert(googleInitRes.status === 200, 'OAuth init returns 200 OK');
  assert(googleInitRes.data?.authorization_url?.includes('accounts.google.com'), 'Authorization URL points to accounts.google.com');
  assert(googleInitRes.data?.authorization_url?.includes('596350507445'), 'Authorization URL contains exact Google Client ID');
  assert(googleInitRes.data?.authorization_url?.includes('redirect_uri'), 'Authorization URL contains redirect_uri');

  // 16. Google OAuth Callback Error Handling (Cancellation)
  console.log('\n[Test 16] Google OAuth Callback Error Handling (GET /auth/google/callback?error=access_denied)');
  const callbackRes = await request('/auth/google/callback?error=access_denied&format=json');
  assert(callbackRes.status === 400, 'Cancelled OAuth returns 400 Bad Request');
  assert(callbackRes.data?.error === 'cancelled', 'Callback error response identifies cancellation');

  // 17. Frontend Login Page Availability (localhost)
  console.log('\n[Test 17] Frontend Login Page HTTP Response (http://localhost:5173/login)');
  const frontendRes = await fetch('http://localhost:5173/login');
  assert(frontendRes.status === 200, 'Frontend /login serves HTTP 200 on localhost');

  // 18. Frontend Login Page Availability (127.0.0.1 matching Google Cloud origin)
  console.log('\n[Test 18] Frontend Login Page HTTP Response (http://127.0.0.1:5173/login)');
  const frontend127Res = await fetch('http://127.0.0.1:5173/login');
  assert(frontend127Res.status === 200, 'Frontend /login serves HTTP 200 on 127.0.0.1 matching Google Cloud origin');

  // 19. Vite Proxy for OAuth Redirect (/auth/google/login/)
  console.log('\n[Test 19] Vite Dev Proxy to Django OAuth Endpoint (http://localhost:5173/auth/google/login/)');
  const viteProxyRes = await fetch('http://localhost:5173/auth/google/login/', { redirect: 'manual' });
  assert(viteProxyRes.status === 302, 'Vite /auth/ proxy routes to Django and returns 302 redirect');
  const locationHeader = viteProxyRes.headers.get('location') || '';
  assert(locationHeader.includes('accounts.google.com'), 'Proxy redirect target is accounts.google.com');
  assert(locationHeader.includes('596350507445-94sh0vknugo2j18ur2920su3uj388e5j'), 'Redirect URL includes exact Google Client ID');
  assert(locationHeader.includes('redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Fauth%2Fgoogle%2Fcallback'), 'Redirect URL matches Google Cloud authorized callback');

  // 20. OAuth Init with Frontend URL Parameter
  console.log('\n[Test 20] OAuth Init with frontend_url Parameter');
  const initFeRes = await request('/auth/google/login/?format=json&frontend_url=http://127.0.0.1:5173');
  assert(initFeRes.status === 200, 'OAuth init accepts frontend_url parameter');
  assert(initFeRes.data?.authorization_url?.includes('accounts.google.com'), 'Returned authorization_url is valid');

  console.log('\n========================================================');
  console.log(`   TEST RESULTS: ${passed}/${total} PASSED (${passed === total ? '100% ALL PASS' : 'FAILURES OCCURRED'})`);
  console.log('========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Test suite execution error:', err);
  process.exit(1);
});
