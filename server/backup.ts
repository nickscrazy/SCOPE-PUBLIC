import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import type { DB } from "./db.js";

const MAGIC = Buffer.from("SCOPEBK1");
const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, "-");

function encrypt(data: Buffer, keyHex: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}
function decrypt(data: Buffer, keyHex: string) {
  if (!data.subarray(0, 8).equals(MAGIC)) throw new Error("Not an encrypted SCOPE backup.");
  const iv = data.subarray(8, 20),
    tag = data.subarray(data.length - 16),
    body = data.subarray(20, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
function integrity(path: string) {
  const check = new DatabaseSync(path, { readOnly: true });
  try {
    const r = check.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    const migrations = check.prepare("SELECT COUNT(*) AS n FROM migrations").get() as { n: number };
    return { ok: r.integrity_check === "ok", migrations: Number(migrations.n) };
  } finally {
    check.close();
  }
}

/** Online, transactionally consistent snapshot via VACUUM INTO, verified, then optionally encrypted. */
export function createBackup(db: DB, dir: string, keyHex?: string, now = new Date(), label = "scheduled") {
  mkdirSync(resolve(dir), { recursive: true, mode: 0o700 });
  const plain = join(resolve(dir), `.tmp-${randomBytes(6).toString("hex")}.db`);
  db.exec(`VACUUM INTO '${plain.replaceAll("'", "''")}'`);
  const check = integrity(plain);
  if (!check.ok) {
    rmSync(plain, { force: true });
    throw new Error("Backup snapshot failed its integrity check.");
  }
  const data = readFileSync(plain);
  rmSync(plain, { force: true });
  const name = `scope-${stamp(now)}-${label.replace(/[^a-z0-9-]/gi, "")}.${keyHex ? "db.enc" : "db"}`;
  const out = join(resolve(dir), name);
  writeFileSync(out, keyHex ? encrypt(data, keyHex) : data, { mode: 0o600 });
  const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
  writeFileSync(out + ".sha256", `${sha256}  ${name}\n`, { mode: 0o600 });
  return { file: out, bytes: statSync(out).size, encrypted: !!keyHex, sha256, migrations: check.migrations };
}
function readBackup(file: string, keyHex?: string) {
  const data = readFileSync(file);
  const sidecar = file + ".sha256";
  if (existsSync(sidecar)) {
    const expected = readFileSync(sidecar, "utf8").split(/\s+/)[0];
    if (createHash("sha256").update(data).digest("hex") !== expected) throw new Error("Backup checksum mismatch.");
  }
  if (file.endsWith(".enc")) {
    if (!keyHex) throw new Error("BACKUP_ENCRYPTION_KEY is required to read an encrypted backup.");
    return decrypt(data, keyHex);
  }
  return data;
}
/** Decrypts to a temporary file and runs the integrity check without touching live data. */
export function verifyBackup(file: string, keyHex?: string) {
  const tmp = resolve(file + `.verify-${randomBytes(4).toString("hex")}.db`);
  try {
    writeFileSync(tmp, readBackup(file, keyHex), { mode: 0o600 });
    return integrity(tmp);
  } finally {
    rmSync(tmp, { force: true });
  }
}
/**
 * Restores a verified backup to DATABASE_PATH. The application must be stopped.
 * The current database (with WAL/SHM) is kept as `<path>.pre-restore-<time>` for rollback.
 */
export function restoreBackup(file: string, databasePath: string, keyHex?: string, now = new Date()) {
  const target = resolve(databasePath);
  const staged = target + ".restore-staged";
  writeFileSync(staged, readBackup(file, keyHex), { mode: 0o600 });
  const check = integrity(staged);
  if (!check.ok) {
    rmSync(staged, { force: true });
    throw new Error("Backup failed its integrity check; nothing was changed.");
  }
  let previous: string | null = null;
  if (existsSync(target)) {
    // Fold any WAL into the current file before setting it aside.
    const live = new DatabaseSync(target);
    live.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    live.close();
    previous = `${target}.pre-restore-${stamp(now)}`;
    copyFileSync(target, previous);
  }
  for (const suffix of ["-wal", "-shm"]) rmSync(target + suffix, { force: true });
  renameSync(staged, target);
  return { restored: target, previous, migrations: check.migrations };
}
export function pruneBackups(dir: string, retentionDays: number, now = new Date()) {
  if (!existsSync(dir)) return [];
  const cutoff = now.getTime() - retentionDays * 86400000;
  const removed: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!/^scope-.*\.db(\.enc)?$/.test(f)) continue;
    const p = join(dir, f);
    if (statSync(p).mtimeMs < cutoff) {
      rmSync(p, { force: true });
      rmSync(p + ".sha256", { force: true });
      removed.push(basename(p));
    }
  }
  return removed;
}
