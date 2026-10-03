# Production Deployment Checklist — v1.0.0 Frozen Release

Controlled deployment plan for the frozen Vee Power Electricals application
(tag `v1.0.0-frozen`, freeze commit `ed40091`, audited application commit
`f340514`).

**Deployment boundary (§1):** the deployment target is the frozen application
code — it must not be modified. Deployment configuration (environment files,
reverse proxy, external services) is separate and may be created for the
production environment, but no production secret ever enters Git; secrets are
supplied only through the production environment or an approved secret manager.

**Status summary (2026-10-03):** every item below is classified honestly as
`PASS` / `PARTIAL` / `BLOCKED` / `DEFERRED` / `NOT VERIFIED`. No production
server, domain, database, Redis, SMTP, or live payment credentials have been
provisioned, so the deployment is currently **BLOCKED** at the infrastructure
boundary — preparation artifacts are complete; environment-dependent
verification has not started. Nothing is claimed complete without evidence.

Preparation evidence produced this phase: this checklist, the environment
matrix (§4, variable names verified against `backend/config/settings/base.py`,
`backend/config/settings/production.py`, `.env.example`, and
`docker-compose.prod.yml`), and the release record
[PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md).

## 1–4. Infrastructure (server, DNS, TLS, reverse proxy)

| # | Item | Status | Notes / verification required |
|---|---|---|---|
| 1 | Production server access | **BLOCKED** | No host provisioned. Required: SSH/console access, OS user, Docker Engine on the target host. |
| 2 | DNS/domain configuration | **BLOCKED** | No domain pointed at a host. Required: A/AAAA (or CNAME) records for the app origin and API origin; verify resolution + reachability. |
| 3 | HTTPS certificate | **BLOCKED** | No certificate issued. Required: TLS cert (e.g. Let's Encrypt or org PKI) for both origins; verify valid chain + auto-renewal. |
| 4 | Reverse proxy | **BLOCKED** | No TLS terminator exists in the topology: `docker-compose.prod.yml` exposes the SPA on :80 (nginx serving static only, no proxy rules) and gunicorn on :8000 directly. Required: external reverse proxy/CDN terminating TLS, routing `/`→frontend and the API origin→backend :8000, and serving `/static/` + `/media/` from the backend volumes (see Static/media, #13). |

## 5–6. Application deployment (frozen code only)

| # | Item | Status | Notes / verification required |
|---|---|---|---|
| 5 | Frontend deployment | **NOT VERIFIED** | Definition exists and is frozen: `frontend/Dockerfile` production stage builds `dist` and serves via nginx on :80 with SPA fallback; build arg `VITE_API_URL` must be the production API URL. Verify: build from the frozen tag succeeds; assets resolve; no localhost URLs in the bundle; `GET /` and `GET /login` return the SPA. |
| 6 | Django backend deployment | **NOT VERIFIED** | Definition exists: `docker-compose.prod.yml` runs `gunicorn --bind 0.0.0.0:8000 --workers 3 --timeout 60 config.wsgi:application` with `DJANGO_SETTINGS_MODULE=config.settings.production`, `DJANGO_DEBUG=False`, `SEED_DEMO_DATA=False`, `USE_SQLITE=False`. Verify: container starts, health check passes, `manage.py check` 0 issues in production mode. |

## 7–8. Database & configuration

| # | Item | Status | Notes / verification required |
|---|---|---|---|
| 7 | MySQL production database | **BLOCKED** | No production DB provisioned (only the development container exists). Required: production MySQL 8 instance/instance-credentials, network isolation, dedicated non-root app user. |
| 8 | Environment variables | **PARTIAL** | Complete deployment-safe matrix below (§4); names verified from actual code. No production values provisioned anywhere yet. |

## 9–12. External services

| # | Item | Status | Notes / verification required |
|---|---|---|---|
| 9 | Redis | **BLOCKED — post-freeze change required** | The codebase contains **no cache configuration at all**: zero matches for `CACHES`/`redis` in `backend/config/settings/` or requirements. Throttling uses Django's default LocMem cache, so with the prod compose's 3 gunicorn workers, auth-throttle counters are per-worker (documented limitation, `docs/limitations.md` §5). Wiring Redis requires a dependency + settings change — under freeze rules this is a **formal post-freeze change request** (freeze rule 1/7), not deployment configuration. Do not fake Redis presence. |
| 10 | SMTP | **BLOCKED** | No production SMTP credentials. Required: `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` + `EMAIL_HOST/PORT/USE_TLS/HOST_USER/HOST_PASSWORD/DEFAULT_FROM_EMAIL`. Verify: controlled test email (password reset) and failure handling; delivery is not claimed from configuration alone. |
| 11 | Razorpay | **BLOCKED** | No live credentials. Required: `RAZORPAY_KEY_ID` (`rzp_live_*`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` + publicly reachable webhook endpoint. Verify: signature validation, amount authority, idempotency, order/payment consistency, currency (INR). Standing limitation (unchanged): automated outbound refunds are deferred/manual. |
| 12 | CORS/CSRF | **PARTIAL** | Environment-driven surfaces verified in code (`CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`; production defaults disallow wildcards). Production origins not provisioned. Verify against the real domain once provisioned. |

## 13. Static / media files

**Status: PARTIAL (gap identified).** `production.py` sets `STATIC_ROOT`/`MEDIA_ROOT`, but with `DEBUG=False` Django does not serve `/static/` or `/media/` (the `static()` helper in `config/urls.py` is DEBUG-gated), and the frontend nginx serves only the SPA with no proxy rules. **A serving strategy must be defined as deployment configuration** — e.g. the external reverse proxy serving `staticfiles/` and `media/` from the backend volumes (or object storage/CDN) — before product images and admin assets work in production. No application change is required for the proxy-volume approach; any code-based alternative would be a post-freeze change.

## 14–16. Database operations (execute in order when environment exists)

1. **Migration verification (§6):** `python manage.py showmigrations`, `python manage.py makemigrations --check`, `python manage.py migrate --plan` against the production environment. Expected: no drift, no pending migrations generated, plan contains only expected unapplied migrations. `finance/0002_add_payment_reference_check` must exist; if already applied in production, record it; if unapplied, review (do not modify) before applying.
2. **Snapshot (§5):** confirm DB identity/engine/version (MySQL 8.x), create a verified backup, record timestamp + location/reference, test restorability where operationally possible. Never run destructive/reset/flush/seed commands against production.
3. **Migrate (§7):** `python manage.py migrate`; capture output, final `showmigrations` state, errors/warnings. No failure may be ignored.
4. **Live integrity audit (§8):** run `docker exec -i <backend> python manage.py shell < backend/tests/audit_step18_database_integrity.py` (44 read-only checks) — **production-safe by design**. Expected: `AUDIT RESULT: PASS`. The 34-test integrity suite is **not** run against production: it provisions a scratch test database and is not part of a production-safe strategy — this limitation is documented per §8; the 44-check audit is the production gate.

**Current status: NOT VERIFIED** (no production database exists; commands captured and ready).

## 14. Health checks

`NOT VERIFIED` — required once deployed: backend starts, connects to MySQL (and Redis only if the post-freeze change lands), serves API requests; `/health`-style endpoint + compose healthchecks green; auth endpoint responds; protected endpoint requires authentication; RBAC enforced; error envelope returned without stack traces; request IDs present.

## 17–27. Production smoke test plan (controlled, production-safe data)

| # | Flow | Verification |
|---|---|---|
| 17 | Authentication | login → authenticated request → refresh/logout; inactive users rejected |
| 18 | RBAC | customer vs admin isolation; 401/403 on cross-role access |
| 19 | Catalog | browse → category → product → detail (real data, no mock) |
| 20 | Inventory | stock visible; deduction on order; restoration on cancel/return (test data only) |
| 21 | Orders | create order (test account) → PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED; never mutate real customer orders |
| 22 | Payments | create → verify → order/payment consistency; **no real financial transaction unless explicitly authorized**; live-mode verification per org procedure |
| 23 | Invoices | invoice totals, payment status, outstanding amount |
| 24 | B2B credit | approved test client: GSTIN, credit limit, exposure, available credit, quotation→invoice |
| 25 | Finance | expenses/settlements/summary read paths |
| 26 | Communication | password-reset email, communication logs written |
| 27 | Error handling | invalid input → structured error envelope; no stack traces |

**Status: NOT VERIFIED** (no environment). Test accounts/data must be approved production-safe fixtures — never development seeds (`SEED_DEMO_DATA=False`).

## 28–33. Operations

| # | Item | Status | Notes |
|---|---|---|---|
| 28 | Logging | **PARTIAL** | Production structured logging defined in `production.py` (console, `DJANGO_LOG_LEVEL`). Verify in production that errors, auth failures, payment/webhook failures, DB errors and 5xx are captured and that passwords/tokens/API keys/SMTP/DB credentials are never logged. |
| 29 | Monitoring | **NOT VERIFIED** | No monitoring/alerting configured. Required: uptime, error-rate, DB/disk metrics, webhook failure alerts. |
| 30 | Backup/restore | **NOT VERIFIED** | Procedure defined (§14–16 above); no production DB exists yet to back up. Record location, timestamp, restorability. |
| 31 | Rollback | **NOT VERIFIED** | Procedure documented below; no previous production release exists (this would be the first). |
| 32 | Security verification | **NOT VERIFIED** | §16 gate below. |
| 33 | Production smoke testing | **NOT VERIFIED** | §17–27 plan above. |

## §4 — Production environment variable matrix

Names verified against actual code (`base.py` L16–20, 82–87, 137–139, 153,
178–187, 191–209, 231–233; `production.py`; `docker-compose.prod.yml`;
`frontend/Dockerfile`). **No production values exist yet; no secret values are
written anywhere in documentation.**

| Variable | Required | Production Value Present | Secret | Verified |
|---|---|---|---|---|
| DJANGO_SETTINGS_MODULE | Yes (prod compose sets `config.settings.production`) | No | No | No |
| DJANGO_SECRET_KEY | Yes (enforced by `STRICT_PROD_SECRET`) | No | **Yes** | No |
| JWT_SECRET_KEY | Yes (should differ from Django key) | No | **Yes** | No |
| STRICT_PROD_SECRET | Recommended `True` | No | No | No |
| DJANGO_DEBUG | Must be `False` | compose.prod sets `False` | No | No (env not live) |
| ALLOWED_HOSTS | Yes (production domains) | No | No | No |
| CORS_ALLOWED_ORIGINS | Yes (production origins) | No | No | No |
| CSRF_TRUSTED_ORIGINS | Yes (production origins) | No | No | No |
| SECURE_SSL_REDIRECT | Yes once HTTPS active | No | No | No |
| SESSION_COOKIE_SECURE | Yes once HTTPS active | No | No | No |
| CSRF_COOKIE_SECURE | Yes once HTTPS active | No | No | No |
| SECURE_HSTS_SECONDS / _INCLUDE_SUBDOMAINS / _PRELOAD | Yes once HTTPS active | No | No | No |
| DATABASE_ENGINE | Yes (`django.db.backends.mysql`) | No | No | No |
| DATABASE_HOST / DATABASE_PORT | Yes | No | No | No |
| DATABASE_NAME | Yes | No | No | No |
| DATABASE_USER | Yes | No | **Yes** | No |
| DATABASE_PASSWORD | Yes | No | **Yes** | No |
| MYSQL_ROOT_PASSWORD | Container provisioning only | No | **Yes** | No |
| USE_SQLITE | Must be `False` | compose.prod sets `False` | No | No (env not live) |
| SEED_DEMO_DATA | Must be `False` in production | compose.prod sets `False` | No | No (env not live) |
| THROTTLE_RATE_ANON / _USER / _AUTH | Optional tuning | No | No | No |
| EMAIL_BACKEND | Yes (`smtp` backend for real delivery) | No | No | No |
| EMAIL_HOST / EMAIL_PORT / EMAIL_USE_TLS (or EMAIL_USE_SSL) / EMAIL_TIMEOUT | Yes | No | No | No |
| EMAIL_HOST_USER | Yes | No | No | No |
| EMAIL_HOST_PASSWORD | Yes | No | **Yes** | No |
| DEFAULT_FROM_EMAIL | Yes | No | No | No |
| FRONTEND_URL | Yes (password-reset links) | No | No | No |
| RAZORPAY_KEY_ID | Yes for live payments (`rzp_live_*`) | No | Config-sensitive | No |
| RAZORPAY_KEY_SECRET | Yes | No | **Yes** | No |
| RAZORPAY_WEBHOOK_SECRET | Yes | No | **Yes** | No |
| DJANGO_LOG_LEVEL | Optional | No | No | No |
| STATIC_URL / MEDIA_URL | Defaults exist | No | No | No |
| VITE_API_URL | Yes (build arg; production API URL; embedded in bundle — never a secret) | No | No | No |
| PROD_FRONTEND_PORT | Optional (compose default 80) | No | No | No |
| ENVIRONMENT | Recommended `production` | No | No | No |

Not applicable: any Redis variable — no cache backend exists in the frozen code (see #9).

## §16 — Security verification gate (run at deployment)

DEBUG=false · HTTPS active · secure cookies · CSRF configured · CORS restricted ·
hosts restricted · security headers active (RequestID + SecurityHeaders
middleware are in the frozen MIDDLEWARE) · auth throttling active (LocMem
caveat: per-worker until the Redis post-freeze change) · no secrets in repo ·
no secrets in frontend bundle (only `VITE_API_URL`) · no development
credentials · no exposed debug endpoints. Never print secret values while
verifying.

## §17 — Backup & rollback (procedure; to execute with a real environment)

- Application rollback: redeploy the previous release identifier (first release: re-deploy `v1.0.0-frozen`); application rollback never reverses database changes.
- Database rollback: restore the verified pre-migration snapshot taken in §14–16; migrations are forward-only in the app's strategy.
- Record: backup location + timestamp, release identifier, frozen tag, previous release, responsible operator — captured in [PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md) when deployment executes.

## §20 — Decision gate

Deployment may be declared COMPLETE only when: frozen release deployed · environment verified · backup exists · migrations successful · 44-check live audit `PASS` · HTTPS works · frontend works · backend works · auth/RBAC work · core smoke tests pass · no Critical/High defects · secrets protected · rollback procedure exists. **Currently failing at the first gate (no production environment); do not work around by modifying the frozen application.**
