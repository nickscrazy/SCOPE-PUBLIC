import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import { openDatabase, upsertOpportunities, allOpportunities } from "../server/db";
import { grantsCatalogue } from "../server/catalogue";
import { createBackup, verifyBackup, restoreBackup, pruneBackups } from "../server/backup";
import { createMailer, templates } from "../server/email";
import { testConfig } from "../server/config";
import { matchOpportunity, cpvPrefixesFor, stem } from "../server/matching";
import { researchProfile, restaurantProfile, type Opportunity } from "../src/domain";
import { normalizeNotice } from "../server/ted";

const key = "0f".repeat(32);
describe("backup and restore", () => {
  it("round-trips an encrypted, integrity-checked backup and keeps a rollback copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "scope-backup-"));
    const path = join(dir, "scope.db");
    const db = openDatabase(path);
    upsertOpportunities(db, grantsCatalogue);
    db.prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','backup@example.com','x','2026-10-25')").run();
    const b = createBackup(db, join(dir, "backups"), key);
    expect(b.encrypted).toBe(true);
    // The encrypted file does not contain plaintext personal data.
    expect(readFileSync(b.file).includes(Buffer.from("backup@example.com"))).toBe(false);
    expect(verifyBackup(b.file, key)).toMatchObject({ ok: true });
    expect(() => verifyBackup(b.file, "1e".repeat(32))).toThrow();
    db.prepare("DELETE FROM users").run();
    db.close();
    const r = restoreBackup(b.file, path, key);
    expect(r.previous).toMatch(/pre-restore/);
    const restored = openDatabase(path);
    expect(restored.prepare("SELECT email FROM users").all()).toEqual([{ email: "backup@example.com" }]);
    expect(allOpportunities(restored)).toHaveLength(grantsCatalogue.length);
    restored.close();
    rmSync(dir, { recursive: true });
  });
  it("refuses tampered backups and prunes by retention", () => {
    const dir = mkdtempSync(join(tmpdir(), "scope-backup-"));
    const db = openDatabase(join(dir, "scope.db"));
    const b = createBackup(db, join(dir, "backups"));
    const data = readFileSync(b.file);
    data[data.length - 10] ^= 0xff;
    writeFileSync(b.file, data);
    expect(() => verifyBackup(b.file)).toThrow(/checksum/);
    expect(() => restoreBackup(b.file, join(dir, "scope.db"))).toThrow(/checksum/);
    const old = new Date("2026-01-01");
    utimesSync(b.file, old, old);
    expect(pruneBackups(join(dir, "backups"), 30, new Date("2026-10-25"))).toHaveLength(1);
    expect(readdirSync(join(dir, "backups"))).toHaveLength(0);
    db.close();
    rmSync(dir, { recursive: true });
  });
});

describe("email delivery over real SMTP", () => {
  it("delivers transactional templates through the SMTP provider with escaped content", async () => {
    const received: string[] = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onData(stream, _session, cb) {
        let body = "";
        stream.on("data", (c) => (body += c));
        stream.on("end", () => {
          received.push(body);
          cb();
        });
      },
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.server.address() as AddressInfo).port;
    const mailer = createMailer(testConfig({ EMAIL_PROVIDER: "smtp", SMTP_URL: `smtp://127.0.0.1:${port}?ignoreTLS=true`, EMAIL_FROM: "SCOPE <no-reply@scope.example>" }));
    const ok = await mailer.send({ to: "owner@example.com", ...templates.resetPassword('https://scope.example/reset-password?token=abc"><script>') });
    expect(ok).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toContain("Subject: Reset your SCOPE password");
    expect(received[0]).toContain("To: owner@example.com");
    // HTML bodies escape untrusted values; the text part is plain text and is never rendered.
    const html = templates.resetPassword('https://x.example/?t="><script>').html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&#34;&#62;&#60;script&#62;");
    await new Promise<void>((r) => server.close(() => r()));
  });
  it("reports failure instead of pretending delivery when SMTP is unreachable", async () => {
    const mailer = createMailer(testConfig({ EMAIL_PROVIDER: "smtp", SMTP_URL: "smtp://127.0.0.1:1?connectionTimeout=500" }));
    expect(await mailer.send({ to: "x@example.com", ...templates.passwordChanged() })).toBe(false);
  });
  it("never allows the file outbox in production", () => {
    expect(() =>
      createMailer({ ...testConfig({ EMAIL_PROVIDER: "outbox" }), production: true }),
    ).toThrow(/production/);
  });
});

describe("matching beyond lexical overlap", () => {
  const tender = (cpv: string[], extra: Partial<Opportunity> = {}): Opportunity => ({
    ...normalizeNotice({ "publication-number": "1-2026", "notice-title": { eng: "Provision of services to a ministry" }, "classification-cpv": cpv, "publication-date": "2026-10-20+02:00" }, new Date("2026-10-25")),
    ...extra,
  });
  const now = new Date("2026-10-25T12:00:00Z");
  it("stems conservatively and maps services to official CPV prefixes", () => {
    expect(stem("consultancies")).toBe("consultancy");
    expect(stem("catering")).toBe("cater");
    expect(stem("class")).toBe("class");
    expect(cpvPrefixesFor(["Web development", "IT consultancy"])).toEqual(expect.arrayContaining(["72", "794"]));
    expect(cpvPrefixesFor(["Catering"])).toContain("555");
  });
  it("ranks a classification match above an unrelated notice even with no shared words", () => {
    const it = { ...researchProfile, services: ["software development"], sectors: [] };
    const software = matchOpportunity(it, tender(["72212000"]), now);
    const catering = matchOpportunity(it, tender(["55520000"]), now);
    expect(software.score - catering.score).toBe(20);
    expect(software.reasons.join(" ")).toContain("CPV 72212000");
    expect(matchOpportunity(restaurantProfile, tender(["55520000"]), now).score).toBeGreaterThan(matchOpportunity(restaurantProfile, tender(["72212000"]), now).score);
  });
  it("keeps eligibility, financial suitability and capacity as separate dimensions", () => {
    const m = matchOpportunity({ ...researchProfile, turnover: "under50k", minValue: 5000, maxValue: 200000 }, tender(["73000000"], { value: 100000 }), now);
    expect(m.dimensions.eligibility).toMatchObject({ status: "unknown", unmet: 0, unknown: 2 });
    // Directive 2014/24/EU Art. 58(3): up to 2x value may be required; an under-€50k band is below €200,000.
    expect(m.dimensions.financial.status).toBe("caution");
    expect(m.dimensions.financial.notes.join(" ")).toContain("€200,000");
    expect(m.dimensions.capacity.status).toBe("unknown");
    // A high relevance score never turns unknown conditions into eligibility.
    expect(m.conditions.every((c) => c.status === "unknown")).toBe(true);
  });
  it("surfaces a staffing blocker in both eligibility and capacity", () => {
    const o = tender(["73000000"], { conditions: [{ label: "At least 10 staff", field: "staff", value: 10, sourceLocator: "Synthetic" }] });
    const m = matchOpportunity({ ...researchProfile, staff: 3 }, o, now);
    expect(m.dimensions.eligibility.status).toBe("blocker");
    expect(m.dimensions.capacity.status).toBe("blocker");
  });
  it("halves relevance for superseded or closed procedures", () => {
    const base = matchOpportunity(researchProfile, tender(["73000000"]), now).score;
    expect(matchOpportunity(researchProfile, tender(["73000000"], { lifecycle: "result_published" }), now).score).toBe(Math.round(base * 0.5));
  });
});
