# SCOPE

Public tenders and government funding for Maltese SMEs, ranked against what a business actually does, with the official source and the unknowns shown for every match.

**Release status: `BETA_READY_WITH_BLOCKERS`** — see [RELEASE_REPORT.md](RELEASE_REPORT.md), and [REPAIR_REPORT.md](REPAIR_REPORT.md) for the two P1 defects an independent review found in `e89af21` and how they were repaired. The software is complete and tested for the Free/trial product; public launch still needs external items (legal operator, SMTP provider, independent security review, and — for paid plans — a live Stripe account). Nothing has been publicly deployed and no live payment or customer email has been sent.

| Document | Purpose |
| --- | --- |
| [REPAIR_REPORT.md](REPAIR_REPORT.md) | **Latest:** repairs made after the independent review — both P1 defects, before/after reproductions, deferred debt |
| [RELEASE_REPORT.md](RELEASE_REPORT.md) | Independent review of the Codex build, repairs, executed evidence, verdict, launch steps |
| [RUNBOOK.md](RUNBOOK.md) | Deploy, configure, monitor, back up, restore, upgrade, roll back |
| [SECURITY.md](SECURITY.md) | Threat model, controls, residual risks, items needing external review |
| [HANDOFF.md](HANDOFF.md) | Brief for an independent Codex security and functional review |
| [evidence/repairs/](evidence/repairs/) | Evidence for the repair round: browser results, accessibility audit, screenshots |
| [evidence/release/](evidence/release/) | Raw output of every check in the `e89af21` release, screenshots |
| [evidence/codex-baseline/](evidence/codex-baseline/) | Codex's original evidence, `BUILD_REPORT.md` and `NEXT_STEPS.md`, unmodified |

## Run locally

Requires **Node 24+**.

```bash
cp .env.example .env          # local defaults: outbox email, billing disabled
npm ci
npm run db:migrate
npm run db:seed               # reviewed funding references only; no fictional data
npm run dev                   # http://localhost:3000
npm run sync:ted -- --full    # optional: live import of Maltese TED notices (public API)
```

Sign up at `/signup`. Email is delivered to `./data/outbox/*.json` in local mode; open the `verify_email` message and follow its link to confirm the address and start the trial. To use the operations console, grant a role to a confirmed account:

```bash
npm run admin:role -- you@example.com admin     # user | editor | reviewer | admin
```

## What the product does

- **Accounts**: email confirmation, password reset, password and email change, device sessions with revocation, full data export, account deletion.
- **Plans**: Free (3 detailed analyses per UTC month, 5 saves), a one-time 7-day trial that starts on email confirmation, and Solo (paid) when Stripe is configured. Entitlements are computed on the server from webhook-verified state only.
- **Discovery**: TED contract notices from Maltese buyers plus a reviewed Maltese funding catalogue (grants, tax credits, loans, other incentives). Closed, superseded and awarded notices are hidden by default; sorting, filters, saved records and side-by-side comparison.
- **Assessment**: relevance (0–100, never eligibility) and three separate dimensions — eligibility conditions (`appears_met` / `unmet` / `unknown`), financial fit, delivery capacity — each with its evidence and source locator.
- **Operations console** (`/app/admin`, role-gated): TED sync health and manual refresh, incidents with optional customer banner, four-eyes editorial workflow for funding references, tender-alert email ingestion, audit log.

## Matching

`server/matching.ts` is deterministic and shared with the public demo.

| Relevance signal | Points |
| --- | --- |
| Distinct stemmed service terms found in the record | 12 each, max 30 |
| CPV classification matches the CPV divisions mapped from your services | 20 |
| Sector match | 15 |
| Preferred geography | 10 |
| Published value within preferred range | 10 |
| Current credential relates to subject / is explicitly required | 5 + 5 |
| Intended role listed | 5 |
| Experience/project term overlap | 5 |

Multipliers: outside requested opportunity types ×0.35; closed (deadline passed, superseded or result published) ×0.5; published over 90 days ago ×0.85. Capped at 100.

Separately: **eligibility** summarises explicit source conditions (any `unmet` is a blocker; any `unknown` means "to confirm"); **financial fit** compares value with preferences and the declared turnover band against the Directive 2014/24/EU Art. 58(3) ceiling (a buyer may normally require up to 2× the contract value as minimum turnover); **capacity** compares explicit staffing conditions with declared staff. TED metadata does not include selection criteria, so tender conditions remain `unknown` until documents are reviewed.

## Sources

- **TED** (`POST https://api.ted.europa.eu/v3/notices/search`): `buyer-country = MLT`, contract notices (`cn-standard`, `cn-social`) plus result notices, rolling 90-day window, incremental after the first success, twice daily when `TED_SYNC_ENABLED=true`. Notices sharing a `procedure-identifier` are linked: a newer notice supersedes older ones; a result notice closes the procedure.
- **Funding catalogue**: entries are drafted by an editor and published only after a *different* reviewer attests an official-source check; re-verification falls due after `EDITORIAL_REVIEW_DAYS`. Only approved government hosts may be cited.
- **Tender alert emails**: uploaded `.eml` or HMAC-signed webhook; links are classified, never fetched; TED notices are imported only from the official API after editor review.
- **Not covered**: Malta ePPS (its terms prohibit automated access); no scraping or 403 bypass anywhere.

## Tests

```bash
npm run lint && npm run typecheck
npm test                     # 96 unit/integration/adversarial tests
npm run build
npm run test:e2e             # 10 Chromium scenarios on the production build (+ axe audit)
npm run smoke:prod           # production process boot, verification, restart persistence
docker build -t scope:rc . && npx tsx scripts/container-test.ts   # container deployment drill
```

Set `CHROMIUM_PATH` if Playwright's bundled browser is not installed. Test databases and outboxes live under `data/` and never touch `data/scope.db`.

## Layout

```text
server/            API (app.ts, routes-*.ts), auth, billing, email, ingestion (ted.ts, inbound.ts),
                   editorial workflow, jobs/scheduler, backups, operator CLI (cli.ts), migrations/
src/               React UI: public pages, auth, app, settings, operations console
tests/             vitest suites, Playwright browser suite, fixtures
scripts/           production smoke test, container deployment test
deploy/            container entrypoint
brief/             original product, design, evidence and source specifications
```
