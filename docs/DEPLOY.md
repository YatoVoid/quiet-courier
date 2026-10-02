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
| Editions | `/srv/quiet-courier/editions` (written by the Phase 4 build) |

## First-time setup

1. Check that port 3200 is free: `ss -ltnp | grep 3200`.
2. DNS: A records for `quietcourier.com` and `www` pointing at the server.
3. User and folders:
   ```sh
   sudo useradd --system --home-dir /srv/quiet-courier --create-home --shell /usr/sbin/nologin courier
   sudo -u courier mkdir -p /srv/quiet-courier/backups /srv/quiet-courier/editions
   sudo chmod 750 /srv/quiet-courier
   ```
4. Clone with a read-only deploy key in `/srv/quiet-courier/.ssh`, into `/srv/quiet-courier/app`.
5. Database. The role owns only its own database and is not a superuser:
   ```sh
   sudo -u postgres createuser --pwprompt quietcourier
   sudo -u postgres createdb --owner quietcourier quietcourier
   ```
6. `web/.env` from `web/.env.example`, mode 600, owned by `courier`. Set `RESEND_API_KEY` and `APP_URL=https://quietcourier.com`.
7. Install, migrate, build:
   ```sh
   sudo -u courier bash -c 'cd /srv/quiet-courier/app/web && npm ci --no-audit --no-fund && node db/migrate.mjs && npm run build'
   ```
8. systemd: copy `deploy/quiet-courier-web.service` to `/etc/systemd/system/`, then `daemon-reload`, `enable --now quiet-courier-web`.
9. nginx: copy `deploy/nginx-courier-limits.conf` to `/etc/nginx/conf.d/` and the site file to `sites-available`. Get the certificate first with `certbot certonly --nginx -d quietcourier.com -d www.quietcourier.com`, then link the site, `nginx -t`, and `systemctl reload nginx`. Reload, never restart.
10. Backups: `/etc/cron.d/quiet-courier-backup` with `15 3 * * * courier /srv/quiet-courier/app/deploy/backup.sh`. Restore one into a scratch database once to prove it works.

## Updating

```sh
sudo bash /srv/quiet-courier/app/deploy/deploy.sh
```

It refuses to run if tracked files were edited on the server. It backs up the database, pulls, installs, migrates, builds and restarts, and rolls back to the previous commit if the site doesn't answer within 30 seconds. Migrations that drop or truncate data are refused unless `ALLOW_DESTRUCTIVE_MIGRATION=<tag>` names that migration.

## Email

Resend has to verify the sending domain before anything is delivered. Add the DNS records Resend lists for `quietcourier.com` (SPF, DKIM, and a DMARC record) at the registrar. Readers approve the `MAIL_FROM` address in their Amazon settings, so changing it later means every reader has to approve the new one.
