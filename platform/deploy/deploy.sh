#!/bin/bash
# Deploys the code that is in /var/www/tari-studio/app (pull or copy it there first), as root:
#   sudo bash /var/www/tari-studio/app/deploy/deploy.sh
# Builds with low priority so the other sites on the server keep their CPU, takes a database backup
# first, applies migrations, restarts only the two Tari units and checks /api/health.
set -euo pipefail
APP_DIR=/var/www/tari-studio/app
cd "$APP_DIR"

echo "== backup before changing anything"
/usr/local/bin/tari-backup

echo "== install and build (as the tari user, niced)"
sudo -u tari bash -c "cd $APP_DIR && nice -n 15 npm ci --no-audit --no-fund && nice -n 15 npx prisma generate"
set -a; . ./.env; set +a
sudo -u tari --preserve-env=DATABASE_URL bash -c "cd $APP_DIR && npx prisma migrate deploy"
sudo -u tari --preserve-env=NEXT_PUBLIC_PRODUCT_NAME bash -c "cd $APP_DIR && NODE_OPTIONS=--max-old-space-size=2048 nice -n 15 npx next build"

echo "== restart (worker finishes its current job first)"
systemctl restart tari-web
systemctl restart tari-worker

echo "== health"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3400/api/health | grep -q '"status":"ok"'; then echo "healthy"; exit 0; fi
  sleep 2
done
echo "NOT healthy: journalctl -u tari-web -u tari-worker -n 80"; exit 1
