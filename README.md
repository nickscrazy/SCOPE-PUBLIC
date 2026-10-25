# SCOPE

Business opportunity intelligence for Malta + EU SMEs. A designed public site and a working multi-user application with source-linked records, deterministic relevance and explicit qualification gaps.

**Completion verdict: FUNCTIONAL_PROTOTYPE.** Live TED ingestion was exercised, but this is not a production or commercially connected beta. See [BUILD_REPORT.md](BUILD_REPORT.md) for evidence and limits, and [NEXT_STEPS.md](NEXT_STEPS.md) for operational/commercial work. No public deployment, payment, email or official submission has occurred.

## Run locally

Requires **Node 24+** and npm. No cloud account, database service, model key or billing credentials are needed.

```bash
cd /workspace/scope
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. Use the hostname matching `BASE_URL`: the API checks request origins. Register your own account at `/signup`; there are no shared credentials. The main database is `data/scope.db`. Stop and start the process to confirm that accounts, profiles, sessions and saved records persist. The application also runs pending migrations on start.

`db:seed` adds two checked FONDI funding references and one explicitly unverified Malta Enterprise reference. It does **not** invent open opportunities, advance verification dates, create users or copy fictional demo records into the account catalogue. The fictional examples at `/demo` live separately in `src/demo-data.ts`.

To add recent Maltese contract notices from the permitted official TED API:

```bash
npm run sync:ted
```

The implemented import requests at most **3 pages × 30 records**, sorted newest first, from the previous 90 days, with Maltese buyers and `cn-standard` notices. This is a bounded sample of published notices, not complete coverage or a guarantee of currently open tenders. The build imported **90 notices** on 25 October 2026. A later run may produce different records. The importer uses the inherited proxy when configured through Node 24's `NODE_USE_ENV_PROXY=1`. Failures return a nonzero exit code, record a safe error and retain prior good data. No ePPS requests are made.

Environment variables:

| Variable             | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `PORT`               | HTTP port, default 3000                                     |
| `BASE_URL`           | Canonical browser origin, default `http://localhost:3000`   |
| `DATABASE_PATH`      | Persistent SQLite file, default `./data/scope.db`           |
| `NODE_ENV`           | `production` enables static serving, CSP and Secure cookies |
| `NODE_USE_ENV_PROXY` | Set to `1` for Node HTTP proxy support when needed          |
| `CHROMIUM_PATH`      | Browser-test executable; defaults to `/usr/bin/chromium`    |

CLI database commands and the server read `.env`. Do not commit it. No secrets are required for the prototype. Production requires HTTPS and a real canonical `BASE_URL`; do not disable TLS or Secure cookies to expose the service.

## Try the complete flow

1. Open `/`, `/how-it-works`, `/pricing` and `/demo`. In the demo, switch business and add ISO 9001; observe reranking and Unknown → Appears met. All demo records are fictional.
2. Create an account at `/signup`. The server records one exact seven-day trial; no card is requested. `/signup?plan=free` instead creates a Free account that can activate its trial later.
3. Complete the four profile steps. Services, sectors, experience, past projects, credential dates, staff/contractors, capacity, turnover bands, geography, project range, role and interests are editable. Unknown inputs can remain blank.
4. Discover records, filter, open a detail, inspect condition status and original source, and save it. Log out and back in from another browser session; profile and saves remain.
5. Account settings show server-computed plan/usage, one-time trial activation, profile JSON export and confirmed profile deletion. Deletion preserves the account and saved records; full account deletion currently needs an operator.

## Entitlements

- **Free:** basic browsing, 3 distinct detailed analyses per **UTC calendar month**, up to 5 saved records, one profile. Revisiting a record already analysed that month costs no extra credit. The list API does not return detailed condition evaluations.
- **Trial:** exactly 7 × 24 hours from first activation, server-persisted, once per account. Analyses and saves are unlimited within request limits. Trial analyses do not consume subsequent Free credits.
- **Expiry:** the server computes Free automatically; there is no background timer dependency. Existing saves remain even above five; adding new ones is blocked until below the allowance.
- **Paid:** unavailable. Solo €19/month is an experimental hypothesis; Team €59/month and shared workspaces are future concepts, not implemented features. No checkout exists.

Changing browser storage, supplying plan fields or editing client code does not change permissions. Account attempt limits are 15 per IP per 15 minutes; detail/save limits are 120 per IP per hour. These are pragmatic local limits; a production proxy/IP policy and verified account ownership need review.

## Matching and evidence

`server/matching.ts` is deterministic and shared with the isolated public demo:

| Signal                                                              | Points                |
| ------------------------------------------------------------------- | --------------------- |
| Distinct service token overlap (common English stop words excluded) | 12 each, capped at 35 |
| Sector matches metadata or tags                                     | 20                    |
| Preferred geography                                                 | 15                    |
| Known value within preferred project range                          | 10                    |
| Current credential subject overlap                                  | 5                     |
| Current exact credential explicitly required by source              | 5                     |
| Intended role explicitly listed in the record                       | 5                     |
| Relevant experience/project token                                   | 5                     |

A tender/grant outside the user's stated interest is multiplied by 0.35 and rounded. A known passed deadline multiplies the score by 0.5; a publication older than 90 days multiplies it by 0.85 (rounded at each step). Unknown dates incur no invented deadline penalty. Final scores are capped at 100. CPV prefixes supply broad sector tags; English lexical matching has known recall/precision limits and is not semantic or legal analysis. Staff and turnover support condition assessment where reliable explicit requirements and corresponding profile facts exist; no threshold is invented. Contractor counts and available capacity are retained for business context but do not yet add independent ranking signals or imply selection requirements.

Conditions evaluate separately as `appears_met`, `unmet` or `unknown`. Exact declared credentials and staff/turnover thresholds can support an indicative result. Missing credentials remain unknown; known expired/future credentials and insufficient staff are unmet. Dates are inclusive UTC calendar dates. A turnover band spanning a threshold remains unknown. Geographic preference never establishes legal domicile. All profile facts are self-declared, not independently certified.

The current TED adapter reads published metadata, **not full selection documents**. Its mandatory conditions remain unknown. It only assigns a notice-wide deadline when a single date and a single explicitly zoned time are supplied; multi-lot or incomplete deadlines remain unknown. It only normalises procedure values explicitly denominated in EUR. Grant conditions, co-financing and aid history remain unknown pending review. A high relevance score does not override a blocker or certify eligibility.

## Sources and operator imports

- TED API documentation: <https://docs.ted.europa.eu/api/latest/search.html>; official request: `POST https://api.ted.europa.eu/v3/notices/search`.
- FONDI SME Enhance and Digitalise your SME: reference facts reviewed from official pages on 25 October 2026; individual rules and opening status are not certified.
- Malta Enterprise Micro Invest: 403 during this build. Its reference is visibly unverified, correctly labelled tax credit, and not represented as open. The supplied brief's 2027 submission date is attributed, not independently verified.
- SEM page: 403 during checking; no bypass attempted. Digitalise uses the reachable FONDI source instead.
- No automated ePPS access, complete EU-wide search coverage, inbox connection, attachment fetching or tender/grant submissions.

Each record retains source identity, URL, publication/check/retrieval dates and a source version. `opportunity_versions` stores content hashes and revisions; source identity is unique, while `first_seen_at` and `last_seen_at` are retained separately. Repeat imports update records without duplicates. All pages are validated before one atomic upsert. Previous records remain after failures; the feed and record freshness expose the failure. Source checks older than seven days are explicitly stale. Re-seeding never refreshes check dates.

A **trusted operator with database/filesystem access** can manually import reviewed grants JSON:

```bash
npm run import:grants -- /absolute/path/to/reviewed-catalogue.json
```

Use the shape in `server/catalogue.ts` (`grantsCatalogue`) and `curatedImportSchema`. Limit: 100 records / 1 MiB. Source hostnames are restricted to approved official HTTPS hosts; arbitrary URLs, invalid types and future check dates are rejected. Stable `id` and `(source, sourceId)` must be preserved. The operator must verify facts before assigning `verifiedAt`; the CLI does not fetch URLs or confer verification. It stores text as data. There is no public upload/admin endpoint or email parser. Reviewer identities and editorial approvals need a future admin workflow.

## Tests and evidence

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run smoke:prod
```

Browser tests require an installed Chromium (`CHROMIUM_PATH=/your/chromium npm run test:e2e`). They launch the **production build** at port 3100 and reset only `data/e2e.db`. They never touch `data/scope.db`. If Chromium is absent, install it through your environment's approved mechanism before running; no browser execution should be claimed otherwise.

- `tests/core.test.ts`: auth, session expiry/logout, tenant isolation, real-file restart persistence, profile edits, unknown/unmet conditions, trial clock injection, Free quota, saves, filters, hostile input, CSRF and request limits.
- `tests/ted.test.ts`: actual recorded payload parsing, synthetic replay pagination, revision history/deduplication, retries, failure atomicity, malformed/timed-out responses and permission errors. Synthetic IDs are test-only; the recorded payload is public TED data from the actual request in this build.
- `tests/browser/product.spec.ts`: public routes, mobile navigation, keyboard/reduced motion, meaningful demo changes, complete onboarding, return login and persistence, source links, quota bypass, browser account isolation, HTML escaping, profile export/deletion, all four target widths, axe audits.
- `evidence/screenshots/`: actual Chromium captures of desktop/mobile public and app views. Screenshots were visually inspected. Automated audit results are in `evidence/accessibility-results.json`; this is not a full accessibility certification.

## Production build and deployment preparation

```bash
npm run build
npm run db:migrate:prod
npm run db:seed:prod
npm start
# Optional operator sync after reviewing coverage:
npm run sync:ted:prod
```

Compiled CLI commands use only production dependencies. Run from the repository root; migrations are read from `server/migrations/`. The application serves `dist/client` and the API on one origin. `/api/health` checks database readability without returning personal data. Keep SQLite files outside any static directory. The process must have write permission to the database directory (including WAL/SHM files) and the `evidence/` directory used by the sync summary command.

A non-root Node 24 [Dockerfile](Dockerfile) and loopback-only [compose.yaml](compose.yaml) are supplied. **They were not built or deployed in this environment.** After authorisation and target-runtime review:

```bash
docker compose build
docker compose run --rm scope node dist/seed.js
docker compose up -d
```

Set `BASE_URL` to your actual HTTPS origin and terminate TLS at a reverse proxy. The default published port binds only to loopback. Preserve the `scope-data` volume across releases. Use a **single application replica on persistent storage**; SQLite and this migration runner are not designed for multi-replica distributed writes. Do not use ephemeral/serverless storage. Run bounded scheduled TED syncs with the same volume and approved network/proxy configuration; there is no enabled scheduler.

Before any public service: independent security/privacy review, verified email/recovery, monitored errors/syncs, encrypted backups and restore drills, source/eligibility qualification and commercial terms are required. Do not offer paid plans until genuine billing is integrated and tested.

Back up via SQLite's online backup facility or stop the process and copy the database with its WAL consistently. Test a restore to a separate path. Before upgrades, retain a pre-migration backup and the previous release; migrations currently move forward only, so rollback means restoring that backup with the earlier release. No hosted backups or restore automation is configured.

## Repository layout

```text
brief/                  product, design, acceptance and source contracts
src/                    React pages, reusable UI, shared schema, fictional demo
server/                 API, auth, matching, SQLite, adapters, trusted CLI
server/migrations/      versioned SQL migrations
public/                 original vector favicon; hero artwork is CSS/HTML
tests/                  unit/integration/browser verification
 evidence/              source snapshots, command results and real screenshots
```

Original brand mark and sculptural hero are implemented as vector/CSS assets with reduced-motion fallback; no purchased images or proprietary fonts. Manrope and Inter are bundled locally from Fontsource under their included open font licences. Font licence texts are also included in `public/LICENSE-Manrope.txt` and `public/LICENSE-Inter.txt`. The name and domain are not trademark-cleared. See [NEXT_STEPS.md](NEXT_STEPS.md).
