import express from "express";
import { z } from "zod";
import type { Ctx } from "./context.js";
import { HttpError, userOf } from "./context.js";
import { allOpportunities, transaction } from "./db.js";
import { account, audit, FREE_ANALYSES } from "./auth.js";
import { matchOpportunity, freshness, currentLifecycle } from "./matching.js";
import { emptyProfile, opportunityTypes, type Opportunity, type Profile } from "../src/domain.js";

export function opportunityRoutes(ctx: Ctx) {
  const { db, config, clock, limited } = ctx;
  const r = express.Router();
  function tedHealth(now: Date) {
    const last = db
      .prepare("SELECT started_at,status FROM sync_runs WHERE source='TED' AND status IN ('success','failed') ORDER BY started_at DESC LIMIT 1")
      .get() as { started_at: string; status: string } | undefined;
    const lastSuccess = db
      .prepare("SELECT started_at FROM sync_runs WHERE source='TED' AND status='success' ORDER BY started_at DESC LIMIT 1")
      .get() as { started_at: string } | undefined;
    const ageHours = lastSuccess ? (now.getTime() - new Date(lastSuccess.started_at).getTime()) / 3600000 : null;
    return {
      lastStatus: last?.status ?? null,
      lastSuccessAt: lastSuccess?.started_at ?? null,
      stale: last?.status === "failed" || ageHours === null || ageHours > config.TED_STALE_HOURS,
    };
  }
  function ranked(userId: string) {
    const now = clock();
    const row = db.prepare("SELECT data FROM profiles WHERE user_id=?").get(userId) as { data: string } | undefined;
    const p: Profile = row ? JSON.parse(row.data) : emptyProfile;
    const saves = new Set(
      (db.prepare("SELECT opportunity_id FROM saves WHERE user_id=?").all(userId) as { opportunity_id: string }[]).map((s) => s.opportunity_id),
    );
    const ted = tedHealth(now);
    return {
      ted,
      profile: row ? p : null,
      records: allOpportunities(db)
        .filter((o) => o.status !== "fictional")
        .map((o) => {
          const withState: Opportunity = { ...o, lifecycle: currentLifecycle(o, now), stale: o.source === "TED" && ted.stale };
          return {
            ...withState,
            match: matchOpportunity(p, withState, now),
            saved: saves.has(o.id),
            freshness: freshness(withState, now),
          };
        }),
    };
  }
  const closed = (l: string | undefined) => l === "deadline_passed" || l === "result_published" || l === "superseded";
  r.get("/opportunities", (req, res) => {
    const filter = z
      .object({
        q: z.string().max(120).optional(),
        type: z.enum(["all", ...opportunityTypes]).optional(),
        sector: z.string().max(80).optional(),
        saved: z.enum(["true", "false"]).optional(),
        deadline: z.enum(["all", "upcoming", "unknown"]).optional(),
        status: z.enum(["active", "all", "closed"]).optional(),
        source: z.string().max(80).optional(),
        location: z.string().max(80).optional(),
        maxValue: z.coerce.number().min(0).optional(),
        minScore: z.coerce.number().min(0).max(100).optional(),
        sort: z.enum(["relevance", "deadline", "newest"]).optional(),
      })
      .parse(req.query);
    const now = clock();
    const { records: all, ted, profile } = ranked(userOf(res).id);
    const q = filter.q?.toLowerCase().trim();
    // Saved views show everything the user kept, including closed records.
    const status = filter.status ?? (filter.saved === "true" ? "all" : "active");
    const records = all.filter(
      (o) =>
        (!q || `${o.title} ${o.description} ${o.buyer}`.toLowerCase().includes(q)) &&
        (!filter.type || filter.type === "all" || o.type === filter.type) &&
        (!filter.sector || o.sector === filter.sector) &&
        (filter.saved !== "true" || o.saved) &&
        (!filter.source || o.source === filter.source) &&
        (!filter.location || o.geography === filter.location) &&
        (!filter.maxValue || o.value === null || o.value <= filter.maxValue) &&
        (!filter.minScore || o.match.score >= filter.minScore) &&
        (filter.deadline !== "upcoming" || (!!o.deadline && new Date(o.deadline) > now)) &&
        (filter.deadline !== "unknown" || !o.deadline) &&
        (status === "all" || (status === "active" ? !closed(o.lifecycle) : closed(o.lifecycle))),
    );
    const sort = filter.sort ?? "relevance";
    records.sort((a, b) => {
      if (sort === "deadline") {
        const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity,
          bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
      } else if (sort === "newest") {
        const ap = a.publishedAt || a.verifiedAt || "",
          bp = b.publishedAt || b.verifiedAt || "";
        if (ap !== bp) return ap < bp ? 1 : -1;
      }
      return b.match.score - a.match.score || a.title.localeCompare(b.title);
    });
    // Detailed condition evaluations are metered; the feed exposes only the relevance summary.
    res.json({
      opportunities: records.slice(0, 300).map((o) => {
        const { conditions, role, match, ...summary } = o;
        void conditions;
        void role;
        return { ...summary, match: { score: match.score, reasons: match.reasons.slice(0, 2) } };
      }),
      total: records.length,
      closedHidden: status === "active" ? all.filter((o) => closed(o.lifecycle)).length : 0,
      sectors: [...new Set(all.map((o) => o.sector))].sort(),
      ted,
      hasProfile: !!profile,
    });
  });
  r.get("/opportunities/:id", limited("analysis", 120, 3600000), (req, res) => {
    const id = z.string().max(120).parse(req.params.id);
    const u = userOf(res);
    const o = ranked(u.id).records.find((o) => o.id === id);
    if (!o) throw new HttpError(404, "Opportunity not found.");
    const now = clock(),
      month = now.toISOString().slice(0, 7);
    const allowed = transaction(db, () => {
      const plan = account(db, u, now);
      if (plan.analysesLimit === null) return true;
      const seen = db
        .prepare("SELECT 1 FROM analyses WHERE user_id=? AND opportunity_id=? AND month=?")
        .get(u.id, o.id, month);
      if (seen) return true;
      if (plan.analysesUsed >= plan.analysesLimit) return false;
      db.prepare("INSERT INTO analyses VALUES(?,?,?,?)").run(u.id, o.id, month, now.toISOString());
      return true;
    });
    if (!allowed)
      throw new HttpError(
        402,
        `You have used your ${FREE_ANALYSES} detailed analyses for this calendar month. Browsing and records you already analysed remain available.`,
        "ANALYSIS_LIMIT",
      );
    const superseding = o.supersededBy
      ? (db.prepare("SELECT id,source_id FROM opportunities WHERE id=?").get(o.supersededBy) as { id: string; source_id: string } | undefined)
      : undefined;
    res.json({ opportunity: { ...o, supersededBy: superseding ? { id: superseding.id, sourceId: superseding.source_id } : null } });
  });
  r.post("/saves/:id", limited("saves", 120, 3600000), (req, res) => {
    const id = z.string().max(120).parse(req.params.id);
    if (!db.prepare("SELECT 1 FROM opportunities WHERE id=? AND editorial_state='published'").get(id))
      throw new HttpError(404, "Opportunity not found.");
    const u = userOf(res);
    const allowed = transaction(db, () => {
      const plan = account(db, u, clock());
      if (db.prepare("SELECT 1 FROM saves WHERE user_id=? AND opportunity_id=?").get(u.id, id)) return true;
      const count = Number((db.prepare("SELECT COUNT(*) AS n FROM saves WHERE user_id=?").get(u.id) as { n: number }).n);
      if (plan.savesLimit !== null && count >= plan.savesLimit) return false;
      db.prepare("INSERT INTO saves VALUES(?,?,?)").run(u.id, id, clock().toISOString());
      return true;
    });
    if (!allowed)
      throw new HttpError(402, "Free includes up to 5 saved opportunities. Remove a save or upgrade to add another.", "SAVE_LIMIT");
    res.json({ ok: true });
  });
  r.delete("/saves/:id", (req, res) => {
    db.prepare("DELETE FROM saves WHERE user_id=? AND opportunity_id=?").run(userOf(res).id, String(req.params.id).slice(0, 120));
    res.json({ ok: true });
  });
  return { router: r, tedHealth };
}

export function billingRoutes(ctx: Ctx) {
  const { db, clock, billing, limited } = ctx;
  const r = express.Router();
  r.post("/billing/checkout", limited("checkout", 10, 3600000), async (_req, res) => {
    const u = userOf(res);
    if (!billing.enabled) throw new HttpError(503, "Paid plans are not available yet.", "BILLING_DISABLED");
    if (!u.email_verified_at) throw new HttpError(403, "Confirm your email address before upgrading.", "EMAIL_UNVERIFIED");
    const plan = account(db, u, clock());
    if (plan.plan === "solo") throw new HttpError(409, "You already have an active Solo subscription.");
    const sub = db.prepare("SELECT customer_id FROM subscriptions WHERE user_id=?").get(u.id) as { customer_id: string | null } | undefined;
    const url = await billing.checkout(u, sub?.customer_id);
    audit(db, clock(), "billing.checkout_started", u.id);
    res.json({ url });
  });
  r.post("/billing/portal", limited("portal", 20, 3600000), async (_req, res) => {
    const u = userOf(res);
    if (!billing.enabled) throw new HttpError(503, "Paid plans are not available yet.", "BILLING_DISABLED");
    const sub = db.prepare("SELECT customer_id FROM subscriptions WHERE user_id=?").get(u.id) as { customer_id: string | null } | undefined;
    if (!sub?.customer_id) throw new HttpError(404, "No billing account found.");
    res.json({ url: await billing.portal(sub.customer_id) });
  });
  return r;
}
