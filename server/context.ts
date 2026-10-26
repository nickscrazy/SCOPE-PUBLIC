import type express from "express";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import type { Mailer } from "./email.js";
import type { Billing } from "./billing.js";
import type { FetchLike } from "./ted.js";
import type { User } from "./auth.js";
import { tokenHash } from "./auth.js";
import { transaction } from "./db.js";

export type Ctx = {
  db: DB;
  config: Config;
  clock: () => Date;
  mailer: Mailer;
  billing: Billing;
  tedFetcher: FetchLike;
  /** Fixed-window limiter persisted in SQLite; `key` should already include its scope. */
  allow: (key: string, limit: number, windowMs: number) => boolean;
  limited: (name: string, limit: number, windowMs: number) => express.RequestHandler;
  /** Failed attempts recorded against `key` in the current window. */
  failures: (key: string) => number;
  /** Records a failed attempt and returns the new count. */
  penalise: (key: string, windowMs: number) => number;
  /** Clears a failure counter once the real credential has been presented. */
  forgive: (key: string) => void;
  /** Test harnesses may raise limits; refused in production. */
  multiplier: number;
};
export type Locals = { user: User; sessionId: string };
export function userOf(res: express.Response): User {
  return (res.locals as Locals).user;
}
export function makeLimiter(db: DB, clock: () => Date, multiplier = 1) {
  const allow = (key: string, baseLimit: number, windowMs: number) => {
    const limit = baseLimit * multiplier;
    const now = clock().getTime(),
      k = tokenHash(key);
    return transaction(db, () => {
      const r = db.prepare("SELECT count,reset_at FROM rate_limits WHERE key=?").get(k) as
        | { count: number; reset_at: number }
        | undefined;
      if (!r || Number(r.reset_at) <= now) {
        db.prepare("INSERT OR REPLACE INTO rate_limits VALUES(?,?,?)").run(k, 1, now + windowMs);
        return true;
      }
      if (Number(r.count) >= limit) return false;
      db.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").run(k);
      return true;
    });
  };
  const limited =
    (name: string, limit: number, windowMs: number): express.RequestHandler =>
    (req, res, next) => {
      if (!allow(`${name}:ip:${req.ip}`, limit, windowMs)) {
        tooMany(res, windowMs);
        return;
      }
      next();
    };
  /**
   * Failure counters, kept apart from `allow`'s request counters.
   *
   * `allow` counts every attempt, so anyone able to send requests can exhaust a bucket. That is
   * safe for a bucket keyed on the caller, and unsafe for one keyed on an identity an attacker
   * merely has to name. These count only attempts that actually failed and are cleared the
   * moment the real credential is presented, so a failed attempt can never deny the account
   * holder.
   */
  const failures = (key: string) => {
    const r = db
      .prepare("SELECT count,reset_at FROM rate_limits WHERE key=?")
      .get(tokenHash(key)) as { count: number; reset_at: number } | undefined;
    return !r || Number(r.reset_at) <= clock().getTime() ? 0 : Number(r.count);
  };
  const penalise = (key: string, windowMs: number) => {
    const now = clock().getTime(),
      k = tokenHash(key);
    return transaction(db, () => {
      const r = db.prepare("SELECT count,reset_at FROM rate_limits WHERE key=?").get(k) as
        | { count: number; reset_at: number }
        | undefined;
      if (!r || Number(r.reset_at) <= now) {
        db.prepare("INSERT OR REPLACE INTO rate_limits VALUES(?,?,?)").run(k, 1, now + windowMs);
        return 1;
      }
      // The window rolls forward on each failure, so a sustained attack keeps its penalty
      // instead of being handed a fresh budget every window. Only failures reach here, so
      // this cannot be used to extend a denial against the account holder.
      const next = Number(r.count) + 1;
      db.prepare("UPDATE rate_limits SET count=?,reset_at=? WHERE key=?").run(next, now + windowMs, k);
      return next;
    });
  };
  const forgive = (key: string) => {
    db.prepare("DELETE FROM rate_limits WHERE key=?").run(tokenHash(key));
  };
  return { allow, limited, failures, penalise, forgive, multiplier };
}
export function tooMany(res: express.Response, windowMs: number) {
  res
    .set("Retry-After", String(Math.ceil(windowMs / 1000)))
    .status(429)
    .json({ error: "Too many requests. Please try again later." });
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
