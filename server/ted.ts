import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { transaction, upsertOpportunities } from "./db.js";
import type { Opportunity } from "../src/domain.js";
import { log } from "./log.js";
export const TED_URL = "https://api.ted.europa.eu/v3/notices/search";
export const TED_FIELDS = [
  "publication-number",
  "notice-title",
  "title-proc",
  "description-proc",
  "buyer-name",
  "buyer-country",
  "publication-date",
  "classification-cpv",
  "estimated-value-proc",
  "estimated-value-cur-proc",
  "deadline-receipt-tender-date-lot",
  "deadline-receipt-tender-time-lot",
  "notice-type",
  "procedure-identifier",
  "change-notice-version-identifier",
];
const RESULT_FIELDS = [
  "publication-number",
  "procedure-identifier",
  "publication-date",
  "notice-type",
];
const responseSchema = z.object({
  notices: z.array(z.record(z.string(), z.unknown())).max(250),
  totalNoticeCount: z.number().nonnegative(),
  timedOut: z.boolean().optional(),
});
const publicationNumber = z.string().regex(/^\d{1,8}-\d{4}$/);
const procedureId = z
  .string()
  .regex(/^[A-Za-z0-9-]{8,80}$/)
  .optional()
  .catch(undefined);
function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join("; ");
  if (v && typeof v === "object") {
    const map = v as Record<string, unknown>;
    return text(map.eng ?? map.en ?? Object.values(map)[0]);
  }
  return "";
}
function dateValue(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}(?:[+-]\d{2}:\d{2}|Z)?$/.test(s);
  const d = new Date(dateOnly ? s.slice(0, 10) + "T00:00:00.000Z" : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const sectorMap: Record<string, string> = {
  "03": "agriculture",
  "09": "energy",
  "15": "food",
  "30": "office equipment",
  "31": "electrical",
  "32": "technology",
  "33": "health",
  "34": "transport",
  "35": "security",
  "38": "laboratory",
  "39": "furnishings",
  "44": "construction materials",
  "45": "construction",
  "48": "digital",
  "50": "maintenance",
  "55": "hospitality",
  "60": "transport",
  "63": "logistics",
  "64": "communications",
  "65": "utilities",
  "66": "financial services",
  "70": "real estate",
  "71": "engineering",
  "72": "digital",
  "73": "research",
  "75": "public services",
  "77": "environment",
  "79": "business services",
  "80": "education",
  "85": "health",
  "90": "environment",
  "92": "culture",
  "98": "services",
};
const LOT_DATE = /^(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?$/;
const LOT_TIME = /^(\d{2}:\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})?$/;
/**
 * Submission deadlines, one entry per lot. TED states the date and the time in separate
 * parallel arrays; the time carries the authoritative UTC offset and entries pair by position.
 *
 * Two safeguards keep an open lot from being treated as closed:
 *  - a lot with a date but no readable time falls back to the end of that day, an upper bound,
 *    and is flagged approximate rather than presented as a stated closing time;
 *  - if any entry cannot be read at all, `complete` is false and the caller must not infer
 *    closure from the entries that did parse.
 */
export function parseLotDeadlines(rawDates: unknown, rawTimes: unknown) {
  const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
  const dates = list(rawDates),
    times = list(rawTimes);
  const values: string[] = [];
  let complete = true,
    approximate = false;
  // Parallel arrays of different lengths mean lots cannot be paired reliably.
  if (times.length && times.length !== dates.length) complete = false;
  for (let i = 0; i < dates.length; i++) {
    const day = LOT_DATE.exec(text(dates[i]));
    if (!day) {
      complete = false;
      continue;
    }
    const time = times.length === dates.length ? LOT_TIME.exec(text(times[i])) : null;
    if (!time) approximate = true;
    const at = new Date(
      time
        ? `${day[1]}T${time[1]}${time[2] ?? day[2] ?? "Z"}`
        : `${day[1]}T23:59:59${day[2] ?? "Z"}`,
    );
    if (Number.isNaN(at.getTime())) {
      complete = false;
      continue;
    }
    values.push(at.toISOString());
  }
  return {
    values: [...new Set(values)].sort(),
    lots: dates.length,
    complete,
    approximate,
  };
}

export function normalizeNotice(
  n: Record<string, unknown>,
  now: Date,
): Opportunity {
  const publication = publicationNumber.parse(n["publication-number"]),
    cpv = z
      .array(z.string().regex(/^\d{8}$/))
      .max(200)
      .parse(n["classification-cpv"] || []),
    title = text(n["title-proc"]) || text(n["notice-title"]);
  if (!title) throw new Error("TED notice is missing title.");
  const sector = sectorMap[cpv[0]?.slice(0, 2)] || "public procurement";
  const rawAmount = n["estimated-value-proc"];
  const numberAmount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && /^\d+(?:\.\d+)?$/.test(rawAmount)
        ? Number(rawAmount)
        : NaN;
  const amount =
    n["estimated-value-cur-proc"] === "EUR" &&
    Number.isFinite(numberAmount) &&
    numberAmount >= 0
      ? numberAmount
      : null;
  const lots = parseLotDeadlines(
    n["deadline-receipt-tender-date-lot"],
    n["deadline-receipt-tender-time-lot"],
  );
  // A notice-wide deadline exists only when every lot shares one closing instant. Where lots
  // close at different times the record carries the full set and the deadline is resolved at
  // read time, so a stored value can never go stale.
  const deadline = lots.values.length === 1 ? lots.values[0] : null;
  const procedure = procedureId.parse(n["procedure-identifier"]) ?? null;
  const isChange = !!text(n["change-notice-version-identifier"]);
  return {
    id: "ted-" + publication,
    sourceId: publication,
    source: "TED",
    title: title.slice(0, 1000),
    buyer: text(n["buyer-name"]).slice(0, 500) || "Buyer not supplied",
    type: "tender",
    description: (
      text(n["description-proc"]) ||
      "Published TED notice metadata. Full procurement documents have not been evaluated."
    ).slice(0, 16000),
    sector,
    tags: [sector],
    cpv,
    geography: "Malta",
    value: amount,
    deadline,
    lotDeadlines: lots.values,
    lotCount: lots.lots,
    deadlinesComplete: lots.complete,
    deadlineApproximate: lots.approximate,
    publishedAt: dateValue(n["publication-date"]),
    fetchedAt: now.toISOString(),
    verifiedAt: now.toISOString(),
    sourceUrl: `https://ted.europa.eu/en/notice/-/detail/${publication}`,
    documentsUrl: `https://ted.europa.eu/en/notice/${publication}/pdf`,
    sourceVersion: publication + (isChange ? " (change notice)" : ""),
    procedureId: procedure,
    status: "published",
    role: [],
    conditions: [
      {
        label: "Mandatory selection and award conditions",
        field: "unknown",
        sourceLocator:
          "Original TED notice and procurement documents — not evaluated",
      },
      {
        label: "Submission deadline, lot scope and current notice status",
        field: "unknown",
        sourceLocator:
          "Original TED notice — verify amendments and lot-specific deadlines",
      },
    ],
  };
}
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type SyncOptions = {
  fetcher?: FetchLike;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
  limit?: number;
  /** Full 90-day window instead of the incremental window from the last success. */
  full?: boolean;
  trigger?: string;
};
export type SyncResult = {
  status: "success" | "failed";
  count: number;
  changed?: number;
  results?: number;
  superseded?: number;
  closedByResult?: number;
  totalAvailable?: number;
  capped?: boolean;
  /** Notices the adapter could not read; the rest of the window is still imported. */
  rejected?: number;
  since?: string;
  query: string;
  error?: string;
  runId: string;
};
const MAX_WINDOW_DAYS = 90,
  OVERLAP_DAYS = 3;
const tedDate = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
export function syncWindow(db: DB, now: Date, full = false): Date {
  const floor = new Date(now.getTime() - MAX_WINDOW_DAYS * 86400000);
  if (full) return floor;
  const last = db
    .prepare(
      "SELECT started_at FROM sync_runs WHERE source='TED' AND status='success' ORDER BY started_at DESC LIMIT 1",
    )
    .get() as { started_at: string } | undefined;
  if (!last) return floor;
  const since = new Date(
    new Date(last.started_at).getTime() - OVERLAP_DAYS * 86400000,
  );
  return since > floor ? since : floor;
}
async function fetchPages(
  query: string,
  fields: string[],
  o: Required<Pick<SyncOptions, "fetcher" | "sleep" | "maxPages" | "limit">>,
) {
  const notices: Record<string, unknown>[] = [];
  let total = 0;
  for (let page = 1; page <= o.maxPages; page++) {
    let payload: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await o.fetcher(TED_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            query,
            fields,
            page,
            limit: o.limit,
            scope: "ALL",
            paginationMode: "PAGE_NUMBER",
          }),
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          const e = new Error(`TED HTTP ${response.status}`);
          // Permission and request errors are not retried; 403s are never worked around.
          if (response.status !== 429 && response.status < 500)
            throw Object.assign(e, { retryable: false });
          throw e;
        }
        const length = Number(response.headers.get("content-length") || 0);
        if (length > 20 * 1024 * 1024) throw new Error("TED response too large");
        payload = await response.json();
        break;
      } catch (e) {
        if (attempt === 2 || (e as { retryable?: boolean }).retryable === false)
          throw e;
        await o.sleep(250 * 2 ** attempt);
      }
    }
    const parsed = responseSchema.parse(payload);
    if (parsed.timedOut) throw new Error("TED response timed out.");
    total = parsed.totalNoticeCount;
    notices.push(...parsed.notices);
    if (parsed.notices.length < o.limit || page * o.limit >= total) break;
    await o.sleep(200);
  }
  return { notices, total };
}
/** Recompute stored lifecycle for TED records from procedure identity. */
export function recomputeTedLifecycle(db: DB) {
  return transaction(db, () => {
    const rows = db
      .prepare(
        "SELECT id,procedure_id,data FROM opportunities WHERE source='TED' AND procedure_id IS NOT NULL",
      )
      .all() as { id: string; procedure_id: string; data: string }[];
    const byProcedure = new Map<string, { id: string; key: string }[]>();
    for (const r of rows) {
      const o = JSON.parse(r.data) as Opportunity;
      const [num, year] = o.sourceId.split("-").map(Number);
      // Newest publication wins; publication number orders notices within a year.
      const key = `${o.publishedAt ?? ""}|${String(year).padStart(4, "0")}|${String(num).padStart(8, "0")}`;
      const list = byProcedure.get(r.procedure_id) || [];
      list.push({ id: r.id, key });
      byProcedure.set(r.procedure_id, list);
    }
    db.exec(
      "UPDATE opportunities SET lifecycle='unknown',superseded_by=NULL WHERE source='TED'",
    );
    let superseded = 0;
    const mark = db.prepare(
      "UPDATE opportunities SET lifecycle='superseded',superseded_by=? WHERE id=?",
    );
    for (const list of byProcedure.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => (a.key < b.key ? 1 : -1));
      for (const older of list.slice(1)) {
        mark.run(list[0].id, older.id);
        superseded++;
      }
    }
    const closed = db
      .prepare(
        "UPDATE opportunities SET lifecycle='result_published' WHERE source='TED' AND procedure_id IN (SELECT procedure_id FROM ted_results)",
      )
      .run().changes;
    return { superseded, closedByResult: Number(closed) };
  });
}
export async function syncTed(
  db: DB,
  {
    fetcher = fetch,
    clock = () => new Date(),
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    maxPages = 3,
    limit = 30,
    full = false,
    trigger = "manual",
  }: SyncOptions = {},
): Promise<SyncResult> {
  const id = randomUUID(),
    now = clock(),
    since = syncWindow(db, now, full);
  const window = `buyer-country = MLT AND publication-date >= ${tedDate(since)}`;
  const query = `${window} AND notice-type IN (cn-standard cn-social) SORT BY publication-date DESC`;
  const resultQuery = `${window} AND form-type = result SORT BY publication-date DESC`;
  db.prepare(
    "INSERT INTO sync_runs(id,source,started_at,status,trigger) VALUES(?,?,?,?,?)",
  ).run(id, "TED", now.toISOString(), "running", trigger);
  try {
    const opts = { fetcher, sleep, maxPages, limit };
    const competition = await fetchPages(query, TED_FIELDS, opts);
    // One unreadable notice must not cost the whole window. Each is normalised on its own and
    // the failures are counted and reported, so a schema change shows up in sync health
    // instead of silently stopping the feed.
    const records: Opportunity[] = [];
    const rejected: string[] = [];
    for (const n of competition.notices) {
      try {
        records.push(normalizeNotice(n, now));
      } catch {
        const id = publicationNumber.safeParse(n["publication-number"]);
        rejected.push(id.success ? id.data : "unidentified");
      }
    }
    // A wholesale failure is a schema break, not a bad record: fail the run so it is retried
    // and alerted on rather than quietly publishing an empty window.
    if (competition.notices.length && !records.length)
      throw new Error("TED notices could not be read: schema may have changed");
    if (rejected.length)
      log.warn("ingestion.ted_notice_rejected", {
        count: rejected.length,
        sample: rejected.slice(0, 5),
      });
    const results = await fetchPages(resultQuery, RESULT_FIELDS, opts);
    const resultRows = results.notices.flatMap((n) => {
      const pub = publicationNumber.safeParse(n["publication-number"]);
      const proc = procedureId.parse(n["procedure-identifier"]);
      return pub.success && proc
        ? [{ pub: pub.data, proc, date: dateValue(n["publication-date"]) }]
        : [];
    });
    const unique = [...new Map(records.map((o) => [o.sourceId, o])).values()];
    // Validate everything first, then commit atomically: a failure leaves prior data intact.
    const outcome = transaction(db, () => {
      const changed = upsertOpportunities(db, unique, now);
      const insertResult = db.prepare(
        "INSERT INTO ted_results(procedure_id,publication_number,published_at,seen_at) VALUES(?,?,?,?) ON CONFLICT(procedure_id) DO UPDATE SET seen_at=excluded.seen_at",
      );
      for (const r of resultRows)
        insertResult.run(r.proc, r.pub, r.date, now.toISOString());
      return { changed, ...recomputeTedLifecycle(db) };
    });
    const capped =
      competition.total > maxPages * limit || results.total > maxPages * limit;
    const detail = {
      since: since.toISOString(),
      changed: outcome.changed,
      results: resultRows.length,
      superseded: outcome.superseded,
      closedByResult: outcome.closedByResult,
      totalAvailable: competition.total,
      rejected: rejected.length,
      capped,
    };
    db.prepare(
      "UPDATE sync_runs SET finished_at=?,status=?,count=?,detail=? WHERE id=?",
    ).run(
      clock().toISOString(),
      "success",
      unique.length,
      JSON.stringify(detail),
      id,
    );
    return { status: "success", count: unique.length, query, runId: id, ...detail };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Unknown source failure";
    const safe = reason.startsWith("TED ")
      ? reason
      : "Network or notice-schema failure";
    db.prepare(
      "UPDATE sync_runs SET finished_at=?,status=?,error=? WHERE id=?",
    ).run(clock().toISOString(), "failed", safe, id);
    return { status: "failed", count: 0, error: safe, query, runId: id };
  }
}
