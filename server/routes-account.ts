import express from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Ctx } from "./context.js";
import { HttpError, tooMany, userOf } from "./context.js";
import { transaction } from "./db.js";
import { log } from "./log.js";
import {
  account,
  audit,
  clearSessionCookie,
  createSession,
  DUMMY_HASH,
  hashPassword,
  newToken,
  pseudonym,
  sessionToken,
  startTrial,
  tokenHash,
  verifyPassword,
  type User,
} from "./auth.js";
import { templates } from "./email.js";
import { profileSchema } from "../src/domain.js";

const email = z
  .email()
  .max(254)
  .transform((s) => s.trim().toLowerCase());
/**
 * NIST SP 800-63B: length over composition rules; 12–128 characters, plus §5.1.1.2's
 * screening against values known to be commonly chosen. The list is deliberately small and
 * shaped around what survives a 12-character minimum — keyboard runs, repeated words and the
 * handful of long passphrases that appear in every breach corpus — rather than a dictionary
 * this service has no way to keep current. A credential-stuffing feed belongs in front of it.
 */
const COMMON_PASSWORDS = [
  "password", "passw0rd", "qwerty", "letmein", "welcome", "monkey", "dragon", "football",
  "baseball", "superman", "trustno1", "iloveyou", "princess", "sunshine", "starwars",
  "whatever", "freedom", "michael", "jennifer", "computer", "internet", "samsung",
  "qwertyuiop", "asdfghjkl", "zxcvbnm", "1qaz2wsx", "qazwsxedc", "adminadmin",
  "administrator", "changeme", "secret", "charlie", "shadow", "master", "hello",
];
const isCommon = (p: string) => {
  const flat = p.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Only digits, or a single character repeated, however long.
  if (/^\d+$/.test(flat) || /^(.)\1*$/.test(flat)) return true;
  // A straight keyboard or counting run, e.g. 123456789012.
  if (/^(?:0123456789|1234567890|123456789|12345678)/.test(flat)) return true;
  const stripped = flat.replace(/\d+$/, "");
  return COMMON_PASSWORDS.some((c) => flat === c || stripped === c || flat === c + c);
};
const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128)
  .refine((p) => new Set(p).size >= 4, "Choose a less repetitive password.")
  .refine(
    (p) => !isCommon(p),
    "That password is among the most commonly chosen ones. Pick something only you would write.",
  );
const token = z.string().regex(/^[a-f0-9]{64}$/, "This link is invalid.");
const HOUR = 3600000;
const LOGIN_WINDOW = 15 * 60000;
/** Failed sign-ins one client may make before it is refused outright. */
const IP_FAILURES = 15;
/** Failed sign-ins against one address before each further failure is slowed. */
const ACCOUNT_FAILURES_BEFORE_BACKOFF = 10;
/**
 * Delay applied to a *failed* sign-in once an address has been guessed at repeatedly.
 * It never applies to a correct password, so it slows an attacker without giving them a way
 * to deny the account holder access. Capped so a request cannot be held open indefinitely.
 */
export function loginBackoffMs(failures: number, multiplier = 1) {
  const over = failures - ACCOUNT_FAILURES_BEFORE_BACKOFF * multiplier;
  return over <= 0 ? 0 : Math.min(2000, 100 * 2 ** (over - 1));
}

/** Routes that do not need a session. */
export function publicAuthRoutes(ctx: Ctx) {
  const { db, config, clock, mailer, allow, limited } = ctx;
  const r = express.Router();
  const base = config.BASE_URL.replace(/\/$/, "");
  async function sendVerification(u: { id: string; email: string; trial_requested: number }, now: Date) {
    const t = newToken();
    db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='verify_email'").run(u.id);
    db.prepare(
      "INSERT INTO auth_tokens(token_hash,user_id,purpose,created_at,expires_at) VALUES(?,?,?,?,?)",
    ).run(tokenHash(t), u.id, "verify_email", now.toISOString(), new Date(now.getTime() + 24 * HOUR).toISOString());
    return mailer.send({ to: u.email, ...templates.verifyEmail(`${base}/verify-email?token=${t}`, !!u.trial_requested) });
  }
  r.post("/auth/register", limited("register", 10, 15 * 60000), async (req, res) => {
    const c = z
      .object({ email, password, startTrial: z.boolean().optional() })
      .parse(req.body);
    const id = randomUUID(),
      now = clock(),
      trial = c.startTrial !== false;
    const hash = await hashPassword(c.password);
    try {
      db.prepare(
        "INSERT INTO users(id,email,password_hash,created_at,trial_requested,password_changed_at) VALUES(?,?,?,?,?,?)",
      ).run(id, c.email, hash, now.toISOString(), trial ? 1 : 0, now.toISOString());
    } catch (e) {
      if (String(e).includes("UNIQUE"))
        throw new HttpError(409, "An account already uses this email. Please log in or reset your password.");
      throw e;
    }
    audit(db, now, "auth.registered", id, null, { trialRequested: trial });
    createSession(db, req, res, id, now, config.secureCookies);
    const sent = await sendVerification({ id, email: c.email, trial_requested: trial ? 1 : 0 }, now);
    res.status(201).json({ ok: true, verificationSent: sent });
  });
  r.post("/auth/login", limited("login", 30, LOGIN_WINDOW), async (req, res) => {
    const c = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
    const ipKey = `login-fail:ip:${req.ip}`,
      accountKey = `login-fail:account:${c.email}`;
    // Keyed on the caller, so it cannot be driven against somebody else's account. `req.ip`
    // comes from X-Forwarded-For only when TRUST_PROXY declares the reverse proxy, so a
    // client cannot spend someone else's budget by spoofing a header.
    const fromThisClient = ctx.failures(ipKey);
    if (fromThisClient >= IP_FAILURES * ctx.multiplier) {
      log.warn("auth.login_throttled", { scope: "client", failures: fromThisClient });
      tooMany(res, LOGIN_WINDOW);
      return;
    }
    const u = db.prepare("SELECT * FROM users WHERE email=?").get(c.email) as User | undefined;
    // Equal-cost verification for unknown accounts; the response is identical either way.
    const valid = await verifyPassword(c.password, u?.password_hash || DUMMY_HASH);
    if (!u || !valid) {
      ctx.penalise(ipKey, LOGIN_WINDOW);
      const against = ctx.penalise(accountKey, LOGIN_WINDOW);
      // Sustained guessing against one address is slowed down, but only the failing attempt
      // waits. The account holder presenting the right password is never delayed or refused,
      // which is what stops an attacker from locking them out by guessing wrongly.
      const wait = loginBackoffMs(against, ctx.multiplier);
      if (wait && config.APP_ENV !== "test") await new Promise((r) => setTimeout(r, wait));
      log.warn("auth.login_failed", { scope: "account", failures: against, delayedMs: wait });
      throw new HttpError(401, "Email or password is incorrect.");
    }
    // Proof of the password clears whatever an attacker accumulated against this account.
    ctx.forgive(accountKey);
    ctx.forgive(ipKey);
    const now = clock();
    createSession(db, req, res, u.id, now, config.secureCookies);
    audit(db, now, "auth.login", u.id);
    res.json({ ok: true });
  });
  r.post("/auth/logout", (req, res) => {
    const t = sessionToken(req);
    if (t) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(t));
    clearSessionCookie(res, config.secureCookies);
    res.json({ ok: true });
  });
  r.post("/auth/verify-email", limited("verify", 30, HOUR), (req, res) => {
    const t = z.object({ token }).parse(req.body).token;
    const now = clock();
    const result = transaction(db, () => {
      const row = db
        .prepare("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose IN ('verify_email','change_email')")
        .get(tokenHash(t)) as
        | { user_id: string; purpose: string; new_email: string | null; expires_at: string; used_at: string | null }
        | undefined;
      if (!row || row.used_at || new Date(row.expires_at) <= now)
        throw new HttpError(400, "This link has expired or was already used. Request a new one from your account.");
      db.prepare("UPDATE auth_tokens SET used_at=? WHERE token_hash=?").run(now.toISOString(), tokenHash(t));
      const u = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id) as User;
      let notifyOld: string | null = null;
      if (row.purpose === "change_email") {
        if (db.prepare("SELECT 1 FROM users WHERE email=? AND id!=?").get(row.new_email, u.id))
          throw new HttpError(409, "That email address is now used by another account.");
        notifyOld = u.email;
        db.prepare("UPDATE users SET email=?,email_verified_at=? WHERE id=?").run(row.new_email, now.toISOString(), u.id);
        audit(db, now, "account.email_changed", u.id);
      } else {
        db.prepare("UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?").run(now.toISOString(), u.id);
        audit(db, now, "auth.email_verified", u.id);
      }
      const trialStarted = !!u.trial_requested && startTrial(db, u.id, now);
      if (trialStarted) audit(db, now, "account.trial_started", u.id);
      return { trialStarted, notifyOld, purpose: row.purpose };
    });
    if (result.notifyOld) void mailer.send({ to: result.notifyOld, ...templates.emailChangedNotice() });
    res.json({ ok: true, trialStarted: result.trialStarted, purpose: result.purpose });
  });
  r.post("/auth/forgot-password", limited("forgot", 10, HOUR), async (req, res) => {
    const c = z.object({ email }).parse(req.body);
    const now = clock();
    // Identical response whether or not the account exists.
    const respond = () =>
      res.status(202).json({ ok: true, message: "If an account uses that address, a reset link is on its way." });
    // Caps how many reset emails one address can be sent, so the mailbox cannot be flooded.
    // It is counted before the account lookup so the response cannot reveal whether the
    // address exists. A reset link already issued stays valid for its full hour, so hitting
    // this cap delays a new email rather than denying recovery.
    if (!allow(`forgot:account:${c.email}`, 5, HOUR)) {
      log.warn("auth.reset_throttled", { scope: "account" });
      return respond();
    }
    const u = db.prepare("SELECT id,email FROM users WHERE email=?").get(c.email) as { id: string; email: string } | undefined;
    if (u) {
      const t = newToken();
      db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='reset_password'").run(u.id);
      db.prepare(
        "INSERT INTO auth_tokens(token_hash,user_id,purpose,created_at,expires_at) VALUES(?,?,?,?,?)",
      ).run(tokenHash(t), u.id, "reset_password", now.toISOString(), new Date(now.getTime() + HOUR).toISOString());
      audit(db, now, "auth.reset_requested", u.id);
      await mailer.send({ to: u.email, ...templates.resetPassword(`${base}/reset-password?token=${t}`) });
    }
    respond();
  });
  r.post("/auth/reset-password", limited("reset", 20, HOUR), async (req, res) => {
    const c = z.object({ token, password }).parse(req.body);
    const now = clock();
    const hash = await hashPassword(c.password);
    const userEmail = transaction(db, () => {
      const row = db
        .prepare("SELECT user_id,expires_at,used_at FROM auth_tokens WHERE token_hash=? AND purpose='reset_password'")
        .get(tokenHash(c.token)) as { user_id: string; expires_at: string; used_at: string | null } | undefined;
      if (!row || row.used_at || new Date(row.expires_at) <= now)
        throw new HttpError(400, "This reset link has expired or was already used. Request a new one.");
      db.prepare("UPDATE auth_tokens SET used_at=? WHERE token_hash=?").run(now.toISOString(), tokenHash(c.token));
      // Completing a reset proves control of the mailbox.
      db.prepare(
        "UPDATE users SET password_hash=?,password_changed_at=?,email_verified_at=COALESCE(email_verified_at,?) WHERE id=?",
      ).run(hash, now.toISOString(), now.toISOString(), row.user_id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
      db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='reset_password'").run(row.user_id);
      audit(db, now, "auth.password_reset", row.user_id);
      return (db.prepare("SELECT email FROM users WHERE id=?").get(row.user_id) as { email: string }).email;
    });
    void mailer.send({ to: userEmail, ...templates.passwordChanged() });
    res.json({ ok: true });
  });
  return { router: r, sendVerification };
}

/** Routes that require a session (mounted after the authentication middleware). */
export function accountRoutes(ctx: Ctx, sendVerification: ReturnType<typeof publicAuthRoutes>["sendVerification"]) {
  const { db, config, clock, mailer, billing, allow, limited } = ctx;
  const r = express.Router();
  const base = config.BASE_URL.replace(/\/$/, "");
  const sessionId = (res: express.Response) => res.locals.sessionId as string;
  async function confirmPassword(u: User, given: unknown) {
    const p = z.string().min(1).max(128).parse(given);
    if (!allow(`reauth:${u.id}`, 10, 15 * 60000)) throw new HttpError(429, "Too many attempts. Please wait and try again.");
    if (!(await verifyPassword(p, u.password_hash))) throw new HttpError(403, "Your current password is incorrect.");
  }
  r.get("/me", (_req, res) => {
    res.json(account(db, userOf(res), clock()));
  });
  r.post("/auth/resend-verification", (req, res, next) => {
    const u = userOf(res);
    if (u.email_verified_at) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    if (!allow(`resend:${u.id}`, 3, HOUR)) {
      tooMany(res, HOUR);
      return;
    }
    sendVerification(u, clock())
      .then((sent) => res.json({ ok: true, verificationSent: sent }))
      .catch(next);
  });
  r.post("/trial", limited("trial", 10, HOUR), (_req, res) => {
    const u = userOf(res),
      now = clock();
    if (!u.email_verified_at) throw new HttpError(403, "Confirm your email address to start the trial.", "EMAIL_UNVERIFIED");
    if (!startTrial(db, u.id, now)) throw new HttpError(409, "Your seven-day trial has already been used.");
    audit(db, now, "account.trial_started", u.id);
    res.json({ ok: true });
  });
  r.post("/account/password", limited("password", 10, HOUR), async (req, res) => {
    const u = userOf(res),
      c = z.object({ currentPassword: z.string(), newPassword: password }).parse(req.body);
    await confirmPassword(u, c.currentPassword);
    const now = clock();
    db.prepare("UPDATE users SET password_hash=?,password_changed_at=? WHERE id=?").run(
      await hashPassword(c.newPassword),
      now.toISOString(),
      u.id,
    );
    const revoked = db.prepare("DELETE FROM sessions WHERE user_id=? AND id!=?").run(u.id, sessionId(res)).changes;
    audit(db, now, "account.password_changed", u.id, null, { otherSessionsRevoked: revoked });
    void mailer.send({ to: u.email, ...templates.passwordChanged() });
    res.json({ ok: true, otherSessionsRevoked: revoked });
  });
  r.post("/account/email", limited("email-change", 5, HOUR), async (req, res) => {
    const u = userOf(res),
      c = z.object({ password: z.string(), newEmail: email }).parse(req.body);
    await confirmPassword(u, c.password);
    if (c.newEmail === u.email) throw new HttpError(400, "That is already your email address.");
    const now = clock();
    // Do not reveal whether another account uses the address; the change fails at confirmation.
    const t = newToken();
    db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='change_email'").run(u.id);
    db.prepare(
      "INSERT INTO auth_tokens(token_hash,user_id,purpose,new_email,created_at,expires_at) VALUES(?,?,?,?,?,?)",
    ).run(tokenHash(t), u.id, "change_email", c.newEmail, now.toISOString(), new Date(now.getTime() + 24 * HOUR).toISOString());
    audit(db, now, "account.email_change_requested", u.id);
    const sent = await mailer.send({ to: c.newEmail, ...templates.changeEmail(`${base}/verify-email?token=${t}`) });
    res.json({ ok: true, verificationSent: sent });
  });
  r.get("/account/sessions", (_req, res) => {
    const u = userOf(res);
    const rows = db
      .prepare("SELECT id,client,created_at,last_seen_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY last_seen_at DESC")
      .all(u.id, clock().toISOString()) as { id: string; client: string | null; created_at: string | null; last_seen_at: string | null }[];
    res.json({
      sessions: rows.map((s) => ({
        id: s.id,
        client: s.client || "Unknown client",
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
        current: s.id === sessionId(res),
      })),
    });
  });
  r.delete("/account/sessions/:id", (req, res) => {
    const u = userOf(res),
      id = z.string().regex(/^[a-f0-9]{32}$/).parse(req.params.id);
    const n = db.prepare("DELETE FROM sessions WHERE user_id=? AND id=?").run(u.id, id).changes;
    if (!n) throw new HttpError(404, "Session not found.");
    audit(db, clock(), "account.session_revoked", u.id);
    if (id === sessionId(res)) clearSessionCookie(res, config.secureCookies);
    res.json({ ok: true });
  });
  r.post("/account/sessions/revoke-others", (_req, res) => {
    const u = userOf(res);
    const n = db.prepare("DELETE FROM sessions WHERE user_id=? AND id!=?").run(u.id, sessionId(res)).changes;
    audit(db, clock(), "account.sessions_revoked", u.id, null, { count: n });
    res.json({ ok: true, revoked: n });
  });
  r.get("/account/export", limited("export", 20, HOUR), (_req, res) => {
    const u = userOf(res),
      now = clock();
    const profile = db.prepare("SELECT data,updated_at FROM profiles WHERE user_id=?").get(u.id) as { data: string; updated_at: string } | undefined;
    const exportData = {
      exportedAt: now.toISOString(),
      format: "scope-account-export/v1",
      account: {
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        emailVerifiedAt: u.email_verified_at,
        role: u.role,
        trialStartedAt: u.trial_started_at,
        trialEndsAt: u.trial_ends_at,
        passwordChangedAt: u.password_changed_at,
      },
      plan: account(db, u, now),
      profile: profile ? { ...JSON.parse(profile.data), updatedAt: profile.updated_at } : null,
      saved: db.prepare("SELECT opportunity_id AS opportunityId,created_at AS savedAt FROM saves WHERE user_id=?").all(u.id),
      analyses: db.prepare("SELECT opportunity_id AS opportunityId,month,created_at AS createdAt FROM analyses WHERE user_id=?").all(u.id),
      sessions: db.prepare("SELECT client,created_at AS createdAt,last_seen_at AS lastSeenAt,expires_at AS expiresAt FROM sessions WHERE user_id=?").all(u.id),
      subscription: db.prepare("SELECT provider,plan,status,current_period_end AS currentPeriodEnd,cancel_at_period_end AS cancelAtPeriodEnd FROM subscriptions WHERE user_id=?").get(u.id) ?? null,
      activity: db.prepare("SELECT created_at AS at,action FROM audit_log WHERE actor=? ORDER BY id DESC LIMIT 500").all(u.id),
    };
    audit(db, now, "account.exported", u.id);
    res.set("Content-Disposition", 'attachment; filename="scope-account-export.json"');
    res.json(exportData);
  });
  r.delete("/account", limited("delete-account", 5, HOUR), async (req, res) => {
    const u = userOf(res),
      c = z.object({ password: z.string(), confirm: z.literal("DELETE") }).parse(req.body);
    await confirmPassword(u, c.password);
    const now = clock();
    const sub = db.prepare("SELECT subscription_id,status FROM subscriptions WHERE user_id=?").get(u.id) as
      | { subscription_id: string | null; status: string }
      | undefined;
    if (sub?.subscription_id && ["active", "trialing", "past_due", "unpaid"].includes(sub.status)) {
      // Stop future charges before erasing the record that links the account to billing.
      if (!billing.enabled)
        throw new HttpError(409, "Your subscription must be cancelled before deletion. Contact the operator.");
      await billing.cancelImmediately(sub.subscription_id);
    }
    const alias = pseudonym(u.id);
    transaction(db, () => {
      // Accountability records survive under a pseudonym; personal data does not.
      db.prepare("UPDATE audit_log SET actor=? WHERE actor=?").run(alias, u.id);
      db.prepare("UPDATE audit_log SET target=? WHERE target=?").run(alias, u.id);
      db.prepare("UPDATE editorial_events SET actor=? WHERE actor=?").run(alias, u.id);
      db.prepare("UPDATE grant_drafts SET author=? WHERE author=?").run(alias, u.id);
      db.prepare("UPDATE grant_drafts SET submitted_by=? WHERE submitted_by=?").run(alias, u.id);
      db.prepare("UPDATE grant_drafts SET reviewer=? WHERE reviewer=?").run(alias, u.id);
      db.prepare("UPDATE inbound_messages SET reviewed_by=? WHERE reviewed_by=?").run(alias, u.id);
      db.prepare("UPDATE incidents SET created_by=? WHERE created_by=?").run(alias, u.id);
      db.prepare("DELETE FROM users WHERE id=?").run(u.id); // cascades sessions, profile, saves, analyses, tokens, subscription
      audit(db, now, "account.deleted", alias);
    });
    clearSessionCookie(res, config.secureCookies);
    void mailer.send({ to: u.email, ...templates.accountDeleted() });
    res.json({ ok: true });
  });
  // Business profile
  r.get("/profile", (_req, res) => {
    const row = db.prepare("SELECT data FROM profiles WHERE user_id=?").get(userOf(res).id) as { data: string } | undefined;
    res.json({ profile: row ? JSON.parse(row.data) : null });
  });
  r.put("/profile", limited("profile", 60, HOUR), (req, res) => {
    const p = profileSchema.parse(req.body);
    db.prepare(
      "INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
    ).run(userOf(res).id, JSON.stringify(p), clock().toISOString());
    res.json({ profile: p });
  });
  r.delete("/profile", (_req, res) => {
    db.prepare("DELETE FROM profiles WHERE user_id=?").run(userOf(res).id);
    audit(db, clock(), "account.profile_deleted", userOf(res).id);
    res.json({ ok: true });
  });
  r.get("/profile/export", (_req, res) => {
    const row = db.prepare("SELECT data,updated_at FROM profiles WHERE user_id=?").get(userOf(res).id) as
      | { data: string; updated_at: string }
      | undefined;
    res.set("Content-Disposition", 'attachment; filename="scope-profile.json"');
    res.json({ profile: row ? JSON.parse(row.data) : null, updatedAt: row?.updated_at || null });
  });
  return r;
}
