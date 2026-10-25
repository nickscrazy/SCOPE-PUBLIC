import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import type { DB } from "./db.js";
import type { Account } from "../src/domain.js";
const scrypt = promisify(scryptCallback);
export type User = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
};
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
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function getUser(db: DB, req: Request, now: Date): User | undefined {
  const token = req.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("scope_session="))
    ?.slice(14);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  return db
    .prepare(
      "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?",
    )
    .get(tokenHash(token), now.toISOString()) as User | undefined;
}
export function createSession(
  db: DB,
  res: Response,
  userId: string,
  now: Date,
  secure: boolean,
) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    tokenHash(token),
    userId,
    new Date(now.getTime() + 30 * 86400000).toISOString(),
  );
  res.cookie("scope_session", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 30 * 86400000,
    path: "/",
  });
}
export function account(db: DB, u: User, now: Date): Account {
  const trial = !!u.trial_ends_at && new Date(u.trial_ends_at) > now;
  const usage = db
    .prepare(
      "SELECT COUNT(*) AS count FROM analyses WHERE user_id=? AND month=?",
    )
    .get(u.id, now.toISOString().slice(0, 7));
  return {
    id: u.id,
    email: u.email,
    plan: trial ? "trial" : "free",
    trialStartedAt: u.trial_started_at,
    trialEndsAt: u.trial_ends_at,
    trialAvailable: !u.trial_started_at,
    analysesUsed: Number(usage?.count || 0),
    analysesLimit: trial ? null : 3,
    savesLimit: trial ? null : 5,
  };
}
