# Environment Configuration & Secret Management

## Vee Power Electricals E-Commerce Platform

---

### 1. Environment Separation Strategy

The system strictly isolates runtime parameters across three distinct environments:

1. **DEVELOPMENT (`local`):**
   - Active debugging enabled (`DEBUG=True`).
   - Permissive origins (`localhost:5173`, `localhost:8000`).
   - SQLite or local Docker MySQL without SSL.
   - Development fixtures and seed scripts active.
2. **TEST / CI (`test`):**
   - Isolated ephemeral MySQL service container in GitHub Actions.
   - Fast password hashing and test runners.
   - Strict settings verification (`makemigrations --check`, `check --deploy`).
3. **PRODUCTION (`production`):**
   - Strictly `DEBUG=False`.
   - Explicit `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS`.
   - Strong secrets injected exclusively via environment variables or secret manager.
   - Strict SSL proxy headers and secure cookie flags.
   - Auto-seeding disabled.

---

### 2. Configuration Matrix

| Variable Name | Development Default | CI / Test | Production Requirement | Sensitive? |
|---|---|---|---|---|
Variable names below are the **actual names read by the settings code**
(`backend/config/settings/base.py`, verified at commit `d0a62a3`). Full
reference: [Deployment README — Environment Variables](README.md#5-environment-variables-complete-reference).

| Variable Name | Development Default | CI / Test | Production Requirement | Sensitive? |
|---|---|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.development` | `config.settings.production` | `config.settings.production` | No |
| `DJANGO_DEBUG` | `True` | `False` | `False` (CRITICAL) | No |
| `DJANGO_SECRET_KEY` | dev-only insecure fallback in `base.py` | Ephemeral CI test key | Cryptographically random (>= 50 chars) | **YES** |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` (fallback `*`) | `localhost,127.0.0.1` | Specific domain(s) e.g., `veepower.com,api.veepower.com` | No |
| `USE_SQLITE` | `True` (dev convenience) | `False` | `False` — must use MySQL | No |
| `DATABASE_ENGINE` | `django.db.backends.mysql` | `django.db.backends.mysql` | `django.db.backends.mysql` | No |
| `DATABASE_NAME` | `veepower_db` | `veepower_test_db` | `veepower_production_db` | No |
| `DATABASE_USER` | dev fallback `root` | CI user | Dedicated restricted user | **YES** |
| `DATABASE_PASSWORD` | dev fallback `root` | CI password | High-entropy random password | **YES** |
| `DATABASE_HOST` | `127.0.0.1` / `mysql` | service hostname | Private DB hostname / RDS Endpoint | No |
| `DATABASE_PORT` | `3306` | `3306` | `3306` | No |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | None | `https://veepower.com,https://www.veepower.com` | No |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:5173` | None | `https://veepower.com,https://api.veepower.com` | No |
| `JWT_SECRET_KEY` | Falls back to `DJANGO_SECRET_KEY` | CI test key | Independent high-entropy secret | **YES** |
| `THROTTLE_RATE_ANON` / `_USER` / `_AUTH` | `120/minute` / `1000/minute` / `100/minute` | same | tuned per load | No |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET` | mock test-mode fallbacks (dev-only) | mock keys | Live Razorpay keys from vault | **YES** |
| `EMAIL_BACKEND` + `EMAIL_HOST`/`_PORT`/`_HOST_USER`/`_HOST_PASSWORD`/`_USE_TLS`/`_USE_SSL`/`_TIMEOUT`/`DEFAULT_FROM_EMAIL` | console backend (dev-only) | console | Production SMTP credentials | **YES** (user/password) |
| `FRONTEND_URL` | `http://localhost:5173` | — | `https://veepower.com` (used in reset emails) | No |
| `VITE_API_URL` (frontend) | `http://localhost:8000/api/v1` | `http://localhost:8000/api/v1` | `https://api.veepower.com/api/v1` | Public |

---

### 3. Secret Management Rules

1. **No Hardcoded Secrets:**
   - No production passwords, secret keys, or API tokens may exist in Git history, Docker images, test files, or client-side code.
2. **Client-Side Isolation:**
   - Any variable prefixed with `VITE_` is compiled into the client-side JavaScript bundle and is publicly readable by anyone inspecting browser network traffic or source code.
   - Only public configuration (such as `VITE_API_URL`) may use the `VITE_` prefix.
   - Database credentials, Django `SECRET_KEY`, and JWT signing keys must **never** be referenced in frontend files.
3. **Secrets Injection in Production:**
   - Inject secrets as environment variables via AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets, or Docker Compose `.env` files with `chmod 600` permissions.
4. **Leak Prevention:**
   - `.gitignore` must enforce exclusion of `.env`, `.env.production`, `*.pem`, `*.key`, and `*.sql` files.
   - The CI pipeline runs secret detection checks prior to merge.
