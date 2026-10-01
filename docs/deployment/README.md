# Deployment Guide — Vee Power Electricals

Deployment documentation index and overview, verified against the repository at
commit `d0a62a3`. Deep-dives:

| Document | Contents |
|---|---|
| [deployment-runbook.md](deployment-runbook.md) | Step-by-step production deployment |
| [production-architecture.md](production-architecture.md) | Production topology and assumptions |
| [environment-configuration.md](environment-configuration.md) | Full environment-variable matrix and secret rules |
| [backup-restore.md](backup-restore.md) | MySQL logical backup/restore procedure |
| [rollback-runbook.md](rollback-runbook.md) | Incident recovery and rollback |
| [ci-cd.md](ci-cd.md) | CI/CD pipeline automation |

## 1. Environments

| Environment | Settings module | Database | Notes |
|---|---|---|---|
| **LOCAL** | `config.settings.development` | SQLite (`USE_SQLITE=True`, default) or Docker MySQL | `DEBUG=True`, console emails, mock Razorpay keys, auto-seed available |
| **STAGING / CI** | `config.settings.production` | Ephemeral MySQL service container | `DEBUG=False`, `check --deploy` enforced, strict settings verification |
| **PRODUCTION** | `config.settings.production` | Dedicated MySQL (8.0) | `DEBUG=False` mandatory, env-injected secrets, secure cookies/headers, auto-seed disabled |

⚠️ **No production deployment currently exists.** Production readiness is
documented and CI-validated; actual infrastructure provisioning is a future
operational task (see `docs/limitations.md`).

## 2. Docker Architecture (actual compose files)

- `docker-compose.yml` — development: `mysql:8.0` (healthcheck), `backend`
  (`python manage.py runserver 0.0.0.0:8000`, source-mounted, healthcheck),
  `frontend` (`npm run dev -- --host 0.0.0.0`).
- `docker-compose.prod.yml` — overlay: backend switches to
  `gunicorn --bind 0.0.0.0:8000 --workers 3 --timeout 60 config.wsgi:application`;
  frontend serves the static production build. **HTTPS terminates at an
  assumed external reverse proxy/CDN** (not shipped in-repo).
- Environment via `.env` files; `.env.example` templates are tracked; real
  `.env` files are gitignored and must never be committed.

## 3. Environment Variables (quick reference)

Full matrix: [environment-configuration.md](environment-configuration.md).
Placeholders only — never real values:

```env
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<50+-char-random-secret>
JWT_SECRET_KEY=<independent-random-secret>
ALLOWED_HOSTS=<your-domain>,api.<your-domain>
DATABASE_ENGINE=django.db.backends.mysql
DATABASE_NAME=<database-name>
DATABASE_USER=<restricted-db-user>
DATABASE_PASSWORD=<high-entropy-password>
DATABASE_HOST=<db-host>
DATABASE_PORT=3306
CORS_ALLOWED_ORIGINS=https://<your-domain>
CSRF_TRUSTED_ORIGINS=https://<your-domain>
RAZORPAY_KEY_ID=<rzp_live_...>
RAZORPAY_KEY_SECRET=<vault-secret>
RAZORPAY_WEBHOOK_SECRET=<vault-secret>
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=<smtp-provider>
EMAIL_HOST_USER=<smtp-user>
EMAIL_HOST_PASSWORD=<smtp-password>
DEFAULT_FROM_EMAIL=<from-address>
FRONTEND_URL=https://<your-domain>
VITE_API_URL=https://api.<your-domain>/api/v1
```

## 4. Database Setup & Migrations

```bash
docker exec veepower_backend python manage.py migrate          # apply
docker exec veepower_backend python manage.py migrate --plan   # preview
docker exec veepower_backend python manage.py showmigrations   # state (39/39 applied at d0a62a3)
```

`makemigrations --check --dry-run` must report *No changes detected* before any
release. Deployment applies migrations before starting the application server.

## 5. Static Files & Frontend Build

- Backend static files: collected in production via `collectstatic` (WhiteNoise/
  proxy-served per `production-architecture.md`).
- Frontend: `npm run build` produces `frontend/dist/` (verified: builds clean in
  ~8 s, code-split per route).

## 6. Health / Readiness

| Check | Expectation |
|---|---|
| `GET /api/v1/health/` | `{"status": "healthy", "services": {"application": "up", "database": "connected"}}` |
| Docker healthchecks | backend (HTTP probe) and mysql healthy in `docker ps` |
| Frontend root | HTTP 200 from :5173 (dev) / static host |

## 7. Backup, Rollback, Smoke Tests

- Backups: `mysqldump` logical dumps per [backup-restore.md](backup-restore.md);
  expected cadence documented there.
- Rollback: previous image tag / migration awareness per
  [rollback-runbook.md](rollback-runbook.md).
- Post-deploy smoke test: run the 17-check live integration script
  (`node tests/integration.test.mjs`) plus `GET /api/v1/health/` — see
  `docs/testing/README.md` for the full matrix.

## 8. Security Notes for Deployment

- Secrets exclusively via environment/secret manager; `.env` never committed.
- `DJANGO_DEBUG=False`, explicit `ALLOWED_HOSTS`, strict CORS/CSRF origins.
- Security headers enforced by `SecurityHeadersMiddleware` (Step 13) — verify
  after first deploy.
- Rate limiting is cache-backed; **configure Redis for multi-worker
  production** or limits are per-process (see `docs/limitations.md`).
