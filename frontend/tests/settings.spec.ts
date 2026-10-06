import { test, expect, Page, APIRequestContext } from '@playwright/test';

/**
 * Admin Settings module end-to-end suite.
 *
 * Every expectation is compared against the authoritative backend response, so the
 * suite stays valid as the development database changes.
 *
 * Deliberate scope decisions (both to avoid destructive side effects on a shared
 * development database):
 *
 * - No password is actually rotated. The current admin credential is shared with
 *   every other suite, so the password tests exercise the real backend validation
 *   paths (wrong current password, mismatch, weak password) which reject the
 *   request before any write. Successful rotation, hashing and session revocation
 *   are covered by `backend/tests/test_admin_settings.py::PasswordChangeTests`.
 * - "Sign out other sessions" is not clicked. This account holds thousands of
 *   outstanding tokens and blacklisting them is irreversible; the behaviour is
 *   covered by `SessionRevocationTests` in the backend suite.
 */

const API_BASE = 'http://localhost:8000/api/v1';
const ADMIN_CREDENTIALS = { email: 'admin@veepower.in', password: 'AdminPass123!' };

interface AdminAuth {
  access: string;
  refresh: string;
  user: { id: number; email: string; first_name?: string; last_name?: string };
}

async function adminLogin(request: APIRequestContext): Promise<AdminAuth> {
  const res = await request.post(`${API_BASE}/auth/login/`, { data: ADMIN_CREDENTIALS });
  expect(res.ok(), 'admin login must succeed for settings tests').toBeTruthy();
  return (await res.json()) as AdminAuth;
}

async function apiGet(request: APIRequestContext, token: string, path: string) {
  const res = await request.get(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `GET ${path} must answer for the administrator`).toBeTruthy();
  return res.json();
}

async function establishAdminSession(page: Page, request: APIRequestContext): Promise<AdminAuth> {
  const auth = await adminLogin(request);
  await page.goto('/');
  await page.evaluate((data) => {
    localStorage.setItem('auth_access_token', data.access);
    localStorage.setItem('auth_token', data.access);
    localStorage.setItem('auth_refresh_token', data.refresh);
    sessionStorage.setItem('vp_token', data.access);
    sessionStorage.setItem('vp_refresh_token', data.refresh);
    const userObj = {
      id: data.user.id,
      name: `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || data.user.email,
      email: data.user.email,
      role: 'admin',
      is_admin: true,
    };
    localStorage.setItem('vp_user', JSON.stringify(userObj));
    sessionStorage.setItem('vp_user', JSON.stringify(userObj));
  }, auth);
  return auth;
}

/** Collects console errors so every test can assert a clean console. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('Admin Settings module', () => {
  let auth: AdminAuth;

  test.beforeEach(async ({ page, request }) => {
    auth = await establishAdminSession(page, request);
  });

  test('1. Replaces the placeholder and stays highlighted in the admin navigation', async ({ page }) => {
    await page.goto('/admin/settings');

    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 20000 });
    // The "Coming soon" placeholder must be gone entirely.
    await expect(page.getByText('Coming soon')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('⚙️');

    // AdminLayout resolves the page title from the same navigation table as the sidebar.
    await expect(page.locator('header').first().locator('h2')).toHaveText('Settings');

    // Settings remains the active sidebar entry.
    const sidebarLink = page.locator('aside').getByRole('link', { name: 'Settings' });
    await expect(sidebarLink).toHaveClass(/border-\[#F2A900\]/);

    // Every section is offered and the first one is selected.
    for (const section of ['general', 'profile', 'security', 'notifications', 'business', 'system']) {
      await expect(page.getByTestId(`settings-tab-${section}`)).toBeVisible();
    }
    await expect(page.getByTestId('settings-tab-general')).toHaveAttribute('aria-selected', 'true');
  });

  test('2. General renders authoritative company configuration from the backend', async ({ page, request }) => {
    const store = await apiGet(request, auth.access, '/config/store/');

    await page.goto('/admin/settings?tab=general');
    await expect(page.locator('#legal_company_name')).toBeVisible({ timeout: 20000 });

    await expect(page.locator('#legal_company_name')).toHaveValue(store.legal_company_name);
    await expect(page.locator('#brand_name')).toHaveValue(store.brand_name);
    await expect(page.locator('#support_email')).toHaveValue(store.support_email);
    await expect(page.locator('#support_phone')).toHaveValue(store.support_phone);
    await expect(page.locator('#currency_code')).toHaveValue(store.currency_code);
    await expect(page.locator('#currency_symbol')).toHaveValue(store.currency_symbol);

    // Locale/runtime values come from the live system diagnostics endpoint.
    const system = await apiGet(request, auth.access, '/settings/system/');
    await expect(page.getByText(system.time_zone)).toBeVisible();
    await expect(page.getByText(system.app_version)).toBeVisible();

    // An unmodified form offers no save action (dirty-state tracking is real).
    await expect(page.getByTestId('settings-general-save')).toBeDisabled();
  });

  test('3. General blocks an invalid support email and writes nothing', async ({ page, request }) => {
    const before = await apiGet(request, auth.access, '/config/store/');
    const patches: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes('/config/store/')) patches.push(req.url());
    });

    await page.goto('/admin/settings?tab=general');
    await expect(page.locator('#support_email')).toBeVisible({ timeout: 20000 });

    await page.locator('#support_email').fill('not-an-email');
    await expect(page.getByTestId('settings-general-save')).toBeEnabled();
    await page.getByTestId('settings-general-save').click();

    await expect(page.locator('#support_email-error')).toContainText(
      'Enter a valid email address.'
    );
    await expect(page.locator('#support_email')).toHaveAttribute('aria-invalid', 'true');
    expect(patches, 'client-side validation must prevent the request').toHaveLength(0);

    const after = await apiGet(request, auth.access, '/config/store/');
    expect(after.support_email).toBe(before.support_email);
  });

  test('4. Business rejects an invalid GSTIN with the real backend rules and writes nothing', async ({ page, request }) => {
    const before = await apiGet(request, auth.access, '/config/store/');

    await page.goto('/admin/settings?tab=business');
    await expect(page.locator('#gstin')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#gstin')).toHaveValue(before.gstin);
    await expect(page.locator('#pan')).toHaveValue(before.pan);
    await expect(page.locator('#registered_address')).toHaveValue(before.registered_address);

    await page.locator('#gstin').fill('12345');
    await page.getByTestId('settings-business-save').click();

    await expect(page.locator('#gstin-error')).toContainText('GSTIN must be 15 characters');

    const after = await apiGet(request, auth.access, '/config/store/');
    expect(after.gstin).toBe(before.gstin);
  });

  test('5. Business saves a real change to the database and restores it', async ({ page, request }) => {
    const before = await apiGet(request, auth.access, '/config/store/');
    const temporaryValue = Number(before.return_window_days) + 1;

    try {
      await page.goto('/admin/settings?tab=business');
      await expect(page.locator('#return_window_days')).toBeVisible({ timeout: 20000 });

      await page.locator('#return_window_days').fill(String(temporaryValue));
      await page.getByTestId('settings-business-save').click();

      await expect(page.getByTestId('settings-toast')).toContainText('saved to the database');

      // Authoritative proof: the database now holds the new value.
      const persisted = await apiGet(request, auth.access, '/config/store/');
      expect(Number(persisted.return_window_days)).toBe(temporaryValue);

      // ...and it survives a full page reload.
      await page.reload();
      await expect(page.locator('#return_window_days')).toHaveValue(String(temporaryValue));
      await expect(page.getByTestId('settings-business-save')).toBeDisabled();
    } finally {
      const restore = await request.patch(`${API_BASE}/config/store/`, {
        headers: { Authorization: `Bearer ${auth.access}` },
        data: { return_window_days: Number(before.return_window_days) },
      });
      expect(restore.ok(), 'test fixture value must be restored').toBeTruthy();
    }

    const restored = await apiGet(request, auth.access, '/config/store/');
    expect(Number(restored.return_window_days)).toBe(Number(before.return_window_days));
  });

  test('6. Notification policy persists to MySQL and is restored afterwards', async ({ page, request }) => {
    const before = await apiGet(request, auth.access, '/settings/notifications/');

    try {
      await page.goto('/admin/settings?tab=notifications');
      const toggle = page.locator('#order_notifications');
      await expect(toggle).toBeVisible({ timeout: 20000 });
      await expect(toggle).toHaveAttribute('aria-checked', String(before.order_notifications));

      // Toggling only changes the draft — nothing is written until Save.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', String(!before.order_notifications));

      const untouched = await apiGet(request, auth.access, '/settings/notifications/');
      expect(untouched.order_notifications).toBe(before.order_notifications);

      await page.getByTestId('settings-notifications-save').click();
      await expect(page.getByTestId('settings-toast')).toContainText('enforced immediately');

      // Authoritative proof that a real PATCH persisted the value.
      const persisted = await apiGet(request, auth.access, '/settings/notifications/');
      expect(persisted.order_notifications).toBe(!before.order_notifications);
      expect(persisted.updated_by_email).toBe(ADMIN_CREDENTIALS.email);

      // Survives a reload: this is backend state, not React state.
      await page.reload();
      await expect(page.locator('#order_notifications')).toHaveAttribute(
        'aria-checked',
        String(!before.order_notifications)
      );
      await expect(page.getByTestId('settings-notifications-save')).toBeDisabled();
    } finally {
      const restore = await request.patch(`${API_BASE}/settings/notifications/`, {
        headers: { Authorization: `Bearer ${auth.access}` },
        data: { order_notifications: before.order_notifications, change_reason: 'E2E fixture restore' },
      });
      expect(restore.ok(), 'notification fixture value must be restored').toBeTruthy();
    }

    const restored = await apiGet(request, auth.access, '/settings/notifications/');
    expect(restored.order_notifications).toBe(before.order_notifications);
  });

  test('7. Notification loading state shows a skeleton and no invented values', async ({ page }) => {
    await page.route('**/api/v1/settings/notifications/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    await page.goto('/admin/settings?tab=notifications');
    await expect(page.getByTestId('settings-skeleton')).toBeVisible();
    await expect(page.locator('#order_notifications')).toHaveCount(0);

    await expect(page.locator('#order_notifications')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('settings-skeleton')).toHaveCount(0);
  });

  test('8. Backend failure surfaces a retryable error instead of fake values', async ({ page }) => {
    await page.route('**/api/v1/settings/system/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Synthetic settings failure' }),
      })
    );

    await page.goto('/admin/settings?tab=system');
    await expect(page.getByTestId('settings-error')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('settings-error')).toContainText('Retry');
    await expect(page.locator('main')).not.toContainText('Operational');
  });

  test('9. A backend permission denial is reported honestly', async ({ page }) => {
    await page.route('**/api/v1/settings/security/**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Administrative privileges required.',
            details: {},
            request_id: 'req_e2e_forbidden',
          },
        }),
      })
    );

    await page.goto('/admin/settings?tab=security');
    await expect(page.getByTestId('settings-error')).toContainText(
      'Administrative privileges required.'
    );
  });

  test('10. Security reports real session data from the token registry', async ({ page, request }) => {
    const overview = await apiGet(request, auth.access, '/settings/security/');

    await page.goto('/admin/settings?tab=security');
    await expect(page.getByText(overview.email).first()).toBeVisible({ timeout: 20000 });

    await expect(page.locator('main')).toContainText(overview.role_display);
    await expect(page.locator('main')).toContainText(overview.account_status);
    await expect(page.locator('main')).toContainText(
      `${overview.active_sessions_count.toLocaleString('en-IN')} active session(s)`
    );

    // Recent sessions are real registry rows, capped by the backend.
    const expectedRows = overview.recent_sessions.length;
    if (expectedRows > 0) {
      await expect(page.getByTestId('settings-session-row')).toHaveCount(expectedRows);
    }

    // MFA is not implemented, so the page states that plainly and offers no toggle.
    await expect(page.locator('main')).toContainText('Not configured for this deployment');
    await expect(page.getByRole('switch', { name: /two-factor/i })).toHaveCount(0);
  });

  test('11. Password change applies real backend validation without rotating credentials', async ({ page }) => {
    await page.goto('/admin/settings?tab=security');
    await expect(page.locator('#current_password')).toBeVisible({ timeout: 20000 });

    // Client-side: mismatched confirmation is blocked before the request leaves.
    await page.locator('#current_password').fill(ADMIN_CREDENTIALS.password);
    await page.locator('#new_password').fill('Rotated#Admin2027!');
    await page.locator('#confirm_password').fill('Different#Admin2027!');
    await page.getByTestId('settings-password-save').click();
    await expect(page.locator('#confirm_password-error')).toContainText(
      'New password and confirmation do not match.'
    );

    // Client-side: a short password is rejected.
    await page.locator('#new_password').fill('short1!');
    await page.locator('#confirm_password').fill('short1!');
    await page.getByTestId('settings-password-save').click();
    await expect(page.locator('#new_password-error')).toContainText('Must be at least 8 characters.');

    // Server-side: the wrong current password is rejected by Django's check_password.
    await page.locator('#current_password').fill('DefinitelyWrong#123');
    await page.locator('#new_password').fill('Rotated#Admin2027!');
    await page.locator('#confirm_password').fill('Rotated#Admin2027!');
    await page.getByTestId('settings-password-save').click();
    await expect(page.locator('#current_password-error')).toContainText(
      'Current password is incorrect.'
    );

    // The credential is unchanged: the original password still authenticates.
    const login = await page.request.post(`${API_BASE}/auth/login/`, { data: ADMIN_CREDENTIALS });
    expect(login.ok()).toBeTruthy();
  });

  test('12. System diagnostics are live, complete and secret-free', async ({ page, request }) => {
    const system = await apiGet(request, auth.access, '/settings/system/');

    await page.goto('/admin/settings?tab=system');
    await expect(page.getByText(system.django_version)).toBeVisible({ timeout: 20000 });

    await expect(page.locator('main')).toContainText(system.python_version);
    await expect(page.locator('main')).toContainText(system.drf_version);
    await expect(page.locator('main')).toContainText(
      system.database_status === 'connected' ? 'Connected' : 'Disconnected'
    );
    await expect(page.locator('main')).toContainText(`${system.database_engine} ·`);
    await expect(page.locator('main')).toContainText(
      `${system.last_migration.app}.${system.last_migration.name}`
    );

    // The endpoint's schema is a fixed allow-list, so no secret field even exists
    // for the UI to render.
    expect(Object.keys(system).sort()).toEqual(
      [
        'api_status',
        'api_version',
        'app_version',
        'database_engine',
        'database_latency_ms',
        'database_status',
        'debug',
        'django_version',
        'drf_version',
        'environment',
        'last_migration',
        'python_version',
        'server_time',
        'time_zone',
      ].sort()
    );

    // The section is strictly read-only: there is no field a credential could sit in.
    await expect(page.locator('#settings-panel-system input')).toHaveCount(0);
    await expect(page.locator('#settings-panel-system textarea')).toHaveCount(0);

    // No secret-bearing element identifier is rendered, and no opaque key/token
    // literal (a Django secret key or JWT signing key is 40+ characters) appears.
    const renderedIdList = await page.locator('#settings-panel-system [id]').evaluateAll((nodes) =>
      nodes.map((node) => node.id)
    );
    expect(renderedIdList.join(' ')).not.toMatch(/secret|password|token|api_key|credential/i);

    const panelText = await page.locator('#settings-panel-system').innerText();
    expect(panelText).not.toMatch(/[A-Za-z0-9+/=]{40,}/);
  });

  test('13. Every tab renders without overflow or console errors', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/admin/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 20000 });

    for (const section of ['general', 'profile', 'security', 'notifications', 'business', 'system']) {
      await page.getByTestId(`settings-tab-${section}`).click();
      await expect(page.getByTestId(`settings-tab-${section}`)).toHaveAttribute(
        'aria-selected',
        'true'
      );
      // Tab state is deep-linkable.
      await expect(page).toHaveURL(new RegExp(`tab=${section}`));

      // Wait for the section to settle, then assert no horizontal overflow.
      await expect(page.getByTestId('settings-skeleton')).toHaveCount(0, { timeout: 20000 });
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, `section "${section}" must not overflow horizontally`).toBeLessThanOrEqual(1);
    }

    expect(consoleErrors, 'settings page must not log console errors').toEqual([]);
  });

  test('14. Tabs are keyboard accessible and expose proper ARIA roles', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible({
      timeout: 20000,
    });

    await expect(page.getByRole('tab')).toHaveCount(6);
    await expect(page.getByRole('tabpanel')).toBeVisible();

    await page.getByTestId('settings-tab-general').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('settings-tab-profile')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#settings-panel-profile')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('settings-tab-general')).toHaveAttribute('aria-selected', 'true');
  });

  test('15. Profile shows the authenticated administrator and refuses privilege escalation', async ({ page, request }) => {
    const profile = await apiGet(request, auth.access, '/auth/me/');

    await page.goto('/admin/settings?tab=profile');
    await expect(page.locator('#profile_first_name')).toHaveValue(profile.first_name, {
      timeout: 20000,
    });
    await expect(page.locator('#profile_last_name')).toHaveValue(profile.last_name);
    await expect(page.locator('#profile_phone')).toHaveValue(profile.phone ?? '');

    // Identity attributes are displayed from the backend, and role is not editable.
    await expect(page.locator('main')).toContainText(profile.email);
    await expect(page.locator('main')).toContainText(
      profile.role === 'admin' ? 'Administrator' : 'Customer'
    );
    await expect(page.locator('main')).toContainText(profile.is_active ? 'Active' : 'Disabled');
    await expect(page.locator('#profile_role')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /role/i })).toHaveCount(0);

    // The backend rejects attempts to modify restricted security fields.
    const escalation = await request.patch(`${API_BASE}/auth/me/`, {
      headers: { Authorization: `Bearer ${auth.access}` },
      data: { role: 'customer', is_superuser: false },
    });
    expect(escalation.status(), 'privilege escalation must be rejected').toBe(400);

    const unchanged = await apiGet(request, auth.access, '/auth/me/');
    expect(unchanged.role).toBe('admin');
    expect(unchanged.is_superuser).toBe(true);
  });

  test('16. Profile edits persist to the database and are restored afterwards', async ({ page, request }) => {
    const before = await apiGet(request, auth.access, '/auth/me/');
    const temporaryPhone = '+919876500777';

    try {
      await page.goto('/admin/settings?tab=profile');
      await expect(page.locator('#profile_phone')).toBeVisible({ timeout: 20000 });

      await page.locator('#profile_phone').fill(temporaryPhone);
      await expect(page.getByTestId('settings-profile-save')).toBeEnabled();
      await page.getByTestId('settings-profile-save').click();

      await expect(page.getByTestId('settings-toast')).toContainText('Profile updated');

      const persisted = await apiGet(request, auth.access, '/auth/me/');
      expect(persisted.phone).toBe(temporaryPhone);

      await page.reload();
      await expect(page.locator('#profile_phone')).toHaveValue(temporaryPhone);
    } finally {
      const restore = await request.patch(`${API_BASE}/auth/me/`, {
        headers: { Authorization: `Bearer ${auth.access}` },
        data: { phone: before.phone ?? '' },
      });
      expect(restore.ok(), 'profile fixture value must be restored').toBeTruthy();
    }

    const restored = await apiGet(request, auth.access, '/auth/me/');
    expect(restored.phone ?? '').toBe(before.phone ?? '');
  });

  test('17. Unauthenticated visitors never receive settings data', async ({ page, request }) => {
    // Server-side enforcement, independent of any frontend guard.
    const unauthorised = await request.get(`${API_BASE}/settings/system/`);
    expect(unauthorised.status()).toBe(401);

    // With no session, the admin route guard keeps the page away entirely.
    await page.context().clearCookies();
    await page.goto('/admin/settings');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/admin/settings');
    await expect(page.getByTestId('settings-page')).toHaveCount(0);
    await expect(page.getByText('Coming soon')).toHaveCount(0);
  });
});
