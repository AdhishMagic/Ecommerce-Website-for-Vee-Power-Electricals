# Authentication, JWT & RBAC — Implementation Reference

Verified against the codebase at commit `d0a62a3` (settings:
`backend/config/settings/base.py`; implementation: `backend/apps/users/`;
permission classes: `backend/apps/users/permissions.py`). Security-architecture
overview: `docs/security/README.md`.

## 1. Endpoints (all under `/api/v1/auth/`)

| Method | Route | Auth | Behavior |
|---|---|---|---|
| POST | `/register/` | public | Customer self-registration; role forced to `customer`; validation errors are field-level |
| POST | `/login/` | public | Returns JWT access + refresh; last-login updated; throttled via the dedicated `auth` rate |
| POST | `/google/` | public | Google Sign-In: verifies a Google ID token server-side and returns the same JWT pair; links/creates the local account (see `docs/authentication/GOOGLE_SIGNIN.md`) |
| POST | `/token/refresh/` | public (refresh token) | Rotates refresh; old refresh blacklisted (`ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION`) |
| POST | `/logout/` | authenticated | Blacklists the supplied refresh token server-side |
| GET | `/me/` | authenticated | Current profile (role drives frontend route guards) |
| POST | `/password-reset/` | public | Emails a reset link; responds identically whether or not the email exists (no account enumeration) |
| POST | `/password-reset/confirm/` | public | Validates the signed token and sets the new password |

## 2. Token Configuration (actual settings)

| Setting | Value | Notes |
|---|---|---|
| Algorithm | HS256 | signing key = `JWT_SECRET_KEY` (env; falls back to `SECRET_KEY`) |
| Access token lifetime | **30 minutes** | frontend auto-refreshes on 401/refresh flow |
| Refresh token lifetime | **7 days** | rotation enabled; used refresh is blacklisted |
| Password reset timeout | **24 hours** (`PASSWORD_RESET_TIMEOUT = 86400`) | Django signed-token mechanism |

Refresh-token blacklist is persisted in the database (`token_blacklist` app) —
logout and rotation survive process restarts.

## 3. Roles & Permission Classes

Two roles exist: **`customer`** and **`admin`** (admin requires
`is_staff`; superuser checks use `is_superuser`). Implemented permission
classes (`apps/users/permissions.py`):

- `IsCustomer` — role == customer
- `IsAdminUser` — role == admin (and staff)
- `IsStaffOrReadOnly` — read for all, write for staff/admin
- `IsSuperAdminUser` — superuser only
- `IsOwnerOrAdmin` — object-level ownership or admin (IDOR workhorse)

Viewsets/views combine these with DRF defaults; writes to catalog, inventory,
finance, configuration and admin order operations are admin-only; customers
access only their own orders, addresses, returns and payment status.

## 4. Where Authentication Is Enforced (layer by layer)

1. **Frontend (UX only, not security):** `ProtectedRoute allowedRoles={[...]}`
   guards `/checkout`, `/account/*` and the entire `/admin` tree;
   `AuthContext` holds the JWT and role. Bypassing the client gains nothing —
   the API re-checks everything.
2. **API layer:** every protected view/viewset applies authentication +
   permission classes; DRF throttles apply globally (anon `120/min`, user
   `1000/min`, auth-sensitive `100/min` — all env-tunable via
   `THROTTLE_RATE_*`).
3. **Service layer:** ownership and business rules are re-validated before any
   mutation (e.g. only the owner can cancel an order or request a return; only
   admins transition orders).
4. **Database/business invariants:** FK scoping, unique constraints and CHECK
   constraints (e.g. `chk_pay_reference`) provide the final backstop.

## 5. IDOR / BOLA Protections

- Customer endpoints scope querysets to `request.user` (my-orders, my
  addresses, my payment status) — foreign IDs return 404, not 403 (no
  resource enumeration).
- `IsOwnerOrAdmin` on detail/update/delete paths.
- Admin-only data (clients, quotations, invoices, settlements, config, audit
  logs, expenses) is unreachable for customer tokens.
- Order return/cancel endpoints verify order ownership in the service layer.
- Validated by `test_step13_security.py` (45 tests) and the comprehensive
  audit's Data Isolation + Security sections.

## 6. Password Reset Flow

1. `POST /auth/password-reset/` with the account email → signed single-use
   token generated (24 h validity), email sent via the communication service;
   response is always success-shaped (no enumeration).
2. User opens the frontend reset link → `POST /auth/password-reset/confirm/`
   with token + new password → password validators apply, token invalidated on
   use.
3. Communication hooks (template, log, idempotency key) are exercised by
   `test_communication_service.py`.

## 7. Frontend Auth State Behavior

- `AuthContext` persists the session; axios client attaches the Bearer token
  and performs transparent refresh on expiry (rotation handled automatically).
- Logout calls the API (blacklist) and clears local state.
- Role-based redirects: customers land on the storefront; admins on
  `/admin`. Deep links to protected routes redirect unauthenticated users to
  login.

## 8. Development Notes & Limitations

- Dev fallbacks (`django-insecure-...` secret key, SQLite option) exist for
  local development only; **production settings require env-provided secrets**
  (`production.py` does not fall back to the insecure key).
- Rate limiting uses Django's cache (in-memory in the default dev setup);
  **multi-worker production deployments should configure Redis** as the cache
  backend or limits become per-process.
- No MFA yet; **Google Sign-In (OIDC)** is available as an optional federated identity path (`POST /api/v1/auth/google/`, `docs/authentication/GOOGLE_SIGNIN.md`) and converges on the same JWT + rotation + blacklist boundary described above. Email/password remains fully supported.
