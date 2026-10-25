# SCOPE — Independent review, completion and release readiness

**Verdict: `BETA_READY_WITH_BLOCKERS`**

The software is complete for the Free/trial product and passes every check below, including a production-mode container deployment, a backup/restore drill, an upgrade and a rollback. It is **not** a `RELEASE_CANDIDATE` for public sale because four things outside the code have not happened and cannot be faked: a legal operator and legal review, a configured SMTP provider, an independent security review, and (for paid plans) a live Stripe account tested end to end. A closed beta with Free/trial only becomes possible as soon as the operator details and SMTP are configured (§7).

Review date 25 October 2026. Nothing was publicly deployed, purchased or sent to customers. Codex's original deliverables are preserved unmodified in [`evidence/codex-baseline/`](evidence/codex-baseline/); new evidence is in [`evidence/release/`](evidence/release/).

## 1. Verification of Codex's claims

| Codex claim | Independent result |
| --- | --- |
| Clean install, migrations, lint, strict types, build | **Reproduced** on Node 24.22.1 |
| 28 unit/integration tests, 8 browser scenarios pass | **Reproduced** (all passed before any change) |
| Accounts, profiles, sessions, saves survive restart | **Reproduced** |
| Live TED ingestion imported 90 notices | **Reproduced** — the API is live and the adapter works. But see F1: a quarter of current notices are superseded or awarded and were presented as live |
| `npm audit`: 0 vulnerabilities | **Incomplete** — audit omitted dev dependencies, which carried a critical (tinypool RCE gadget) and moderate (vitest) advisory. Fixed |
| Docker/Compose supplied | **Never built by Codex.** It does build; now replaced by a hardened image that is built and tested |
| Accessibility: 7 views, zero axe findings | **Reproduced for those 7**; unaudited pages (signup, sources, forgot-password, discover) had contrast failures. Fixed; 12 routes now audited |
| Screenshots visually inspected | Plausible; the screenshots also show the visual defects listed in F8–F11 |

Codex's own report was candid about its limits (no recovery, no billing, no admin workflow, no deletion). The review confirmed those and found the additional defects below.

## 2. Findings and repairs

| # | Severity | Finding | Repair |
| --- | --- | --- | --- |
| F1 | High | TED change notices and result (award) notices were ignored. Live data on 25 Oct: of 350 Maltese contract notices, **66 were superseded by a later change notice and 23 already had a published result**, yet all were presented as opportunities | Procedure identity (`procedure-identifier`), supersession by newest notice, closure by result notices, read-time deadline expiry; closed records hidden by default and down-ranked |
| F2 | High | No email ownership: unlimited seven-day trials with invented addresses; no way to recover an account | Email confirmation via emailed single-use link; trial starts on confirmation; unconfirmed accounts purged after 30 days |
| F3 | High | No password reset or change, no session list or revocation | Reset (1 h single-use, revokes all sessions, owner notified), change (revokes other sessions), device list with per-device and "everywhere else" sign-out, email change with confirmation of the new mailbox and notice to the old |
| F4 | Medium | Rate limits keyed on `req.ip` without proxy configuration: behind a reverse proxy every user shares one bucket (15 attempts per 15 min for the whole service → trivial lockout), and per-account guessing was unlimited across IPs | `TRUST_PROXY` (required in production) plus per-account login throttle; limits on recovery, resend, exports, checkout |
| F5 | Medium | Account deletion required an operator; export covered the profile only | Self-service deletion (password + typed confirmation, cancels billing first, pseudonymises audit) and full account export |
| F6 | Medium | Funding references could only be imported by a CLI with no reviewer identity, approval or history | Editorial workflow: draft → submit with evidence note → different reviewer attests official-source check → publish; re-verification dates; retire; history; audit |
| F7 | Medium | TED freshness was "stale" only if the *latest* sync failed; a scheduler that never ran showed records as current. No scheduler existed | Freshness from last *successful* sync (36 h); leased twice-daily scheduler; incidents and alert webhook after repeated failures |
| F8 | Medium | Over 280 CSS declarations set product text at 4–10 px (freshness labels at 7 px); text colours below WCAG AA on pages outside Codex's audit | Systematic type scale (app text now 10–16 px, decorative hero art untouched); every light-surface text colour below 4.5:1 corrected while keeping semantic hues |
| F9 | Medium | Pricing sold a Team plan whose features were listed with check marks, including "✓ Not included in this prototype" | Team removed from sale; pricing reflects billing configuration; comparison table |
| F10 | Low | `↗` text glyphs rendered as missing-glyph boxes ("FONDI ▯", "Coverage ▯") | Replaced with icons |
| F11 | Low | Most TED cards scored an identical 25%; CPV codes were tokenised as words and never matched | CPV classification signal mapped from services (official CPV divisions), conservative stemming; positive reasons shown first on cards |
| F12 | Low | Re-importing a record whose stored id differed from the new id would write a version row with a dangling foreign key | Stable identity: existing id kept on upsert |
| F13 | Low | Migrations auto-applied with no backup; no backup/restore tooling; no readiness check; no CI | Pre-migration encrypted backup in the entrypoint, backup/verify/restore CLI, `/api/ready`, GitHub Actions |
| F14 | Low | Long multi-buyer names and tender titles inflated cards; status chip collided with an existing `.lifecycle` class; mobile filter selects truncated to "Al / O / M" | Clamped text, renamed class, two-column mobile filter grid |
| R1 | Medium (found in this review's own tests) | Email-link classifier accepted official hosts on non-standard ports | Port rejected; test added |

## 3. Requirement status

| Area | Status | Notes |
| --- | --- | --- |
| Registration, login, confirmation, recovery, password/email change, sessions | **Done** | Unit + E2E |
| Seven-day trial, Free limits, entitlement enforcement | **Done** | Server-side, transactional |
| Persistent, editable business profile | **Done** | Four-step onboarding |
| Discovery, filtering, ranking, saved records, comparison | **Done** | |
| Detail: evidence, requirements, deadlines, qualification gaps, four separate dimensions | **Done** | Tender conditions stay `unknown` (TED metadata has no selection criteria) |
| Export, deletion, retention | **Done** | Retention schedule in RUNBOOK §5 and privacy page |
| Upgrade/subscription | **Built, not live** | Stripe checkout/portal/webhooks implemented and tested against a local API stand-in and signed fixtures. **Never exercised against Stripe** — no credentials |
| Transactional email | **Built, tested locally** | Real SMTP delivery tested against a local SMTP server (unit and container tests). No real provider configured |
| TED ingestion: scheduled, idempotent, revisions, lifecycle, freshness, retries, alerts | **Done** | Live run evidence below |
| Email-notification ingestion | **Done** | Upload and HMAC webhook; links classified, never fetched |
| Maltese grants editorial workflow | **Done** | Catalogue content itself is still only 3 references |
| Admin console (catalogue, incidents, ingestion, audit) | **Done** | Role-gated server-side |
| Health/readiness, structured logs, alert hook | **Done** | |
| Backups, restore, migrations, rollback | **Done and drilled** | Container test |
| Docker/Compose, CI | **Done** | Image built and run here; CI defined (not yet run on GitHub) |
| Privacy, terms, cookies | **Drafted, config-driven** | Operator identity not fabricated; pages state when it is missing. Requires legal review |
| Public site design, SEO, accessibility | **Done (automated checks)** | Manual assistive-technology audit outstanding |

## 4. Executed evidence

All from a fresh clone of the release commit (`evidence/release/clean-checkout.log`) unless noted.

| Check | Result | File |
| --- | --- | --- |
| `npm ci` (Node 24.22.1, npm 11.19.1) | pass | `clean-checkout.log` |
| `db:migrate`, `db:seed` | pass (001, 002 applied; 3 references) | `migrate.log`, `seed.log` |
| `npm run lint` | pass | `lint.log` |
| `npm run typecheck` (strict) | pass | `typecheck.log` |
| `npm test` | **81 tests, 6 files, all pass** — includes adversarial suites for tenant isolation, role bypass, trial abuse, recovery, CSRF, SSRF, hostile email, billing signature/replay/ordering, editorial four-eyes, retention, backups | `tests.log` |
| `npm run build` | pass | `build.log` |
| `npm audit` (all dependencies) | 0 vulnerabilities | `npm-audit.json` |
| `npm run smoke:prod` | pass: boot, verification, writes, restart persistence, CSP | `production-smoke.log` |
| `npm run test:e2e` | **10 Chromium scenarios pass** on the production build: public pages and SEO, demo, sign-up → emailed confirmation → onboarding → evidence → save → new session, password recovery revoking sessions, quota/trial abuse, hostile text and tenant isolation, editor/reviewer publication, export and deletion, overflow at 360/768/1024/1440, axe | `e2e.log`, `browser-results.json` |
| Automated WCAG 2.1 A/AA (axe) | **0 violations on 12 routes** | `accessibility-results.json` |
| Live TED sync (full 90-day window) | success: 350 notices, 201 result notices, 66 superseded, 23 closed by result, not capped | `ted-sync-live.json` |
| Repeat live sync (incremental) | success: 11 in window, **0 changed** (idempotent), versions unchanged | `ted-sync-repeat.json`, `ted-lifecycle-counts.txt` |
| Container deployment test (`scripts/container-test.ts`) | **pass**: `APP_ENV=production` boot, read-only rootfs, dropped capabilities, refusal of insecure config, SMTP-delivered verification, restart persistence, encrypted backup + verify, data loss → restore, upgrade of a Codex-schema DB with automatic pre-migration backup, **rollback to the Codex image** from that backup | `container-test.json` |

Screenshots (real Chromium captures, inspected): `evidence/release/screenshots/` — `home-{360,768,1024,1440}`, `home-mobile`, `pricing-desktop`, `demo-desktop/mobile`, `dashboard-desktop`, `discover-{360,768,1024,1440}`, `opportunity-desktop`, `tender-detail-desktop/mobile`, `saved-mobile`, `profile-mobile`, `settings-mobile`, `account-desktop`, `verify-email-desktop`, `operations-desktop`, `catalogue-desktop`. Full-page captures show the fixed desktop sidebar only at the top; in a browser it spans the viewport.

No test was weakened to obtain a pass. Six Codex tests changed because the contract changed (trial now starts on email confirmation; TED sync now also queries result notices); each kept or strengthened its assertions.

## 5. Environment and credentials required

| Item | Required for | Status |
| --- | --- | --- |
| Host with persistent disk, Docker, TLS proxy, domain | Any deployment | Not provisioned (instructed not to deploy) |
| `SMTP_URL`, sender domain with SPF/DKIM/DMARC | Production start (enforced) | **Missing** |
| `BACKUP_ENCRYPTION_KEY` (32 bytes hex) + off-host backup target | Production start (enforced) | Generate at deployment |
| `LEGAL_OPERATOR_NAME/ADDRESS/CONTACT_EMAIL` | Public privacy/terms | **Missing** — not fabricated |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO` | Paid plan only | **Missing**; billing disabled |
| `ALERT_WEBHOOK_URL` | Ingestion alerts | Optional |
| `INBOUND_EMAIL_SECRET` + mail provider inbound route | Automated alert-email ingestion | Optional |
| Outbound HTTPS to `api.ted.europa.eu` | TED | Verified from this environment |

## 6. Remaining blockers

**Legal and privacy** — operator entity, privacy notice, terms (liability, governing law, refunds, VAT), processor agreements, DPIA screening and a data-subject request procedure all need a lawyer. The pages are drafted and honest about what is missing.

**Security** — independent penetration test and code review (see [HANDOFF.md](HANDOFF.md)); WAF/CDN rate limiting; MFA for operator accounts recommended. Residual risks are listed in [SECURITY.md](SECURITY.md).

**Commercial integrations** — Stripe never exercised live; SMTP provider not configured; CI not yet run on GitHub.

**Source access and content** — ePPS (where most low-value Maltese tenders appear) requires an authorised feed; Malta Enterprise and SEM pages return HTTP 403 to automated requests, so Micro Invest stays marked unverified until an editor checks it in a browser; the funding catalogue holds 3 references and needs editorial work before it is useful; TED selection criteria are not parsed, so tender eligibility stays `unknown`.

**Product** — manual accessibility audit with assistive technology; testing in Firefox/Safari and on real touch devices (only Chromium was automated); name and domain trademark clearance; willingness-to-pay validation.

## 7. Steps to a safe public launch

1. Appoint the legal operator; obtain legal review of privacy, terms and cookies; set `LEGAL_*` and `LEGAL_REVIEWED=true`.
2. Provision host, domain, TLS proxy, off-host backup storage; generate and safely store `BACKUP_ENCRYPTION_KEY`.
3. Configure an SMTP provider with SPF/DKIM/DMARC; send test confirmation and reset emails to real mailboxes.
4. Deploy with `APP_ENV=production` per [RUNBOOK.md](RUNBOOK.md); seed; first TED sync; enable the scheduler; configure the alert webhook and an uptime monitor on `/api/ready`.
5. Create operator accounts (`admin`, plus separate `editor` and `reviewer`); editors verify and expand the funding catalogue (re-verify the three seeded references, resolve Micro Invest).
6. Commission an independent security review; fix findings; add a CDN/WAF rate limit.
7. Run a manual accessibility review and cross-browser/device checks.
8. Run a restore drill on the production host; schedule daily backups and monthly drills.
9. Open a closed beta (Free/trial only). Monitor sync health, email delivery and error rates.
10. For paid plans: complete RUNBOOK §7 in staging with Stripe test mode, then switch to live keys, configure tax, and only then present Solo as purchasable (the UI does this automatically when billing is configured).
