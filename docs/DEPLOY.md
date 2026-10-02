# Deploying the website

The site runs on a shared Ubuntu server that already hosts other sites behind nginx. Nothing here may change another site's config or restart a shared service.

| | |
|---|---|
| System user | `courier`, home `/srv/quiet-courier`, no login shell |
| Code | `/srv/quiet-courier/app` (this repo), site in `app/web` |
| Process | systemd `quiet-courier-web.service`, `next start` on 127.0.0.1:3200 |
| Database | Postgres database `quietcourier`, owned by role `quietcourier` |
| Proxy | nginx site `quietcourier.com`, certificate from Let's Encrypt |
| Backups | `/srv/quiet-courier/backups`, nightly, kept 30 days |
| Editions | `/srv/quiet-courier/editions`, built by the delivery job, kept 14 days |
| Delivery | systemd `quiet-courier-deliver.timer`, every 15 minutes, settings in `/srv/quiet-courier/pipeline.env` |
| Pipeline | Python 3.12 venv at `/srv/quiet-courier/venv`, article history in `/srv/quiet-courier/data/courier.db` |

## First-time setup

1. Check that port 3200 is free: `ss -ltnp | grep 3200`.
2. DNS: A records for `quietcourier.com` and `www` pointing at the server.
3. User and folders:
   ```sh
   sudo useradd --system --home-dir /srv/quiet-courier --create-home --shell /usr/sbin/nologin courier
   sudo -u courier mkdir -p /srv/quiet-courier/backups /srv/quiet-courier/editions
   sudo chmod 750 /srv/quiet-courier
   ```
4. The repo is public, so clone over HTTPS into `/srv/quiet-courier/app`. No deploy key needed.
5. Database. The role owns only its own database and is not a superuser:
   ```sh
   sudo -u postgres createuser --pwprompt quietcourier
   sudo -u postgres createdb --owner quietcourier quietcourier
   ```
6. `web/.env` from `web/.env.example`, mode 600, owned by `courier`. Set `RESEND_API_KEY` and `APP_URL=https://quietcourier.com`.
7. Install, migrate, build:
   ```sh
   sudo -u courier bash -c 'cd /srv/quiet-courier/app/web && npm ci --no-audit --no-fund && node db/migrate.mjs && node db/import-places.mjs && npm run build'
   ```
   The place list only needs reloading occasionally. Rerunning `node db/import-places.mjs` updates rows in place and never deletes any, since readers point at them.
8. systemd: copy `deploy/quiet-courier-web.service` to `/etc/systemd/system/`, then `daemon-reload`, `enable --now quiet-courier-web`.
9. nginx 1.18 on Ubuntu 22.04 doesn't know `http2 on;`, and turning HTTP/2 on in a `listen` line would turn it on for every site on port 443, so the site file leaves it off.
   1. Copy `deploy/nginx-courier-limits.conf` to `/etc/nginx/conf.d/`.
   2. The site file needs the certificate to exist, so get it first with a temporary port-80-only site: a `server` block for both names with `location /.well-known/acme-challenge/ { root /var/www/quietcourier-acme; }`, then `certbot certonly --webroot -w /var/www/quietcourier-acme -d quietcourier.com -d www.quietcourier.com`. This touches no other site's certificate. The final site file keeps serving that path on port 80, so renewals work.
   3. Replace the temporary file with `deploy/nginx-quietcourier.com.conf`, `nginx -t`, `systemctl reload nginx`. Reload, never restart.
10. Backups: `/etc/cron.d/quiet-courier-backup` with `15 3 * * * courier /srv/quiet-courier/app/deploy/backup.sh`. Restore one into a scratch database once to prove it works.

## Delivery job

The pipeline needs Python 3.11 or newer and Pango. Ubuntu 22.04 ships Python 3.10, so the venv uses a Python that `uv` installs under `/srv/quiet-courier`, leaving the system Python alone.

1. Pango, if it isn't there already (check with `dpkg -l libpango-1.0-0`). This is a shared package, so ask first: `sudo apt install libpango-1.0-0 libpangoft2-1.0-0`.
2. Python and the venv, as `courier`:
   ```sh
   sudo -u courier bash -c 'cd /srv/quiet-courier && curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/srv/quiet-courier/bin sh \
     && bin/uv python install 3.12 && bin/uv venv --python 3.12 venv && venv/bin/pip install -e app/pipeline'
   sudo -u courier mkdir -p /srv/quiet-courier/data /srv/quiet-courier/.cache
   ```
3. `/srv/quiet-courier/pipeline.env` from `deploy/pipeline.env.example`, mode 600, owned by `courier`. Put The Conversation's addresses in `PARTNER_COPY_TO` and `PARTNER_REPORT_TO` here, never in the repo.
4. Copy `deploy/quiet-courier-deliver.service` and `.timer` to `/etc/systemd/system/`, `daemon-reload`, then `systemctl enable --now quiet-courier-deliver.timer`.
5. Test it with `DELIVERY_ENABLED=0` first: `systemctl start quiet-courier-deliver` should log "nothing sent". Then set it to `1` in both `pipeline.env` and `web/.env` and restart the site.

Logs: `journalctl -u quiet-courier-deliver`. Problems are also emailed to `ALERT_EMAIL`.

## Updating

```sh
sudo bash /srv/quiet-courier/app/deploy/deploy.sh
```

It refuses to run if tracked files were edited on the server. It backs up the database, pulls, installs, migrates, builds and restarts, and rolls back to the previous commit if the site doesn't answer within 30 seconds. Migrations that drop or truncate data are refused unless `ALLOW_DESTRUCTIVE_MIGRATION=<tag>` names that migration.

## Email

Resend has to verify the sending domain before anything is delivered. Add the DNS records Resend lists for `quietcourier.com` (SPF, DKIM, and a DMARC record) at the registrar. Readers approve the `MAIL_FROM` address in their Amazon settings, so changing it later means every reader has to approve the new one.
