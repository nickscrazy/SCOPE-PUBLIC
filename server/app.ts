import express from "express";
import helmet from "helmet";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { pendingMigrations } from "./db.js";
import { getSession } from "./auth.js";
import { loadConfig, testConfig, type Config } from "./config.js";
import { createMailer, type Mailer } from "./email.js";
import { createBilling, applyBillingEvent, verifyStripeSignature, BillingError } from "./billing.js";
import { makeLimiter, HttpError, type Ctx } from "./context.js";
import { publicAuthRoutes, accountRoutes } from "./routes-account.js";
import { opportunityRoutes, billingRoutes } from "./routes-opportunities.js";
import { adminRoutes } from "./routes-admin.js";
import { recordInboundMessage, verifyInboundSignature, MAX_MESSAGE_BYTES } from "./inbound.js";
import type { FetchLike } from "./ted.js";
import { log, errorName } from "./log.js";
import type { PublicConfig } from "../src/domain.js";

export type AppOptions = {
  config?: Config;
  clock?: () => Date;
  mailer?: Mailer;
  /** Fetch used for billing provider calls (tests point it at a local mock). */
  billingFetcher?: FetchLike;
  tedFetcher?: FetchLike;
  /** Legacy options kept for compatibility with earlier tests. */
  baseUrl?: string;
  secureCookies?: boolean;
};

export function createApp(db: DB, options: AppOptions = {}) {
  const config =
    options.config ??
    (options.baseUrl || options.secureCookies !== undefined
      ? testConfig({ BASE_URL: options.secureCookies ? "https://localhost:3000" : options.baseUrl || "http://localhost:3000" })
      : process.env.APP_ENV || process.env.NODE_ENV === "production"
        ? loadConfig()
        : testConfig());
  const clock = options.clock || (() => new Date());
  const mailer = options.mailer ?? createMailer(config);
  const billing = createBilling(config, options.billingFetcher);
  const { allow, limited } = makeLimiter(db, clock, config.RATE_LIMIT_MULTIPLIER);
  const ctx: Ctx = { db, config, clock, mailer, billing, allow, limited, tedFetcher: options.tedFetcher ?? fetch };
  const allowedOrigin = new URL(config.BASE_URL).origin;
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY) {
    const v = config.TRUST_PROXY;
    app.set("trust proxy", /^\d+$/.test(v) ? Number(v) : v === "true" ? true : v);
  }
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    const id = randomUUID();
    res.set("X-Request-Id", id);
    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;
      log.info("http.request", {
        id,
        method: req.method,
        route: (req.route?.path as string | undefined) ?? req.path.replace(/[0-9a-f-]{20,}/gi, ":id").slice(0, 80),
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - started) / 1000000n),
      });
    });
    next();
  });
  const strictCsp = config.APP_ENV !== "development";
  app.use(
    helmet({
      contentSecurityPolicy: strictCsp
        ? {
            directives: {
              "default-src": ["'self'"],
              "script-src": ["'self'"],
              "style-src": ["'self'", "'unsafe-inline'"],
              "img-src": ["'self'", "data:"],
              "font-src": ["'self'"],
              "connect-src": ["'self'"],
              "form-action": ["'self'"],
              "frame-ancestors": ["'none'"],
              "base-uri": ["'self'"],
              "object-src": ["'none'"],
              "upgrade-insecure-requests": config.secureCookies ? [] : null,
            },
          }
        : false,
      strictTransportSecurity: config.secureCookies ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // Signed machine-to-machine endpoints: raw bodies, no cookies, no browser origin checks.
  app.post("/api/billing/webhook", express.raw({ type: "*/*", limit: "512kb" }), (req, res) => {
    if (!config.billingEnabled) throw new HttpError(404, "Endpoint not found.");
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyStripeSignature(raw, req.header("stripe-signature"), config.STRIPE_WEBHOOK_SECRET!, Math.floor(clock().getTime() / 1000))) {
      log.warn("billing.webhook_rejected", {});
      throw new HttpError(400, "Invalid signature.");
    }
    const event = z
      .object({ id: z.string().max(255), type: z.string().max(120), created: z.number().int(), data: z.object({ object: z.record(z.string(), z.unknown()) }) })
      .parse(JSON.parse(raw.toString("utf8")));
    const outcome = applyBillingEvent(db, event, clock());
    log.info("billing.webhook", { type: event.type, outcome });
    res.json({ received: true, outcome });
  });
  app.post("/api/inbound/email", express.raw({ type: "*/*", limit: MAX_MESSAGE_BYTES }), async (req, res) => {
    if (!config.INBOUND_EMAIL_SECRET) throw new HttpError(404, "Endpoint not found.");
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyInboundSignature(raw, req.header("x-scope-timestamp"), req.header("x-scope-signature"), config.INBOUND_EMAIL_SECRET, Math.floor(clock().getTime() / 1000)))
      throw new HttpError(401, "Invalid signature.");
    if (!allow("inbound-webhook", 500, 3600000)) throw new HttpError(429, "Too many messages.");
    try {
      const r = await recordInboundMessage(db, raw, "webhook", null, clock());
      res.status(r.duplicate ? 200 : 202).json({ id: r.id, duplicate: r.duplicate });
    } catch {
      throw new HttpError(400, "Unreadable message.");
    }
  });

  app.use("/api/admin/inbound", express.json({ limit: "3mb" }));
  app.use(express.json({ limit: "40kb" }));
  // CSRF defence for cookie-authenticated APIs: same-origin fetch metadata, matching Origin,
  // and JSON-only bodies (which HTML forms cannot send cross-site).
  app.use("/api", (req, res, next) => {
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") {
      res.status(403).json({ error: "Cross-site API access is not permitted." });
      return;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== allowedOrigin) {
        res.status(403).json({ error: "Request origin is not permitted." });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "Use application/json." });
        return;
      }
    }
    next();
  });

  // Public, unauthenticated endpoints
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });
  const { router: oppRouter, tedHealth } = opportunityRoutes(ctx);
  app.get("/api/ready", (_req, res) => {
    const checks: Record<string, unknown> = {};
    let ready = true;
    try {
      db.prepare("SELECT 1").get();
      checks.database = "ok";
      const pending = pendingMigrations(db, config.MIGRATIONS_DIR);
      checks.migrations = pending.length ? { pending } : "ok";
      if (pending.length) ready = false;
      const ted = tedHealth(clock());
      checks.tedSource = { lastSuccessAt: ted.lastSuccessAt, stale: ted.stale };
    } catch (e) {
      ready = false;
      checks.database = errorName(e);
    }
    checks.email = mailer.provider;
    checks.billing = config.billingEnabled ? "stripe" : "disabled";
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", checks });
  });
  app.get("/api/config", (_req, res) => {
    const incident = db
      .prepare("SELECT title,customer_message,severity FROM incidents WHERE status='open' AND customer_visible=1 ORDER BY updated_at DESC LIMIT 1")
      .get() as { title: string; customer_message: string | null; severity: string } | undefined;
    const body: PublicConfig = {
      billingEnabled: config.billingEnabled,
      soloPriceLabel: config.SOLO_PRICE_LABEL,
      emailDelivery: mailer.delivers,
      legal: {
        configured: config.legalConfigured,
        reviewed: config.LEGAL_REVIEWED,
        operatorName: config.LEGAL_OPERATOR_NAME ?? null,
        operatorAddress: config.LEGAL_OPERATOR_ADDRESS ?? null,
        contactEmail: config.LEGAL_CONTACT_EMAIL ?? null,
      },
      incident: incident ? { title: incident.title, message: incident.customer_message ?? "", severity: incident.severity } : null,
    };
    res.set("Cache-Control", "public, max-age=60").json(body);
  });
  // Crawlers: public marketing pages only; the workspace and token pages are excluded.
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      `User-agent: *\nDisallow: /app\nDisallow: /api\nDisallow: /reset-password\nDisallow: /verify-email\nSitemap: ${config.BASE_URL.replace(/\/$/, "")}/sitemap.xml\n`,
    );
  });
  app.get("/sitemap.xml", (_req, res) => {
    const base = config.BASE_URL.replace(/\/$/, "");
    const pages = ["/", "/how-it-works", "/pricing", "/demo", "/sources", "/privacy", "/terms", "/cookies"];
    res
      .type("application/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${base}${p}</loc></url>`).join("")}</urlset>\n`);
  });
  const auth = publicAuthRoutes(ctx);
  app.use("/api", auth.router);

  // Everything below requires a valid session.
  app.use("/api", (req, res, next) => {
    const s = getSession(db, req, clock());
    if (!s) {
      res.status(401).json({ error: "Please log in to continue." });
      return;
    }
    res.locals.user = s.user;
    res.locals.sessionId = s.sessionId;
    next();
  });
  app.use("/api", accountRoutes(ctx, auth.sendVerification));
  app.use("/api", oppRouter);
  app.use("/api", billingRoutes(ctx));
  app.use("/api", adminRoutes(ctx));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
      return;
    }
    if (err instanceof BillingError) {
      log.error("billing.error", { status: err.status });
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; "),
      });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON request." });
      return;
    }
    const type = (err as { type?: string }).type;
    if (type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large." });
      return;
    }
    log.error("http.unhandled", { error: errorName(err) });
    res.status(500).json({ error: "The request could not be completed. Please try again." });
  });
  return app;
}
