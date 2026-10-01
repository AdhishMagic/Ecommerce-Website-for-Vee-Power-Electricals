# ⚡ Vee Power Electricals — Full-Stack E-Commerce Application

An enterprise-ready, full-stack e-commerce web application designed for **Vee Power Electricals**, featuring a modern React frontend, Django REST Framework backend API, MySQL database (SQLite for quick local starts), and a containerized Docker setup.

**Validated state:** 595 backend tests, 171 Playwright E2E tests, 44-check live database audit and the full quality gate pass at commit `d0a62a3` — see [docs/testing/README.md](docs/testing/README.md).

---

## ✨ Main Capabilities

- **Storefront:** catalog browsing/search/filtering, product detail, client-side cart, backend-authoritative checkout (GST + delivery + discounts computed server-side), online payments (Razorpay) & Cash on Delivery, order tracking, returns.
- **Admin panel:** dashboard analytics, product/category management & CSV import, inventory with append-only stock ledger, order fulfilment state machine, returns processing, payment transactions, finance (invoices, expenses, settlements, P&L summary), B2B quotations → invoices, B2B clients with credit limits, configuration with audit trail.
- **Platform:** JWT auth with rotation/blacklist, RBAC (customer/admin), IDOR-safe ownership scoping, rate limiting, canonical error envelope, security headers, communication/email hooks with idempotent logging, Docker health checks.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 5, Vite 8, Tailwind CSS 4, React Router 7 (lazy routes), Recharts |
| Backend | Python/Django 5, Django REST Framework, SimpleJWT, MySQL client |
| Database | MySQL 8.0 (SQLite fallback for local dev) |
| Infrastructure | Docker Compose (dev + prod overlay), gunicorn in production |
| Payments | Razorpay (test/live via env) |

```text
Browser (React SPA) ──HTTP──▶ Backend API (Django/DRF :8000)
                                  │  services layer (pricing, tax, stock, FSM, credit)
                                  ▼
                              MySQL 8.0 (:3306)
```

Presentation → API → business-logic → persistence boundaries are described in
[docs/architecture/README.md](docs/architecture/README.md).

---

## 📑 Table of Contents
1. [Prerequisites](#-prerequisites)
2. [Option A: Quick Local Setup (Recommended)](#-option-a-quick-local-setup-recommended)
   - [Step 1: Backend Setup (Django API)](#step-1-backend-setup-django-api)
   - [Step 2: Frontend Setup (React + Vite)](#step-2-frontend-setup-react--vite)
3. [Option B: Docker Setup (Containerized)](#-option-b-docker-setup-containerized)
4. [🔑 Admin Access & Seed Data](#-admin-access--seed-data)
5. [⚙️ Environment Variables](#️-environment-variables)
6. [🔌 API Endpoints Cheat Sheet](#-api-endpoints-cheat-sheet)
7. [🧪 Testing](#-testing)
8. [🚢 Production Build & Deployment](#-production-build--deployment)
9. [🛠️ Troubleshooting & FAQs](#️-troubleshooting--faqs)
10. [🚩 Security Notes & Known Limitations](#-security-notes--known-limitations)
11. [📚 Documentation Index](#-documentation-index)

---

## 📋 Prerequisites

- **Node.js**: `v18.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **Python**: `v3.10` or higher ([Download Python](https://www.python.org/))
- **Git**: Installed ([Download Git](https://git-scm.com/))
- **Docker Desktop** *(Optional - only required if running Option B)*: ([Download Docker](https://www.docker.com/products/docker-desktop/))

---

## 🚀 Option A: Quick Local Setup (Recommended)

> 💡 In development mode the backend uses **SQLite** automatically — no MySQL needed.

### Step 1: Backend Setup (Django API)

```bash
cd backend
python -m venv venv
# Windows PowerShell:  .\venv\Scripts\Activate.ps1
# macOS/Linux:        source venv/bin/activate
pip install -r requirements/development.txt
python manage.py migrate
python manage.py seed_data          # demo categories, brands, products
python manage.py runserver          # → http://127.0.0.1:8000/
```

- **API root:** `http://127.0.0.1:8000/api/v1/`
- **Django Admin:** `http://127.0.0.1:8000/admin/`

### Step 2: Frontend Setup (React + Vite)

In a **new terminal**:

```bash
cd frontend
npm install
npm run dev                         # → http://localhost:5173
```

---

## 🐳 Option B: Docker Setup (Containerized with Live Code Reload)

```bash
docker compose up -d --build        # migrations + demo data applied on first run
docker compose ps                   # verify the 3 services are healthy
docker compose down                 # stop
```

- 🌐 Frontend (hot reload): `http://localhost:5173`
- ⚡ Backend API: `http://localhost:8000/api/v1/`
- 🛠️ Django Admin: `http://localhost:8000/admin/`
- 🗄️ MySQL: `localhost:3306`

> 💡 **Production mode** (gunicorn + static frontend build):
> `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

---

## 🔑 Admin Access & Seed Data

1. Create an admin account: `python manage.py createsuperuser` (or use the
   development seed's demo users — dev fixtures only, never production).
2. Open `http://localhost:8000/admin/` and log in.
3. Everything seeded by `seed_data` (or `seed_development_data` for the richer
   demo dataset) is manageable in the Admin Portal or via REST.

---

## ⚙️ Environment Variables

Both apps ship tracked `.env.example` templates; defaults work out-of-the-box
for local development. **Never commit real `.env` files or secrets.**

Backend (`backend/.env`) — full reference:
[docs/deployment/environment-configuration.md](docs/deployment/environment-configuration.md)

```env
USE_SQLITE=True                     # False to use MySQL
DATABASE_ENGINE=django.db.backends.mysql
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=veepower_db
DATABASE_USER=<db-user>
DATABASE_PASSWORD=<db-password>
DJANGO_SECRET_KEY=<random-secret>
DJANGO_DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

Frontend (`frontend/.env`):

```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## 🔌 API Endpoints Cheat Sheet

All routes are prefixed `/api/v1/` — full reference with auth/authorization per
endpoint: [docs/api/README.md](docs/api/README.md).

| Domain | Prefix | Examples |
|---|---|---|
| Auth & users | `/auth/` | `POST /auth/login/`, `POST /auth/register/`, `GET /auth/me/`, `POST /auth/token/refresh/` |
| Addresses | `/addresses/` | customer address CRUD |
| Catalog | `/catalog/` | `GET /catalog/products/`, `/catalog/categories/`, `/catalog/brands/` |
| Inventory | `/inventory/` | overview, ledger, `POST /inventory/restock/`, `POST /inventory/adjust/` |
| Orders | `/orders/` | `POST /orders/checkout/`, `GET /orders/my-orders/`, `PATCH /orders/{id}/status/`, `POST /orders/{id}/return/` |
| Payments | `/payments/` | `POST /payments/initiate/`, `POST /payments/verify/`, `POST /payments/webhook/` |
| Finance | `/finance/` | clients, quotations, invoices, payments, settlements, `GET /finance/summary/` |
| Expenses | `/expenses/` | expense CRUD (admin) |
| Configuration | `/config/` | `store/`, `tax/`, `delivery/`, `slabs/`, `shipping-rules/`, `discounts/`, `audit-logs/` |
| Inquiries | `/inquiries/` | public contact form, admin inbox |
| Health | `/health/` | readiness probe (application + database) |

---

## 🧪 Testing

Verified counts at `d0a62a3` — authoritative record:
[docs/testing/README.md](docs/testing/README.md).

```bash
# Backend (595 tests)
docker exec veepower_backend python manage.py test tests --noinput

# Database integrity (34 tests + 44-check live audit)
docker exec veepower_backend python manage.py test tests.test_phase8_database_integrity
docker exec -i veepower_backend python manage.py shell < backend/tests/audit_step18_database_integrity.py

# Frontend typecheck + build
cd frontend && npm run typecheck && npm run build

# Live integration (17 checks) — needs the stack running
cd frontend && node tests/integration.test.mjs

# Playwright E2E (171 tests) — needs the stack running
cd frontend && npx playwright test

# Overflow audit (172 checks) & comprehensive backend audit (32 checks)
cd frontend && node tests/overflow-audit.mjs
cd frontend && node tests/comprehensive_audit.mjs
```

> ⚠️ Database-mutating suites (integration, Playwright, comprehensive audit,
> live DB audit) must run **sequentially**, never concurrently.

---

## 🚢 Production Build & Deployment

- Frontend production build: `npm run build` → `frontend/dist/` (code-split per route).
- Backend production mode: gunicorn via `docker-compose.prod.yml`.
- Deployment guide, runbooks, backup/restore and rollback:
  [docs/deployment/README.md](docs/deployment/README.md).
- Operations & maintenance runbook: [docs/operations/README.md](docs/operations/README.md).

---

## 🛠️ Troubleshooting & FAQs

### Q: Command `python` is not recognized on Windows?
Try `py -m venv venv`.

### Q: `Activate.ps1 cannot be loaded` on Windows PowerShell?
Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process`, then
`.\\venv\\Scripts\\Activate.ps1`.

### Q: Port 8000 or 5173 already in use?
Backend: `python manage.py runserver 8080`. Frontend: Vite will offer `5174`, or change the port in `vite.config.ts`.

### Q: Frontend shows no products / empty screens?
Run `python manage.py seed_data` in the backend environment.

More: [docs/operations/README.md §9](docs/operations/README.md#9-troubleshooting).

---

## 🚩 Security Notes & Known Limitations

- Secrets are env-only; dev fallbacks in settings are for local development —
  production requires real secrets (`docs/deployment/environment-configuration.md`).
- Rate limiting uses the in-memory cache in dev; configure **Redis** for
  multi-worker production.
- **Automated Razorpay outbound refunds are deferred/manual**; returns/cancellations
  reconcile via credit notes.
- Full list: [docs/limitations.md](docs/limitations.md).
- Security architecture: [docs/security/README.md](docs/security/README.md),
  auth deep-dive: [docs/security/authentication.md](docs/security/authentication.md).

---

## 📚 Documentation Index

| Area | Document |
|---|---|
| Architecture (layers, modules, decisions) | [docs/architecture/README.md](docs/architecture/README.md) |
| API reference (all real routes) | [docs/api/README.md](docs/api/README.md) |
| Authentication & RBAC | [docs/security/authentication.md](docs/security/authentication.md) |
| Business workflows (checkout, FSM, returns, B2B…) | [docs/workflows/README.md](docs/workflows/README.md) |
| Database schema & integrity (Step 18 audit) | [docs/database/README.md](docs/database/README.md) |
| Testing & regression record (Step 19) | [docs/testing/README.md](docs/testing/README.md) |
| Performance (Step 17) | [docs/performance/README.md](docs/performance/README.md) |
| Responsive (Step 16) | [docs/responsive/README.md](docs/responsive/README.md) |
| Security hardening (Step 13) | [docs/security/README.md](docs/security/README.md) |
| Deployment (runbooks, env, backup, CI/CD) | [docs/deployment/README.md](docs/deployment/README.md) |
| Operations & maintenance | [docs/operations/README.md](docs/operations/README.md) |
| User guide (customer & admin) | [docs/user-guide/README.md](docs/user-guide/README.md) |
| Limitations & deferred features | [docs/limitations.md](docs/limitations.md) |
| Domain deep-dives | `docs/orders/`, `docs/payment/`, `docs/inventory/`, `docs/catalog/`, `docs/finance/`, `docs/b2b-credit/`, `docs/configuration/`, `docs/communication/`, `docs/error-handling/`, `docs/frontend-integration/` |
| Historical phase reports | `docs/PHASE_*.md`, `docs/phases/` |

---

✨ **Happy Coding!** Built for **Vee Power Electricals**.
