import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { openDatabase, allOpportunities } from "../server/db";
import type { DB } from "../server/db";
import { syncTed, normalizeNotice, parseLotDeadlines, TED_URL } from "../server/ted";
import { freshness, currentLifecycle, effectiveDeadline } from "../server/matching";
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
      readFileSync("tests/fixtures/ted-recent.json", "utf8"),
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
    // This recording states lot dates but no times: the deadline is the end of the stated
    // day in its own offset — an upper bound — and is flagged as not an exact closing time.
    expect(o.deadline).toBe("2026-11-18T21:59:59.000Z");
    expect(o.deadlineApproximate).toBe(true);
    expect(o.deadlinesComplete).toBe(true);
    expect(currentLifecycle(o, now)).toBe("open");
  });
  it("normalises only EUR amounts and reads the zoned closing instant", () => {
    const o = normalizeNotice(synthetic, now);
    expect(o.deadline).toBe("2026-11-20T09:00:00.000Z");
    expect(o.deadlineApproximate).toBe(false);
    expect(o.value).toBe(35000);
    expect(
      normalizeNotice({ ...synthetic, "estimated-value-cur-proc": "USD" }, now)
        .value,
    ).toBeNull();
    // Lots closing at different times have no single notice-wide deadline; the set is kept
    // and the one that matters is resolved against the clock at read time.
    const staggered = normalizeNotice(
      {
        ...synthetic,
        "deadline-receipt-tender-date-lot": ["2026-11-20+01:00", "2026-12-01+01:00"],
        "deadline-receipt-tender-time-lot": ["10:00:00+01:00", "10:00:00+01:00"],
      },
      now,
    );
    expect(staggered.deadline).toBeNull();
    expect(staggered.lotDeadlines).toEqual([
      "2026-11-20T09:00:00.000Z",
      "2026-12-01T09:00:00.000Z",
    ]);
    expect(effectiveDeadline(staggered, now)).toBe("2026-11-20T09:00:00.000Z");
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
    // Contract notices are paginated first; result notices for the same window follow.
    const competition = calls.filter((c) =>
      String(c.body.query).includes("notice-type IN"),
    );
    expect(competition.map((c) => c.body.page)).toEqual([1, 2]);
    expect(
      calls.filter((c) => String(c.body.query).includes("form-type = result"))
        .length,
    ).toBeGreaterThan(0);
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
    // Two failed attempts, the recovered contract-notice request, then the result-notice request.
    expect(attempts).toBe(4);
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

/**
 * Regression for the independently reported defect: a notice whose lots all closed was served
 * as an active opportunity because a notice-wide deadline was only read when the source stated
 * exactly one lot date and one lot time.
 */
describe("multi-lot deadline lifecycle", () => {
  const lot = (dates: string[], times: string[]) => ({
    ...synthetic,
    "deadline-receipt-tender-date-lot": dates,
    "deadline-receipt-tender-time-lot": times,
  });
  const at = (d: string) => new Date(d);

  it("closes ted-654724-2026, the reported case: eleven lots sharing one past deadline", () => {
    // Shape taken from the live notice: the same closing instant repeated once per lot.
    const o = normalizeNotice(
      {
        ...synthetic,
        "publication-number": "654724-2026",
        "deadline-receipt-tender-date-lot": Array(11).fill("2026-10-07+02:00"),
        "deadline-receipt-tender-time-lot": Array(11).fill("09:30:00+02:00"),
      },
      now,
    );
    expect(o.lotCount).toBe(11);
    expect(o.lotDeadlines).toEqual(["2026-10-07T07:30:00.000Z"]);
    expect(o.deadline).toBe("2026-10-07T07:30:00.000Z");
    expect(o.deadlinesComplete).toBe(true);
    expect(currentLifecycle(o, at("2026-10-25T12:00:00Z"))).toBe("deadline_passed");
    expect(freshness({ ...o, lifecycle: "deadline_passed" }, at("2026-10-25T12:00:00Z"))).toBe(
      "Submission deadline has passed",
    );
  });

  it("stays open while any lot is open and reports that lot as the deadline", () => {
    const o = normalizeNotice(
      lot(
        ["2026-10-01+02:00", "2026-11-30+02:00"],
        ["09:30:00+02:00", "09:30:00+02:00"],
      ),
      now,
    );
    expect(currentLifecycle(o, at("2026-10-25T12:00:00Z"))).toBe("open");
    // The passed lot is not what the customer can still act on.
    expect(effectiveDeadline(o, at("2026-10-25T12:00:00Z"))).toBe("2026-11-30T07:30:00.000Z");
  });

  it("closes only once every lot has passed, and then reports when it actually closed", () => {
    const o = normalizeNotice(
      lot(
        ["2026-10-01+02:00", "2026-10-09+02:00"],
        ["09:30:00+02:00", "09:30:00+02:00"],
      ),
      now,
    );
    expect(currentLifecycle(o, at("2026-10-05T12:00:00Z"))).toBe("open");
    expect(currentLifecycle(o, at("2026-10-25T12:00:00Z"))).toBe("deadline_passed");
    expect(effectiveDeadline(o, at("2026-10-25T12:00:00Z"))).toBe("2026-10-09T07:30:00.000Z");
  });

  it("respects the stated offset rather than the calendar day", () => {
    const o = normalizeNotice(lot(["2026-10-25+02:00"], ["09:30:00+02:00"]), now);
    expect(o.deadline).toBe("2026-10-25T07:30:00.000Z");
    expect(currentLifecycle(o, at("2026-10-25T07:29:00Z"))).toBe("open");
    expect(currentLifecycle(o, at("2026-10-25T07:31:00Z"))).toBe("deadline_passed");
  });

  it("treats a date with no stated time as the end of that day and says so", () => {
    const o = normalizeNotice(
      { ...synthetic, "deadline-receipt-tender-date-lot": ["2026-10-20+02:00"], "deadline-receipt-tender-time-lot": [] },
      now,
    );
    expect(o.deadline).toBe("2026-10-20T21:59:59.000Z");
    expect(o.deadlineApproximate).toBe(true);
    // An upper bound still closes the record once the whole day has gone.
    expect(currentLifecycle(o, at("2026-10-20T20:00:00Z"))).toBe("open");
    expect(currentLifecycle(o, at("2026-10-21T06:00:00Z"))).toBe("deadline_passed");
  });

  it("never infers closure from an unreadable lot set", () => {
    const unreadable = normalizeNotice(
      lot(["2026-10-01+02:00", "not-a-date"], ["09:30:00+02:00", "09:30:00+02:00"]),
      now,
    );
    expect(unreadable.deadlinesComplete).toBe(false);
    // One lot parsed and has passed, but the other could not be read, so it may still be open.
    expect(currentLifecycle(unreadable, at("2026-10-25T12:00:00Z"))).toBe("unknown");

    const mismatched = normalizeNotice(lot(["2026-10-01+02:00", "2026-10-02+02:00"], ["09:30:00+02:00"]), now);
    expect(mismatched.deadlinesComplete).toBe(false);
    expect(currentLifecycle(mismatched, at("2026-10-25T12:00:00Z"))).toBe("unknown");
  });

  it("reports no deadline at all as unknown, never as open", () => {
    const o = normalizeNotice(
      { ...synthetic, "deadline-receipt-tender-date-lot": [], "deadline-receipt-tender-time-lot": [] },
      now,
    );
    expect(o.deadline).toBeNull();
    expect(o.lotDeadlines).toEqual([]);
    expect(currentLifecycle(o, now)).toBe("unknown");
    expect(currentLifecycle(o, now)).not.toBe("open");
  });

  it("keeps supersession and result closure ahead of the deadline clock", () => {
    const o = normalizeNotice(lot(["2026-11-30+02:00"], ["09:30:00+02:00"]), now);
    expect(currentLifecycle({ ...o, lifecycle: "superseded" }, now)).toBe("superseded");
    expect(currentLifecycle({ ...o, lifecycle: "result_published" }, now)).toBe("result_published");
  });

  it("parses lot entries defensively", () => {
    expect(parseLotDeadlines(undefined, undefined)).toEqual({ values: [], lots: 0, complete: true, approximate: false });
    expect(parseLotDeadlines("2026-10-20Z", "09:00:00Z").values).toEqual(["2026-10-20T09:00:00.000Z"]);
    // A syntactically shaped but impossible time makes the entry unreadable, not approximate.
    expect(parseLotDeadlines(["2026-10-20+02:00"], ["25:00:00+02:00"])).toMatchObject({
      values: [],
      complete: false,
    });
    expect(parseLotDeadlines([{ eng: "2026-10-20+02:00" }], [{ eng: "09:30:00+02:00" }]).values).toEqual([
      "2026-10-20T07:30:00.000Z",
    ]);
  });
});
