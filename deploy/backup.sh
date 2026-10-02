#!/bin/bash
# Nightly database backup, kept for 30 days. Run from /etc/cron.d as the courier user.
set -euo pipefail
BACKUPS=/srv/quiet-courier/backups
url=$(grep -oP '(?<=^DATABASE_URL=).*' /srv/quiet-courier/app/web/.env)
umask 077
pg_dump -Fc -f "$BACKUPS/nightly-$(date +%F).dump" "$url"
find "$BACKUPS" -name '*.dump' -mtime +30 -delete
