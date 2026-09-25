# Rollback Runbook & Incident Recovery

## Vee Power Electricals E-Commerce Platform

---

### 1. Rollback Decision Triggers

Initiate an emergency rollback immediately if any of the following occur within 30 minutes of deployment:
1. **Health Check Failure:** `/health/?probe=readiness` returns 503 or fails to respond.
2. **Elevated Error Rates:** Sustained HTTP 500 error rate exceeding 1% across API requests.
3. **Critical Core Workflow Blocked:**
   - Customers cannot authenticate (JWT failure).
   - Customers cannot view product catalog.
   - Customers cannot place orders / checkout.
   - Payment status webhook failures.
4. **Data Corruption or Inconsistency:** Unrecoverable schema migration issue or foreign key constraint violation.

---

### 2. Rollback Flowchart

```
[ Deployment Alert / Smoke Test Failure ]
                   │
                   ▼
     Can issue be hotfixed in < 5m?
            │             │
        YES │             │ NO
            ▼             ▼
      Apply Hotfix   Initiate Rollback
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
[ Application Code Rollback ]     [ Migration Status Check ]
   Revert Docker tag to               Did migration alter
   previous stable commit             data or drop columns?
         │                                 │
         │                        ┌────────┴────────┐
         │                    NO  │                 │ YES
         │                        ▼                 ▼
         │               Revert Migration    Restore Pre-Deploy
         │               via `manage.py      Database Snapshot
         │                migrate <app>`     via Backup Script
         │                        │                 │
         └────────────────┬───────┴─────────────────┘
                          ▼
               Restart Docker Containers
                          │
                          ▼
               Run Health Check & Smoke Test
                          │
                          ▼
             Traffic Restored & Incident Logged
```

---

### 3. Step-by-Step Application Rollback

#### Step 1: Halt Incoming Production Traffic / Enable Maintenance Mode
If using Nginx/Cloudflare, enable the maintenance splash page:
```bash
# Example if using Nginx maintenance block
touch /var/www/veepower/maintenance.flag
```

#### Step 2: Roll Back Application Container Images
Deploy the previous stable image tag (e.g., `c8f1d98d`):
```bash
export PREVIOUS_COMMIT=c8f1d98d9fba7696e3341d7795d73a49e89ceb19
docker compose -f docker-compose.prod.yml down
# Update image tag to PREVIOUS_COMMIT or pull previously validated image
docker compose -f docker-compose.prod.yml up -d
```

#### Step 3: Handle Database Schema State
Evaluate if migrations executed in the failed release require reversion:

- **Case A: Backwards-compatible migrations (e.g., added nullable column, new index)**
  - Safe to leave intact; previous application version will ignore additional columns.
- **Case B: Reversible migration (e.g., added a model or table)**
  - Reverse to target migration number:
    ```bash
    docker compose -f docker-compose.prod.yml run --rm backend python manage.py migrate <app_name> <target_migration_number>
    ```
- **Case C: Destructive or corrupted schema/data**
  - Execute database restore from the pre-deployment backup:
    ```bash
    ./scripts/db_backup_restore.sh restore backups/veepower_backup_pre_deploy.sql
    ```

#### Step 4: Verification & Smoke Test
1. Query health probe: `curl -f http://localhost:8000/health/?probe=readiness`
2. Test customer login, catalog load, and order creation.
3. Remove maintenance page flag:
   ```bash
   rm -f /var/www/veepower/maintenance.flag
   ```

---

### 4. Post-Rollback Review & Postmortem

Following a rollback, conduct a blameless postmortem documenting:
- Incident start and resolution timestamps.
- Root cause (e.g., missed dependency, unhandled migration edge case, environment variable typo).
- Why the defect was not caught in CI or staging.
- Corrective actions to prevent recurrence.
