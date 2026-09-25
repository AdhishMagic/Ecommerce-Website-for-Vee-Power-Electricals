# Database Backup & Restore Procedure

## Vee Power Electricals E-Commerce Platform

---

### 1. Strategy & Objectives

Data integrity and disaster recovery for Vee Power Electricals are maintained via consistent logical dumps, strict retention schedules, and automated restoration testing.

- **RPO (Recovery Point Objective):** <= 24 hours (daily full logical dumps) or <= 1 hour with binary logging enabled.
- **RTO (Recovery Time Objective):** <= 30 minutes to restore a full snapshot.
- **Scope:** Complete MySQL database (`veepower_db`) covering all 8 business data domains:
  1. `users` (auth, customer profiles, addresses)
  2. `products` (categories, brands, products, variants)
  3. `orders` (orders, order items, status transitions)
  4. `inventory` (stock items, stock transactions, warehouses)
  5. `quotations` (B2B quotations, inquiry negotiation records)
  6. `invoices` (tax invoices, sequence numbering)
  7. `payments` (transactions, audit logs)
  8. `django system tables` (migrations, content types, sessions)

---

### 2. Backup Script Tooling (`scripts/db_backup_restore.sh`)

The repository includes a production-grade utility script:

```bash
# Generate full logical backup with transaction isolation
./scripts/db_backup_restore.sh backup
```

The script utilizes:
```bash
mysqldump -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  ${DB_NAME} > ${BACKUP_FILE}
```
- `--single-transaction`: Ensures snapshot consistency across tables without locking reads or writes in InnoDB.
- `--quick`: Streams rows directly from the server to minimize container memory footprint.
- `--routines & --triggers`: Preserves stored procedures, triggers, and table metadata.
- `--default-character-set=utf8mb4`: Prevents Unicode corruption.

---

### 3. Backup Retention Schedule

| Schedule | Frequency | Retention Period | Storage Location |
|---|---|---|---|
| **Daily Full** | Once every 24h at 02:00 UTC | 7 days | Encrypted S3 / Cloud Storage bucket with object lock |
| **Weekly Snapshot** | Every Sunday at 03:00 UTC | 4 weeks | Cold storage (e.g., AWS S3 Glacier / GCS Nearline) |
| **Monthly Archive** | 1st of every month | 12 months | Immutable archive storage |

---

### 4. Restoration Procedure

#### Step 1: Locate Target Backup File
List available backups in `backups/`:
```bash
ls -lh backups/*.sql
```

#### Step 2: Validate Backup Integrity
Ensure the dump ends with a successful completion comment:
```bash
tail -n 5 backups/veepower_backup_<timestamp>.sql | grep "Dump completed"
```

#### Step 3: Execute Restoration
Run the restore command:
```bash
./scripts/db_backup_restore.sh restore backups/veepower_backup_<timestamp>.sql
```

#### Step 4: Verify Data Fidelity
Execute database validation query across core models:
```bash
docker exec veepower_backend python -c "
import django; django.setup()
from apps.users.models import User
from apps.catalog.models import Product
from apps.orders.models import Order
print(f'Restoration verified: Users={User.objects.count()}, Products={Product.objects.count()}, Orders={Order.objects.count()}')
"
```

---

### 5. Automated Verification Results (Phase 10 Drill)

During Phase 10 verification, a complete end-to-end backup and restore drill was executed against `veepower_restore_test`:

| Domain | Table Name | Source Rows | Restored Rows | Match Status |
|---|---|---|---|---|
| Users | `users_user` | 31 | 31 | **EXACT MATCH (100%)** |
| Catalog | `catalog_product` | 15 | 15 | **EXACT MATCH (100%)** |
| Orders | `orders_order` | 46 | 46 | **EXACT MATCH (100%)** |
| Order Items | `orders_orderitem` | 46 | 46 | **EXACT MATCH (100%)** |
| Inventory | `inventory_stocktransaction` | 50 | 50 | **EXACT MATCH (100%)** |
| Quotations | `quotations_quotation` | 7 | 7 | **EXACT MATCH (100%)** |
| Invoices | `invoices_invoice` | 6 | 6 | **EXACT MATCH (100%)** |
| Payments | `payments_paymenttransaction`| 1 | 1 | **EXACT MATCH (100%)** |
