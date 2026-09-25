# Production Deployment Runbook

## Vee Power Electricals E-Commerce Platform

---

### 1. Pre-Deployment Checklist

Before any production release, the release coordinator must verify:

- [ ] **Working Tree Clean:** Git status has no uncommitted changes (`git status`).
- [ ] **Commit Tagged:** Exact release candidate commit SHA is recorded (`git rev-parse HEAD`).
- [ ] **CI Pipeline Green:** All GitHub Actions checks passed on the target commit (Tests, Types, Build, Security Scan).
- [ ] **Database Backup Verified:** A fresh logical backup of the production database is completed and verified (`./scripts/db_backup_restore.sh backup`).
- [ ] **Rollback Target Identified:** Previous stable release Git SHA and image tag are known and accessible.
- [ ] **Release Notes Ready:** Any migration warnings or schema changes are reviewed.

---

### 2. Standard Deployment Procedure

#### Step 1: Create Production Database Snapshot
```bash
./scripts/db_backup_restore.sh backup
# Verify backup file created under backups/veepower_backup_<timestamp>.sql
```

#### Step 2: Build / Pull Immutable Docker Images
```bash
# Tagged deterministically by Git commit SHA
export GIT_COMMIT=$(git rev-parse --short HEAD)
docker compose -f docker-compose.prod.yml build
```

#### Step 3: Run Database Migrations
Run migrations prior to traffic shift:
```bash
docker compose -f docker-compose.prod.yml run --rm backend python manage.py migrate --noinput
```
*Note: Verify that `makemigrations --check` reports zero uncreated migrations.*

#### Step 4: Collect Static Assets
```bash
docker compose -f docker-compose.prod.yml run --rm backend python manage.py collectstatic --noinput
```

#### Step 5: Start / Restart Production Containers
```bash
docker compose -f docker-compose.prod.yml up -d
```

#### Step 6: Post-Deployment Health Check
Validate container health and readiness:
```bash
# Inspect container health states
docker compose -f docker-compose.prod.yml ps

# Query liveness probe
curl -f http://localhost:8000/health/?probe=liveness

# Query readiness probe (validates database connection)
curl -f http://localhost:8000/health/?probe=readiness
```

---

### 3. Post-Deployment Smoke Test (Verification Steps)

1. **Frontend Landing & SPA Routing:**
   - Access `https://veepower.com/` (HTTP 200).
   - Directly navigate to `https://veepower.com/shop` (HTTP 200, no 404).
2. **API Endpoint Health:**
   - Access `https://api.veepower.com/health/` (HTTP 200, status: healthy).
   - Fetch public catalog `https://api.veepower.com/api/v1/catalog/products/` (HTTP 200).
3. **Authentication Flow:**
   - Log in as test customer. Verify JWT token issuance.
4. **Order Placement Flow:**
   - Add item to cart, proceed to checkout, create test order.
5. **Admin Access:**
   - Log into admin dashboard at `/admin/dashboard`, verify order appears.
6. **Logs Inspection:**
   - Inspect backend logs for tracebacks: `docker compose -f docker-compose.prod.yml logs --tail=100 backend`.
