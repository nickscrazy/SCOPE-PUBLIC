# Handoff for independent Codex security and functional review

You are reviewing release `1.0.0-rc.1` of SCOPE. The baseline you built is commit `f03cffe` (unmodified import); everything after it is this release. Please verify claims rather than trusting them, and report findings with reproduction steps.

## Orientation (30 minutes)

```bash
git log --oneline f03cffe..HEAD
git diff --stat f03cffe..HEAD
cp .env.example .env && npm ci && npm run db:migrate && npm run db:seed
npm test && npm run build && npm run test:e2e
npm run dev   # sign up; the confirmation email is in data/outbox/
npm run admin:role -- <your confirmed email> admin
```

Read [RELEASE_REPORT.md](RELEASE_REPORT.md) §2 (findings) and [SECURITY.md](SECURITY.md) (threat model and accepted risks).

## Where the trust boundaries are in code

| Boundary | Files |
| --- | --- |
| Session → user, CSRF/origin checks, error handling, raw-body webhooks | `server/app.ts`, `server/auth.ts` |
| Account lifecycle (register, verify, reset, change, sessions, export, delete) | `server/routes-account.ts` |
| Entitlements and metering | `server/auth.ts › account()`, `server/routes-opportunities.ts` |
| Roles and admin APIs | `server/routes-admin.ts › requireRole`, `server/cli.ts admin-role` |
| Billing (signature, idempotency, ordering) | `server/billing.ts`, webhook in `server/app.ts` |
| External data: TED | `server/ted.ts`; inbound email `server/inbound.ts` |
| Editorial integrity | `server/editorial.ts` |
| Configuration guards | `server/config.ts` |
| Backups | `server/backup.ts` |

## Specific questions for the security review

1. Can any request change `users.role`, `subscriptions`, `trial_*`, or another user's rows without going through the intended path? (Try body/query/header injection, path parameters, JSON prototype keys.)
2. Can an unauthenticated or cross-site request mutate state? Note that `/api/billing/webhook` and `/api/inbound/email` intentionally bypass cookie auth and origin checks; verify their signature checks cannot be bypassed (header parsing, timestamp edge cases, empty bodies, alternate content types).
3. Token handling: are verification, reset and email-change tokens correctly bound to purpose, single-use, expiring, and unusable after password reset or account deletion? Is there a race allowing double use?
4. Rate limits: with `TRUST_PROXY` set, can `X-Forwarded-For` spoofing bypass per-IP limits? (Expected: only if the proxy hop count is misconfigured.) Are the per-account limits sufficient?
5. Inbound email: can a crafted message cause any outbound request other than the fixed TED API, store HTML or attachments, cause excessive CPU (postal-mime is pinned at a version patched for the RFC 2047 quadratic issue), or inject into the admin UI?
6. Editorial: can one person publish alone (author ≠ submitter ≠ approver combinations, withdrawn/resubmitted drafts, retire/republish)?
7. Account deletion: does any personal data survive outside backups (audit `detail`, editorial notes written by the user, inbound `reviewed_by`)? Is the pseudonym linkable?
8. Billing: can out-of-order, duplicated or cross-customer events grant or retain an entitlement incorrectly? Is `past_due` grace correct?
9. Container: anything writable outside `/data`, `/backups`, `/tmp`? Secrets in layers or logs?

## Specific questions for the functional review

1. Run `npm run sync:ted -- --full` and compare a sample of `superseded` / `result_published` records with ted.europa.eu. Are change notices and results linked correctly? Are any open procedures wrongly closed?
2. Is the CPV mapping in `server/matching.ts › CPV_LEXICON` accurate against CPV 2008? Are there obvious false positives?
3. Is the financial-fit rule (Directive 2014/24/EU Art. 58(3), 2× contract value) applied and worded correctly, including for frameworks and multi-lot notices?
4. Walk every customer journey on a phone-sized viewport and with keyboard only.
5. Check that no UI implies eligibility, official affiliation, complete coverage or a purchasable plan when billing is disabled.

## Known gaps (do not report as new)

Stripe never exercised live; no real SMTP provider; operator legal identity not configured; ePPS not covered; TED selection criteria not parsed (conditions stay `unknown`); funding catalogue has 3 references; no MFA; registration reveals existing emails (409); single-instance SQLite.
