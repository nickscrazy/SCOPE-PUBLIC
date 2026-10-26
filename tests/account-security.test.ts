import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { openDatabase, upsertOpportunities } from "../server/db";
import type { DB } from "../server/db";
import { createApp } from "../server/app";
import { testConfig } from "../server/config";
import { grantsCatalogue } from "../server/catalogue";
import { researchProfile } from "../src/domain";
import { pseudonym } from "../server/auth";
import { loginBackoffMs } from "../server/routes-account";
import { captureMailer, cookieOf, registerAccount, tokenFrom } from "./helpers";

const password = "Correct horse battery staple 1";
let db: DB, now: Date, mailer: ReturnType<typeof captureMailer>, app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(":memory:");
  now = new Date("2026-10-25T12:00:00Z");
  mailer = captureMailer();
  app = createApp(db, { clock: () => now, mailer, config: testConfig() });
  upsertOpportunities(db, grantsCatalogue);
});
afterEach(() => db.close());
const reg = (email: string, opts?: { startTrial?: boolean; verify?: boolean }) =>
  registerAccount(app, mailer, email, password, opts);

describe("email ownership and trial abuse", () => {
  it("does not start a trial until the mailbox is confirmed, and a link works once", async () => {
    const { cookie } = await reg("owner@example.com", { verify: false });
    const me = (await request(app).get("/api/me").set("Cookie", cookie)).body;
    expect(me).toMatchObject({ plan: "free", emailVerified: false, trialPending: true });
    expect((await request(app).post("/api/trial").set("Cookie", cookie).send({})).status).toBe(403);
    const token = tokenFrom(mailer.last("verify_email"));
    const v = await request(app).post("/api/auth/verify-email").send({ token });
    expect(v.body).toMatchObject({ ok: true, trialStarted: true });
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body).toMatchObject({ plan: "trial", emailVerified: true });
    expect((await request(app).post("/api/auth/verify-email").send({ token })).status).toBe(400);
  });
  it("rejects forged, expired and wrong-purpose tokens", async () => {
    await reg("t@example.com", { verify: false });
    expect((await request(app).post("/api/auth/verify-email").send({ token: "f".repeat(64) })).status).toBe(400);
    expect((await request(app).post("/api/auth/verify-email").send({ token: "../../x" })).status).toBe(400);
    const token = tokenFrom(mailer.last("verify_email"));
    now = new Date(now.getTime() + 25 * 3600000);
    expect((await request(app).post("/api/auth/verify-email").send({ token })).status).toBe(400);
    // A reset token cannot verify an email, and vice versa.
    await request(app).post("/api/auth/forgot-password").send({ email: "t@example.com" });
    const reset = tokenFrom(mailer.last("reset_password"));
    expect((await request(app).post("/api/auth/verify-email").send({ token: reset })).status).toBe(400);
  });
  it("stores only token hashes and limits verification resends", async () => {
    const { cookie } = await reg("r@example.com", { verify: false });
    const token = tokenFrom(mailer.last("verify_email"));
    const stored = db.prepare("SELECT token_hash FROM auth_tokens").all() as { token_hash: string }[];
    expect(stored.some((s) => s.token_hash === token)).toBe(false);
    for (let i = 0; i < 3; i++)
      expect((await request(app).post("/api/auth/resend-verification").set("Cookie", cookie).send({})).status).toBe(200);
    expect((await request(app).post("/api/auth/resend-verification").set("Cookie", cookie).send({})).status).toBe(429);
    // Only the newest link remains valid.
    expect((await request(app).post("/api/auth/verify-email").send({ token })).status).toBe(400);
  });
});

describe("password recovery and session revocation", () => {
  it("answers identically for unknown addresses and never emails them", async () => {
    await reg("known@example.com");
    const before = mailer.sent.length;
    const a = await request(app).post("/api/auth/forgot-password").send({ email: "unknown@example.com" });
    const b = await request(app).post("/api/auth/forgot-password").send({ email: "known@example.com" });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(a.body).toEqual(b.body);
    expect(mailer.sent.length).toBe(before + 1);
    expect(mailer.last()?.to).toBe("known@example.com");
  });
  it("resets the password once, revokes every session and notifies the owner", async () => {
    const { cookie } = await reg("victim@example.com");
    const second = cookieOf(await request(app).post("/api/auth/login").send({ email: "victim@example.com", password }));
    await request(app).post("/api/auth/forgot-password").send({ email: "victim@example.com" });
    const token = tokenFrom(mailer.last("reset_password"));
    const newPassword = "An entirely new passphrase 9";
    expect((await request(app).post("/api/auth/reset-password").send({ token, password: newPassword })).status).toBe(200);
    expect((await request(app).post("/api/auth/reset-password").send({ token, password: "Another one entirely 77" })).status).toBe(400);
    for (const c of [cookie, second]) expect((await request(app).get("/api/me").set("Cookie", c)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "victim@example.com", password })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "victim@example.com", password: newPassword })).status).toBe(200);
    expect(mailer.last()?.tag).toBe("password_changed");
  });
  it("expires reset links after one hour", async () => {
    await reg("late@example.com");
    await request(app).post("/api/auth/forgot-password").send({ email: "late@example.com" });
    const token = tokenFrom(mailer.last("reset_password"));
    now = new Date(now.getTime() + 61 * 60000);
    expect((await request(app).post("/api/auth/reset-password").send({ token, password: "Too late for this one 5" })).status).toBe(400);
  });
  it("changes the password only with the current one and signs out other sessions", async () => {
    const { cookie } = await reg("change@example.com");
    const other = cookieOf(await request(app).post("/api/auth/login").send({ email: "change@example.com", password }));
    expect((await request(app).post("/api/account/password").set("Cookie", cookie).send({ currentPassword: "wrong password here", newPassword: "A fresh secure phrase 12" })).status).toBe(403);
    const ok = await request(app).post("/api/account/password").set("Cookie", cookie).send({ currentPassword: password, newPassword: "A fresh secure phrase 12" });
    expect(ok.body).toMatchObject({ ok: true, otherSessionsRevoked: 1 });
    expect((await request(app).get("/api/me").set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).get("/api/me").set("Cookie", other)).status).toBe(401);
  });
  it("lists and revokes only the account's own sessions", async () => {
    const a = (await reg("a@example.com")).cookie;
    const b = (await reg("b@example.com")).cookie;
    const bSessions = (await request(app).get("/api/account/sessions").set("Cookie", b)).body.sessions;
    expect(bSessions).toHaveLength(1);
    expect(bSessions[0]).toMatchObject({ current: true });
    expect(JSON.stringify(bSessions)).not.toMatch(/token|hash/i);
    expect((await request(app).delete("/api/account/sessions/" + bSessions[0].id).set("Cookie", a).send({})).status).toBe(404);
    expect((await request(app).get("/api/me").set("Cookie", b)).status).toBe(200);
    const extra = cookieOf(await request(app).post("/api/auth/login").send({ email: "a@example.com", password }));
    expect((await request(app).post("/api/account/sessions/revoke-others").set("Cookie", a).send({})).body.revoked).toBe(1);
    expect((await request(app).get("/api/me").set("Cookie", extra)).status).toBe(401);
  });
});

/**
 * Regression for the independently reported availability defect: ten wrong guesses against a
 * known address made the account holder's own correct password return 429, and further guesses
 * sustained the denial. Throttling must constrain guessing without ever refusing the real
 * credential.
 */
describe("authentication throttling cannot be turned into a lockout", () => {
  const guess = (email: string, n: number) =>
    request(app).post("/api/auth/login").send({ email, password: `wrong guess number ${n}` });
  const signIn = (email: string) => request(app).post("/api/auth/login").send({ email, password });

  it("lets the account holder in while an attacker is guessing at their address", async () => {
    await reg("target@example.com");
    for (let i = 0; i < 12; i++) expect((await guess("target@example.com", i)).status).toBe(401);
    expect((await signIn("target@example.com")).status).toBe(200);
  });

  it("cannot be sustained: the holder still gets in after continued guessing", async () => {
    await reg("target@example.com");
    for (let i = 0; i < 12; i++) await guess("target@example.com", i);
    expect((await signIn("target@example.com")).status).toBe(200);
    for (let i = 12; i < 25; i++) await guess("target@example.com", i);
    expect((await signIn("target@example.com")).status).toBe(200);
  });

  it("refuses the failing client without touching a different client's access", async () => {
    // Behind a declared reverse proxy, as production requires, attacker and account holder
    // are distinguishable. The attacker gets cut off; the holder is unaffected.
    const proxied = createApp(db, { clock: () => now, mailer, config: testConfig({ TRUST_PROXY: "1" }) });
    await registerAccount(proxied, mailer, "victim@example.com", password);
    const attacker = "203.0.113.5",
      owner = "198.51.100.7";
    const codes: number[] = [];
    for (let i = 0; i < 25; i++)
      codes.push(
        (
          await request(proxied)
            .post("/api/auth/login")
            .set("X-Forwarded-For", attacker)
            .send({ email: "victim@example.com", password: `wrong ${i}` })
        ).status,
      );
    expect(codes).toContain(429);
    const holder = await request(proxied)
      .post("/api/auth/login")
      .set("X-Forwarded-For", owner)
      .send({ email: "victim@example.com", password });
    expect(holder.status).toBe(200);
  });

  it("does not let a spoofed forwarding header buy a fresh budget", async () => {
    await reg("target@example.com");
    // TRUST_PROXY is unset here, so X-Forwarded-For must not be believed: every one of these
    // is the same client and they share one budget rather than getting one each.
    const codes: number[] = [];
    for (let i = 0; i < 25; i++)
      codes.push(
        (
          await request(app)
            .post("/api/auth/login")
            .set("X-Forwarded-For", `10.0.0.${i}`)
            .send({ email: "target@example.com", password: `spoofed ${i}` })
        ).status,
      );
    expect(codes).toContain(429);
  });

  it("keeps recovery usable while an address is under attack", async () => {
    await reg("target@example.com");
    for (let i = 0; i < 20; i++) await guess("target@example.com", i);
    const r = await request(app).post("/api/auth/forgot-password").send({ email: "target@example.com" });
    expect(r.status).toBe(202);
    expect(tokenFrom(mailer.last("reset_password"))).toMatch(/^[a-f0-9]{64}$/);
  });

  it("answers identically whether or not the address exists", async () => {
    await reg("real@example.com");
    const a = await request(app).post("/api/auth/login").send({ email: "real@example.com", password: "wrong one here" });
    const b = await request(app).post("/api/auth/login").send({ email: "ghost@example.com", password: "wrong one here" });
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
  });

  it("slows a failing attempt only after repeated failure, and never a successful one", () => {
    expect(loginBackoffMs(1)).toBe(0);
    expect(loginBackoffMs(10)).toBe(0);
    expect(loginBackoffMs(11)).toBe(100);
    expect(loginBackoffMs(13)).toBe(400);
    expect(loginBackoffMs(30)).toBe(2000);
    // A raised test-harness multiplier moves the threshold, it does not remove it.
    expect(loginBackoffMs(11, 10)).toBe(0);
    expect(loginBackoffMs(101, 10)).toBe(100);
  });
});

describe("email change", () => {
  it("requires the password, confirms the new mailbox and notifies the old one", async () => {
    const { cookie } = await reg("old@example.com");
    expect((await request(app).post("/api/account/email").set("Cookie", cookie).send({ password: "not my password", newEmail: "new@example.com" })).status).toBe(403);
    await request(app).post("/api/account/email").set("Cookie", cookie).send({ password, newEmail: "new@example.com" });
    expect(mailer.last()?.to).toBe("new@example.com");
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.email).toBe("old@example.com");
    await request(app).post("/api/auth/verify-email").send({ token: tokenFrom(mailer.last("change_email")) });
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.email).toBe("new@example.com");
    expect(mailer.last()).toMatchObject({ to: "old@example.com", tag: "email_changed" });
  });
  it("cannot take over an address that another account claimed in the meantime", async () => {
    const { cookie } = await reg("first@example.com");
    await request(app).post("/api/account/email").set("Cookie", cookie).send({ password, newEmail: "taken@example.com" });
    const token = tokenFrom(mailer.last("change_email"));
    await reg("taken@example.com");
    expect((await request(app).post("/api/auth/verify-email").send({ token })).status).toBe(409);
  });
});

describe("export, erasure and retention", () => {
  it("exports the account's own data only, without secrets", async () => {
    const a = (await reg("a@example.com")).cookie;
    const b = (await reg("b@example.com")).cookie;
    await request(app).put("/api/profile").set("Cookie", a).send(researchProfile);
    await request(app).post("/api/saves/fondi-sme-enhance").set("Cookie", a).send({});
    const exp = (await request(app).get("/api/account/export").set("Cookie", a)).body;
    expect(exp.account.email).toBe("a@example.com");
    expect(exp.profile.companyName).toBe(researchProfile.companyName);
    expect(exp.saved).toHaveLength(1);
    const text = JSON.stringify(exp);
    expect(text).not.toContain("password_hash");
    expect(text).not.toMatch(/token_hash|[a-f0-9]{32}:[a-f0-9]{128}/);
    const other = (await request(app).get("/api/account/export").set("Cookie", b)).body;
    expect(other.profile).toBeNull();
    expect(other.saved).toHaveLength(0);
  });
  it("deletes the account and all personal records, keeping only pseudonymous audit entries", async () => {
    const { cookie } = await reg("leaving@example.com");
    const id = (await request(app).get("/api/me").set("Cookie", cookie)).body.id;
    await request(app).put("/api/profile").set("Cookie", cookie).send(researchProfile);
    await request(app).post("/api/saves/fondi-sme-enhance").set("Cookie", cookie).send({});
    expect((await request(app).delete("/api/account").set("Cookie", cookie).send({ password, confirm: "delete" })).status).toBe(400);
    expect((await request(app).delete("/api/account").set("Cookie", cookie).send({ password: "wrong password!!", confirm: "DELETE" })).status).toBe(403);
    expect((await request(app).delete("/api/account").set("Cookie", cookie).send({ password, confirm: "DELETE" })).status).toBe(200);
    expect((await request(app).get("/api/me").set("Cookie", cookie)).status).toBe(401);
    for (const table of ["users", "profiles", "saves", "sessions", "auth_tokens", "analyses"]) {
      const col = table === "users" ? "id" : "user_id";
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col}=?`).get(id)).toEqual({ n: 0 });
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor=? OR target=?").get(id, id)).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor=?").get(pseudonym(id))).not.toEqual({ n: 0 });
    expect(JSON.stringify(db.prepare("SELECT * FROM audit_log").all())).not.toContain("leaving@example.com");
    expect(mailer.last()).toMatchObject({ to: "leaving@example.com", tag: "account_deleted" });
    // The address can be registered again as a new, unrelated account.
    expect((await reg("leaving@example.com")).response.status).toBe(201);
  });
});

describe("roles and administrative boundaries", () => {
  it("denies admin APIs to users regardless of client-asserted claims", async () => {
    const { cookie } = await reg("user@example.com");
    for (const [method, path] of [
      ["get", "/api/admin/overview"],
      ["get", "/api/admin/catalogue"],
      ["post", "/api/admin/ted-sync"],
      ["post", "/api/admin/drafts"],
      ["get", "/api/admin/audit"],
      ["post", "/api/admin/incidents"],
    ] as const) {
      const r = await request(app)[method](path).set("Cookie", cookie).set("X-Role", "admin").send({ role: "admin" });
      expect(r.status, path).toBe(403);
    }
    expect((await request(app).put("/api/me").set("Cookie", cookie).send({ role: "admin" })).status).toBe(404);
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.role).toBe("user");
  });
  it("requires a verified email even for a role granted in the database", async () => {
    const { cookie } = await reg("unverified-admin@example.com", { verify: false });
    db.prepare("UPDATE users SET role='admin'").run();
    expect((await request(app).get("/api/admin/overview").set("Cookie", cookie)).status).toBe(403);
  });
  it("lets an editor read the catalogue but not approve, sync or manage incidents", async () => {
    const { cookie } = await reg("editor@example.com");
    db.prepare("UPDATE users SET role='editor' WHERE email='editor@example.com'").run();
    expect((await request(app).get("/api/admin/catalogue").set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).post("/api/admin/ted-sync").set("Cookie", cookie).send({})).status).toBe(403);
    expect((await request(app).post("/api/admin/incidents").set("Cookie", cookie).send({ title: "x", severity: "info" })).status).toBe(403);
    expect((await request(app).post("/api/admin/drafts/00000000-0000-4000-8000-000000000000/decision").set("Cookie", cookie).send({ approve: true, note: "ok", sourceChecked: true })).status).toBe(403);
  });
});

describe("transport and request hardening", () => {
  it("rejects cross-site and mismatched-origin writes, including for public auth endpoints", async () => {
    expect((await request(app).post("/api/auth/forgot-password").set("Origin", "https://evil.example").send({ email: "a@example.com" })).status).toBe(403);
    expect((await request(app).post("/api/auth/login").set("Sec-Fetch-Site", "cross-site").send({ email: "a@example.com", password })).status).toBe(403);
    expect((await request(app).post("/api/auth/login").type("text/plain").send("{}")).status).toBe(415);
  });
  it("sets secure cookies, HSTS and a strict CSP for HTTPS deployments", async () => {
    const secure = createApp(db, { clock: () => now, mailer, config: testConfig({ BASE_URL: "https://scope.example" }) });
    const r = await request(secure).post("/api/auth/register").set("Origin", "https://scope.example").send({ email: "s@example.com", password });
    expect(String(r.headers["set-cookie"])).toMatch(/Secure/);
    expect(String(r.headers["set-cookie"])).toMatch(/HttpOnly/);
    expect(r.headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
  it("hides closed records from discovery by default but keeps them in saved views", async () => {
    upsertOpportunities(db, [{ ...grantsCatalogue[0], id: "closed-ref", sourceId: "closed-ref", deadline: "2026-01-01T00:00:00Z" }]);
    const { cookie } = await reg("closed@example.com");
    await request(app).post("/api/saves/closed-ref").set("Cookie", cookie).send({});
    const feed = (await request(app).get("/api/opportunities").set("Cookie", cookie)).body;
    expect(feed.opportunities.some((o: { id: string }) => o.id === "closed-ref")).toBe(false);
    expect(feed.closedHidden).toBe(1);
    const saved = (await request(app).get("/api/opportunities?saved=true").set("Cookie", cookie)).body;
    expect(saved.opportunities[0]).toMatchObject({ id: "closed-ref", lifecycle: "deadline_passed" });
  });
});

describe("configuration validation", () => {
  it("refuses unsafe production configurations", async () => {
    const { loadConfig } = await import("../server/config");
    expect(() => loadConfig({ APP_ENV: "production", BASE_URL: "http://scope.example" })).toThrow(/https/);
    expect(() => loadConfig({ APP_ENV: "production", BASE_URL: "https://scope.example", EMAIL_PROVIDER: "outbox" })).toThrow(/EMAIL_PROVIDER=smtp/);
    expect(() =>
      loadConfig({ APP_ENV: "staging", BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_SOLO: "price_x" }),
    ).toThrow(/live key/);
    expect(() => loadConfig({ BILLING_PROVIDER: "stripe" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() =>
      loadConfig({
        APP_ENV: "production",
        BASE_URL: "https://scope.example",
        EMAIL_PROVIDER: "smtp",
        SMTP_URL: "smtps://u:p@smtp.example:465",
        BACKUP_ENCRYPTION_KEY: "a".repeat(64),
        TRUST_PROXY: "1",
      }),
    ).not.toThrow();
  });
});
