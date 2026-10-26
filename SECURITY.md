# SCOPE security and privacy model

Scope of this document: the application in this repository as of release `1.0.0-rc.1`. It records the threat model, the controls implemented, how each is tested, and what still needs independent or external review. **This is not a certification**; no penetration test or legal compliance assessment has been performed.

## Assets and trust boundaries

| Asset | Sensitivity |
| --- | --- |
| Account credentials, session tokens, email/reset tokens | High |
| Business profiles (capabilities, staff, turnover band, projects) | Commercially sensitive |
| Entitlements (trial, plan, quotas) and billing linkage | Integrity-critical |
| Funding catalogue and TED records | Integrity-critical (customers act on them) |
| Audit log | Integrity-critical, pseudonymous |
| Backups and `BACKUP_ENCRYPTION_KEY` | High (contain everything) |

Boundaries: **browser ↔ API** (untrusted client); **API ↔ TED / Stripe / SMTP** (external services); **inbound email / webhooks** (untrusted senders); **operator host** (trusted: CLI requires filesystem access). Roles are data in the database; the only way to grant one is the operator CLI.

## Threats and controls

| Threat | Control | Evidence |
| --- | --- | --- |
| Credential stuffing / guessing | scrypt (N=16384) hashes; per-IP request limit (30/15 min); **failed** sign-ins counted per client and per address, cleared the moment the right password is given, with a rolling window and an escalating delay on repeated failure against one address; equal-cost verification for unknown emails; 12-character minimum screened against commonly chosen values | `account-security.test.ts › authentication throttling cannot be turned into a lockout` |
| Account takeover via recovery | Single-use, 1-hour reset tokens stored as SHA-256 hashes; reset revokes all sessions and notifies the owner; identical response for unknown addresses | `› resets the password once…`, `› answers identically…`, E2E recovery scenario |
| Unowned email / trial farming | Trial starts only after mailbox confirmation; one trial per account; unconfirmed accounts purged after 30 days | `› does not start a trial until the mailbox is confirmed`, E2E quota scenario |
| Session theft / fixation | 256-bit random tokens, stored hashed; HttpOnly, SameSite=Lax, Secure on HTTPS; new token per login; 30-day expiry; device list with revocation; password change revokes other sessions; role change revokes all | session tests, E2E |
| Tenant isolation | Every query is scoped by the session user id; no user id accepted from clients | `core.test.ts › isolates…`, E2E two-account scenario |
| Privilege escalation | Roles only from DB, set via CLI; admin APIs re-check role and confirmed email per request; no role-changing endpoint; client headers/bodies ignored | `› denies admin APIs to users regardless of client-asserted claims`, `› requires a verified email even for a role granted in the database` |
| Editorial abuse (one person publishing false funding info) | Four-eyes: approver must differ from author/submitter; attestation of an official-source check required; official-host allow-list; full editorial history | `ingestion.test.ts › grants editorial workflow`, E2E editorial scenario |
| CSRF | JSON-only mutations, Origin must match `BASE_URL`, `Sec-Fetch-Site` cross-site rejected, SameSite=Lax | `› rejects cross-site and mismatched-origin writes` |
| XSS | React escaping, no `dangerouslySetInnerHTML`; strict CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`); email HTML escaped; URLs from untrusted sources rendered as text | E2E hostile-profile scenario, email template test |
| Injection | Parameterised SQL throughout; zod validation of every request body and query; TED fields validated (publication number, CPV, procedure id formats) | `ingestion.test.ts › rejects malformed procedure ids and CPV codes` |
| SSRF | No user- or email-supplied URL is ever fetched. Outbound calls go only to fixed TED/Stripe endpoints and the operator-configured alert URL; `redirect: "error"` | `› classifies links without fetching anything and refuses SSRF targets` |
| Hostile email / documents | 2 MiB cap; zero-dependency MIME parser (patched version); attachments discarded unread; HTML never rendered; control and bidi characters stripped; HMAC + 5-minute timestamp window on the webhook; dedup by hash | inbound tests |
| Payment fraud / entitlement forgery | Plan changes only from Stripe-signed webhooks (HMAC, 5-minute tolerance, multiple v1 signatures), idempotent by event id, stale events cannot roll state back, redirect URLs pinned to Stripe hosts | `billing.test.ts` |
| Quota bypass | Analyses/saves metered in transactions on the server; browser storage and headers ignored | `core.test.ts`, E2E quota scenario |
| Abuse / DoS | Persisted per-IP and per-identity rate limits on auth, analysis, saves, exports; body limits (40 kB JSON, 3 MB admin upload, 512 kB webhooks); request/header timeouts | rate-limit tests |
| Data over-collection | Turnover as bands only; device stored as "browser on OS"; no IPs stored; logs contain no personal data | log module, audit tests |
| Erasure | Account deletion removes user, profile, saves, analyses, sessions, tokens and subscription link; cancels an active subscription first; audit/editorial records re-keyed to a one-way pseudonym | `› deletes the account and all personal records…` |
| Backup exposure | AES-256-GCM encryption required in production, checksum sidecar, integrity check before restore, 30-day retention | `ops-matching.test.ts › backup and restore`, container test |
| Misconfiguration | Startup validation refuses HTTP base URL, file outbox, unencrypted backups, missing proxy setting, Stripe test keys in production and live keys outside production | `› refuses unsafe production configurations`, container test |
| Supply chain | Lockfile, `npm audit` clean (prod and dev), pinned container base digest, dependencies chosen for small footprint | `evidence/release/npm-audit.json` |
| Container breakout impact | Non-root user, read-only root filesystem and app code, all capabilities dropped, `no-new-privileges` | `compose.yaml`, container test |

## Residual risks and accepted limitations

1. **Registration reveals whether an email is registered** (409). Mitigated by rate limits; switching to an always-"check your inbox" flow would need a different onboarding design.
1. **Guessing against one address is slowed, not hard-capped.** An earlier design refused all sign-ins to an address after ten failures in fifteen minutes. That stopped distributed guessing but let anyone who knew an address deny its owner access by guessing wrongly, which an independent review reproduced. Account-level protection now counts only *failed* attempts and never refuses the correct password, so the denial is impossible; sustained guessing is constrained instead by the per-client request and failure limits, a rolling penalty window, an escalating delay on each failed attempt, and the password policy. A determined attacker with many source addresses can therefore make more attempts against one account than before. A CDN or WAF rate limit in front of the service (already recommended below) is the right place to close that gap, because it can see across addresses without being able to lock anyone out.
2. **Disposable-email trial abuse** remains possible (one trial per confirmed mailbox), including sub-addressing: `you+1@`, `you+2@` are distinct accounts from one mailbox. Addresses are deliberately not normalised, because provider alias rules differ and guessing them wrongly would merge or reject legitimate accounts. Consider a disposable-domain blocklist or payment-method trials if abuse appears.
3. **A reset email can be withheld for up to an hour.** Reset emails are capped at five per address per hour so a mailbox cannot be flooded; an attacker can spend that budget. A link already issued stays valid for its full hour, and sign-in itself is unaffected, so this delays a new email rather than denying recovery.
3. **Rate limits are per process and per IP**; a large botnet can still spread attempts. Put a WAF/CDN rate limit in front for public launch.
4. **No MFA**. Recommended before granting `admin` to more than a couple of people; admins should use unique, long passwords.
5. **Session cookie is not `__Host-` prefixed** (kept for compatibility); harmless while the app owns its whole origin.
6. **`style-src 'unsafe-inline'`** is allowed for component styles; scripts remain strictly self-hosted.
7. **Self-declared profile facts** drive assessments; SCOPE never verifies them and says so.
8. **SQLite single writer**: availability is bound to one host; recovery is by restore from backup (RPO = backup interval).

## Requires external review before public launch

- Independent penetration test / code security review (start with [HANDOFF.md](HANDOFF.md)).
- Data protection review: controller identity, lawful bases, retention schedule, processor agreements (hosting, SMTP, Stripe), records of processing, DPIA screening, data-subject request procedure.
- Terms of use: liability, governing law, consumer/B2B scope, refund and cancellation terms for paid plans, VAT.
- Accessibility: automated axe checks pass on 12 routes; a manual audit with assistive technology is still needed for a WCAG claim.

## Reporting a vulnerability

Until the operator publishes a security contact, report privately to the repository owner. Do not open public issues for vulnerabilities.
