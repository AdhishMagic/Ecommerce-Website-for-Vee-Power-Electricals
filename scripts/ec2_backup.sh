#!/bin/bash
set -e
cd /home/ubuntu/Ecommerce-Website-for-Vee-Power-Electricals
echo "=== STEP 1: Reading DB Credentials ==="
DB_USER=$(grep '^DATABASE_USER=' .env | cut -d= -f2- | tr -d '\r')
DB_PASS=$(grep '^DATABASE_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')
DB_NAME=$(grep '^DATABASE_NAME=' .env | cut -d= -f2- | tr -d '\r')
DB_NAME=${DB_NAME:-veepower_db}
DB_USER=${DB_USER:-veepower}

mkdir -p backups
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backups/${DB_NAME}_pre_seo_deploy_${TIMESTAMP}.sql"

echo "=== STEP 2: Creating Database Backup: $BACKUP_FILE ==="
docker exec veepower_mysql mysqldump \
    --user="$DB_USER" \
    --password="$DB_PASS" \
    --single-transaction \
    --quick \
    --no-tablespaces \
    --lock-tables=false \
    "$DB_NAME" > "$BACKUP_FILE"

echo "=== STEP 3: Verifying Backup File ==="
if grep -q "Dump completed" "$BACKUP_FILE"; then
    echo "Backup PASSED. Size: $(du -h "$BACKUP_FILE" | cut -f1), Lines: $(wc -l < "$BACKUP_FILE")"
else
    echo "ERROR: Backup file incomplete!"
    exit 1
fi
