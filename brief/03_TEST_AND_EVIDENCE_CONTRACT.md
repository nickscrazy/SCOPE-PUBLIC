# SCOPE — One-Shot Build Qualification and Evidence Contract

This is a build experiment. A polished static UI does NOT pass. A working backend with a generic landing page does NOT pass. Each claim must be supported by executable evidence.

## Completion levels
- `PRESENTATION_ONLY`: website screens, dummy interactive demo, no account/persistence.
- `FUNCTIONAL_PROTOTYPE`: full end-to-end account/profile/persistent matching using real local DB and cited source fixtures or live TED; actual gating/trial; runnable.
- `CONNECTED_BETA`: validated live TED ingestion, production-grade persistence/auth, monitoring/error reporting, authorised grant curation and email delivery as configured.
- `PRODUCTION_READY`: independently reviewed access/privacy/security, real billing if offered, all target sources authorised, actual staging deployment, health checks, backups and rollback, live data and support qualification. Never claim this from one green test suite alone.

## P0 acceptance — all required for FUNCTIONAL_PROTOTYPE
T01: Clean install/start of full app from README; `.env.example`; migrations; seeded *clearly sample* records.
T02: Home, how-it-works, pricing, demo load with meaningful content and responsive navigation; key CTA path isn't dead.
T03: A new user can create account/sign in/out, persists secure session, cannot access another user's profile or saved items. Include session and cross-tenant tests.
T04: User can create/edit company profile: services, credentials/expiry, capacity, financial size band, geography, project preference, role, tender/grant interests; all persist after restart.
T05: Matching uses profile + opportunity metadata and outputs a deterministic relevance score plus evidence: reasons, unknowns, applicable conditions, explicit `unmet` where supported; matches actually change when profile changes. Unknown never appears as met.
T06: Opportunity feed supports type, sector, saved and deadline filters; opportunity detail has attributable original source URL and freshness; saved items persist.
T07: Real server-persisted 7-day trial starts once, expires server-side using clock injection in test; Free quota 3 detailed analyses per calendar month enforced server-side; bypass by editing browser storage must fail.
T08: Production source adapter for published TED notices with real API payload parsing (or clearly blocked if network cannot verify). Offline replay fixture tests for pagination/normalization/dedup/failure/retry. Recorded fixture is synthetic or known from real source; distinguish.
T09: Grants catalogue uses verified official reference URLs and `last_verified_at`; stale schemes cannot silently present as open nor promise aid. No ePPS scraper.
T10: Import operation is idempotent with source identity/provenance, handles network errors, leaves prior good data untouched and surfaces stale data warning.
T11: Common HTML injection, uploaded text prompt-injection, path abuse and access-control tests; no secrets in logs/client bundle; input validation; rate limiting on account and expensive endpoints; no unauthorised SMTP payment actions.
T12: `npm run build`, lint, type-check and automated tests (or stack-equivalent) pass with exact outputs. Headless browser E2E and screenshots if environment supports Playwright; report gaps truthfully. Mobile view checks where available.

## Meaningful demo success oracle
- Use account A with 2 research services, one qualification, 3-person team, €5–50k range. App ranks a source-backed research tender high but marks an unstated required certification as `unknown`.
- Edit A to add relevant sector qualification: ranking/eligibility evidence changes in a documented deterministic way.
- Switch to profile B, a restaurant business with 8 staff; results meaningfully change; no A data visible.
- Discover grant result (e.g. a Digitalise scheme) showing conditional aid type, current-source verification warning and separate "Potential fit" from "Eligible".
- Free quota reached: further detail analysis denied server-side; start a real one-week trial on new account; advance injected clock beyond seven days and verify downgrade.
- Feed same TED notice twice; no duplicate. Fail an external sync; retain prior valid records with stale warning.
- Open public demo; any records there are unambiguously labelled fictional.

## Visual acceptance
- Screens at 360px and desktop 1440px, keyboard and reduced-motion checks; app and marketing share brand.
- Navigation/CTAs must do what they claim, no filler placeholder links or sections.
- No text overflow, button overlay, unreadable contrast; user can complete profile on mobile.
- Screenshot/DOM evidence if automated browser test tooling works. Cloud may lack interactive browser use; do not claim that simulated screenshots were viewed.

## What must not count as success
- A static dashboard with localStorage pretending to be a multiuser SaaS; Stripe buttons that do nothing; always-live source data invented in seed; government logo implying official endorsement; tests that only check element presence but not operations; grant eligibility inferred from word similarity; silent ePPS scraping; success declared while live data/auth fails; UX performance described without measurement.

## Handoff requirements
At completion produce `BUILD_REPORT.md` with `VERIFIED`, `PARTIAL`, `BLOCKED` for each requirement, code paths, executed test commands/results, demo instructions, example accounts or documented creation flow (no shared passwords), actual source status, design screenshots if collected, estimated recurring operational costs and unknowns, deployment instructions, and the **three most serious risks**.

Produce a separate `NEXT_STEPS.md` for optional commercial work (real billing and trial communications; SMTP; authorised ePPS; grants publisher/admin; staging hosting; security/privacy review; domain/trademark review; user discovery). These cannot be silently claimed as completed.
