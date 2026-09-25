#!/usr/bin/env bash
# ==============================================================================
# Vee Power Electricals — MySQL Database Backup & Restore Utility
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER_NAME="${DB_CONTAINER:-veepower_mysql}"
DB_NAME="${DATABASE_NAME:-veepower_db}"
DB_USER="${DATABASE_USER:-veepower}"
DB_PASS="${DATABASE_PASSWORD:-root}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

usage() {
    echo "Usage: $0 {backup|restore <filepath>|verify <filepath>}"
    exit 1
}

backup() {
    mkdir -p "$BACKUP_DIR"
    local TARGET_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"
    echo "Backing up database '$DB_NAME' from container '$CONTAINER_NAME' to '$TARGET_FILE'..."
    
    docker exec "$CONTAINER_NAME" mysqldump \
        --user="$DB_USER" \
        --password="$DB_PASS" \
        --single-transaction \
        --quick \
        --lock-tables=false \
        "$DB_NAME" > "$TARGET_FILE"
        
    echo "Backup completed successfully. Size: $(du -h "$TARGET_FILE" | cut -f1)"
}

verify() {
    local SQL_FILE="${1:-}"
    if [ -z "$SQL_FILE" ] || [ ! -f "$SQL_FILE" ]; then
        echo "Error: Backup file '$SQL_FILE' not found."
        exit 1
    fi
    echo "Verifying backup file integrity for '$SQL_FILE'..."
    if grep -q "Dump completed" "$SQL_FILE"; then
        echo "Backup verification PASSED: valid mysqldump structure."
    else
        echo "Backup verification FAILED: incomplete dump."
        exit 1
    fi
}

restore() {
    local SQL_FILE="${1:-}"
    if [ -z "$SQL_FILE" ] || [ ! -f "$SQL_FILE" ]; then
        echo "Error: Please specify an existing SQL backup file to restore."
        exit 1
    fi
    echo "WARNING: Restoring will overwrite data in '$DB_NAME' on container '$CONTAINER_NAME'."
    read -p "Are you sure you want to proceed? [y/N]: " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Restoring from '$SQL_FILE'..."
        docker exec -i "$CONTAINER_NAME" mysql \
            --user="$DB_USER" \
            --password="$DB_PASS" \
            "$DB_NAME" < "$SQL_FILE"
        echo "Restore completed successfully."
    else
        echo "Restore operation cancelled."
    fi
}

case "${1:-}" in
    backup)
        backup
        ;;
    verify)
        verify "${2:-}"
        ;;
    restore)
        restore "${2:-}"
        ;;
    *)
        usage
        ;;
esac
