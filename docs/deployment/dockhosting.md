# DockHosting deployment

This repository is a monorepo. `frontend/` is a Vite static site and `backend/`
is a Django API; neither can be detected from the repository root because it has
no root-level `package.json`, `requirements.txt`, or `Dockerfile`.

Deploy them as two DockHosting projects, both tracking the `main` branch. Use
the existing Dockerfiles rather than Nixpacks so builds are deterministic.

| DockHosting project | Root directory | Dockerfile path | Public port |
| --- | --- | --- | --- |
| Frontend | `frontend` | `Dockerfile` | `80` |
| Backend API | `backend` | `docker/backend/Dockerfile` | `PORT` (defaults to `8000`) |

DockHosting builds one Dockerfile per project; it does not run this repository's
Compose stack. Create or attach a managed MySQL 8 database to the backend
project. Do not point either project at the repository root and do not enable
Nixpacks for this monorepo.

## Build-time frontend setting

Set this **build argument/environment variable** on the frontend project before
deploying. Vite embeds it in the generated static files, so it must be the
public HTTPS backend URL, never `localhost`:

```text
VITE_API_URL=https://<backend-project>.dockhosting.dev/api/v1
```

The frontend Dockerfile builds `dist/`, serves it through Nginx, and its Nginx
configuration includes SPA history fallback.

## Backend runtime settings

Set these on the backend project (use DockHosting secrets for sensitive values):

```text
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_DEBUG=False
STRICT_PROD_SECRET=True
DJANGO_SECRET_KEY=<secure-random-value>
JWT_SECRET_KEY=<independent-secure-random-value>
ALLOWED_HOSTS=<backend-project>.dockhosting.dev
CORS_ALLOWED_ORIGINS=https://<frontend-project>.dockhosting.dev
CSRF_TRUSTED_ORIGINS=https://<frontend-project>.dockhosting.dev,https://<backend-project>.dockhosting.dev
DATABASE_ENGINE=django.db.backends.mysql
DATABASE_HOST=<DockHosting-managed-MySQL-private-host>
DATABASE_PORT=3306
DATABASE_NAME=<database-name>
DATABASE_USER=<database-user>
DATABASE_PASSWORD=<database-password>
USE_SQLITE=False
FRONTEND_URL=https://<frontend-project>.dockhosting.dev
BACKEND_BASE_URL=https://<backend-project>.dockhosting.dev
RUN_MIGRATIONS=False
```

Also configure only the application integrations actually used in production:
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and the
chosen email provider variables (`EMAIL_*` or `BREVO_*`). Do not use a `VITE_`
name for any backend secret.

The backend image starts Gunicorn using the platform-provided `PORT` and binds
to `0.0.0.0`. Collected Django static files are served by WhiteNoise. It waits
for MySQL but does not run migrations automatically.
Before the first release, and once for each reviewed schema change, run
`python manage.py migrate --noinput` against the attached database as a
separate release task. Keep the MySQL service persistent; this repository does
not create, reset, or seed production data during normal backend startup.

## Release order

1. Create the managed MySQL service and record a verified backup/rollback plan.
2. Deploy the backend with the variables above, run the reviewed migration task,
   then verify `https://<backend-project>.dockhosting.dev/health/`.
3. Set the frontend `VITE_API_URL` to that backend HTTPS URL and deploy the
   frontend.
4. Verify a frontend deep link, browser API calls, CORS behavior, and the
   backend health endpoint.
