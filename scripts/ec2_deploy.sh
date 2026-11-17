#!/bin/bash
set -e
cd /home/ubuntu/Ecommerce-Website-for-Vee-Power-Electricals

echo "=== DEPLOY STEP 1: Git Pull ==="
git pull origin main
echo "Current commit: $(git rev-parse HEAD)"

echo "=== DEPLOY STEP 2: Applying Database Migrations ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend python manage.py migrate --noinput

echo "=== DEPLOY STEP 3: Collecting Static Assets ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend python manage.py collectstatic --noinput

echo "=== DEPLOY STEP 4: Building and Restarting Services ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend frontend

echo "=== DEPLOY STEP 5: Waiting for Health Checks ==="
sleep 8
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "=== DEPLOY STEP 6: Submitting URLs to IndexNow ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py submit_indexnow --all

echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
