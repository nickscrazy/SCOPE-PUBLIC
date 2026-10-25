import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { loadConfig } from "./config.js";
import { configureLogging } from "./log.js";
import { openDatabase, applyMigrations, pendingMigrations, upsertOpportunities } from "./db.js";
import { grantsCatalogue, curatedImportSchema } from "./catalogue.js";
import { runTedSync, runMaintenance } from "./jobs.js";
import { createBackup, verifyBackup, restoreBackup, pruneBackups } from "./backup.js";
import { audit } from "./auth.js";

/**
 * Operator CLI. Requires filesystem access to the database: the trust boundary for every
 * command here is the host, not the web application.
 */
const [command, ...args] = process.argv.slice(2);
const config = loadConfig();
configureLogging(config.LOG_LEVEL, command !== "sync-ted");
const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const usage = `Usage: node dist/cli.js <command>
  migrate                 Back up (if a database exists), then apply pending migrations
  seed                    Load the reviewed funding references (idempotent; check dates preserved)
  sync-ted [--full] [--evidence <file>]  Run a bounded TED import now
  maintenance             Apply retention rules (sessions, tokens, stale accounts, logs)
  backup [label]          Write a verified (encrypted if configured) backup to BACKUP_DIR and prune
  verify-backup <file>    Decrypt and integrity-check a backup without restoring it
  restore <file>          Restore a backup to DATABASE_PATH (stop the app first)
  admin-role <email> <user|editor|reviewer|admin>   Grant or revoke an administrative role
  import-grants <file>    Trusted bulk import of reviewed references (legacy path; prefer the editorial UI)`;

switch (command) {
  case "migrate": {
    const exists = config.DATABASE_PATH !== ":memory:" && existsSync(config.DATABASE_PATH);
    const db = openDatabase(config.DATABASE_PATH, { migrate: false, migrationsDir: config.MIGRATIONS_DIR });
    const pending = pendingMigrations(db, config.MIGRATIONS_DIR);
    let backup = null;
    if (exists && pending.length)
      backup = createBackup(db, config.BACKUP_DIR, config.BACKUP_ENCRYPTION_KEY, new Date(), "pre-migration");
    const applied = applyMigrations(db, config.MIGRATIONS_DIR);
    db.close();
    out({ applied, preMigrationBackup: backup?.file ?? null });
    break;
  }
  case "seed": {
    const db = openDatabase(config.DATABASE_PATH);
    let changed = 0;
    // Each reference is due for re-verification on the editorial interval from its last check.
    for (const ref of grantsCatalogue)
      changed += upsertOpportunities(db, [ref], new Date(), {
        reviewDueAt: ref.verifiedAt ? new Date(new Date(ref.verifiedAt).getTime() + config.EDITORIAL_REVIEW_DAYS * 86400000).toISOString() : null,
      });
    db.close();
    out({ references: grantsCatalogue.length, changed, note: "Reviewed references only; no fictional records or accounts. Check dates are preserved." });
    break;
  }
  case "sync-ted": {
    const db = openDatabase(config.DATABASE_PATH);
    const result = await runTedSync(db, config, { trigger: "cli", full: args.includes("--full") });
    db.close();
    const evidence = args.indexOf("--evidence");
    if (evidence >= 0 && args[evidence + 1])
      writeFileSync(args[evidence + 1], JSON.stringify({ ...result, executedAt: new Date().toISOString() }, null, 2));
    out(result);
    if (result.status !== "success") process.exitCode = 1;
    break;
  }
  case "maintenance": {
    const db = openDatabase(config.DATABASE_PATH);
    out(runMaintenance(db, config));
    db.close();
    break;
  }
  case "backup": {
    const db = openDatabase(config.DATABASE_PATH);
    const result = createBackup(db, config.BACKUP_DIR, config.BACKUP_ENCRYPTION_KEY, new Date(), args[0] || "manual");
    db.close();
    out({ ...result, pruned: pruneBackups(config.BACKUP_DIR, config.BACKUP_RETENTION_DAYS) });
    if (!config.BACKUP_ENCRYPTION_KEY) console.error("WARNING: backup is not encrypted (BACKUP_ENCRYPTION_KEY unset).");
    break;
  }
  case "verify-backup": {
    if (!args[0]) throw new Error(usage);
    const r = verifyBackup(args[0], config.BACKUP_ENCRYPTION_KEY);
    out(r);
    if (!r.ok) process.exitCode = 1;
    break;
  }
  case "restore": {
    if (!args[0]) throw new Error(usage);
    out(restoreBackup(args[0], config.DATABASE_PATH, config.BACKUP_ENCRYPTION_KEY));
    const db = openDatabase(config.DATABASE_PATH, { migrate: false });
    out({ pendingMigrations: pendingMigrations(db, config.MIGRATIONS_DIR), note: "Run `migrate` if this release expects newer migrations." });
    db.close();
    break;
  }
  case "admin-role": {
    const [email, role] = args;
    if (!email || !["user", "editor", "reviewer", "admin"].includes(role)) throw new Error(usage);
    const db = openDatabase(config.DATABASE_PATH);
    const u = db.prepare("SELECT id,email_verified_at FROM users WHERE email=?").get(email.toLowerCase()) as { id: string; email_verified_at: string | null } | undefined;
    if (!u) throw new Error("No account uses that email address.");
    if (role !== "user" && !u.email_verified_at) throw new Error("The account must verify its email before receiving a role.");
    db.prepare("UPDATE users SET role=? WHERE id=?").run(role, u.id);
    // Role changes invalidate existing sessions so new privileges begin with a fresh login.
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
    audit(db, new Date(), "admin.role_set", "operator-cli", u.id, { role });
    db.close();
    out({ ok: true, role, sessionsRevoked: true });
    break;
  }
  case "import-grants": {
    const file = args[0];
    if (!file) throw new Error(usage);
    if (statSync(file).size > 1024 * 1024) throw new Error("Import exceeds 1 MiB.");
    const records = curatedImportSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    if (records.some((o) => o.verifiedAt && new Date(o.verifiedAt) > new Date()))
      throw new Error("Verification timestamp cannot be in the future.");
    const db = openDatabase(config.DATABASE_PATH);
    const n = upsertOpportunities(db, records);
    audit(db, new Date(), "editorial.bulk_import", "operator-cli", null, { records: records.length });
    db.close();
    out({ imported: records.length, changed: n });
    break;
  }
  default:
    console.error(usage);
    process.exitCode = command ? 1 : 0;
}
