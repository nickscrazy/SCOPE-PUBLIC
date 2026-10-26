# SCOPE — repairs following the independent review

**Branch `claude/review-repairs-p1-p2`, based on `e89af21`.** Scope: repair the defects an independent review reproduced against that commit, and nothing else. No feature work, no visual redesign, no change to the data model beyond what the lifecycle repair needs.

That review's verdict was `ACCEPT_WITH_DEBT`: two P1 defects gating customer access, plus eleven P2 findings. Both P1s are repaired and demonstrated below. Historical evidence in [`evidence/release/`](evidence/release/) and [`evidence/codex-baseline/`](evidence/codex-baseline/) is untouched; this round's evidence is in [`evidence/repairs/`](evidence/repairs/).

## P1-1 — Expired multi-lot tenders were presented as open

**Root cause.** `server/ted.ts` recorded a notice-wide deadline only when TED returned *exactly one* lot date and *exactly one* lot time. Every multi-lot notice therefore stored `deadline: null`; `currentLifecycle()` returned `"unknown"`; and the feed's `closed()` test did not treat `"unknown"` as closed, so the record stayed in the default active view indefinitely. Against 357 live Maltese notices, 52 (14.6%) stored no deadline and **30 of those had every lot deadline already in the past**.

**Change.** `parseLotDeadlines()` reads the parallel date and time arrays lot by lot, pairing by position and honouring each entry's UTC offset. The record carries the full set (`lotDeadlines`), how many lots were listed (`lotCount`), whether every entry could be read (`deadlinesComplete`) and whether a closing time had to be inferred (`deadlineApproximate`). A notice-wide `deadline` is stored only when all lots share one instant, so no stored value can go stale; where lots differ, the deadline the customer sees is resolved at read time by `effectiveDeadline()` — the next lot still open, or the last one once they have all passed.

`currentLifecycle()` now reports a record open while **any** lot is open, and closed only once **every** lot has passed *and* every entry was readable. An unreadable or unpairable set stays `unknown` — never `open`, never `deadline_passed` — so a lot that failed to parse cannot hide a live opportunity. Supersession and result-notice closure still take precedence over the clock. `matchOpportunity()` derives its closed-record discount from the same function, so ranking, filtering, cards, detail and the stated match reasons cannot disagree.

**Before / after** against the same 357-notice live sample:

| | before | after |
| --- | --- | --- |
| Closed notices served as active (false inclusions) | 30 | **0** |
| Open notices wrongly hidden (false exclusions) | 0 | **0** |
| `ted-654724-2026` (11 lots, all closed 2026-10-07) | active | `deadline_passed` |

Five records that a crude date-only comparison flags as "future yet closed" were each checked by hand: every one closes *today* at a stated zoned time that has already passed, so closing them is correct and the comparison was wrong, not the code.

**Regressions** (`tests/ted.test.ts`): the reported `ted-654724-2026` shape; some lots open and some closed; closure only once the last lot passes; offsets honoured rather than calendar days; date-only values treated as end of day and labelled approximate; unreadable and unpairable sets left `unknown`; no deadline at all left `unknown`; supersession and result closure preserved.

## P1-2 — Anyone knowing an address could lock its owner out

**Root cause.** `server/routes-account.ts` throttled sign-ins with a counter keyed on the email address alone and incremented on **every** attempt. Ten wrong guesses made the account holder's own correct password return `429`, and further guesses sustained the denial indefinitely.

**Change.** Failure counting is now separate from request counting (`failures`, `penalise`, `forgive` in `server/context.ts`). Only failed attempts are counted; the counters are cleared the moment the correct password is presented; and the penalty window rolls forward on each failure, so a sustained attack keeps its penalty rather than being handed a fresh budget every window. A client that keeps failing is refused — keyed on the caller, so it cannot be driven against somebody else's account — while repeated failure against one address adds an escalating delay capped at two seconds, applied **only to the attempt that failed**.

The correct password is therefore never refused and never delayed, which removes the denial. Guessing stays constrained by the per-client request limit, the per-client failure limit, the rolling penalty window, the escalating delay, and a password policy that now screens commonly chosen values. `req.ip` derives from `X-Forwarded-For` only when `TRUST_PROXY` declares the proxy, so a spoofed header buys no extra budget — asserted by a test.

**Before / after**, the same script run against a production build of each tree:

| Step | before | after |
| --- | --- | --- |
| 12 wrong guesses at a known address | `401`×9 then `429`×3 | `401`×12 |
| Owner then signs in with the correct password | **`429` — locked out** | **`200` — signed in** |
| Attacker continues guessing; owner retries | **`429` — still locked out** | **`200`** |
| Password recovery during the attack | `202` | `202` |
| 30 further wrong guesses from that client | 30 refused | 25 refused, 5 through |

**Regressions** (`tests/account-security.test.ts`): the holder gets in during an attack; the denial cannot be sustained; a persistently failing client is still cut off without affecting a different client; spoofed forwarding headers buy nothing; recovery stays usable; responses are identical for unknown addresses; and the backoff curve itself.

The test that previously asserted the vulnerable behaviour — `throttles password guessing per account across addresses`, which *expected* the owner to receive `429` — was replaced rather than deleted. Seven tests now cover the same ground plus the denial-of-service property it missed.

## P2 repairs

| # | Finding | Change |
| --- | --- | --- |
| P2-12 | An image built from a Windows checkout could not start: CRLF shebang in `deploy/entrypoint.sh` | `.gitattributes` pins `*.sh`, `Dockerfile` and YAML to `eol=lf`. Verified the file now checks out LF on Windows with `core.autocrlf=true`, and that an image built from a CRLF tree fails exactly as reported |
| P2-9 | Browser suite could not run on Windows (`execFileSync("npx")`), and the recovery scenario raced the route transition | The CLI runs through `process.execPath --import tsx`; both client-side navigations wait for the destination heading before filling a field |
| P2-10 | `npm start` used POSIX env syntax, which also broke `test:e2e` on Windows | `start` no longer sets `NODE_ENV`; the built client is served whenever `APP_ENV` is not `development`. `sync:ted` uses `node --use-env-proxy` rather than an env prefix |
| P2-8 | CSP refused an inlined `data:` font on every page load | `assetsInlineLimit: 0`, so fonts are emitted as files. Verified: 0 inlined fonts, 13 `.woff2` emitted |
| P2-1 | One unreadable notice aborted the entire TED sync | Notices are normalised individually; failures are counted, logged and reported in sync detail. A window where *nothing* parses still fails the run, so a schema break is alerted rather than quietly publishing an empty feed |
| P2-3 | `EDITORIAL_ALLOW_SELF_APPROVAL` could disable four-eyes in production | Refused by production configuration validation |
| P2-4 | Password policy accepted `password1234` | NIST SP 800-63B §5.1.1.2 screening against commonly chosen values, digit-only and repeated-character strings, and keyboard runs |
| — | Evidence capture overwrote the previous release's evidence | `EVIDENCE_DIR` selects the output folder, defaulting to the previous behaviour |

## Deliberately deferred, with reasons

| # | Finding | Why not now |
| --- | --- | --- |
| P2-2 | `import-grants` and `seed` publish catalogue records without four-eyes | An operator-only path behind filesystem access, documented as legacy. Removing it needs an editorial path for seeding, which is a design change rather than a repair |
| P2-5 | Sub-addressing (`you+1@`) yields repeat trials | Normalising aliases guesses at provider rules and risks merging or rejecting legitimate accounts. Recorded as residual risk in `SECURITY.md`; the commercial answer is a payment-method trial |
| P2-6 | A result notice can close a procedure whose own deadline is still future | 2 of 357 live notices. Treating a published award as closure is the safer reading, and the record stays reachable under the closed filter. Revisit if editors see it mislead |
| P2-7 | Opportunities grow unboundedly; no cascade on `opportunity_versions` or `saves` | Needs a schema migration and a retention decision (how long a closed notice stays queryable). Not a correctness defect today |
| P2-11 | `format:check` fails on 44 files and is not in CI | A 44-file reformat would bury this repair diff. Worth its own commit |
| — | `node:sqlite` is an experimental Node API | Architectural; the pinned base-image digest contains the risk |

## What did not change

Security controls, visual identity, the matching weights and their explanations, provenance and
evidence display, the editorial four-eyes workflow, container hardening, and the data model
beyond the four lifecycle fields. No test was weakened: the suite grew from 81 to 96.
