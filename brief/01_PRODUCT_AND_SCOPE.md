# SCOPE — Malta & EU Business Opportunities | Product Brief

Status: one-shot build specification, 25 October 2026. Working brand **SCOPE** (not trademark-cleared). Build in a NEW dedicated repository; this is not the Agent Factory repository. Target: credible, usable, polished B2B web product proof with a public marketing site and integrated SaaS app.

## 1. Who and why
- Audience: Malta-based self-employed professionals, small/medium firms and teams; later firms sourcing EU opportunities. Not solely tender consultants.
- User problem: relevant tenders, public grants and incentives are scattered; keyword searches create noise; conditions are complex; firms waste time understanding whether opportunities suit their capabilities and resources.
- Product promise: **"The right opportunities. Within your reach."** Supporting copy: "Discover public contracts and business support matched to what your company can actually do. See the evidence, understand the gaps, and act with clarity."
- Product value: improve time spent discovering/shortlisting appropriate opportunities >25% vs users' current process, without false eligibility claims. No assertions of certified eligibility, guaranteed funds, government endorsement or coverage of all Malta notices.
- Business model: Free with restrictive quota, full-function seven-day trial, optional paid plan once billing credentials exist. Public pricing is experimental and must be clearly labelled if real purchase is unavailable. Do NOT fake subscription purchases.

## 2. Pages and primary paths
PUBLIC:
- `/` editorial premium landing, graphic hero, product visualization, meaningful benefits, process, source transparency, CTA and subtle footer.
- `/how-it-works` short product explanation with interactive example and source-to-match lifecycle.
- `/pricing` honest three-tier cards with functional CTA. Suggested test prices: Free €0, Solo €19/mo, Team €59/mo (hypotheses; no live transactions without backend).
- `/demo` interactive guided demo with explicit sample/fictional records and no login. Do not label samples as real open opportunities.
- Terms, privacy and source/coverage disclosure pages; no fake testimonials, customer logos, awards, numbers or certifications.

APP (requires real account authentication or explicitly documented local single-user preview mode if infrastructure blocks implementation):
- `/app` overview with relevant matching results and source freshness.
- `/app/profile` profile setup/editing with services, experience, qualifications/certificates (type, date, expiry), historical projects, staff/contractor count, available capacity, company size, turnover **bands** rather than financial account details, geographic preferences, contract type and value range, intended role (bidder, subcontractor, consortium), interests (tenders, grants, both).
- `/app/opportunities` searchable/filterable results by type, fit, source, deadline, value, location, saved status; graceful empty/error states.
- `/app/opportunities/[id]` evidence-linked explanation: summary, why matched, qualification/eligibility conditions, known unmet conditions, unknowns/missing info, source link, last checked, disclaimer and CTA to save.
- `/app/saved` persistence of saved opportunities across sessions.
- `/app/settings` plan/trial status, account and data export/delete controls at minimum for profile (do not claim full GDPR compliance without independent assessment).

CORE FLOWS:
1. Visitor sees premium public page, explores interactive demo and pricing.
2. Visitor creates an account and begins a **real persisted** 7-day trial, not merely a timer in the browser; default automatically downgrades to Free when expired.
3. Customer completes a profile using structured fields; saves/revises information and receives reranked matches.
4. Customer searches, filters, opens a tender/grant detail, inspects source citations and uncertainty, saves an opportunity.
5. Customer sees current trial/free entitlements accurately. Free gets max 3 detailed match analyses per calendar month (enforced server-side), basic browsing and limited saves; trial gets unlimited analyses within reasonable rate limits. When trial ends enforce limit; no payment/cancel claim unless actually integrated.
6. Operator can ingest real permitted notice data from TED, and admin-curated funding opportunities from verified official URLs; updates are idempotent; source failure does not masquerade as zero available opportunities.

## 3. Source integrations, legal boundaries
**P0 REAL SOURCE:** EU TED public search API. Official documentation https://docs.ted.europa.eu/api/latest/search.html and swagger https://api.ted.europa.eu/swagger-ui/index.html ; production API uses POST `https://api.ted.europa.eu/v3/notices/search`. Published notices available without authentication; query fields and result schema from official docs. Implement a small robust adapter for Malta-related/selected EU notices, pagination, retry/backoff, deduplication, fetched-at timestamp and provenance links. Fetch on server, not directly from browser. Respect fair-use limits; do not claim verified live connection until exercised.
**P0 GRANTS:** curated official-source catalogue with source URLs and date-last-verified; support revision tracking and admin import. Illustrative relevant authorities:
- https://fondi.eu/what-funding-is-available/digitalise-your-sme/
- https://fondi.eu/what-funding-is-available/sme-enhance/
- https://maltaenterprise.com/node/1917 (Micro Invest is a tax credit; first 2026-2030 submissions from 2027, not a cash grant)
- https://sem.gov.mt/open-calls/digitalise-your-sme
Use only verified structured facts; distinguish `verified_at` from expiry and display `Status requires confirmation` if stale. Never mark scheme open merely because it appears in seed file. Validate scheme rules and eligibility independently before individual recommendations; this is indicative opportunity matching.
**OPTIONAL EMAIL:** allow secure ingestion of `.eml` files uploaded by an authorised user into an isolated parser, treating their contents/links as untrusted. Actual IMAP/Gmail/OAuth inbox integration is P2 and must remain disabled until connected; an email link does NOT grant unrestricted scraping permission.
**ePPS:** NO automated scraping, page monitoring, bypassing access checks or unpermitted attachment retrieval. Published 2018 ePPS terms prohibit these approaches (https://www.etenders.gov.mt/epps/docs/eTenders_Terms_of_Use.pdf). Support manual/user-authorised import and external links; say clearly that full ePPS coverage is not provided. If later an authorised feed is secured, it can be added through a documented source adapter.

## 4. Matching semantics
Use a deterministic, transparent two-stage system:
- Stage A relevance: sector/service keywords, CPV, geographical scope, role, contract-value preference, publication/deadline, similar past projects. Parameter/weight choices documented and unit-tested. Semantic similarity optional but cannot be the only functioning mechanism.
- Stage B evidence/eligibility: compare **explicit requirements present in source text/fields** against verified company-profile facts. Each condition status `appears_met`, `unmet`, or `unknown`, with supporting source locator and profile evidence; `unknown` is never silently considered met. An overall relevance score (0–100) is NOT legal eligibility certification. Hard disqualifier remains visible even if relevance is high. Grant co-financing/de-minimis/tax-credit conditions must remain unknown unless reliable sourced rules and company inputs allow grounded conditional assessment.
- Explanations: "Matched because…", "Needs confirmation…", "Current blockers…" and provenance, no invented qualification criteria or fabricated cost/profit forecasts.
- Save history of source version/first_seen/last_seen; repeated syncs must not generate duplicate opportunities.

## 5. Technology and operating constraints
Choose a pragmatic full-stack TypeScript implementation; recommend Next.js/React + Tailwind with accessible components, relational persistent store and real migrations. Prefer few dependencies, no elaborate multi-service/microservice architecture. Secure authentication, server-side session and entitlements, isolated per-user data, validation, rate limiting, error boundaries and safe secrets/env handling. Use minimal structured data for business financial profiles; do not ingest bank statements or tax credentials in V1.

Must be runnable from a clean clone with documented commands. Supply `.env.example`, database setup/migrations/seed instructions, local dev start, production build and tests. Respect cloud limitations (network restrictions, no credentials). If persistence or secure auth cannot be made to work, mark product NOT COMPLETE rather than replacing them with localStorage demos.

## 6. Explicit out-of-scope
No official grant application submissions, ePPS bots, tender submissions, grant awards, automated customer legal/financial advice, cross-country legal eligibility certification, bespoke CRM, payments without verified credentials, mass outreach, deceptive marketing, fake user counts/testimonials, or creating misleading founder/business identity.
