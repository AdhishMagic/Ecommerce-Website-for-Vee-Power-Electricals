# CI/CD Pipeline Automation

## Vee Power Electricals E-Commerce Platform

---

### 1. CI/CD Architecture Overview

The continuous integration and delivery architecture guarantees that every commit to `main` and all pull requests are rigorously tested, linted, verified against database migrations, built for production, and scanned for secrets prior to release.

```
       [ Git Push / Pull Request ]
                    │
                    ▼
     ┌──────────────────────────────┐
     │     GitHub Actions (CI)      │
     │      (.github/workflows)     │
     └──────────────┬───────────────┘
                    │
     ┌──────────────┼──────────────┬──────────────┐
     ▼              ▼              ▼              ▼
[ Backend Test ] [ Frontend Test ] [ Build Test ] [ Secret Scan ]
 • Python 3.12   • Node 22/24    • Vite Build   • No .env / keys
 • MySQL 8 Svc   • TypeScript    • Asset check  • Clean repo
 • 183 Tests     • Component test• Zero secrets
 • Migrations    • ESLint
     │              │              │              │
     └──────────────┴──────┬───────┴──────────────┘
                           ▼
                  [ All Checks Green ]
                           │
                           ▼
            ┌─────────────────────────────┐
            │   Automated Delivery (CD)   │
            │      (deploy.yml on tag)    │
            └──────────────┬──────────────┘
                           │
                           ▼
         [ Build & Tag Docker Images ]
         • veepower-backend:<GIT_SHA>
         • veepower-frontend:<GIT_SHA>
                           │
                           ▼
         [ Staging / Production Deployment ]
         • DB Backup
         • Safe Migration Run
         • Container Restart
         • Readiness Health Check
```

---

### 2. CI Workflow Specifications (`.github/workflows/ci.yml`)

The primary CI workflow contains four concurrent and dependent jobs:

1. **`backend-checks-and-tests`:**
   - **Environment:** Ubuntu latest, Python 3.12, MySQL 8 service container.
   - **Database Readiness:** Verifies MySQL is healthy via `mysqladmin ping`.
   - **Deployment Check:** Executes `python manage.py check --deploy --settings=config.settings.production`.
   - **Migration Check:** Executes `python manage.py makemigrations --check` (fails if any model changes lack migrations).
   - **Static Collection:** Runs `python manage.py collectstatic --noinput --settings=config.settings.production`.
   - **Full Backend Suite:** Executes all 183 Django unit, integration, and deployment tests.
   - **Rule:** `continue-on-error: false` strictly enforced.
2. **`frontend-checks-and-tests`:**
   - **Environment:** Ubuntu latest, Node.js 22.x, npm caching.
   - **Type Checking:** Runs `npm run typecheck` (`tsc -b`).
   - **Integration / Unit Tests:** Runs frontend test suite.
   - **Production Build:** Executes `npm run build` using Vite.
   - **Bundle Audit:** Verifies bundle size and checks that zero private secrets are embedded in `dist/`.
3. **`security-and-secret-scan`:**
   - Scans git history and staged files for accidental credential inclusion.
   - Enforces absence of unencrypted `.env` or `.pem` files.
4. **`ci-complete-gate`:**
   - Consolidates status of all jobs into a single blocking gate required for PR merge.

---

### 3. Continuous Delivery & Release Packaging (`.github/workflows/deploy.yml`)

- **Trigger:** Pushes with release tags (e.g., `v1.0.0-rc1`) or manual workflow dispatch.
- **Traceability:** Every image is tagged with the exact Git commit SHA:
  - `ghcr.io/veepower/backend:${{ github.sha }}`
  - `ghcr.io/veepower/frontend:${{ github.sha }}`
- **Deployment Gates:**
  1. Staging deployment automatically executed upon tag creation.
  2. Automated health check verification (`/health/?probe=readiness`).
  3. Production promotion requires manual sign-off / environment protection rule in GitHub repository settings.
