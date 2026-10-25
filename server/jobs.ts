import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { syncTed, type FetchLike, type SyncResult } from "./ted.js";
import { audit } from "./auth.js";
import { log, errorName } from "./log.js";

/** Cross-process mutual exclusion through a leased row; survives crashes via expiry. */
export function acquireLock(
  db: DB,
  name: string,
  ttlMs: number,
  now = Date.now(),
): string | null {
  const holder = randomUUID();
  return transaction(db, () => {
    const row = db
      .prepare("SELECT expires_at FROM job_locks WHERE name=?")
      .get(name) as { expires_at: number } | undefined;
    if (row && row.expires_at > now) return null;
    db.prepare(
      "INSERT INTO job_locks(name,holder,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at",
    ).run(name, holder, now + ttlMs);
    return holder;
  });
}
export function releaseLock(db: DB, name: string, holder: string) {
  db.prepare("DELETE FROM job_locks WHERE name=? AND holder=?").run(
    name,
    holder,
  );
}

export async function sendAlert(
  config: Pick<Config, "ALERT_WEBHOOK_URL">,
  payload: Record<string, unknown>,
  fetcher: FetchLike = fetch,
) {
  if (!config.ALERT_WEBHOOK_URL) return false;
  try {
    // The alert URL is operator configuration, never user input. Payload holds no personal data.
    const r = await fetcher(config.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "scope", ...payload }),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch (e) {
    log.warn("alert.failed", { error: errorName(e) });
    return false;
  }
}

export function consecutiveFailures(db: DB, source = "TED") {
  const runs = db
    .prepare(
      "SELECT status FROM sync_runs WHERE source=? AND status IN ('success','failed') ORDER BY started_at DESC LIMIT 10",
    )
    .all(source) as { status: string }[];
  let n = 0;
  for (const r of runs) {
    if (r.status !== "failed") break;
    n++;
  }
  return n;
}

const SYNC_INCIDENT = "TED source refresh failing";
export async function runTedSync(
  db: DB,
  config: Config,
  options: {
    trigger: string;
    actor?: string | null;
    full?: boolean;
    fetcher?: FetchLike;
    alertFetcher?: FetchLike;
    clock?: () => Date;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<SyncResult | { status: "skipped"; reason: string }> {
  const clock = options.clock || (() => new Date());
  const lock = acquireLock(db, "ted-sync", 15 * 60000, clock().getTime());
  if (!lock) return { status: "skipped", reason: "A sync is already running." };
  try {
    // Runs abandoned by a crash are closed so they cannot look like work in progress.
    db.prepare(
      "UPDATE sync_runs SET status='failed',finished_at=?,error='Interrupted run' WHERE source='TED' AND status='running'",
    ).run(clock().toISOString());
    const result = await syncTed(db, {
      fetcher: options.fetcher,
      clock,
      sleep: options.sleep,
      maxPages: config.TED_MAX_PAGES,
      limit: config.TED_PAGE_SIZE,
      full: options.full,
      trigger: options.trigger,
    });
    const now = clock();
    audit(db, now, "ingestion.ted_sync", options.actor ?? "system", result.runId, {
      status: result.status,
      count: result.count,
      trigger: options.trigger,
    });
    log[result.status === "success" ? "info" : "error"]("ingestion.ted_sync", {
      status: result.status,
      count: result.count,
      error: result.error,
      trigger: options.trigger,
      capped: result.capped,
    });
    const open = db
      .prepare(
        "SELECT id FROM incidents WHERE status='open' AND source='system' AND title=?",
      )
      .get(SYNC_INCIDENT) as { id: string } | undefined;
    if (result.status === "failed") {
      const failures = consecutiveFailures(db);
      // One failure is retried at the next run; repeated failure is an incident.
      if (failures >= 2 && !open) {
        db.prepare(
          "INSERT INTO incidents(id,created_at,updated_at,severity,status,title,customer_message,customer_visible,source) VALUES(?,?,?,?,?,?,?,?,?)",
        ).run(
          randomUUID(),
          now.toISOString(),
          now.toISOString(),
          "minor",
          "open",
          SYNC_INCIDENT,
          "Public tender data has not refreshed recently. Records shown may be out of date.",
          1,
          "system",
        );
        await sendAlert(
          config,
          {
            event: "ted_sync_failing",
            consecutiveFailures: failures,
            error: result.error,
            at: now.toISOString(),
          },
          options.alertFetcher,
        );
      }
    } else if (open) {
      db.prepare(
        "UPDATE incidents SET status='resolved',updated_at=? WHERE id=?",
      ).run(now.toISOString(), open.id);
      await sendAlert(
        config,
        { event: "ted_sync_recovered", at: now.toISOString() },
        options.alertFetcher,
      );
    }
    return result;
  } finally {
    releaseLock(db, "ted-sync", lock);
  }
}

/** Retention and hygiene. Every rule here is documented in RUNBOOK.md and the privacy page. */
export function runMaintenance(db: DB, config: Config, now = new Date()) {
  const iso = (days: number) =>
    new Date(now.getTime() - days * 86400000).toISOString();
  return transaction(db, () => {
    const r = {
      sessions: db
        .prepare("DELETE FROM sessions WHERE expires_at<=?")
        .run(now.toISOString()).changes,
      tokens: db
        .prepare(
          "DELETE FROM auth_tokens WHERE expires_at<=? OR used_at IS NOT NULL",
        )
        .run(iso(1)).changes,
      rateLimits: db
        .prepare("DELETE FROM rate_limits WHERE reset_at<=?")
        .run(now.getTime()).changes,
      unverifiedAccounts: db
        .prepare(
          "DELETE FROM users WHERE email_verified_at IS NULL AND role='user' AND created_at<=? AND id NOT IN (SELECT user_id FROM subscriptions)",
        )
        .run(iso(config.UNVERIFIED_ACCOUNT_DAYS)).changes,
      analyses: db
        .prepare("DELETE FROM analyses WHERE created_at<=?")
        .run(iso(400)).changes,
      audit: db
        .prepare("DELETE FROM audit_log WHERE created_at<=?")
        .run(iso(config.AUDIT_RETENTION_DAYS)).changes,
      syncRuns: db
        .prepare("DELETE FROM sync_runs WHERE started_at<=?")
        .run(iso(180)).changes,
      billingEvents: db
        .prepare("DELETE FROM billing_events WHERE received_at<=?")
        .run(iso(400)).changes,
      inbound: db
        .prepare(
          "DELETE FROM inbound_messages WHERE received_at<=? AND status!='pending'",
        )
        .run(iso(90)).changes,
    };
    log.info("maintenance.completed", r);
    return r;
  });
}

/** Twice-daily (configurable) in-process scheduler. One replica; the lease prevents overlap. */
export function startScheduler(db: DB, config: Config) {
  let lastSlot = "",
    lastMaintenance = "";
  const tick = async () => {
    const now = new Date();
    const slot = `${now.toISOString().slice(0, 10)}T${now.getUTCHours()}`;
    if (now.getUTCMinutes() < 5 && config.TED_SYNC_HOURS_UTC.includes(now.getUTCHours()) && slot !== lastSlot) {
      lastSlot = slot;
      try {
        await runTedSync(db, config, { trigger: "schedule" });
      } catch (e) {
        log.error("scheduler.ted_failed", { error: errorName(e) });
      }
    }
    if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5 && slot !== lastMaintenance) {
      lastMaintenance = slot;
      try {
        runMaintenance(db, config, now);
      } catch (e) {
        log.error("scheduler.maintenance_failed", { error: errorName(e) });
      }
    }
  };
  const timer = setInterval(() => void tick(), 60000);
  timer.unref();
  log.info("scheduler.started", { tedHoursUtc: config.TED_SYNC_HOURS_UTC });
  return () => clearInterval(timer);
}
