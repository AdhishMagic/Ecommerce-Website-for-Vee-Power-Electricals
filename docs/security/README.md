# Security Architecture & Hardening Guide

## Project: Vee Power Electricals Ecommerce Platform
**Baseline Commit**: `2c781c8f90c40ba706b168c1019063efedbcae31`  
**Phase**: Step 13 — Security Hardening

---

## 1. Executive Summary

This document formalizes the application-level security architecture, threat model, and defense-in-depth controls implemented across the Vee Power Electricals Django/DRF backend, React frontend, MySQL 8.0 relational database, Razorpay payment gateway integration, and operational runtime environments.

Security hardening has been implemented strictly preserving canonical business workflows, authoritative billing and FSM state machines, API contracts, and user experience.

---

## 2. Security Architecture Overview

The system adheres to the principle of **Server Authority**: no financial, inventory, tax, role, or state machine decision is ever delegated to or trusted from client payloads.

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|  - React 19 SPA (JSX auto-escaping, zero dangerouslySetInnerHTML/eval)            |
|  - Axios/Fetch Client (Bearer JWT in memory/sessionStorage, clean logout purge)   |
+-----------------------------------------------------------------------------------+
                                      │  HTTPS / Strict CORS
                                      ▼
+-----------------------------------------------------------------------------------+
|                              HTTP INGRESS & PERIMETER                             |
|  - RequestIdMiddleware: Unique request correlation tracking (req_<uuid16>)        |
|  - SecurityHeadersMiddleware: Content-Type nosniff, X-Frame DENY, COOP, Perm-Policy|
|  - Strict CORS: Allowlisted origins only (no wildcard with credentials)           |
|  - SameSite Lax & HttpOnly session/CSRF cookies                                   |
+-----------------------------------------------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------------+
|                        AUTHENTICATION & RATE LIMITING                             |
|  - SimpleJWT: HS256 HMAC tokens, rotation on refresh, blacklisting on logout      |
|  - ScopedRateThrottle: Abuse protection on login, register, password reset         |
|  - Timing-Safe Credential Verification: Zero email/account enumeration leakage    |
+-----------------------------------------------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------------+
|                          AUTHORIZATION & DATA ISOLATION                           |
|  - Role-Based Access Control: Customer vs Staff vs Admin vs Superadmin            |
|  - QuerySet Scoping: Base queryset filtering by request.user (Anti-IDOR/BOLA)     |
|  - Explicit Serializer Writable Fields: Zero mass-assignment vulnerability        |
+-----------------------------------------------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------------+
|                         CORE DOMAIN BUSINESS ENGINES                              |
|  - BillingService: Authoritative 14-step GST and delivery tariff calculation      |
|  - OrderWorkflowService: Canonical FSM transitions with row-level locks           |
|  - InventoryService: Atomic stock reservation (select_for_update)                 |
|  - CreditService: Strict B2B exposure calculation & credit limit enforcement     |
|  - PaymentGatewayService: HMAC-SHA256 signature verification & idempotent webhook|
+-----------------------------------------------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------------+
|                         PERSISTENCE & AUDIT LOGGING                               |
|  - MySQL 8.0 InnoDB: Foreign keys, Check constraints, Unique indexes              |
|  - Immutable Ledgers: StockTransaction, OrderStatusHistory, AdminConfigAuditLog   |
|  - Exception Sanitization: SQL/Traceback stripping, structured error contracts   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Authentication & Credential Security

1. **Password Hashing**: Passwords are cryptographically hashed using Django's PBKDF2 with SHA-256 (`pbkdf2_sha256`) and dynamic salting. Plaintext passwords are never persisted to storage, logs, or cache.
2. **Password Validation**: All passwords must satisfy Django's password validators:
   - `UserAttributeSimilarityValidator`
   - `MinimumLengthValidator` (min length 8)
   - `CommonPasswordValidator`
   - `NumericPasswordValidator`
3. **Timing-Safe Responses & Anti-Enumeration**:
   - `/api/v1/auth/login/`: Returns identical `"Invalid email or password."` whether the email is unregistered or the password is incorrect.
   - `/api/v1/auth/password-reset/`: Returns identical `"If an account with this email exists, password reset instructions have been sent."` regardless of email presence in the database.
4. **JWT Security Strategy**:
   - Access token lifetime: 30 minutes.
   - Refresh token lifetime: 7 days.
   - Refresh token rotation enabled: each refresh yields a new refresh token and invalidates the previous one.
   - Token blacklisting enabled: logged-out and rotated refresh tokens are immediately blacklisted in database cache.
   - Client logout unconditionally purges tokens from `sessionStorage` and `localStorage`.

---

## 4. Authorization, RBAC & IDOR/BOLA Defense

1. **Role-Based Access Control**:
   - `IsCustomer`: Strictly permits authenticated retail users with `role='customer'` (excluding staff/superadmin).
   - `IsAdminUser`: Requires `role='admin'`, `is_staff=True`, or `is_superuser=True`.
   - `IsSuperAdminUser`: Strictly restricted to superusers.
2. **Object-Level Authorization & Queryset Scoping**:
   - Customer orders: `Order.objects.filter(user=request.user)` ensures Customer A attempting to access `GET /api/v1/orders/{b_order_id}/` receives HTTP 404 (Not Found), eliminating horizontal BOLA.
   - Customer addresses: `CustomerAddress.objects.filter(user=request.user)` ensures Customer A attempting to mutate Customer B's address receives HTTP 404.
   - Order cancellation & returns: Endpoints explicitly verify ownership (`order.user_id == request.user.id`) or admin status, rejecting unauthorized cancellations with HTTP 403.
   - Payment order status: `PaymentOrderStatusView` verifies ownership before exposing transaction details.
3. **Vertical Privilege Escalation Defense**:
   - `/api/v1/auth/me/`: Rejects any payload containing `role`, `is_staff`, `is_superuser`, `is_active`, `id`, `email`, or `password` with HTTP 400 Bad Request.
   - `/api/v1/auth/register/`: Ignores role or staff overrides in payload and hardcodes `role=UserRole.CUSTOMER`, `is_staff=False`, `is_superuser=False`.
   - Administrative domains (Finance, Invoices, B2B Clients, Quotations, Inventory, Shipping Rules, Store Configuration, Audit Logs) reject all customer access with HTTP 403.

---

## 5. API Security & Mass Assignment Protection

1. **Explicit Serializer Fields**:
   - No serializer uses `fields = '__all__'` on write operations.
   - Critical audit and state fields are marked `read_only_fields`:
     - Orders: `subtotal`, `tax_amount`, `shipping_fee`, `total_amount`, `status`, `payment_status`.
     - Invoices: `paid_amount`, `outstanding_amount`, `invoice_number`, `created_at`.
     - B2B Clients: `credit_exposure`, `available_credit`, `outstanding_balance`, `total_invoiced`.
     - Addresses: `user` is automatically bound from `request.user` on creation.
2. **Pagination & Bounded Responses**:
   - Default pagination: `StandardResultsSetPagination` with `page_size = 20` and `max_page_size = 100`, preventing denial-of-service via huge record requests.

---

## 6. SQL Injection Protection

1. **ORM-Only Architecture**: The application uses Django ORM queries exclusively. Zero raw string interpolation exists. The only `cursor.execute` in the entire repository is a static `SELECT 1` for database health checks.
2. **Ordering Parameter Whitelist**:
   - Product catalog ordering strictly validates against a predefined whitelist dictionary (`valid_orderings`). Any unrecognized or injected string falls back safely to default ordering (`-created_at, -id`).
3. **Filtering and Search Parameterization**:
   - Keyword search operates via parameterized `icontains` with `Q` objects.
   - Numerical filters (min/max price, category, brand) validate decimal and integer formats, discarding non-numeric input.

---

## 7. Cross-Site Scripting (XSS) & Content Security

1. **Frontend JSX Escaping**: React JSX automatically escapes all interpolated expressions by default, rendering them as text nodes rather than executable markup.
2. **Zero Raw HTML Injection**: The frontend codebase contains zero instances of `dangerouslySetInnerHTML`, `innerHTML`, or `eval()`.
3. **User-Generated Content Sanitization**: Contact inquiries, product reviews, and customer address fields safely store literal HTML entities as plain text strings without interpretation.

---

## 8. Cross-Origin Resource Sharing (CORS) & CSRF

1. **Allowlisted Origins**:
   - `CORS_ALLOW_ALL_ORIGINS = False` across all environments.
   - `CORS_ALLOWED_ORIGINS` is strictly allowlisted to known frontend domains:
     - `http://localhost:5173`
     - `http://127.0.0.1:5173`
     - `http://localhost:80`
     - `http://localhost`
     - Configurable via `CORS_ALLOWED_ORIGINS` environment variable.
2. **Credentials Policy**: Wildcard origins are never combined with credentials.
3. **CSRF Protection**:
   - `CsrfViewMiddleware` active in Django middleware pipeline.
   - `CSRF_TRUSTED_ORIGINS` explicit.
   - `CSRF_COOKIE_SAMESITE = 'Lax'`.
   - `SESSION_COOKIE_SAMESITE = 'Lax'`, `SESSION_COOKIE_HTTPONLY = True`.

---

## 9. Rate Limiting & Abuse Protection

1. **DRF Throttling Architecture**:
   - `DEFAULT_THROTTLE_CLASSES`: `AnonRateThrottle`, `UserRateThrottle`.
   - `DEFAULT_THROTTLE_RATES`:
     - Anonymous: 120/minute (configurable via `THROTTLE_RATE_ANON`).
     - Authenticated User: 1000/minute (configurable via `THROTTLE_RATE_USER`).
     - Sensitive Authentication Endpoints: 100/minute (configurable via `THROTTLE_RATE_AUTH`).
2. **Scoped Authentication Throttling**:
   - `LoginView`, `RegisterView`, `PasswordResetView`, `PasswordResetConfirmView` enforce `ScopedRateThrottle` with `throttle_scope = 'auth'`.
   - Exceeding the rate limit immediately returns HTTP 429 (`TOO_MANY_REQUESTS`) with canonical machine-readable error payload.

---

## 10. Payment & Webhook Security (Razorpay)

1. **Cryptographic HMAC-SHA256 Verification**:
   - Client payment verification (`/api/v1/payments/verify/`): verifies `razorpay_order_id|razorpay_payment_id` against `RAZORPAY_KEY_SECRET`.
   - Webhook processing (`/api/v1/payments/webhook/`): validates raw HTTP request body against `X-Razorpay-Signature` using `RAZORPAY_WEBHOOK_SECRET`.
2. **Server-Authoritative Amounts**:
   - Amount is calculated server-side from `order.total_amount` in paise. Webhook payloads specifying an amount differing from the database total are rejected with HTTP 400.
3. **Anti-Replay & Idempotency**:
   - Duplicate webhook events for already-paid transactions return `{"status": "idempotent_ok"}` without re-executing state machine transitions or double-generating invoices.
4. **Anti-Cross-Crediting**:
   - Payment transaction IDs and gateway order IDs cannot be re-used across different orders.
5. **Deferred Direct Gateway Refund**:
   - Direct payment gateway API refund is deferred for this release. Returns and cancellations are audited and processed through compensating financial credit notes, as formalized in Step 7 and Step 10.

---

## 11. Security Headers

The `SecurityHeadersMiddleware` and Django settings enforce strict production HTTP headers on all responses:
- `X-Content-Type-Options: nosniff`: Prevents MIME type sniffing.
- `X-Frame-Options: DENY`: Prevents clickjacking in iframes.
- `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer disclosure across origins.
- `Cross-Origin-Opener-Policy: same-origin`: Isolates browser browsing context.
- `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(self), usb=()`: Restricts sensitive browser features.
- Under production HTTPS: `SECURE_SSL_REDIRECT = True`, `SECURE_HSTS_SECONDS = 31536000`, `SECURE_HSTS_INCLUDE_SUBDOMAINS = True`.

---

## 12. Error Disclosure & Sanitization

1. **Canonical Error Envelope**: Step 12 unified exception handler intercepts all DRF, Django, and database exceptions.
2. **Sanitization Rules**:
   - Database queries (`SELECT`, `INSERT`, `UPDATE`, `TABLE`) are stripped and replaced with generic safe messages.
   - Python tracebacks (`Traceback (most recent call last)`, file paths `.py`) are completely suppressed.
   - Internal credentials, secrets, and environment tokens are redacted.
   - Correlation `request_id` (`X-Request-ID` / `req_<uuid16>`) is attached to every error response for administrative diagnosis without revealing internal state.

---

## 13. Audit Logging Security

1. **Administrative Immutability**:
   - `AdminConfigAuditLogViewSet` is registered as a `ReadOnlyModelViewSet` restricted to `IsAdminUser`. Write operations (`POST`, `PUT`, `DELETE`) return HTTP 405 Method Not Allowed.
   - Non-admin users attempting to view audit logs receive HTTP 403 Forbidden.
2. **Sensitive Data Redaction**:
   - Audit logs capture `domain`, `action_type`, `user`, `record_id`, `change_reason`, `ip_address`, `old_value`, `new_value`.
   - Passwords, authorization tokens, API keys, and sensitive credit credentials are never captured in audit log payloads.

---

## 14. File Upload & SSRF Status

1. **File Upload Attack Surface**:
   - Currently absent. The catalog references product images via validated external URLs or CDN links. No direct arbitrary file/image upload endpoint exists in the public API (`/api/v1/upload/` returns 404).
2. **Server-Side Request Forgery (SSRF) Attack Surface**:
   - Currently absent. The application never performs server-side HTTP fetching of user-supplied URLs. The only outbound HTTP client in the backend connects exclusively to the hardcoded official Razorpay API endpoint (`https://api.razorpay.com/v1/orders`).

---

## 15. Dependency & Secret Audit Results

1. **Package Vulnerability Audit**:
   - Node dependencies: `npm audit` returned **0 vulnerabilities**.
   - Python dependencies: `pip check` returned **no broken requirements**. All core libraries (`Django 5.2.17`, `djangorestframework 3.18.1`, `djangorestframework-simplejwt 5.5.1`, `django-cors-headers 4.9.0`, `PyMySQL 1.2.3`, `Pillow 12.3.0`, `gunicorn 26.2.0`) are modern releases without known critical vulnerabilities.
2. **Repository Secret Scan**:
   - No private keys, database passwords, Razorpay secrets, or production JWT signing keys are committed in git history.
   - Only `.env.example` templates with generic placeholder documentation are tracked.
   - `.gitignore` strictly ignores `.env`, `.env.local`, `*.sqlite3`, `*.sql`, `*.log`, and test artifacts.

---

## 16. Operational Security Checklist

- [x] `DJANGO_DEBUG=False` strictly enforced in production (`config.settings.production`).
- [x] `DJANGO_SECRET_KEY` validated against default insecure strings in production (`STRICT_PROD_SECRET`).
- [x] Explicit `ALLOWED_HOSTS` required in production.
- [x] Explicit `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` allowlisted.
- [x] Security headers active on all API and static responses.
- [x] Scoped rate limiting active on authentication endpoints.
- [x] HMAC-SHA256 signature verification enforced on all payment callbacks.
- [x] Concurrency locking (`select_for_update`) active on inventory deduction and checkout.
- [x] Error disclosure sanitization active across all API exceptions.
- [x] Admin audit trails append-only and read-only via API.
- [x] Zero unauthenticated file upload or SSRF proxy routes exposed.
