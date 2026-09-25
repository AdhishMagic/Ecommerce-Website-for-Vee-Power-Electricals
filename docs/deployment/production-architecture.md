# Production Deployment Architecture

## Vee Power Electricals E-Commerce Platform

---

### 1. Architectural Overview

The Vee Power Electricals production deployment architecture is designed for high availability, security, determinism, and zero-loss recoverability. The platform consists of two decoupled application tiers backed by a persistent relational database:

```
[ Browser Client ]
        │
        ▼ (HTTPS :443)
┌────────────────────────────────────────────────────────┐
│               Edge / Web Server Tier                   │
│   (Reverse Proxy / Nginx / Cloud CDN / Ingress)        │
│                                                        │
│  • SSL/TLS Termination (Strict HTTPS, HSTS)           │
│  • Direct SPA Route Handling & Fallback to index.html  │
│  • Static Asset Caching (/static/*, /assets/*)         │
│  • Rate Limiting & DDOS Mitigation                     │
└──────────────┬─────────────────────────┬───────────────┘
               │                         │
               │ /api/*, /health/*       │ Static assets
               ▼                         ▼
┌─────────────────────────────┐  ┌───────────────────────┐
│     Backend WSGI Server     │  │   Frontend Static     │
│   (Gunicorn / Uvicorn)      │  │     Web Root / S3     │
│                             │  │                       │
│ • Django 5.2.17 Core        │  │ • React 19 Bundle     │
│ • DRF API ViewSets          │  │ • Tailwind CSS Assets │
│ • JWT Authentication        │  │ • Pre-rendered SVGs   │
│ • Health & Readiness Probes │  └───────────────────────┘
└──────────────┬──────────────┘
               │
               │ (Encrypted TCP :3306)
               ▼
┌─────────────────────────────┐
│       MySQL 8 Engine        │
│                             │
│ • InnoDB Engine             │
│ • Persistent Volume         │
│ • Automated Snapshots       │
│ • Restricted Local Network  │
└─────────────────────────────┘
```

---

### 2. Tier Breakdown

#### 2.1 Edge / Web Tier (Nginx / Cloudflare / ALB)
- **Role:** Handles incoming HTTPS traffic on port 443, enforces TLS 1.2+, applies rate limits and security headers.
- **Routing Rules:**
  - `/api/*`: Proxies to Backend WSGI container (`http://veepower_backend:8000`).
  - `/health/*`: Proxies to Backend healthcheck endpoint (`http://veepower_backend:8000/health/`).
  - `/admin/*`: Proxies to Django Admin (`http://veepower_backend:8000/admin/`).
  - `/static/*`: Serves collected static assets from `STATIC_ROOT` (`/app/staticfiles`).
  - `/media/*`: Serves user uploads from persistent `MEDIA_ROOT` (`/app/media`).
  - `/*` (Fallback): Serves React 19 SPA (`index.html`) to support client-side routing (`/shop`, `/orders`, `/admin/dashboard`).

#### 2.2 Application Backend Tier (Django 5.2.17)
- **WSGI Process:** Gunicorn with 3–4 workers (`gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60`).
- **Runtime:** Python 3.12-slim container.
- **Settings Module:** `config.settings.production` (`DEBUG = False`).
- **Security:** CSRF protection, CORS origin validation, Session cookie security, JWT authentication.
- **Health Probes:**
  - Liveness: `GET /health/?probe=liveness`
  - Readiness: `GET /health/?probe=readiness` (validates active DB connection via `SELECT 1`).

#### 2.3 Frontend Tier (React 19 + TypeScript + Vite)
- **Runtime:** Static compiled bundle (`dist/`) output by Vite production build.
- **API Communication:** Communicates with backend exclusively via `VITE_API_URL` environment variable.
- **Zero Secrets:** Zero backend credentials, database passwords, or JWT secrets embedded in frontend build.

#### 2.4 Data Tier (MySQL 8)
- **Engine:** MySQL 8 with InnoDB default storage.
- **Persistence:** Bound to named Docker volume `mysql_data` or managed database cluster (AWS RDS / DigitalOcean Managed DB).
- **Access Control:** No public internet exposure. Only accessible within Docker network or private VPC subnet.
- **Charset:** `utf8mb4` with `utf8mb4_unicode_ci` collation.

---

### 3. Container Topology & Networks

| Service Name | Image | Ports (Internal) | Host Ports | Volume Mounts | Health Check |
|---|---|---|---|---|---|
| `veepower_mysql` | `mysql:8.0` | 3306 | 3306 (Dev) / None (Prod) | `mysql_data:/var/lib/mysql` | `mysqladmin ping -h localhost` |
| `veepower_backend` | `veepower-backend:latest` | 8000 | 8000 | `static_volume:/app/staticfiles`, `media_volume:/app/media` | Python HTTP probe to `/health/` |
| `veepower_frontend` | `veepower-frontend:latest` | 80 / 5173 | 80 / 5173 | Static dist or webroot | Web HTTP GET `/` |

---

### 4. Storage & Persistence Strategy

1. **Database Volume (`mysql_data`):**
   - Stores all transactional and relational state.
   - Protected against container restarts and redeployments.
   - Backed up daily via logical `mysqldump` and physical filesystem snapshots.
2. **Static Files (`static_volume`):**
   - Populated during deployment via `python manage.py collectstatic --noinput`.
   - Served directly by edge web server with cache headers (`Cache-Control: public, max-age=31536000, immutable`).
3. **Media Files (`media_volume`):**
   - Stores product images, user invoices, quotations, and spec sheets.
   - In production, can be backed by AWS S3 / Cloudflare R2 bucket via `django-storages`.
