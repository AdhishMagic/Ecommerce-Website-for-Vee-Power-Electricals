#!/bin/bash
set -e

echo "=== Vee Power Electricals — Azure App Service Startup ==="

# Set production settings if not already provided in environment
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

# Collect static assets into STATIC_ROOT using production settings
echo "Collecting static assets with WhiteNoise..."
python manage.py collectstatic --noinput --settings="${DJANGO_SETTINGS_MODULE}" || true

# Launch production WSGI Gunicorn server
# Azure App Service sets $PORT dynamically (defaults to 8000)
LISTEN_PORT="${PORT:-8000}"
echo "Starting Gunicorn on port ${LISTEN_PORT}..."
exec gunicorn \
    --bind "0.0.0.0:${LISTEN_PORT}" \
    --workers 2 \
    --threads 4 \
    --timeout 600 \
    --access-logfile - \
    --error-logfile - \
    config.wsgi:application
