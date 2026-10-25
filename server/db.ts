import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Opportunity } from "../src/domain.js";
export type DB = DatabaseSync;
export function openDatabase(
  path = process.env.DATABASE_PATH || "./data/scope.db",
): DB {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const name of readdirSync(resolve("server/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (!db.prepare("SELECT name FROM migrations WHERE name=?").get(name)) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(readFileSync(resolve("server/migrations", name), "utf8"));
        db.prepare("INSERT INTO migrations VALUES(?,?)").run(
          name,
          new Date().toISOString(),
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
  }
  return db;
}
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function upsertOpportunities(
  db: DB,
  records: Opportunity[],
  now = new Date(),
): number {
  return transaction(db, () => {
    for (const o of records) {
      const { fetchedAt: _f, verifiedAt: _v, stale: _s, ...content } = o;
      void _f;
      void _v;
      void _s;
      const hash = createHash("sha256")
        .update(JSON.stringify(content))
        .digest("hex");
      db.prepare(
        "INSERT INTO opportunities VALUES(?,?,?,?,?,?,?) ON CONFLICT(source,source_id) DO UPDATE SET data=excluded.data,content_hash=excluded.content_hash,last_seen_at=excluded.last_seen_at",
      ).run(
        o.id,
        o.source,
        o.sourceId,
        JSON.stringify(o),
        hash,
        now.toISOString(),
        now.toISOString(),
      );
      db.prepare(
        "INSERT OR IGNORE INTO opportunity_versions(opportunity_id,content_hash,data,created_at) VALUES(?,?,?,?)",
      ).run(o.id, hash, JSON.stringify(o), now.toISOString());
    }
    return records.length;
  });
}
export function allOpportunities(db: DB): Opportunity[] {
  return db
    .prepare("SELECT data FROM opportunities")
    .all()
    .map((r) => JSON.parse(String(r.data)) as Opportunity);
}
