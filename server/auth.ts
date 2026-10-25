import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import type { DB } from "./db.js";
import type { Account, Role } from "../src/domain.js";
const scrypt = promisify(scryptCallback);
export type User = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  email_verified_at: string | null;
  role: Role;
  password_changed_at: string | null;
  trial_requested: number;
};
export const SESSION_COOKIE = "scope_session";
export const SESSION_DAYS = 30;
export const TRIAL_DAYS = 7;
export const FREE_ANALYSES = 3;
export const FREE_SAVES = 5;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Equal-cost verification for unknown accounts reduces enumeration by timing.
export const DUMMY_HASH = "00000000000000000000000000000000:" + "00".repeat(64);
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");

export function sessionToken(req: Request): string | undefined {
  const token = req.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(SESSION_COOKIE + "="))
    ?.slice(SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
export function getSession(
  db: DB,
  req: Request,
  now: Date,
): { user: User; sessionId: string } | undefined {
  const token = sessionToken(req);
  if (!token) return;
  const row = db
    .prepare(
      "SELECT users.*, sessions.id AS session_id, sessions.last_seen_at AS session_seen FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?",
    )
    .get(tokenHash(token), now.toISOString()) as
    | (User & { session_id: string; session_seen: string | null })
    | undefined;
  if (!row) return;
  // Touch at most every five minutes to keep reads cheap.
  if (
    !row.session_seen ||
    now.getTime() - new Date(row.session_seen).getTime() > 5 * 60000
  )
    db.prepare("UPDATE sessions SET last_seen_at=? WHERE id=?").run(
      now.toISOString(),
      row.session_id,
    );
  const { session_id, session_seen: _s, ...user } = row;
  void _s;
  return { user: user as User, sessionId: session_id };
}
/** Coarse client description only (browser family and OS), never the raw user agent or IP. */
export function describeClient(ua = ""): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown OS";
  return `${browser} on ${os}`;
}
export function createSession(
  db: DB,
  req: Request,
  res: Response,
  userId: string,
  now: Date,
  secure: boolean,
) {
  const token = newToken();
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at,id,created_at,last_seen_at,client) VALUES(?,?,?,?,?,?,?)",
  ).run(
    tokenHash(token),
    userId,
    new Date(now.getTime() + SESSION_DAYS * 86400000).toISOString(),
    randomBytes(16).toString("hex"),
    now.toISOString(),
    now.toISOString(),
    describeClient(req.headers["user-agent"]),
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: SESSION_DAYS * 86400000,
    path: "/",
  });
}
export function clearSessionCookie(res: Response, secure: boolean) {
  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
  });
}
type SubscriptionRow = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: number;
};
/** Paid entitlement comes only from webhook-verified subscription state. */
export function paidActive(s: SubscriptionRow | undefined, now: Date) {
  if (!s) return false;
  if (s.status === "active" || s.status === "trialing") return true;
  // A failed renewal keeps access until the paid period ends.
  return (
    s.status === "past_due" &&
    !!s.current_period_end &&
    new Date(s.current_period_end) > now
  );
}
export function account(db: DB, u: User, now: Date): Account {
  const sub = db
    .prepare(
      "SELECT status,current_period_end,cancel_at_period_end FROM subscriptions WHERE user_id=?",
    )
    .get(u.id) as SubscriptionRow | undefined;
  const paid = paidActive(sub, now);
  const trial = !paid && !!u.trial_ends_at && new Date(u.trial_ends_at) > now;
  const usage = db
    .prepare(
      "SELECT COUNT(*) AS count FROM analyses WHERE user_id=? AND month=?",
    )
    .get(u.id, now.toISOString().slice(0, 7));
  const limited = !paid && !trial;
  return {
    id: u.id,
    email: u.email,
    emailVerified: !!u.email_verified_at,
    role: u.role,
    plan: paid ? "solo" : trial ? "trial" : "free",
    trialStartedAt: u.trial_started_at,
    trialEndsAt: u.trial_ends_at,
    trialAvailable: !u.trial_started_at,
    trialPending: !u.trial_started_at && !!u.trial_requested && !u.email_verified_at,
    analysesUsed: Number(usage?.count || 0),
    analysesLimit: limited ? FREE_ANALYSES : null,
    savesLimit: limited ? FREE_SAVES : null,
    subscription: sub
      ? {
          status: sub.status,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        }
      : null,
  };
}
/** Starts the one-time trial. Requires a verified email. Returns false if already used. */
export function startTrial(db: DB, userId: string, now: Date): boolean {
  return (
    db
      .prepare(
        "UPDATE users SET trial_started_at=?,trial_ends_at=? WHERE id=? AND trial_started_at IS NULL AND email_verified_at IS NOT NULL",
      )
      .run(
        now.toISOString(),
        new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString(),
        userId,
      ).changes > 0
  );
}
export function audit(
  db: DB,
  now: Date,
  action: string,
  actor: string | null,
  target: string | null = null,
  detail: Record<string, unknown> | null = null,
) {
  db.prepare(
    "INSERT INTO audit_log(created_at,actor,action,target,detail) VALUES(?,?,?,?,?)",
  ).run(
    now.toISOString(),
    actor,
    action,
    target,
    detail ? JSON.stringify(detail) : null,
  );
}
/** Stable pseudonym used to retain accountability records after an account is erased. */
export const pseudonym = (userId: string) =>
  "deleted:" + createHash("sha256").update("scope-erasure:" + userId).digest("hex").slice(0, 16);
