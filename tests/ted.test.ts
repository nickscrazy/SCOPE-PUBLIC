import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { openDatabase, allOpportunities } from "../server/db";
import type { DB } from "../server/db";
import { syncTed, normalizeNotice, TED_URL } from "../server/ted";
import { freshness } from "../server/matching";
let db: DB;
const now = new Date("2026-10-25T12:00:00Z");
// Synthetic schema replay. Identity is deliberately not a claim of a real published notice.
const synthetic = {
  "publication-number": "999999-2026",
  "notice-title": { eng: "Synthetic research fixture" },
  "buyer-name": { eng: ["Synthetic buyer"] },
  "publication-date": "2026-10-20+02:00",
  "classification-cpv": ["73000000"],
  "estimated-value-proc": "35000",
  "estimated-value-cur-proc": "EUR",
  "deadline-receipt-tender-date-lot": ["2026-11-20+01:00"],
  "deadline-receipt-tender-time-lot": ["10:00:00+01:00"],
};
const response = (
  notices: Record<string, unknown>[],
  totalNoticeCount = notices.length,
) =>
  new Response(JSON.stringify({ notices, totalNoticeCount, timedOut: false }), {
    status: 200,
  });
beforeEach(() => {
  db = openDatabase(":memory:");
});
afterEach(() => db.close());
describe("official TED API adapter", () => {
  it("parses the actual recorded API response with multilingual maps and numeric-string values", () => {
    const recorded = JSON.parse(
      readFileSync("evidence/ted-recent.json", "utf8"),
    );
    expect(recorded.notices.length).toBeGreaterThan(0);
    const o = normalizeNotice(recorded.notices[0], now);
    expect(o.sourceId).toBe("733817-2026");
    expect(o.title).toContain("Thermal Label Printers");
    expect(o.buyer).toBe("Department of Contracts");
    expect(o.value).toBe(110000);
    expect(o.sourceUrl).toBe(
      "https://ted.europa.eu/en/notice/-/detail/733817-2026",
    );
    expect(o.publishedAt).toBe("2026-10-23T00:00:00.000Z");
    expect(o.conditions.every((c) => c.field === "unknown")).toBe(true);
    expect(o.deadline).toBeNull();
  });
  it("normalises only EUR amounts, handles unambiguous zoned deadlines and leaves partial or multi-lot dates unknown", () => {
    const o = normalizeNotice(synthetic, now);
    expect(o.deadline).toBe("2026-11-20T09:00:00.000Z");
    expect(o.value).toBe(35000);
    expect(
      normalizeNotice({ ...synthetic, "estimated-value-cur-proc": "USD" }, now)
        .value,
    ).toBeNull();
    expect(
      normalizeNotice(
        {
          ...synthetic,
          "deadline-receipt-tender-date-lot": ["2026-11-20", "2026-12-01"],
        },
        now,
      ).deadline,
    ).toBeNull();
    expect(
      normalizeNotice(
        { ...synthetic, "deadline-receipt-tender-time-lot": [] },
        now,
      ).deadline,
    ).toBeNull();
  });
  it("sends official payload, paginates, deduplicates repeated notice identity and preserves revision history", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetcher = async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      return body.page === 1
        ? response([synthetic], 2)
        : response([{ ...synthetic, "publication-number": "999998-2026" }], 2);
    };
    const r = await syncTed(db, {
      fetcher,
      clock: () => now,
      sleep: async () => {},
      limit: 1,
      maxPages: 2,
    });
    expect(r.status).toBe("success");
    expect(r.count).toBe(2);
    expect(calls[0].url).toBe(TED_URL);
    expect(calls.map((c) => c.body.page)).toEqual([1, 2]);
    expect(calls[0].body).toMatchObject({
      paginationMode: "PAGE_NUMBER",
      scope: "ALL",
      limit: 1,
    });
    await syncTed(db, {
      fetcher,
      clock: () => now,
      sleep: async () => {},
      limit: 1,
      maxPages: 2,
    });
    expect(allOpportunities(db)).toHaveLength(2);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM opportunity_versions").get()?.n,
    ).toBe(2);
    await syncTed(db, {
      fetcher: async () =>
        response([
          {
            ...synthetic,
            "notice-title": { eng: "Revised synthetic fixture" },
          },
        ]),
      clock: () => now,
    });
    expect(allOpportunities(db)).toHaveLength(2);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM opportunity_versions").get()?.n,
    ).toBe(3);
  });
  it("retries transient failures with backoff and records successful recovery", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const r = await syncTed(db, {
      fetcher: async () => {
        attempts++;
        if (attempts < 3) return new Response("Unavailable", { status: 503 });
        return response([synthetic]);
      },
      clock: () => now,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(r.status).toBe("success");
    expect(attempts).toBe(3);
    expect(waits).toEqual([250, 500]);
  });
  it("retains the complete prior catalogue if a later page fails and surfaces stale provenance", async () => {
    await syncTed(db, {
      fetcher: async () => response([synthetic]),
      clock: () => now,
    });
    let attempts = 0;
    const r = await syncTed(db, {
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init.body));
        if (body.page === 1)
          return response(
            [{ ...synthetic, "notice-title": { eng: "Must not commit" } }],
            2,
          );
        attempts++;
        throw new Error("Network offline");
      },
      clock: () => new Date(now.getTime() + 1000),
      sleep: async () => {},
      limit: 1,
      maxPages: 2,
    });
    expect(r.status).toBe("failed");
    expect(attempts).toBe(3);
    expect(allOpportunities(db)).toHaveLength(1);
    expect(allOpportunities(db)[0].title).toBe("Synthetic research fixture");
    const run = db
      .prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1")
      .get();
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("Network or notice-schema failure");
    expect(
      freshness({ ...allOpportunities(db)[0], stale: true }, now),
    ).toContain("cached");
  });
  it("rejects malformed schemas, timed-out payloads and path-like notice IDs without changing previous data", async () => {
    await syncTed(db, {
      fetcher: async () => response([synthetic]),
      clock: () => now,
    });
    for (const value of [
      new Response('{"notices":{},"totalNoticeCount":0}'),
      new Response('{"notices":[],"totalNoticeCount":0,"timedOut":true}'),
      response([{ ...synthetic, "publication-number": "../../etc/passwd" }]),
    ]) {
      const r = await syncTed(db, {
        fetcher: async () => value,
        clock: () => now,
      });
      expect(r.status).toBe("failed");
      expect(allOpportunities(db)).toHaveLength(1);
    }
  });
  it("does not retry permission errors and never accesses ePPS", async () => {
    const urls: string[] = [];
    const r = await syncTed(db, {
      fetcher: async (url) => {
        urls.push(url);
        return new Response("Forbidden", { status: 403 });
      },
      clock: () => now,
    });
    expect(r.status).toBe("failed");
    expect(urls).toEqual([TED_URL]);
    expect(allOpportunities(db)).toHaveLength(0);
  });
  it("handles a zero-result source without inventing records", async () => {
    const r = await syncTed(db, {
      fetcher: async () => response([]),
      clock: () => now,
    });
    expect(r.status).toBe("success");
    expect(r.count).toBe(0);
    expect(allOpportunities(db)).toHaveLength(0);
  });
});
