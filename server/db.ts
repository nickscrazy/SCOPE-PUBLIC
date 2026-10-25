import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Opportunity } from "../src/domain.js";
export type DB = DatabaseSync;

export function migrationNames(dir = process.env.MIGRATIONS_DIR || "server/migrations") {
  return readdirSync(resolve(dir))
    .filter((n) => /^\d{3}_[a-z0-9_]+\.sql$/.test(n))
    .sort();
}
export function openDatabase(
  path = process.env.DATABASE_PATH || "./data/scope.db",
  { migrate = true, migrationsDir = process.env.MIGRATIONS_DIR || "server/migrations" } = {},
): DB {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  if (migrate) applyMigrations(db, migrationsDir);
  return db;
}
export function pendingMigrations(db: DB, dir?: string) {
  return migrationNames(dir).filter(
    (name) => !db.prepare("SELECT 1 FROM migrations WHERE name=?").get(name),
  );
}
export function applyMigrations(db: DB, dir?: string): string[] {
  const applied: string[] = [];
  for (const name of pendingMigrations(db, dir)) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Re-check inside the write lock: another process may have applied it.
      if (!db.prepare("SELECT 1 FROM migrations WHERE name=?").get(name)) {
        db.exec(readFileSync(resolve(dir || process.env.MIGRATIONS_DIR || "server/migrations", name), "utf8"));
        db.prepare("INSERT INTO migrations VALUES(?,?)").run(
          name,
          new Date().toISOString(),
        );
        applied.push(name);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return applied;
}
export function transaction<T>(db: DB, fn: () => T): T {
  if (db.isTransaction) return fn();
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
export function contentHash(o: Opportunity) {
  // Retrieval/check timestamps and computed flags are not part of the source content.
  const {
    fetchedAt: _f,
    verifiedAt: _v,
    stale: _s,
    lifecycle: _l,
    supersededBy: _b,
    reviewDueAt: _r,
    ...content
  } = o;
  void [_f, _v, _s, _l, _b, _r];
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
/** Idempotent upsert keyed on (source, source_id). Returns the number of new or changed records. */
export function upsertOpportunities(
  db: DB,
  records: Opportunity[],
  now = new Date(),
  extra: { reviewDueAt?: string | null } = {},
): number {
  return transaction(db, () => {
    let changed = 0;
    for (const o of records) {
      const hash = contentHash(o);
      const existing = db
        .prepare(
          "SELECT id,content_hash FROM opportunities WHERE source=? AND source_id=?",
        )
        .get(o.source, o.sourceId) as
        | { id: string; content_hash: string }
        | undefined;
      // Stable identity: a re-imported record keeps the id first assigned to it.
      const id = existing?.id ?? o.id;
      const stored = JSON.stringify({ ...o, id });
      if (existing) {
        db.prepare(
          "UPDATE opportunities SET data=?,content_hash=?,last_seen_at=?,procedure_id=COALESCE(?,procedure_id),review_due_at=COALESCE(?,review_due_at) WHERE id=?",
        ).run(
          stored,
          hash,
          now.toISOString(),
          o.procedureId ?? null,
          extra.reviewDueAt ?? null,
          id,
        );
      } else {
        db.prepare(
          "INSERT INTO opportunities(id,source,source_id,data,content_hash,first_seen_at,last_seen_at,procedure_id,review_due_at) VALUES(?,?,?,?,?,?,?,?,?)",
        ).run(
          id,
          o.source,
          o.sourceId,
          stored,
          hash,
          now.toISOString(),
          now.toISOString(),
          o.procedureId ?? null,
          extra.reviewDueAt ?? null,
        );
      }
      if (existing?.content_hash !== hash) changed++;
      db.prepare(
        "INSERT OR IGNORE INTO opportunity_versions(opportunity_id,content_hash,data,created_at) VALUES(?,?,?,?)",
      ).run(id, hash, stored, now.toISOString());
    }
    return changed;
  });
}
type Row = {
  data: string;
  lifecycle: string;
  superseded_by: string | null;
  review_due_at: string | null;
  editorial_state: string;
};
function hydrate(r: Row): Opportunity {
  return {
    ...(JSON.parse(r.data) as Opportunity),
    lifecycle: r.lifecycle as Opportunity["lifecycle"],
    supersededBy: r.superseded_by,
    reviewDueAt: r.review_due_at,
  };
}
/** Customer-visible catalogue: published editorial state only. */
export function allOpportunities(db: DB): Opportunity[] {
  return (
    db
      .prepare(
        "SELECT data,lifecycle,superseded_by,review_due_at,editorial_state FROM opportunities WHERE editorial_state='published'",
      )
      .all() as Row[]
  ).map(hydrate);
}
export function getOpportunity(db: DB, id: string): Opportunity | undefined {
  const r = db
    .prepare(
      "SELECT data,lifecycle,superseded_by,review_due_at,editorial_state FROM opportunities WHERE id=? AND editorial_state='published'",
    )
    .get(id) as Row | undefined;
  return r ? hydrate(r) : undefined;
}
