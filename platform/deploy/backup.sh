#!/bin/bash
# Database dump plus the generated-media folder, 14 days kept. Installed as /usr/local/bin/tari-backup.
set -euo pipefail
DIR=/var/www/tari-studio/backups
STAMP=$(date +%Y%m%d-%H%M%S)
install -d -m 700 "$DIR"
sudo -u postgres pg_dump -Fc tari_studio > "$DIR/db-$STAMP.dump"
tar -C /var/www/tari-studio -czf "$DIR/storage-$STAMP.tgz" storage
find "$DIR" -type f -mtime +14 -delete
echo "$(date -Is) backup $STAMP ok"
