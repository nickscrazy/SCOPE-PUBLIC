import express from "express";
import helmet from "helmet";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { allOpportunities, transaction } from "./db.js";
import {
  account,
  createSession,
  getUser,
  hashPassword,
  verifyPassword,
  tokenHash,
} from "./auth.js";
import { profileSchema, emptyProfile } from "../src/domain.js";
import { matchOpportunity, freshness } from "./matching.js";
export function createApp(
  db: DB,
  options: {
    clock?: () => Date;
    baseUrl?: string;
    secureCookies?: boolean;
  } = {},
) {
  const app = express(),
    clock = options.clock || (() => new Date()),
    baseUrl = options.baseUrl || "http://localhost:3000";
  const allowedOrigin = new URL(baseUrl).origin;
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
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
                "upgrade-insecure-requests": null,
              },
            }
          : false,
      strictTransportSecurity:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "40kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (req.headers["sec-fetch-site"] === "cross-site") {
      res
        .status(403)
        .json({ error: "Cross-site API access is not permitted." });
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
  function rate(
    req: express.Request,
    key: string,
    limit: number,
    windowMs: number,
  ) {
    const now = clock().getTime(),
      k = tokenHash(`${key}:${req.ip}`);
    return transaction(db, () => {
      const r = db.prepare("SELECT * FROM rate_limits WHERE key=?").get(k);
      if (!r || Number(r.reset_at) <= now) {
        db.prepare("INSERT OR REPLACE INTO rate_limits VALUES(?,?,?)").run(
          k,
          1,
          now + windowMs,
        );
        return true;
      }
      if (Number(r.count) >= limit) return false;
      db.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").run(k);
      return true;
    });
  }
  const limited =
    (key: string, limit: number, ms: number): express.RequestHandler =>
    (req, res, next) => {
      if (!rate(req, key, limit, ms)) {
        res
          .set("Retry-After", String(Math.ceil(ms / 1000)))
          .status(429)
          .json({ error: "Too many requests. Please try again later." });
        return;
      }
      next();
    };
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });
  const credentials = z.object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(128),
    startTrial: z.boolean().optional(),
  });
  app.post(
    "/api/auth/register",
    limited("auth", 15, 15 * 60000),
    async (req, res) => {
      const c = credentials.parse(req.body),
        id = randomUUID(),
        now = clock(),
        trial = c.startTrial !== false;
      const hash = await hashPassword(c.password);
      try {
        db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
          id,
          c.email,
          hash,
          now.toISOString(),
          trial ? now.toISOString() : null,
          trial ? new Date(now.getTime() + 7 * 86400000).toISOString() : null,
        );
      } catch (e) {
        if (String(e).includes("UNIQUE")) {
          res.status(409).json({
            error: "An account already uses this email. Please log in.",
          });
          return;
        }
        throw e;
      }
      createSession(
        db,
        res,
        id,
        now,
        options.secureCookies ?? process.env.NODE_ENV === "production",
      );
      res.status(201).json({ ok: true });
    },
  );
  app.post(
    "/api/auth/login",
    limited("auth", 15, 15 * 60000),
    async (req, res) => {
      const c = credentials.parse(req.body),
        u = db.prepare("SELECT * FROM users WHERE email=?").get(c.email) as
          import("./auth.js").User | undefined;
      // Equal-cost derivation for unknown addresses to reduce account enumeration by timing.
      const valid = await verifyPassword(
        c.password,
        u?.password_hash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!u || !valid) {
        res.status(401).json({ error: "Email or password is incorrect." });
        return;
      }
      createSession(
        db,
        res,
        u.id,
        clock(),
        options.secureCookies ?? process.env.NODE_ENV === "production",
      );
      res.json({ ok: true });
    },
  );
  app.post("/api/auth/logout", (req, res) => {
    const token = req.headers.cookie?.match(
      /(?:^|; )scope_session=([a-f0-9]+)/,
    )?.[1];
    if (token)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        tokenHash(token),
      );
    res.clearCookie("scope_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: options.secureCookies ?? process.env.NODE_ENV === "production",
    });
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    const u = getUser(db, req, clock());
    if (!u) {
      res.status(401).json({ error: "Please log in to continue." });
      return;
    }
    res.locals.user = u;
    next();
  });
  app.get("/api/me", (_req, res) => {
    res.json(account(db, res.locals.user, clock()));
  });
  app.post("/api/trial", limited("trial", 10, 3600000), (_req, res) => {
    const now = clock();
    const result = db
      .prepare(
        "UPDATE users SET trial_started_at=?,trial_ends_at=? WHERE id=? AND trial_started_at IS NULL",
      )
      .run(
        now.toISOString(),
        new Date(now.getTime() + 7 * 86400000).toISOString(),
        res.locals.user.id,
      );
    if (!result.changes) {
      res
        .status(409)
        .json({ error: "Your seven-day trial has already been used." });
      return;
    }
    res.json({ ok: true });
  });
  app.get("/api/profile", (_req, res) => {
    const r = db
      .prepare("SELECT data FROM profiles WHERE user_id=?")
      .get(res.locals.user.id);
    res.json({ profile: r ? JSON.parse(String(r.data)) : null });
  });
  app.put("/api/profile", limited("profile", 60, 3600000), (req, res) => {
    const p = profileSchema.parse(req.body);
    db.prepare(
      "INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
    ).run(res.locals.user.id, JSON.stringify(p), clock().toISOString());
    res.json({ profile: p });
  });
  app.delete("/api/profile", (_req, res) => {
    db.prepare("DELETE FROM profiles WHERE user_id=?").run(res.locals.user.id);
    res.json({ ok: true });
  });
  app.get("/api/profile/export", (_req, res) => {
    const r = db
      .prepare("SELECT data,updated_at FROM profiles WHERE user_id=?")
      .get(res.locals.user.id);
    res.set("Content-Disposition", 'attachment; filename="scope-profile.json"');
    res.json({
      profile: r ? JSON.parse(String(r.data)) : null,
      updatedAt: r?.updated_at || null,
    });
  });
  function ranked(userId: string) {
    const r = db
        .prepare("SELECT data FROM profiles WHERE user_id=?")
        .get(userId),
      p = r ? JSON.parse(String(r.data)) : emptyProfile;
    const saves = new Set(
      db
        .prepare("SELECT opportunity_id FROM saves WHERE user_id=?")
        .all(userId)
        .map((s) => s.opportunity_id),
    );
    const sync = db
      .prepare(
        "SELECT status FROM sync_runs WHERE source='TED' ORDER BY started_at DESC LIMIT 1",
      )
      .get();
    return allOpportunities(db)
      .filter((o) => o.status !== "fictional")
      .map((o) => ({
        ...o,
        stale: o.source === "TED" && sync?.status === "failed",
        match: matchOpportunity(p, o, clock()),
        saved: saves.has(o.id),
        freshness: freshness(
          { ...o, stale: o.source === "TED" && sync?.status === "failed" },
          clock(),
        ),
      }))
      .sort((a, b) => b.match.score - a.match.score);
  }
  app.get("/api/opportunities", (req, res) => {
    const filter = z
      .object({
        q: z.string().max(120).optional(),
        type: z.enum(["all", "tender", "grant", "tax_credit"]).optional(),
        sector: z.string().max(80).optional(),
        saved: z.enum(["true", "false"]).optional(),
        deadline: z.enum(["all", "upcoming", "unknown"]).optional(),
        source: z.string().max(80).optional(),
        location: z.string().max(80).optional(),
        maxValue: z.coerce.number().min(0).optional(),
        minScore: z.coerce.number().min(0).max(100).optional(),
      })
      .parse(req.query);
    const records = ranked(res.locals.user.id).filter(
      (o) =>
        (!filter.q ||
          `${o.title} ${o.description} ${o.buyer}`
            .toLowerCase()
            .includes(filter.q.toLowerCase())) &&
        (!filter.type || filter.type === "all" || o.type === filter.type) &&
        (!filter.sector || o.sector === filter.sector) &&
        (filter.saved !== "true" || o.saved) &&
        (!filter.source || o.source === filter.source) &&
        (!filter.location || o.geography === filter.location) &&
        (!filter.maxValue || o.value === null || o.value <= filter.maxValue) &&
        (!filter.minScore || o.match.score >= filter.minScore) &&
        (filter.deadline !== "upcoming" ||
          (!!o.deadline && new Date(o.deadline) > clock())) &&
        (filter.deadline !== "unknown" || !o.deadline),
    );
    // Detailed condition evaluations are metered; feed exposes only the relevance summary.
    res.json({
      opportunities: records.map((o) => {
        const { conditions, role, ...summary } = o;
        void conditions;
        void role;
        return {
          ...summary,
          match: { score: o.match.score, reasons: o.match.reasons.slice(0, 1) },
        };
      }),
      sources: db
        .prepare(
          "SELECT source,started_at,finished_at,status,count,error FROM sync_runs ORDER BY started_at DESC LIMIT 5",
        )
        .all(),
      hasProfile: !!db
        .prepare("SELECT 1 FROM profiles WHERE user_id=?")
        .get(res.locals.user.id),
    });
  });
  app.get(
    "/api/opportunities/:id",
    limited("analysis", 120, 3600000),
    (req, res) => {
      const o = ranked(res.locals.user.id).find((o) => o.id === req.params.id);
      if (!o) {
        res.status(404).json({ error: "Opportunity not found." });
        return;
      }
      const now = clock(),
        u = res.locals.user,
        id = u.id,
        month = now.toISOString().slice(0, 7);
      const allowed = transaction(db, () => {
        const plan = account(db, u, now);
        const seen = db
          .prepare(
            "SELECT 1 FROM analyses WHERE user_id=? AND opportunity_id=? AND month=?",
          )
          .get(id, o.id, month);
        if (plan.plan === "free" && !seen && plan.analysesUsed >= 3)
          return false;
        if (plan.plan === "free" && !seen)
          db.prepare("INSERT INTO analyses VALUES(?,?,?,?)").run(
            id,
            o.id,
            month,
            now.toISOString(),
          );
        return true;
      });
      if (!allowed) {
        res.status(402).json({
          error:
            "You have used your 3 detailed analyses for this calendar month. Browsing and existing analyses remain available.",
          code: "ANALYSIS_LIMIT",
        });
        return;
      }
      res.json({ opportunity: o });
    },
  );
  app.post("/api/saves/:id", limited("saves", 120, 3600000), (req, res) => {
    const id = z.string().max(120).parse(req.params.id);
    if (!db.prepare("SELECT 1 FROM opportunities WHERE id=?").get(id)) {
      res.status(404).json({ error: "Opportunity not found." });
      return;
    }
    const allowed = transaction(db, () => {
      const uid = res.locals.user.id,
        plan = account(db, res.locals.user, clock());
      if (
        db
          .prepare("SELECT 1 FROM saves WHERE user_id=? AND opportunity_id=?")
          .get(uid, id)
      )
        return true;
      const count = Number(
        db.prepare("SELECT COUNT(*) AS n FROM saves WHERE user_id=?").get(uid)
          ?.n,
      );
      if (plan.savesLimit !== null && count >= plan.savesLimit) return false;
      db.prepare("INSERT INTO saves VALUES(?,?,?)").run(
        uid,
        id,
        clock().toISOString(),
      );
      return true;
    });
    if (!allowed) {
      res.status(402).json({
        error:
          "Free includes up to 5 saved opportunities. Remove a save to add another.",
      });
      return;
    }
    res.json({ ok: true });
  });
  app.delete("/api/saves/:id", (req, res) => {
    db.prepare("DELETE FROM saves WHERE user_id=? AND opportunity_id=?").run(
      res.locals.user.id,
      String(req.params.id),
    );
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
        return;
      }
      if (err instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON request." });
        return;
      }
      if ((err as { type?: string }).type === "entity.too.large") {
        res.status(413).json({ error: "Request is too large." });
        return;
      }
      console.error(
        "Request failed:",
        err instanceof Error ? err.name : "Unknown error",
      );
      res.status(500).json({
        error: "The request could not be completed. Please try again.",
      });
    },
  );
  return app;
}
