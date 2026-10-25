import { createHmac, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import type { FetchLike } from "./ted.js";
import { audit } from "./auth.js";

/**
 * Billing provider boundary. Only Stripe is implemented; with BILLING_PROVIDER=disabled
 * every paid action is refused and the UI says paid plans are unavailable.
 * Entitlements change only through signature-verified webhooks, never through a browser redirect.
 */
export class BillingError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
function form(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}
export function createBilling(config: Config, fetcher: FetchLike = fetch) {
  async function stripe(
    path: string,
    params: Record<string, string> | null,
    idempotencyKey?: string,
    method = "POST",
  ) {
    if (!config.billingEnabled)
      throw new BillingError("Paid plans are not available yet.", 503);
    const r = await fetcher(config.STRIPE_API_BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: params ? form(params) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok)
      throw new BillingError(
        "The billing provider could not complete the request.",
      );
    return body;
  }
  return {
    enabled: config.billingEnabled,
    async checkout(user: { id: string; email: string }, customerId?: string | null) {
      const base = config.BASE_URL.replace(/\/$/, "");
      const session = await stripe(
        "/v1/checkout/sessions",
        {
          mode: "subscription",
          "line_items[0][price]": config.STRIPE_PRICE_SOLO!,
          "line_items[0][quantity]": "1",
          success_url: `${base}/app/settings?billing=success`,
          cancel_url: `${base}/app/settings?billing=cancelled`,
          client_reference_id: user.id,
          "metadata[user_id]": user.id,
          "subscription_data[metadata][user_id]": user.id,
          allow_promotion_codes: "false",
          ...(customerId ? { customer: customerId } : { customer_email: user.email }),
        },
        `checkout-${user.id}-${new Date().toISOString().slice(0, 13)}`,
      );
      const url = String(session.url || "");
      // Only ever redirect the browser to the provider's own HTTPS checkout host.
      if (!/^https:\/\/checkout\.stripe\.com\//.test(url) && !url.startsWith(config.STRIPE_API_BASE))
        throw new BillingError("Unexpected checkout URL from billing provider.");
      return url;
    },
    async portal(customerId: string) {
      const session = await stripe("/v1/billing_portal/sessions", {
        customer: customerId,
        return_url: config.BASE_URL.replace(/\/$/, "") + "/app/settings",
      });
      const url = String(session.url || "");
      if (!/^https:\/\/billing\.stripe\.com\//.test(url) && !url.startsWith(config.STRIPE_API_BASE))
        throw new BillingError("Unexpected portal URL from billing provider.");
      return url;
    },
    async cancelImmediately(subscriptionId: string) {
      await stripe(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, null, undefined, "DELETE");
    },
  };
}
export type Billing = ReturnType<typeof createBilling>;

/** Stripe-Signature verification: HMAC-SHA256 over `${t}.${payload}`, 5-minute tolerance. */
export function verifyStripeSignature(
  payload: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  if (!header || header.length > 2000) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isInteger(t) || !signatures.length) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret)
    .update(`${t}.`)
    .update(payload)
    .digest();
  return signatures.some((s) => {
    if (!/^[a-f0-9]{64}$/.test(s || "")) return false;
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
export function signStripePayload(payload: string, secret: string, t: number) {
  const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};
const str = (v: unknown) => (typeof v === "string" && v.length < 255 ? v : null);
const periodEnd = (sub: Record<string, unknown>): string | null => {
  const direct = sub.current_period_end;
  const items = (sub.items as { data?: { current_period_end?: number }[] } | undefined)?.data;
  const value = typeof direct === "number" ? direct : items?.[0]?.current_period_end;
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
};
const statuses = new Set(["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);

/**
 * Applies a verified event. Idempotent by event id; events older than the last applied one
 * for the same subscription are recorded but cannot roll entitlement state back.
 */
export function applyBillingEvent(db: DB, event: StripeEvent, now: Date): string {
  return transaction(db, () => {
    if (db.prepare("SELECT 1 FROM billing_events WHERE id=?").get(event.id)) return "duplicate";
    let outcome = "ignored";
    const obj = event.data.object;
    if (event.type === "checkout.session.completed") {
      const userId = str(obj.client_reference_id);
      const customer = str(obj.customer);
      const subscription = str(obj.subscription);
      if (userId && customer && db.prepare("SELECT 1 FROM users WHERE id=?").get(userId)) {
        db.prepare(
          `INSERT INTO subscriptions(user_id,provider,customer_id,subscription_id,plan,status,updated_at,last_event_created)
           VALUES(?,?,?,?,?,?,?,0)
           ON CONFLICT(user_id) DO UPDATE SET customer_id=excluded.customer_id,subscription_id=COALESCE(excluded.subscription_id,subscription_id),updated_at=excluded.updated_at`,
        ).run(userId, "stripe", customer, subscription, "solo", obj.payment_status === "paid" ? "active" : "incomplete", now.toISOString());
        audit(db, now, "billing.checkout_completed", userId, null, { event: event.id });
        outcome = "linked";
      } else outcome = "unknown_user";
    } else if (event.type.startsWith("customer.subscription.")) {
      const subId = str(obj.id);
      const customer = str(obj.customer);
      const metaUser = str((obj.metadata as Record<string, unknown> | undefined)?.user_id);
      const row = db
        .prepare("SELECT user_id,last_event_created FROM subscriptions WHERE subscription_id=? OR customer_id=?")
        .get(subId, customer) as { user_id: string; last_event_created: number } | undefined;
      const userId = row?.user_id ?? (metaUser && db.prepare("SELECT 1 FROM users WHERE id=?").get(metaUser) ? metaUser : null);
      const status = event.type === "customer.subscription.deleted" ? "canceled" : str(obj.status);
      if (!userId || !status || !statuses.has(status)) outcome = "unknown_subscription";
      else if (row && event.created < row.last_event_created) outcome = "stale";
      else {
        db.prepare(
          `INSERT INTO subscriptions(user_id,provider,customer_id,subscription_id,plan,status,current_period_end,cancel_at_period_end,last_event_created,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id) DO UPDATE SET customer_id=COALESCE(excluded.customer_id,customer_id),subscription_id=excluded.subscription_id,status=excluded.status,
           current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,last_event_created=excluded.last_event_created,updated_at=excluded.updated_at`,
        ).run(userId, "stripe", customer, subId, "solo", status, periodEnd(obj), obj.cancel_at_period_end ? 1 : 0, event.created, now.toISOString());
        audit(db, now, "billing.subscription_" + status, userId, null, { event: event.id });
        outcome = "applied";
      }
    } else if (event.type === "invoice.payment_failed") {
      const customer = str(obj.customer);
      const row = db.prepare("SELECT user_id FROM subscriptions WHERE customer_id=?").get(customer) as { user_id: string } | undefined;
      if (row) audit(db, now, "billing.payment_failed", row.user_id, null, { event: event.id });
      outcome = row ? "recorded" : "unknown_customer";
    }
    db.prepare("INSERT INTO billing_events(id,type,created,received_at,outcome) VALUES(?,?,?,?,?)").run(
      event.id,
      event.type.slice(0, 80),
      event.created,
      now.toISOString(),
      outcome,
    );
    return outcome;
  });
}
