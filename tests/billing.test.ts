import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDatabase, upsertOpportunities } from "../server/db";
import type { DB } from "../server/db";
import { createApp } from "../server/app";
import { testConfig } from "../server/config";
import { grantsCatalogue } from "../server/catalogue";
import { signStripePayload, verifyStripeSignature } from "../server/billing";
import { captureMailer, registerAccount } from "./helpers";

const password = "Billing test passphrase 77";
const secret = "whsec_test_secret_for_unit_tests";
let db: DB, now: Date, mailer: ReturnType<typeof captureMailer>, app: ReturnType<typeof createApp>;
let stripe: Server, stripeCalls: { method: string; url: string; body: string; auth: string; idem?: string }[];
let stripeBase: string;
beforeEach(async () => {
  stripeCalls = [];
  // Local stand-in for the Stripe REST API: records requests, returns realistic shapes.
  stripe = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      stripeCalls.push({ method: req.method!, url: req.url!, body, auth: String(req.headers.authorization), idem: req.headers["idempotency-key"] as string });
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/v1/checkout/sessions") res.end(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
      else if (req.url === "/v1/billing_portal/sessions") res.end(JSON.stringify({ url: "https://billing.stripe.com/p/session/test_1" }));
      else if (req.url?.startsWith("/v1/subscriptions/")) res.end(JSON.stringify({ id: "sub_1", status: "canceled" }));
      else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((r) => stripe.listen(0, "127.0.0.1", r));
  stripeBase = `http://127.0.0.1:${(stripe.address() as AddressInfo).port}`;
  db = openDatabase(":memory:");
  now = new Date("2026-10-25T12:00:00Z");
  mailer = captureMailer();
  app = createApp(db, {
    clock: () => now,
    mailer,
    config: testConfig({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_unit",
      STRIPE_WEBHOOK_SECRET: secret,
      STRIPE_PRICE_SOLO: "price_solo_test",
      STRIPE_API_BASE: stripeBase,
    }),
  });
  upsertOpportunities(db, [
    ...grantsCatalogue,
    ...Array.from({ length: 6 }, (_, i) => ({ ...grantsCatalogue[0], id: "x-" + i, sourceId: "x-" + i })),
  ]);
});
afterEach(async () => {
  db.close();
  await new Promise((r) => stripe.close(r));
});
const t = () => Math.floor(now.getTime() / 1000);
function webhook(event: Record<string, unknown>, opts: { sig?: string; at?: number } = {}) {
  const payload = JSON.stringify(event);
  return request(app)
    .post("/api/billing/webhook")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", opts.sig ?? signStripePayload(payload, secret, opts.at ?? t()))
    .send(payload);
}
const subEvent = (id: string, userId: string, status: string, created: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: "customer.subscription.updated",
  created,
  data: { object: { id: "sub_1", customer: "cus_1", status, metadata: { user_id: userId }, items: { data: [{ current_period_end: t() + 30 * 86400 }] }, ...extra } },
});

describe("signature verification", () => {
  it("accepts only correctly signed, fresh payloads", () => {
    const body = Buffer.from('{"a":1}');
    const sig = signStripePayload('{"a":1}', secret, 1000);
    expect(verifyStripeSignature(body, sig, secret, 1000)).toBe(true);
    expect(verifyStripeSignature(Buffer.from('{"a":2}'), sig, secret, 1000)).toBe(false);
    expect(verifyStripeSignature(body, sig, "whsec_other", 1000)).toBe(false);
    expect(verifyStripeSignature(body, sig, secret, 1000 + 301)).toBe(false);
    expect(verifyStripeSignature(body, undefined, secret, 1000)).toBe(false);
    expect(verifyStripeSignature(body, "t=1000,v1=zz", secret, 1000)).toBe(false);
    // A second, valid v1 signature (secret rotation) is accepted.
    expect(verifyStripeSignature(body, `t=1000,v1=${"0".repeat(64)},${sig.split(",")[1]}`, secret, 1000)).toBe(true);
  });
});

describe("webhook-driven entitlements", () => {
  it("upgrades only after a verified event, never from the browser return URL", async () => {
    const { cookie } = await registerAccount(app, mailer, "payer@example.com", password, { startTrial: false });
    const me = (await request(app).get("/api/me").set("Cookie", cookie)).body;
    const checkout = await request(app).post("/api/billing/checkout").set("Cookie", cookie).send({});
    expect(checkout.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const call = stripeCalls[0];
    expect(call.auth).toBe("Bearer sk_test_unit");
    const params = new URLSearchParams(call.body);
    expect(params.get("mode")).toBe("subscription");
    expect(params.get("line_items[0][price]")).toBe("price_solo_test");
    expect(params.get("client_reference_id")).toBe(me.id);
    expect(call.idem).toBeTruthy();
    // Visiting the success URL changes nothing.
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.plan).toBe("free");
    // Forged webhook: rejected, no entitlement.
    expect((await webhook(subEvent("evt_forged", me.id, "active", t()), { sig: `t=${t()},v1=${"a".repeat(64)}` })).status).toBe(400);
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.plan).toBe("free");
    // Replayed old signature: rejected.
    expect((await webhook(subEvent("evt_old", me.id, "active", t()), { at: t() - 3600 })).status).toBe(400);
    const completed = { id: "evt_1", type: "checkout.session.completed", created: t(), data: { object: { client_reference_id: me.id, customer: "cus_1", subscription: "sub_1", payment_status: "paid" } } };
    expect((await webhook(completed)).body.outcome).toBe("linked");
    expect((await webhook(subEvent("evt_2", me.id, "active", t() + 1))).body.outcome).toBe("applied");
    const paid = (await request(app).get("/api/me").set("Cookie", cookie)).body;
    expect(paid).toMatchObject({ plan: "solo", analysesLimit: null, savesLimit: null });
    for (let i = 0; i < 6; i++) expect((await request(app).post("/api/saves/x-" + i).set("Cookie", cookie).send({})).status).toBe(200);
  });
  it("is idempotent and ignores out-of-order events", async () => {
    const { cookie } = await registerAccount(app, mailer, "order@example.com", password, { startTrial: false });
    const id = (await request(app).get("/api/me").set("Cookie", cookie)).body.id;
    expect((await webhook(subEvent("evt_a", id, "active", t() + 10))).body.outcome).toBe("applied");
    expect((await webhook(subEvent("evt_a", id, "active", t() + 10))).body.outcome).toBe("duplicate");
    // A delayed older "canceled" event cannot revoke a newer active state.
    expect((await webhook(subEvent("evt_b", id, "canceled", t() + 5))).body.outcome).toBe("stale");
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.plan).toBe("solo");
    expect((await webhook({ ...subEvent("evt_c", id, "canceled", t() + 20), type: "customer.subscription.deleted" })).body.outcome).toBe("applied");
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.plan).toBe("free");
  });
  it("keeps access through a failed renewal until the paid period ends, then downgrades", async () => {
    const { cookie } = await registerAccount(app, mailer, "pastdue@example.com", password, { startTrial: false });
    const id = (await request(app).get("/api/me").set("Cookie", cookie)).body.id;
    await webhook(subEvent("evt_pd", id, "past_due", t(), { items: { data: [{ current_period_end: t() + 86400 }] } }));
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.plan).toBe("solo");
    now = new Date(now.getTime() + 2 * 86400000);
    expect((await request(app).get("/api/me").set("Cookie", cookie)).body.plan).toBe("free");
  });
  it("cannot attach a subscription to another user's account or an unknown user", async () => {
    const victim = await registerAccount(app, mailer, "victim@example.com", password, { startTrial: false });
    const vid = (await request(app).get("/api/me").set("Cookie", victim.cookie)).body.id;
    await webhook(subEvent("evt_v", vid, "active", t()));
    const attacker = await registerAccount(app, mailer, "attacker@example.com", password, { startTrial: false });
    // Same customer/subscription ids, attacker metadata: the existing link wins.
    await webhook({ ...subEvent("evt_x", "someone-else", "active", t() + 1) });
    expect((await request(app).get("/api/me").set("Cookie", attacker.cookie)).body.plan).toBe("free");
    expect((await webhook({ id: "evt_u", type: "checkout.session.completed", created: t(), data: { object: { client_reference_id: "nope", customer: "cus_9" } } })).body.outcome).toBe("unknown_user");
  });
  it("requires a verified email to check out and cancels billing before account deletion", async () => {
    const unverified = await registerAccount(app, mailer, "noverify@example.com", password, { verify: false });
    expect((await request(app).post("/api/billing/checkout").set("Cookie", unverified.cookie).send({})).status).toBe(403);
    const { cookie } = await registerAccount(app, mailer, "leaver@example.com", password, { startTrial: false });
    const id = (await request(app).get("/api/me").set("Cookie", cookie)).body.id;
    await webhook({ id: "evt_l1", type: "checkout.session.completed", created: t(), data: { object: { client_reference_id: id, customer: "cus_1", subscription: "sub_1", payment_status: "paid" } } });
    await webhook(subEvent("evt_l2", id, "active", t() + 1));
    const portal = await request(app).post("/api/billing/portal").set("Cookie", cookie).send({});
    expect(portal.body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
    expect((await request(app).delete("/api/account").set("Cookie", cookie).send({ password, confirm: "DELETE" })).status).toBe(200);
    expect(stripeCalls.some((c) => c.method === "DELETE" && c.url === "/v1/subscriptions/sub_1")).toBe(true);
  });
});

describe("billing disabled", () => {
  it("refuses checkout and hides the webhook when no provider is configured", async () => {
    const plain = createApp(db, { clock: () => now, mailer, config: testConfig() });
    const { cookie } = await registerAccount(plain, mailer, "plain@example.com", password);
    expect((await request(plain).post("/api/billing/checkout").set("Cookie", cookie).send({})).status).toBe(503);
    expect((await request(plain).post("/api/billing/webhook").set("Content-Type", "application/json").send("{}")).status).toBe(404);
    expect((await request(plain).get("/api/config")).body.billingEnabled).toBe(false);
  });
});
