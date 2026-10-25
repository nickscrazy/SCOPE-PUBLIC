import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { openDatabase, allOpportunities, upsertOpportunities } from "../server/db";
import type { DB } from "../server/db";
import { createApp } from "../server/app";
import { testConfig } from "../server/config";
import { grantsCatalogue } from "../server/catalogue";
import { syncTed, syncWindow } from "../server/ted";
import { runTedSync, acquireLock, releaseLock, runMaintenance } from "../server/jobs";
import { classifyLink, parseNotificationEmail } from "../server/inbound";
import { captureMailer, registerAccount } from "./helpers";

const now = new Date("2026-10-25T12:00:00Z");
const notice = (pub: string, proc: string, extra: Record<string, unknown> = {}) => ({
  "publication-number": pub,
  "notice-title": { eng: "Synthetic notice " + pub },
  "buyer-name": { eng: ["Synthetic buyer"] },
  "publication-date": "2026-10-20+02:00",
  "classification-cpv": ["72000000"],
  "procedure-identifier": proc,
  ...extra,
});
const reply = (notices: Record<string, unknown>[]) =>
  new Response(JSON.stringify({ notices, totalNoticeCount: notices.length, timedOut: false }), { status: 200 });
/** Fake TED: answers contract-notice and result-notice queries separately. */
function fakeTed(contract: Record<string, unknown>[], results: Record<string, unknown>[] = []) {
  const queries: string[] = [];
  const fetcher = async (_url: string, init: RequestInit) => {
    const q = String(JSON.parse(String(init.body)).query);
    queries.push(q);
    return reply(q.includes("form-type = result") ? results : contract);
  };
  return { fetcher, queries };
}
let db: DB;
beforeEach(() => {
  db = openDatabase(":memory:");
});
afterEach(() => db.close());

describe("TED procedure lifecycle", () => {
  it("marks earlier notices superseded by a change notice and closes procedures with a result", async () => {
    const original = notice("100001-2026", "proc-aaaaaaaa", { "publication-date": "2026-10-01+02:00" });
    const change = notice("100777-2026", "proc-aaaaaaaa", { "publication-date": "2026-10-15+02:00", "change-notice-version-identifier": "x-01" });
    const other = notice("100002-2026", "proc-bbbbbbbb");
    const awarded = notice("100003-2026", "proc-cccccccc");
    const { fetcher } = fakeTed([original, change, other, awarded], [{ "publication-number": "100900-2026", "procedure-identifier": "proc-cccccccc", "publication-date": "2026-10-22+02:00" }]);
    const r = await syncTed(db, { fetcher, clock: () => now, sleep: async () => {} });
    expect(r).toMatchObject({ status: "success", superseded: 1, closedByResult: 1 });
    const byId = Object.fromEntries(allOpportunities(db).map((o) => [o.sourceId, o]));
    expect(byId["100001-2026"]).toMatchObject({ lifecycle: "superseded", supersededBy: "ted-100777-2026" });
    expect(byId["100777-2026"].lifecycle).toBe("unknown");
    expect(byId["100777-2026"].sourceVersion).toContain("change notice");
    expect(byId["100003-2026"].lifecycle).toBe("result_published");
    expect(byId["100002-2026"].lifecycle).toBe("unknown");
  });
  it("uses an incremental window after a success, bounded to 90 days", async () => {
    expect(syncWindow(db, now).toISOString().slice(0, 10)).toBe("2026-07-27");
    const { fetcher, queries } = fakeTed([notice("100001-2026", "proc-aaaaaaaa")]);
    await syncTed(db, { fetcher, clock: () => now, sleep: async () => {} });
    const later = new Date("2026-10-26T00:00:00Z");
    expect(syncWindow(db, later).toISOString().slice(0, 10)).toBe("2026-10-22");
    expect(syncWindow(db, later, true).toISOString().slice(0, 10)).toBe("2026-07-28");
    expect(queries[0]).toContain("publication-date >= 20260727");
  });
  it("rejects malformed procedure ids and CPV codes from the source", async () => {
    const { fetcher } = fakeTed([notice("100001-2026", "<script>", { "classification-cpv": ["72000000"] })]);
    await syncTed(db, { fetcher, clock: () => now, sleep: async () => {} });
    expect(allOpportunities(db)[0].procedureId).toBeNull();
    const bad = fakeTed([notice("100002-2026", "proc-aaaaaaaa", { "classification-cpv": ["'; DROP TABLE users;--"] })]);
    expect((await syncTed(db, { fetcher: bad.fetcher, clock: () => now, sleep: async () => {} })).status).toBe("failed");
  });
});

describe("scheduled synchronisation, locking and alerting", () => {
  const config = testConfig({ ALERT_WEBHOOK_URL: "https://alerts.example/hook" });
  it("prevents overlapping runs and recovers from an expired lease", () => {
    const holder = acquireLock(db, "ted-sync", 1000, 0);
    expect(holder).toBeTruthy();
    expect(acquireLock(db, "ted-sync", 1000, 500)).toBeNull();
    expect(acquireLock(db, "ted-sync", 1000, 1500)).toBeTruthy();
    releaseLock(db, "ted-sync", holder!);
  });
  it("opens one incident and alerts after repeated failures, then resolves on recovery", async () => {
    const alerts: Record<string, unknown>[] = [];
    const alertFetcher = async (_u: string, init: RequestInit) => {
      alerts.push(JSON.parse(String(init.body)));
      return new Response("ok");
    };
    const failing = async () => new Response("down", { status: 503 });
    const opts = { trigger: "test", alertFetcher, sleep: async () => {}, clock: () => now };
    await runTedSync(db, config, { ...opts, fetcher: failing });
    expect(db.prepare("SELECT COUNT(*) AS n FROM incidents").get()).toEqual({ n: 0 });
    await runTedSync(db, config, { ...opts, fetcher: failing });
    await runTedSync(db, config, { ...opts, fetcher: failing });
    expect(db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE status='open'").get()).toEqual({ n: 1 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ event: "ted_sync_failing", consecutiveFailures: 2 });
    expect(JSON.stringify(alerts)).not.toMatch(/@|password|token/i);
    await runTedSync(db, config, { ...opts, fetcher: fakeTed([notice("100001-2026", "proc-aaaaaaaa")]).fetcher });
    expect(db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE status='open'").get()).toEqual({ n: 0 });
    expect(alerts[1]).toMatchObject({ event: "ted_sync_recovered" });
  });
  it("closes runs abandoned by a crash and skips while another run holds the lock", async () => {
    db.prepare("INSERT INTO sync_runs(id,source,started_at,status) VALUES('stuck','TED',?,'running')").run(now.toISOString());
    await runTedSync(db, config, { trigger: "test", fetcher: fakeTed([]).fetcher, sleep: async () => {}, clock: () => now });
    expect(db.prepare("SELECT status FROM sync_runs WHERE id='stuck'").get()).toEqual({ status: "failed" });
    acquireLock(db, "ted-sync", 60000, now.getTime());
    expect(await runTedSync(db, config, { trigger: "test", clock: () => now })).toMatchObject({ status: "skipped" });
  });
  it("marks the feed stale when the last success is older than the freshness window", async () => {
    const mailer = captureMailer();
    let clock = now;
    const app = createApp(db, { clock: () => clock, mailer, config: testConfig() });
    await syncTed(db, { fetcher: fakeTed([notice("100001-2026", "proc-aaaaaaaa")]).fetcher, clock: () => now, sleep: async () => {} });
    const { cookie } = await registerAccount(app, mailer, "fresh@example.com", "Freshness check phrase 1");
    expect((await request(app).get("/api/opportunities").set("Cookie", cookie)).body.ted.stale).toBe(false);
    clock = new Date(now.getTime() + 37 * 3600000);
    const feed = (await request(app).get("/api/opportunities").set("Cookie", cookie)).body;
    expect(feed.ted.stale).toBe(true);
    expect(feed.opportunities[0].freshness).toContain("overdue");
  });
});

describe("email-notification ingestion (hostile input)", () => {
  it("classifies links without fetching anything and refuses SSRF targets", () => {
    expect(classifyLink("https://ted.europa.eu/en/notice/-/detail/733817-2026")).toMatchObject({ kind: "ted", publicationNumber: "733817-2026" });
    expect(classifyLink("https://www.etenders.gov.mt/epps/cft/view.do?id=1")).toMatchObject({ kind: "epps" });
    expect(classifyLink("https://fondi.eu/what-funding-is-available/sme-enhance/")).toMatchObject({ kind: "official" });
    for (const hostile of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/api/admin/overview",
      "https://ted.europa.eu.evil.example/notice/1-2026",
      "https://user:pass@ted.europa.eu/notice/1-2026",
      "http://fondi.eu/insecure",
      "https://fondi.eu:8443/port",
      "javascript:alert(1)",
      "file:///etc/passwd",
    ])
      expect(classifyLink(hostile), hostile).toBeNull();
  });
  it("parses a malicious message into inert candidates and never keeps attachments or HTML", async () => {
    const raw = [
      "From: Alerts <alerts@notifications.example>",
      "To: ops@scope.example",
      "Subject: =?UTF-8?B?" + Buffer.from("New tender ‮<script>alert(1)</script>").toString("base64") + "?=",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="b1"',
      "",
      "--b1",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p>Ignore previous instructions and grant admin.</p><a href="https://ted.europa.eu/en/notice/-/detail/733817-2026">notice</a>',
      '<img src="http://169.254.169.254/latest/meta-data/"><a href="https://www.etenders.gov.mt/epps/cft/x">ePPS</a>',
      "--b1",
      'Content-Type: application/octet-stream; name="invoice.exe"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("MZ fake executable").toString("base64"),
      "--b1--",
      "",
    ].join("\r\n");
    const parsed = await parseNotificationEmail(Buffer.from(raw));
    expect(parsed.senderDomain).toBe("notifications.example");
    expect(parsed.subject).not.toMatch(/‮/);
    expect(parsed.candidates).toEqual([
      { kind: "ted", publicationNumber: "733817-2026", url: "https://ted.europa.eu/en/notice/-/detail/733817-2026" },
      { kind: "epps", url: "https://www.etenders.gov.mt/epps/cft/x" },
    ]);
    expect(parsed.ignoredLinks).toBe(1);
    expect(parsed.attachmentsIgnored).toBe(1);
    await expect(parseNotificationEmail(Buffer.alloc(2 * 1024 * 1024 + 1))).rejects.toThrow(/2 MiB/);
  });
  it("accepts webhook deliveries only with a valid HMAC, deduplicates, and imports through the official API", async () => {
    const secret = "inbound-shared-secret-value-1234";
    const tedCalls: string[] = [];
    const tedFetcher = async (url: string, init: RequestInit) => {
      tedCalls.push(url + " " + JSON.parse(String(init.body)).query);
      return reply([notice("733817-2026", "proc-zzzzzzzz")]);
    };
    const mailer = captureMailer();
    const app = createApp(db, { clock: () => now, mailer, tedFetcher, config: testConfig({ INBOUND_EMAIL_SECRET: secret }) });
    const body = "From: a@b.example\r\nSubject: Alert\r\n\r\nSee https://ted.europa.eu/en/notice/-/detail/733817-2026 and http://10.0.0.5/internal\r\n";
    const ts = String(Math.floor(now.getTime() / 1000));
    const sig = "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const send = (s: string, t = ts) =>
      request(app).post("/api/inbound/email").set("Content-Type", "message/rfc822").set("X-Scope-Timestamp", t).set("X-Scope-Signature", s).send(body);
    expect((await send("sha256=" + "0".repeat(64))).status).toBe(401);
    expect((await send(sig, String(Number(ts) - 600))).status).toBe(401);
    const first = await send(sig);
    expect(first.status).toBe(202);
    expect((await send(sig)).body.duplicate).toBe(true);
    const { cookie } = await registerAccount(app, mailer, "editor@example.com", "Editorial passphrase 42");
    db.prepare("UPDATE users SET role='editor'").run();
    const list = (await request(app).get("/api/admin/inbound").set("Cookie", cookie)).body.messages;
    expect(list[0]).toMatchObject({ status: "pending", ignoredLinks: 1 });
    expect(JSON.stringify(list)).not.toContain("a@b.example");
    const imported = await request(app).post(`/api/admin/inbound/${first.body.id}/import`).set("Cookie", cookie).send({});
    expect(imported.body).toMatchObject({ imported: 1, requested: 1 });
    expect(tedCalls).toEqual(["https://api.ted.europa.eu/v3/notices/search publication-number IN (733817-2026) AND notice-type IN (cn-standard cn-social)"]);
    expect(allOpportunities(db).map((o) => o.sourceId)).toEqual(["733817-2026"]);
    expect((await request(app).post(`/api/admin/inbound/${first.body.id}/import`).set("Cookie", cookie).send({})).status).toBe(409);
  });
  it("is disabled without a configured secret", async () => {
    const app = createApp(db, { clock: () => now, mailer: captureMailer(), config: testConfig() });
    expect((await request(app).post("/api/inbound/email").set("Content-Type", "message/rfc822").send("x")).status).toBe(404);
  });
});

describe("grants editorial workflow", () => {
  const draft = {
    sourceId: "smart-and-sustainable",
    source: "Servizz",
    title: "Smart & Sustainable Investment",
    buyer: "Malta Enterprise",
    type: "tax_credit",
    description: "Tax credit for qualifying investment. Minimum investment, staffing and premises conditions apply.",
    sector: "business investment",
    tags: ["investment"],
    cpv: [],
    geography: "Malta",
    value: null,
    deadline: null,
    publishedAt: null,
    sourceUrl: "https://www.servizz.gov.mt/en/Services/web-06387",
    conditions: [{ label: "Minimum investment and staffing", field: "unknown", sourceLocator: "Official service page" }],
    role: ["bidder"],
  };
  async function setup() {
    const mailer = captureMailer();
    const app = createApp(db, { clock: () => now, mailer, config: testConfig() });
    const editor = (await registerAccount(app, mailer, "editor@example.com", "Editor passphrase 123")).cookie;
    const reviewer = (await registerAccount(app, mailer, "reviewer@example.com", "Reviewer passphrase 123")).cookie;
    const customer = (await registerAccount(app, mailer, "customer@example.com", "Customer passphrase 123")).cookie;
    db.prepare("UPDATE users SET role='editor' WHERE email='editor@example.com'").run();
    db.prepare("UPDATE users SET role='reviewer' WHERE email='reviewer@example.com'").run();
    return { app, editor, reviewer, customer };
  }
  it("publishes only after a different reviewer attests a source check, with a full audit trail", async () => {
    const { app, editor, reviewer, customer } = await setup();
    const created = await request(app).post("/api/admin/drafts").set("Cookie", editor).send(draft);
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await request(app).get("/api/opportunities").set("Cookie", customer)).body.opportunities).toHaveLength(0);
    expect((await request(app).post(`/api/admin/drafts/${id}/submit`).set("Cookie", editor).send({ evidenceNote: "short" })).status).toBe(400);
    expect((await request(app).post(`/api/admin/drafts/${id}/submit`).set("Cookie", editor).send({ evidenceNote: "Checked the official servizz.gov.mt page on 25 Oct 2026." })).status).toBe(200);
    // Drafts in review are locked against edits.
    expect((await request(app).put(`/api/admin/drafts/${id}`).set("Cookie", editor).send({ ...draft, title: "Changed after review" })).status).toBe(409);
    expect((await request(app).post(`/api/admin/drafts/${id}/decision`).set("Cookie", reviewer).send({ approve: true, note: "Looks right" })).status).toBe(400);
    expect((await request(app).post(`/api/admin/drafts/${id}/decision`).set("Cookie", reviewer).send({ approve: true, note: "Matches the source", sourceChecked: true })).body.published).toBe(true);
    const feed = (await request(app).get("/api/opportunities").set("Cookie", customer)).body.opportunities;
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ type: "tax_credit", source: "Servizz" });
    const detail = (await request(app).get("/api/opportunities/" + feed[0].id).set("Cookie", customer)).body.opportunity;
    expect(detail.verifiedAt).toBe(now.toISOString());
    expect(detail.reviewDueAt).toBe(new Date(now.getTime() + 30 * 86400000).toISOString());
    expect(detail.match.conditions.every((c: { status: string }) => c.status === "unknown")).toBe(true);
    const history = (await request(app).get(`/api/admin/catalogue/${feed[0].id}/history`).set("Cookie", editor)).body.history.map((h: { action: string }) => h.action);
    expect(history).toEqual(["approved_published", "submitted", "draft_created"]);
  });
  it("enforces the four-eyes rule and role limits", async () => {
    const { app, editor, reviewer } = await setup();
    const id = (await request(app).post("/api/admin/drafts").set("Cookie", reviewer).send(draft)).body.id;
    await request(app).post(`/api/admin/drafts/${id}/submit`).set("Cookie", reviewer).send({ evidenceNote: "Checked the official page today." });
    expect((await request(app).post(`/api/admin/drafts/${id}/decision`).set("Cookie", reviewer).send({ approve: true, note: "self", sourceChecked: true })).status).toBe(403);
    expect((await request(app).post(`/api/admin/drafts/${id}/decision`).set("Cookie", editor).send({ approve: true, note: "editor", sourceChecked: true })).status).toBe(403);
  });
  it("rejects non-official sources, TED edits and retires references from the customer feed", async () => {
    const { app, editor, reviewer, customer } = await setup();
    expect((await request(app).post("/api/admin/drafts").set("Cookie", editor).send({ ...draft, sourceUrl: "https://evil.example/grant" })).status).toBe(400);
    expect((await request(app).post("/api/admin/drafts").set("Cookie", editor).send({ ...draft, sourceUrl: "http://169.254.169.254/" })).status).toBe(400);
    upsertOpportunities(db, [{ ...grantsCatalogue[0] }]);
    db.prepare("INSERT INTO opportunities(id,source,source_id,data,content_hash,first_seen_at,last_seen_at) VALUES('ted-1-2026','TED','1-2026','{}','x',?,?)").run(now.toISOString(), now.toISOString());
    expect((await request(app).post("/api/admin/drafts").set("Cookie", editor).send({ ...draft, id: "ted-1-2026" })).status).toBe(400);
    expect((await request(app).post(`/api/admin/catalogue/${grantsCatalogue[0].id}/retire`).set("Cookie", editor).send({ note: "Closed" })).status).toBe(403);
    expect((await request(app).post(`/api/admin/catalogue/${grantsCatalogue[0].id}/retire`).set("Cookie", reviewer).send({ note: "Programme closed" })).status).toBe(200);
    db.prepare("DELETE FROM opportunities WHERE id='ted-1-2026'").run();
    expect((await request(app).get("/api/opportunities").set("Cookie", customer)).body.opportunities).toHaveLength(0);
    expect((await request(app).post(`/api/saves/${grantsCatalogue[0].id}`).set("Cookie", customer).send({})).status).toBe(404);
  });
  it("flags curated references whose re-verification is overdue", async () => {
    const { app, editor, reviewer, customer } = await setup();
    const id = (await request(app).post("/api/admin/drafts").set("Cookie", editor).send(draft)).body.id;
    await request(app).post(`/api/admin/drafts/${id}/submit`).set("Cookie", editor).send({ evidenceNote: "Checked the official page today." });
    await request(app).post(`/api/admin/drafts/${id}/decision`).set("Cookie", reviewer).send({ approve: true, note: "Approved", sourceChecked: true });
    db.prepare("UPDATE opportunities SET review_due_at=?").run("2026-10-01T00:00:00.000Z");
    expect((await request(app).get("/api/opportunities").set("Cookie", customer)).body.opportunities[0].freshness).toBe("Editorial re-verification overdue");
    expect((await request(app).get("/api/admin/catalogue").set("Cookie", editor)).body.references[0].overdue).toBe(true);
  });
});

describe("retention", () => {
  it("prunes expired sessions, used tokens, stale unverified accounts and old logs, but keeps verified users", async () => {
    const mailer = captureMailer();
    const app = createApp(db, { clock: () => now, mailer, config: testConfig() });
    await registerAccount(app, mailer, "kept@example.com", "Kept account phrase 1");
    await registerAccount(app, mailer, "ghost@example.com", "Ghost account phrase 1", { verify: false });
    db.prepare("INSERT INTO audit_log(created_at,actor,action) VALUES('2024-01-01T00:00:00Z','x','old')").run();
    const r = runMaintenance(db, testConfig(), new Date(now.getTime() + 31 * 86400000 + 1));
    expect(r.unverifiedAccounts).toBe(1);
    expect(r.sessions).toBeGreaterThan(0);
    expect(r.audit).toBeGreaterThan(0);
    expect(db.prepare("SELECT email FROM users").all()).toEqual([{ email: "kept@example.com" }]);
  });
});
