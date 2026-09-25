#!/bin/sh
set -e

echo "=== Vee Power Electricals Backend ==="

# Wait for MySQL if USE_SQLITE is not enabled
USE_SQLITE_LOWER=$(echo "${USE_SQLITE:-False}" | tr '[:upper:]' '[:lower:]')
if [ "$USE_SQLITE_LOWER" != "true" ] && [ "$USE_SQLITE_LOWER" != "1" ] && [ "$USE_SQLITE_LOWER" != "t" ]; then
    echo "Waiting for MySQL database at ${DATABASE_HOST:-mysql}:${DATABASE_PORT:-3306}..."
    python - << 'EOF'
import os, sys, time, socket

host = os.environ.get('DATABASE_HOST', 'mysql')
port = int(os.environ.get('DATABASE_PORT', 3306))

start_time = time.time()
while True:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"Database ({host}:{port}) is reachable!")
            break
    except (socket.error, ConnectionRefusedError, socket.timeout):
        if time.time() - start_time > 60:
            print(f"Error: Timed out waiting for database at {host}:{port}")
            sys.exit(1)
        print(f"Waiting for database at {host}:{port}...")
        time.sleep(2)
EOF
fi

echo "Applying database migrations..."
python manage.py migrate --noinput

# Guard demo data seeding: run only if explicitly requested or in debug/dev environments
if [ "${SEED_DEMO_DATA:-False}" = "True" ] || [ "${SEED_DEMO_DATA:-False}" = "true" ] || [ "${DJANGO_DEBUG:-False}" = "True" ] || [ "${DJANGO_DEBUG:-False}" = "true" ]; then
    echo "Checking / Seeding initial demo data (Development/Staging)..."
    python manage.py seed_data || true
fi

echo "Starting backend process..."
exec "$@"
