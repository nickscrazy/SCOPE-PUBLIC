import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { upsertOpportunities } from "./db.js";
import type { Opportunity } from "../src/domain.js";
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
];
const responseSchema = z.object({
  notices: z.array(z.record(z.string(), z.unknown())).max(250),
  totalNoticeCount: z.number().nonnegative(),
  timedOut: z.boolean().optional(),
});
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
  const dateOnly = /^\d{4}-\d{2}-\d{2}(?:[+-]\d{2}:\d{2})?$/.test(s);
  const d = new Date(dateOnly ? s.slice(0, 10) + "T00:00:00.000Z" : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const sectorMap: Record<string, string> = {
  "03": "agriculture",
  "15": "food",
  "30": "office equipment",
  "32": "technology",
  "33": "health",
  "34": "transport",
  "39": "furnishings",
  "45": "construction",
  "48": "digital",
  "50": "maintenance",
  "55": "hospitality",
  "60": "transport",
  "64": "communications",
  "66": "financial services",
  "70": "real estate",
  "71": "engineering",
  "72": "digital",
  "73": "research",
  "75": "public services",
  "79": "business services",
  "80": "education",
  "85": "health",
  "90": "environment",
  "92": "culture",
  "98": "services",
};
export function normalizeNotice(
  n: Record<string, unknown>,
  now: Date,
): Opportunity {
  const publication = z
      .string()
      .regex(/^\d+-\d{4}$/)
      .parse(n["publication-number"]),
    cpv = z.array(z.string()).parse(n["classification-cpv"] || []),
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
  const dates = n["deadline-receipt-tender-date-lot"],
    times = n["deadline-receipt-tender-time-lot"];
  let deadline: string | null = null;
  if (
    Array.isArray(dates) &&
    dates.length === 1 &&
    Array.isArray(times) &&
    times.length === 1
  ) {
    const day = text(dates[0]).slice(0, 10),
      time = text(times[0]);
    if (/^\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(time))
      deadline = dateValue(day + "T" + time);
  }
  // Lot deadlines need timezone and lot context. Do not guess a notice-wide cut-off from date-only arrays.
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
    tags: [sector, ...cpv],
    cpv,
    geography: "Malta",
    value: amount,
    deadline,
    publishedAt: dateValue(n["publication-date"]),
    fetchedAt: now.toISOString(),
    verifiedAt: now.toISOString(),
    sourceUrl: `https://ted.europa.eu/en/notice/-/detail/${publication}`,
    sourceVersion: publication,
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
export async function syncTed(
  db: DB,
  {
    fetcher = fetch,
    clock = () => new Date(),
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    maxPages = 3,
    limit = 30,
  }: {
    fetcher?: FetchLike;
    clock?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    maxPages?: number;
    limit?: number;
  } = {},
) {
  const id = randomUUID(),
    now = clock(),
    since = new Date(now.getTime() - 90 * 86400000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
  const query = `buyer-country = MLT AND publication-date >= ${since} AND notice-type = cn-standard SORT BY publication-date DESC`;
  db.prepare(
    "INSERT INTO sync_runs(id,source,started_at,status) VALUES(?,?,?,?)",
  ).run(id, "TED", now.toISOString(), "running");
  try {
    const records: Opportunity[] = [];
    let total = 0;
    for (let page = 1; page <= maxPages; page++) {
      let payload: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetcher(TED_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              query,
              fields: TED_FIELDS,
              page,
              limit,
              scope: "ALL",
              paginationMode: "PAGE_NUMBER",
            }),
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) {
            const e = new Error(`TED HTTP ${response.status}`);
            if (response.status !== 429 && response.status < 500)
              throw Object.assign(e, { retryable: false });
            throw e;
          }
          payload = await response.json();
          break;
        } catch (e) {
          if (
            attempt === 2 ||
            (e as { retryable?: boolean }).retryable === false
          )
            throw e;
          await sleep(250 * 2 ** attempt);
        }
      }
      const parsed = responseSchema.parse(payload);
      if (parsed.timedOut) throw new Error("TED response timed out.");
      total = parsed.totalNoticeCount;
      records.push(...parsed.notices.map((n) => normalizeNotice(n, now)));
      if (parsed.notices.length < limit || page * limit >= total) break;
      await sleep(200);
    }
    const unique = [...new Map(records.map((o) => [o.sourceId, o])).values()];
    upsertOpportunities(db, unique, now);
    db.prepare(
      "UPDATE sync_runs SET finished_at=?,status=?,count=? WHERE id=?",
    ).run(clock().toISOString(), "success", unique.length, id);
    return {
      status: "success",
      count: unique.length,
      totalAvailable: total,
      query,
      capped: total > maxPages * limit,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Unknown source failure";
    const safe = reason.startsWith("TED ")
      ? reason
      : "Network or notice-schema failure";
    db.prepare(
      "UPDATE sync_runs SET finished_at=?,status=?,error=? WHERE id=?",
    ).run(clock().toISOString(), "failed", safe, id);
    return { status: "failed", count: 0, error: safe, query };
  }
}
