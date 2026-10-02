#!/bin/bash
# Deploys the latest main on the server. Run as an admin: sudo bash /srv/quiet-courier/app/deploy/deploy.sh
set -euo pipefail

ROOT=/srv/quiet-courier
APP=$ROOT/app
WEB=$APP/web
BACKUPS=$ROOT/backups
PORT=3200
as_courier() { sudo -u courier bash -c "cd $WEB && $1"; }

if [ -n "$(as_courier 'git status --porcelain --untracked-files=no')" ]; then
  echo "tracked files were edited on the server; commit them in the repo instead" >&2
  exit 1
fi

stamp=$(date +%F-%H%M%S)
as_courier "umask 077 && pg_dump -Fc -f $BACKUPS/pre-deploy-$stamp.dump \"\$(grep -oP '(?<=^DATABASE_URL=).*' .env)\""
echo "backup: $BACKUPS/pre-deploy-$stamp.dump"

previous=$(as_courier 'git rev-parse HEAD')

up() {
  for _ in $(seq 30); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/signin)" = 200 ] && return 0
    sleep 1
  done
  return 1
}

# A failed build has already overwritten .next, so the running site breaks too. Rebuild the previous commit.
rollback() {
  echo "deploy failed, rolling back to $previous" >&2
  as_courier "git reset -q --hard $previous && npm ci --no-audit --no-fund && npm run build"
  systemctl restart quiet-courier-web
  if up; then echo "rolled back; the site is running $previous" >&2; else echo "ROLLBACK DID NOT COME UP, check journalctl -u quiet-courier-web" >&2; fi
  exit 1
}
trap rollback ERR

as_courier 'git pull --ff-only && npm ci --no-audit --no-fund'
# Before the build, so a refused migration fails while the running build is still intact.
as_courier 'node db/migrate.mjs'
as_courier 'npm run build'
sudo -u courier /srv/quiet-courier/venv/bin/pip install --quiet -e "$APP/pipeline"
systemctl restart quiet-courier-web
if ! up; then
  journalctl -u quiet-courier-web -n 40 --no-pager >&2
  false
fi
trap - ERR
echo "deployed $(as_courier 'git log --oneline -1')"
