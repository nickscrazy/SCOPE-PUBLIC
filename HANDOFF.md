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

## Focused re-review of the repair round

**Commit under review: `46c5c17`** on `claude/review-repairs-p1-p2`, parent `e89af21`.
Everything in this round is in that one commit. Start with [REPAIR_REPORT.md](REPAIR_REPORT.md).

```bash
git diff e89af21..46c5c17 --stat
npm ci && npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e                      # runs on Windows and Linux
docker build -t scope:rc . && npx tsx scripts/container-test.ts
```

What to attack first, with the exact claims being made:

| Claim | Where to attack it |
| --- | --- |
| A notice is closed only once **every** lot has passed, and an unreadable lot set never closes a record | `server/ted.ts` `parseLotDeadlines`, `server/matching.ts` `currentLifecycle`. Try mismatched array lengths, missing times, non-UTC offsets, a lot set where one entry is junk, and a notice that gains a lot on re-import |
| No stored value goes stale: the deadline shown is resolved at read time | `effectiveDeadline` and `ranked()` in `server/routes-opportunities.ts`. Check a record stored months ago whose next lot has since passed |
| The correct password is never refused or delayed by throttling | `server/routes-account.ts` `/auth/login`. Try to deny a known address access from another client, with and without `TRUST_PROXY`, and across the window boundary |
| Guessing is still constrained | Same place. Measure how many guesses one client gets per window, and whether a successful sign-in to *another* account resets a client's failure budget |
| `X-Forwarded-For` buys nothing unless `TRUST_PROXY` is set | `server/context.ts` `limited`, and the limiter keys |
| An image built from a Windows checkout starts | Clone with `core.autocrlf=true`, build, run. `.gitattributes` is the control |
| One unreadable notice does not lose the window, but a schema break still fails the run | `syncTed` in `server/ted.ts`; feed it a page where every notice is malformed, and one where a single notice is |

Known and deliberate, please do not re-report as new: the deferred items listed in
[REPAIR_REPORT.md](REPAIR_REPORT.md), and the residual risks in [SECURITY.md](SECURITY.md) —
in particular that account-level guessing is now slowed rather than hard-capped, which is the
trade that removes the lockout.

### Rolling back this round

The commit is additive and touches no migration, so reverting is safe and needs no data work:

```bash
git revert --no-commit 46c5c17 && git commit -m "Revert repair round"
# or, to return to the reviewed baseline exactly:
git checkout e89af21
npm ci && npm run build
```

No schema change was made: `server/migrations/` is untouched (`001`, `002`, as before), so a
database written by `46c5c17` is readable by `e89af21` and the reverse. The four lifecycle
fields added to stored records (`lotDeadlines`, `lotCount`, `deadlinesComplete`,
`deadlineApproximate`) live inside the existing JSON payload and are ignored by the older code,
which falls back to the stored `deadline`. This was checked rather than assumed: 120 records
written by the repaired code were read back through the baseline's own `currentLifecycle`,
verbatim from `e89af21` — all 120 parsed, none threw. Reverting therefore restores the previous
behaviour, including the two defects.

The first TED sync after deploying `46c5c17` rewrites every TED record once, because the
interpretation of the source changed and the content hash changes with it. That is expected:
it writes one new version row per notice and reports a large `changed` count on that run only.

## Known gaps (do not report as new)

Stripe never exercised live; no real SMTP provider; operator legal identity not configured; ePPS not covered; TED selection criteria not parsed (conditions stay `unknown`); funding catalogue has 3 references; no MFA; registration reveals existing emails (409); single-instance SQLite.
