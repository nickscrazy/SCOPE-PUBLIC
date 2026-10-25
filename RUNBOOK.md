# SCOPE operations runbook

Single-instance service: one container, one SQLite database on a persistent local volume, behind a TLS-terminating reverse proxy. **Do not run more than one replica** against the same database, and do not use network or ephemeral storage for `/data`.

## 1. Prerequisites

| Need | Notes |
| --- | --- |
| Linux host with Docker 24+ | 1 vCPU / 1 GB RAM is ample for early use |
| Persistent disk for `/data` and `/backups` | Local SSD; back `/backups` up off-host |
| Domain + TLS reverse proxy | Caddy, nginx or a managed load balancer; forwards to `127.0.0.1:3000` |
| SMTP provider | Any provider with SMTP credentials; SPF/DKIM/DMARC configured for the sender domain |
| Outbound HTTPS to `api.ted.europa.eu` | For TED ingestion |
| Optional: Stripe account | Only to sell Solo; see §7 |
| Optional: alert endpoint | Any HTTPS webhook accepting JSON (Slack/Teams/incoming-webhook relay) |

## 2. Configure

Create `.env.production` (never commit it; `chmod 600`). Start from `.env.example`. Required in production (the app refuses to start otherwise):

```dotenv
APP_ENV=production
BASE_URL=https://scope.example.mt
TRUST_PROXY=1                      # number of proxy hops in front of the app
EMAIL_PROVIDER=smtp
SMTP_URL=smtps://USER:PASSWORD@smtp.provider.example:465
EMAIL_FROM=SCOPE <no-reply@scope.example.mt>
BACKUP_ENCRYPTION_KEY=<openssl rand -hex 32>   # keep a copy OUTSIDE the server
TED_SYNC_ENABLED=true
LEGAL_OPERATOR_NAME=<registered entity>
LEGAL_OPERATOR_ADDRESS=<registered address>
LEGAL_CONTACT_EMAIL=privacy@scope.example.mt
LEGAL_REVIEWED=false               # set true only after legal sign-off
```

Production also refuses Stripe test keys, the file outbox, plain-HTTP `BASE_URL`, and changing `RATE_LIMIT_MULTIPLIER`.

Reverse proxy (Caddy example):

```caddy
scope.example.mt {
  reverse_proxy 127.0.0.1:3000
}
```

The proxy must pass `X-Forwarded-For` (Caddy and nginx defaults do) so per-IP rate limits see client addresses.

## 3. Start

```bash
docker compose --env-file .env.production build      # or pull a tagged image
SCOPE_ENV_FILE=.env.production docker compose up -d
docker compose logs -f scope
```

The entrypoint runs `migrate` (taking an encrypted pre-migration backup when migrations are pending) and then starts the server. Then:

```bash
docker compose exec scope node dist/cli.js seed                 # reviewed funding references (idempotent)
docker compose exec scope node dist/cli.js sync-ted --full       # first TED import; afterwards the scheduler runs
```

Create the first operator: sign up in the browser, confirm the email, then

```bash
docker compose exec scope node dist/cli.js admin-role you@scope.example.mt admin
```

Role changes sign the account out everywhere; log in again. Grant `editor` and `reviewer` to *different people* — publication requires two distinct accounts.

Behind a TLS-intercepting egress proxy, build with `docker build --secret id=extra_ca,src=/path/to/ca.pem .`; the CA is not stored in the image.

## 4. Monitor

| Signal | Where | Action |
| --- | --- | --- |
| Liveness | `GET /api/health` → 200 | Container healthcheck uses `/api/ready` |
| Readiness | `GET /api/ready` → 200 `ready` / 503 | 503 means database unreadable or migrations pending |
| TED freshness | `/api/ready` → `checks.tedSource.stale`; Operations tab | Stale after `TED_STALE_HOURS` (36h) without success |
| Sync failures | `ALERT_WEBHOOK_URL` gets `ted_sync_failing` after 2 consecutive failures and `ted_sync_recovered`; an incident with a customer banner opens automatically | Check `docker compose logs scope | grep ingestion`; TED status page; outbound network |
| Requests | JSON logs, event `http.request` (method, route, status, ms; no personal data) | Ship stdout to your log platform; alert on 5xx rate |
| Email | events `email.sent` / `email.failed` | Failed verification/reset emails mean SMTP credentials or reputation issues |
| Billing | events `billing.webhook` (`outcome`) and `billing.webhook_rejected` | Rejections usually mean a wrong `STRIPE_WEBHOOK_SECRET` |

Point an external uptime monitor at `/api/ready`. Logs contain no email addresses, IPs, tokens or profile text.

## 5. Scheduled work

With `TED_SYNC_ENABLED=true` the app schedules itself (UTC): TED sync at `TED_SYNC_HOURS_UTC` (default 05:00 and 17:00) and retention maintenance at 03:00. A database lease prevents overlapping runs and closes runs abandoned by a crash. Equivalent manual commands:

```bash
docker compose exec scope node dist/cli.js sync-ted
docker compose exec scope node dist/cli.js maintenance
```

Retention applied by maintenance: expired sessions; used/expired tokens; unconfirmed accounts after `UNVERIFIED_ACCOUNT_DAYS` (30); analysis counters after ~13 months; audit log after `AUDIT_RETENTION_DAYS` (365); sync runs after 180 days; billing event ids after 400 days; reviewed inbound messages after 90 days.

## 6. Backup and restore

Backups are online, transactionally consistent snapshots (`VACUUM INTO`), integrity-checked, AES-256-GCM encrypted with `BACKUP_ENCRYPTION_KEY`, with a SHA-256 sidecar, pruned after `BACKUP_RETENTION_DAYS`.

Daily backup (host cron), then copy off-host:

```cron
15 2 * * * cd /srv/scope && docker compose exec -T scope node dist/cli.js backup daily >> /var/log/scope-backup.log 2>&1
45 2 * * * rsync -a /var/lib/docker/volumes/scope_scope-backups/_data/ backup-host:/scope/
```

Verify a backup without touching live data:

```bash
docker compose exec scope node dist/cli.js verify-backup /backups/<file>.db.enc
```

Restore (keeps the current database as `scope.db.pre-restore-<time>`):

```bash
docker compose stop scope
docker compose run --rm --entrypoint node scope dist/cli.js restore /backups/<file>.db.enc
docker compose start scope
```

Run a restore drill monthly; `scripts/container-test.ts` performs one automatically. Losing `BACKUP_ENCRYPTION_KEY` makes backups unrecoverable — store it in a password manager or secrets vault separate from the backups.

Erasure: a deleted account disappears from new backups immediately and from older backups when they expire (`BACKUP_RETENTION_DAYS`). Do not keep long-term archives without updating the privacy notice.

## 7. Billing (when approved)

1. In Stripe: create product **Solo** with a monthly recurring price; note `price_...`.
2. Webhook endpoint `https://<domain>/api/billing/webhook`, events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Note `whsec_...`.
3. Enable the Customer Portal (cancel, update payment method).
4. Configure `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO`, `SOLO_PRICE_LABEL`. Use a **staging** deployment with test keys first (production refuses test keys).
5. Test in staging: checkout with test card `4242…`, confirm plan becomes Solo only after the webhook, cancel in the portal, confirm downgrade at period end, failed renewal (`4000 0000 0000 0341`), account deletion cancels the subscription.
6. Configure VAT/tax in Stripe with your accountant before going live.

## 8. Upgrade

```bash
docker compose exec scope node dist/cli.js backup pre-upgrade      # explicit safety copy
docker tag scope:local scope:previous                               # keep the running image
git pull && docker compose build
docker compose up -d                                                # entrypoint migrates (with its own pre-migration backup)
curl -fsS https://<domain>/api/ready
```

## 9. Roll back

Migrations are forward-only. To return to the previous release:

```bash
docker compose stop scope
ls /var/lib/docker/volumes/scope_scope-backups/_data/ | grep pre-migration   # newest one from the failed upgrade
docker compose run --rm --entrypoint node scope dist/cli.js restore /backups/<pre-migration file>
SCOPE_VERSION=previous docker compose up -d --no-build
```

Data written after the upgrade is lost by a rollback; prefer a forward fix when the release has been live for long. `scripts/container-test.ts` exercises exactly this path against the Codex baseline image.

## 10. Incident handling

- **TED down/failing**: nothing to do immediately — earlier data is kept and labelled stale; a customer banner appears automatically after two failures and clears on recovery. If prolonged, add an operator note via Operations → Incidents.
- **Suspected account compromise**: ask the user to reset their password (revokes all sessions). An operator can revoke all sessions for a user with `admin-role <email> user` (role change revokes sessions).
- **Data protection request**: users self-serve export/deletion in Account & plan. For other requests use the audit log (pseudonymous ids) and the database; record the handling.
- **Leaked secret**: rotate it (SMTP password, Stripe keys/webhook secret, `INBOUND_EMAIL_SECRET`), restart. If `BACKUP_ENCRYPTION_KEY` leaked, generate a new key, take a new backup, and destroy older backups.

## 11. Alert-email ingestion (optional)

Manual: Operations → Alert emails → upload `.eml`. Automated: configure your mail provider's inbound route to POST the raw message to `https://<domain>/api/inbound/email` with headers `X-Scope-Timestamp: <unix seconds>` and `X-Scope-Signature: sha256=<hex HMAC-SHA256(INBOUND_EMAIL_SECRET, "<timestamp>.<raw body>")>`. Only forward alerts you are entitled to receive. Messages wait for editor review; nothing is imported automatically.
