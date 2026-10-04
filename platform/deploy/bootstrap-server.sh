#!/bin/bash
# One-time setup of Tari Studio on a shared Ubuntu 24.04 VPS. Run as root, from the app folder:
#   sudo bash deploy/bootstrap-server.sh taristudio.africa
#
# It only ADDS things: a Postgres server, a `tari` system user, a database, two systemd units and one
# nginx site. It never restarts nginx or touches another site's files, units or certificates; nginx is
# validated (`nginx -t`) and then reloaded. Re-running is safe.
set -euo pipefail

DOMAIN="${1:?usage: bootstrap-server.sh <domain>}"
APP_USER=tari
APP_DIR=/var/www/tari-studio
APP_PORT=3400
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== 1. Is the port free, and does the domain resolve here?"
if ss -tln | grep -q ":${APP_PORT} "; then
  echo "Port ${APP_PORT} is already in use. Pick another and edit deploy/*.service and deploy/nginx.conf first."; exit 1
fi
SERVER_IP="$(curl -4fsS https://ifconfig.me || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)"
echo "server ${SERVER_IP:-?}  domain ${DNS_IP:-<does not resolve>}"
[ -n "$DNS_IP" ] && [ "$DNS_IP" = "$SERVER_IP" ] || echo "WARNING: the domain does not point at this server yet; the certificate step will be skipped."

echo "== 2. Postgres (new packages only; listens on localhost)"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l NEEDRESTART_SUSPEND=1
if ! command -v psql >/dev/null; then apt-get install -y --no-install-recommends postgresql; fi
systemctl enable --now postgresql

echo "== 3. System user, folders, database"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$APP_DIR/app" "$APP_DIR/storage" "$APP_DIR/backups"
DB_PASS_FILE=/root/.tari-db-pass
[ -f "$DB_PASS_FILE" ] || (umask 077; openssl rand -hex 24 > "$DB_PASS_FILE")
DB_PASS="$(cat "$DB_PASS_FILE")"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='tari'" | grep -q 1 \
  || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE tari LOGIN PASSWORD '${DB_PASS}'"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='tari_studio'" | grep -q 1 \
  || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE tari_studio OWNER tari"
sudo -u postgres psql -c "ALTER DATABASE tari_studio SET timezone TO 'UTC'"

echo "== 4. Environment file (secrets are generated here and never leave this server)"
ENV_FILE="$APP_DIR/app/.env"
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  sed -e "s#__DOMAIN__#${DOMAIN}#g" \
      -e "s#__DB_PASS__#${DB_PASS}#g" \
      -e "s#__AUTH_SECRET__#$(openssl rand -base64 48 | tr -d '\n')#g" \
      -e "s#__CREDENTIALS_KEY__#$(openssl rand -base64 32 | tr -d '\n')#g" \
      -e "s#__HEALTH_TOKEN__#$(openssl rand -hex 16)#g" \
      "$HERE/env.production.example" > "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE. Add SMTP and provider keys there, or later in Platform admin -> Settings."
else
  echo "$ENV_FILE already exists; left untouched."
fi
echo "Back up CREDENTIALS_KEY from $ENV_FILE somewhere safe: losing it makes stored channel tokens unreadable."

echo "== 5. systemd units"
install -m 644 "$HERE/tari-web.service" /etc/systemd/system/tari-web.service
install -m 644 "$HERE/tari-worker.service" /etc/systemd/system/tari-worker.service
systemctl daemon-reload
systemctl enable tari-web tari-worker

echo "== 6. nginx site (validated, then reloaded - never restarted)"
sed "s#__DOMAIN__#${DOMAIN}#g" "$HERE/nginx.conf" > "/etc/nginx/sites-available/${DOMAIN}"
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
if nginx -t; then nginx -s reload; else rm -f "/etc/nginx/sites-enabled/${DOMAIN}"; echo "nginx config invalid; site removed, nothing reloaded"; exit 1; fi

echo "== 7. Nightly backup"
install -m 755 "$HERE/backup.sh" /usr/local/bin/tari-backup
echo '17 2 * * * root /usr/local/bin/tari-backup >> /var/log/tari-backup.log 2>&1' > /etc/cron.d/tari-backup

echo "== 8. HTTPS certificate"
if [ -n "$DNS_IP" ] && [ "$DNS_IP" = "$SERVER_IP" ]; then
  certbot --nginx -d "$DOMAIN" -d "www.${DOMAIN}" --redirect --agree-tos -m phinetechltd@gmail.com --non-interactive || \
    echo "certbot failed; check that both ${DOMAIN} and www.${DOMAIN} resolve to ${SERVER_IP}"
  nginx -t && nginx -s reload
else
  echo "Skipped. Once DNS points here run: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --redirect"
fi

echo "Done. Next: deploy the code with deploy/deploy.sh, then create the first admin with deploy/create-admin.sh."
