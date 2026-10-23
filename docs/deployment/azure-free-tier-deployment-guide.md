# Azure Free-Tier Deployment & Readiness Guide
## Vee Power Electricals — React 19 + Django 5 + MySQL 8

---

### 1. Executive Architecture Summary

This repository is prepared for deployment to Microsoft Azure using eligible Free-Tier and cost-conscious services without altering website UI, business logic, API contracts, or database schemas:

```
[ End-User Browser ]
         │
         ├─── (HTTPS) ─────────────────────────┐
         │                                     │
         ▼                                     ▼
┌────────────────────────────────┐   ┌────────────────────────────────┐
│   Azure Static Web Apps (Free) │   │ Azure App Service Linux (F1/B1)│
│   • Global CDN                 │   │ • Python 3.12 Runtime          │
│   • Free SSL / Custom Domains  │   │ • Gunicorn WSGI Server         │
│   • React 19 + Vite SPA        │   │ • WhiteNoise Static Serving    │
│   • Route Fallback (index.html)│   │ • DRF API & Auth Engine        │
└────────────────────────────────┘   └───────────────┬────────────────┘
                                                     │
                                                     │ (Encrypted TLS :3306)
                                                     ▼
                                     ┌────────────────────────────────┐
                                     │ Azure Database for MySQL       │
                                     │ Flexible Server (Free 12-Mo)   │
                                     │ • Standard_B1ms Compute        │
                                     │ • 32 GiB Storage Capped        │
                                     │ • InnoDB utf8mb4 Engine        │
                                     └────────────────────────────────┘
```

---

### 2. Verified Azure Free-Tier Eligibility & Limitations

| Service Component | Azure Free-Tier Offer | Quota & Constraints | Cost Avoidance Rule |
|---|---|---|---|
| **Frontend** | Azure Static Web Apps (Free Plan) | • 100 GB Bandwidth/mo<br>• 0.5 GB App size (Vee Power is ~1.5 MB)<br>• 2 Custom Domains with free auto-renewing SSL | **Always Free ($0/mo)**. Never select "Standard" tier unless enterprise SLA is required. |
| **Backend** | Azure App Service Linux (F1 Free or B1 Trial) | • **F1 Free**: 60 CPU minutes/day, 1 GB RAM, 1 GB storage<br>• **B1**: Eligible for 30-day $200 trial credits or compute vouchers | **Warning on F1**: F1 sleeps on inactivity and has 60 CPU min/day limit. For production reliability, upgrade to B1 using trial credit or pay-as-you-go (~$12/mo). |
| **Database** | Azure Database for MySQL Flexible Server | • 750 hours/mo of `Standard_B1ms` compute for 12 months (New accounts)<br>• 32 GiB Storage & 32 GiB Backup Storage | **CRITICAL**: Select `Standard_B1ms`. **DO NOT** enable High Availability (HA). **DO NOT** enable Auto-Grow above 32 GiB. Select single-zone deployment. |

---

### 3. Step-by-Step Azure Portal Provisioning

#### Step 3.1: Resource Group
1. Open the [Azure Portal](https://portal.azure.com/).
2. Create a Resource Group:
   - **Name:** `rg-veepower-prod`
   - **Region:** Choose a region supporting Free B1ms MySQL (e.g., `East US`, `Central US`, or `North Europe`).

#### Step 3.2: Azure Database for MySQL Flexible Server
1. Search for **Azure Database for MySQL flexible servers** and click **Create**.
2. Configure settings:
   - **Resource Group:** `rg-veepower-prod`
   - **Server Name:** `veepower-mysql-prod` (must be globally unique)
   - **Workload type:** `Development or hobby projects`
   - **Compute + storage:** Click *Configure server* -> Select **Burstable** -> **Standard_B1ms** (1 vCPU, 2 GiB RAM).
   - **Storage:** Set to **32 GiB**. Uncheck *Storage Auto-growth* to avoid unexpected billing past 32 GB.
   - **High Availability:** Leave **Disabled**.
   - **Authentication:** MySQL authentication only. Set admin username (e.g. `veepower_admin`) and a strong password.
3. **Networking Tab:**
   - Connectivity method: **Public access (allowed IP addresses)**
   - Check **Allow public access from any Azure service within Azure to this server** (Required for App Service connection).
   - Add your local client IP to firewall rules for running initial logical data import.
4. Review + Create.
5. Once provisioned, create the production database:
   - Connect via MySQL CLI or Workbench and run:
     ```sql
     CREATE DATABASE veepower_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
     ```

#### Step 3.3: Azure App Service (Backend)
1. Search for **App Services** and click **Create** -> **Web App**.
2. Configure:
   - **Resource Group:** `rg-veepower-prod`
   - **Name:** `veepower-api-prod` (becomes `https://veepower-api-prod.azurewebsites.net`)
   - **Publish:** `Code`
   - **Runtime stack:** `Python 3.12`
   - **Operating System:** `Linux`
   - **Region:** Same region as your database (`East US`)
   - **Pricing Plan:** Select **F1 (Free)** or **B1 (Basic)**.
3. In **Configuration / Environment Variables**, add the following Application Settings:

```ini
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<generate_secure_random_50_char_string>
JWT_SECRET_KEY=<generate_secure_random_50_char_string>
STRICT_PROD_SECRET=True

ALLOWED_HOSTS=veepower-api-prod.azurewebsites.net,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://<your-static-web-app-domain>.azurestaticapps.net
CSRF_TRUSTED_ORIGINS=https://<your-static-web-app-domain>.azurestaticapps.net,https://veepower-api-prod.azurewebsites.net

DATABASE_ENGINE=django.db.backends.mysql
DATABASE_HOST=veepower-mysql-prod.mysql.database.azure.com
DATABASE_PORT=3306
DATABASE_NAME=veepower_db
DATABASE_USER=veepower_admin
DATABASE_PASSWORD=<your_mysql_password>
DATABASE_SSL=True
USE_SQLITE=False
SEED_DEMO_DATA=False

SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

4. In **General Settings / Startup Command**, enter:
   ```bash
   bash startup.sh
   ```
   *(or `gunicorn --bind=0.0.0.0:8000 --workers=2 --timeout=600 config.wsgi:application`)*

#### Step 3.4: Azure Static Web Apps (Frontend)
1. Search for **Static Web Apps** and click **Create**.
2. Configure:
   - **Resource Group:** `rg-veepower-prod`
   - **Name:** `veepower-web-prod`
   - **Plan type:** **Free**
   - **Deployment details:** Select **GitHub** or **Other** (for GitHub Actions).
   - **App location:** `frontend`
   - **Api location:** (leave empty)
   - **Output location:** `dist`
3. Click **Review + Create**.
4. Retrieve the **Deployment Token** from the Static Web App overview blade and save it as a GitHub Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`.

---

### 4. Database Migration & Safe Data Import Runbook

> [!CAUTION]
> Never run migrations blindly or execute destructive reset commands. Follow this exact zero-data-loss sequence.

#### 4.1 Step 1: Backup Local / Staging Database
```bash
# Using the project's tested backup utility
./scripts/db_backup_restore.sh backup
# File created in backups/veepower_backup_<timestamp>.sql
```

#### 4.2 Step 2: Validate Backup Integrity
```bash
# Verify the dump completed successfully
tail -n 5 backups/veepower_backup_*.sql | grep "Dump completed"
```

#### 4.3 Step 3: Import Schema & Data to Azure MySQL
```bash
# Stream logical dump directly to Azure MySQL Flexible Server over TLS
mysql -h veepower-mysql-prod.mysql.database.azure.com \
      -P 3306 \
      -u veepower_admin \
      -p \
      --ssl-mode=REQUIRED \
      veepower_db < backups/veepower_backup_<timestamp>.sql
```

#### 4.4 Step 4: Verify Migration Status (Non-Destructive)
Via SSH console on Azure App Service or locally connected to Azure DB:
```bash
python manage.py showmigrations --settings=config.settings.production
```
Confirm all migrations display `[X]`. If any pending migration exists, run:
```bash
python manage.py migrate --noinput --settings=config.settings.production
```

---

### 5. Frontend Build & Client Routing Compatibility

The frontend has been configured with:
1. `frontend/public/staticwebapp.config.json` & `frontend/staticwebapp.config.json`:
   - Configures `navigationFallback` rewriting unmapped paths (`/shop`, `/account`, `/admin/*`) to `/index.html` to guarantee client-side React Router navigation works seamlessly on page refreshes.
   - Applies 1-year immutable caching on `/assets/*` for optimal performance.
   - Enforces `nosniff`, `DENY` x-frame, and `strict-origin-when-cross-origin` security headers.
2. Build-time production API injection:
   - Set GitHub Secret `VITE_API_URL=https://veepower-api-prod.azurewebsites.net/api/v1`.
   - Build produces clean static assets in `frontend/dist/` without any exposed secret keys.

---

### 6. Smoke Testing & Verification Checklist

After deployment, perform these verification steps:

- [ ] **Frontend Health:** Navigate to `https://<swa-subdomain>.azurestaticapps.net`. Ensure homepage loads with all product cards, icons, and hero section.
- [ ] **SPA Route Refresh:** Navigate to `/shop` and press `Ctrl+F5` (Hard reload). Verify the page loads cleanly without returning Azure 404.
- [ ] **Backend Health Probe:** Check `https://veepower-api-prod.azurewebsites.net/health/` returns `{"status": "healthy"}` and HTTP 200.
- [ ] **API Health Probe:** Check `https://veepower-api-prod.azurewebsites.net/api/v1/health/` returns HTTP 200 with database connectivity confirmation.
- [ ] **Static Assets (Admin & API):** Navigate to `https://veepower-api-prod.azurewebsites.net/admin/`. Verify Django Admin CSS and login styling load cleanly via WhiteNoise.
- [ ] **Live Integration Verification:** Run `npm run test:integration` pointing to production URL:
  ```bash
  VITE_API_URL=https://veepower-api-prod.azurewebsites.net/api/v1 node tests/integration.test.mjs
  ```
- [ ] **Authoritative Metrics Verification:** Run `npm run test:dashboard` to confirm financial summaries and ledger endpoints remain intact.
