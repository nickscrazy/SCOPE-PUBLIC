import express from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Ctx } from "./context.js";
import { HttpError, userOf } from "./context.js";
import { audit, type User } from "./auth.js";
import type { Role } from "../src/domain.js";
import { runTedSync, consecutiveFailures } from "./jobs.js";
import {
  createDraft,
  updateDraft,
  submitDraft,
  withdrawDraft,
  decideDraft,
  retireReference,
  listCatalogue,
  editorialHistory,
  EditorialError,
} from "./editorial.js";
import {
  recordInboundMessage,
  importInboundMessage,
  dismissInboundMessage,
  MAX_MESSAGE_BYTES,
} from "./inbound.js";

/**
 * Administrative API. Roles live only in the database and are granted with the operator CLI
 * (`npm run admin:role`); no endpoint can change a role, and client claims are ignored.
 * Every route re-reads the role from the authenticated session's user row.
 */
const rank: Record<Role, number> = { user: 0, editor: 1, reviewer: 2, admin: 3 };
export function requireRole(min: Role): express.RequestHandler {
  return (_req, res, next) => {
    const u = userOf(res);
    if (rank[u.role] < rank[min]) {
      next(new HttpError(403, "You do not have access to this area."));
      return;
    }
    if (!u.email_verified_at) {
      next(new HttpError(403, "Confirm your email address before using administrative tools."));
      return;
    }
    next();
  };
}
const actor = (u: User) => ({ id: u.id, role: u.role });
const wrap = (e: unknown) => (e instanceof EditorialError ? new HttpError(e.status, e.message) : e);

export function adminRoutes(ctx: Ctx) {
  const { db, config, clock } = ctx;
  const r = express.Router();
  r.use("/admin", (req, res, next) => {
    // Administrative responses must never be cached or framed.
    res.set("Cache-Control", "no-store");
    next();
  });
  r.get("/admin/overview", requireRole("editor"), (_req, res) => {
    const now = clock();
    const runs = db
      .prepare("SELECT id,source,started_at AS startedAt,finished_at AS finishedAt,status,count,error,detail,trigger FROM sync_runs ORDER BY started_at DESC LIMIT 20")
      .all() as { detail: string | null }[];
    const counts = db
      .prepare("SELECT source, lifecycle, COUNT(*) AS n FROM opportunities WHERE editorial_state='published' GROUP BY source, lifecycle")
      .all();
    res.json({
      now: now.toISOString(),
      role: userOf(res).role,
      scheduler: { enabled: config.TED_SYNC_ENABLED, hoursUtc: config.TED_SYNC_HOURS_UTC, staleAfterHours: config.TED_STALE_HOURS },
      syncRuns: runs.map((run) => ({ ...run, detail: run.detail ? JSON.parse(run.detail) : null })),
      consecutiveTedFailures: consecutiveFailures(db),
      counts,
      users: db.prepare("SELECT COUNT(*) AS total, SUM(email_verified_at IS NOT NULL) AS verified FROM users").get(),
      subscriptions: db.prepare("SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status").all(),
      incidents: db.prepare("SELECT * FROM incidents ORDER BY status='open' DESC, updated_at DESC LIMIT 20").all(),
      inboundPending: (db.prepare("SELECT COUNT(*) AS n FROM inbound_messages WHERE status='pending'").get() as { n: number }).n,
      billingEnabled: config.billingEnabled,
      emailProvider: ctx.mailer.provider,
      inboundWebhookEnabled: !!config.INBOUND_EMAIL_SECRET,
    });
  });
  r.post("/admin/ted-sync", requireRole("admin"), async (req, res) => {
    const c = z.object({ full: z.boolean().optional() }).parse(req.body);
    const result = await runTedSync(db, config, { trigger: "admin", actor: userOf(res).id, full: c.full, fetcher: ctx.tedFetcher });
    res.status(result.status === "skipped" ? 409 : 200).json(result);
  });
  // Catalogue / editorial
  r.get("/admin/catalogue", requireRole("editor"), (_req, res) => {
    res.json(listCatalogue(db, clock()));
  });
  r.get("/admin/catalogue/:id/history", requireRole("editor"), (req, res) => {
    res.json({ history: editorialHistory(db, z.string().max(120).parse(req.params.id)) });
  });
  r.post("/admin/drafts", requireRole("editor"), (req, res) => {
    try {
      res.status(201).json(createDraft(db, actor(userOf(res)), req.body, clock()));
    } catch (e) {
      throw wrap(e);
    }
  });
  r.put("/admin/drafts/:id", requireRole("editor"), (req, res) => {
    try {
      updateDraft(db, actor(userOf(res)), z.uuid().parse(req.params.id), req.body, clock());
      res.json({ ok: true });
    } catch (e) {
      throw wrap(e);
    }
  });
  r.post("/admin/drafts/:id/submit", requireRole("editor"), (req, res) => {
    try {
      submitDraft(db, actor(userOf(res)), z.uuid().parse(req.params.id), z.object({ evidenceNote: z.string() }).parse(req.body).evidenceNote, clock());
      res.json({ ok: true });
    } catch (e) {
      throw wrap(e);
    }
  });
  r.post("/admin/drafts/:id/withdraw", requireRole("editor"), (req, res) => {
    try {
      withdrawDraft(db, actor(userOf(res)), z.uuid().parse(req.params.id), clock());
      res.json({ ok: true });
    } catch (e) {
      throw wrap(e);
    }
  });
  r.post("/admin/drafts/:id/decision", requireRole("reviewer"), (req, res) => {
    const c = z.object({ approve: z.boolean(), note: z.string(), sourceChecked: z.boolean().default(false) }).parse(req.body);
    try {
      res.json(
        decideDraft(db, actor(userOf(res)), z.uuid().parse(req.params.id), c, clock(), {
          allowSelfApproval: config.EDITORIAL_ALLOW_SELF_APPROVAL,
          reviewDays: config.EDITORIAL_REVIEW_DAYS,
        }),
      );
    } catch (e) {
      throw wrap(e);
    }
  });
  r.post("/admin/catalogue/:id/retire", requireRole("reviewer"), (req, res) => {
    try {
      retireReference(db, actor(userOf(res)), z.string().max(120).parse(req.params.id), z.object({ note: z.string() }).parse(req.body).note, clock());
      res.json({ ok: true });
    } catch (e) {
      throw wrap(e);
    }
  });
  // Email-notification ingestion
  r.get("/admin/inbound", requireRole("editor"), (_req, res) => {
    const rows = db
      .prepare("SELECT id,received_at AS receivedAt,channel,sender_domain AS senderDomain,subject,candidates,ignored_links AS ignoredLinks,attachments_ignored AS attachmentsIgnored,status,reviewed_at AS reviewedAt,note FROM inbound_messages ORDER BY received_at DESC LIMIT 100")
      .all() as { candidates: string }[];
    res.json({ messages: rows.map((m) => ({ ...m, candidates: JSON.parse(m.candidates) })) });
  });
  r.post("/admin/inbound", requireRole("editor"), async (req, res) => {
    const c = z.object({ message: z.base64().max(Math.ceil((MAX_MESSAGE_BYTES * 4) / 3) + 8) }).parse(req.body);
    const raw = Buffer.from(c.message, "base64");
    try {
      const result = await recordInboundMessage(db, raw, "upload", userOf(res).id, clock());
      res.status(result.duplicate ? 200 : 201).json({ id: result.id, duplicate: result.duplicate, candidates: result.candidates.length });
    } catch {
      throw new HttpError(400, "The message could not be read as an email (.eml).");
    }
  });
  r.post("/admin/inbound/:id/import", requireRole("editor"), async (req, res) => {
    const out = await importInboundMessage(db, z.uuid().parse(req.params.id), userOf(res).id, clock(), ctx.tedFetcher);
    if (out.status !== 200) throw new HttpError(out.status, out.error!);
    res.json(out);
  });
  r.post("/admin/inbound/:id/dismiss", requireRole("editor"), (req, res) => {
    if (!dismissInboundMessage(db, z.uuid().parse(req.params.id), userOf(res).id, clock())) throw new HttpError(409, "Message already reviewed.");
    res.json({ ok: true });
  });
  // Operational incidents
  const incident = z.object({
    title: z.string().trim().min(3).max(200),
    severity: z.enum(["info", "minor", "major"]),
    customerMessage: z.string().trim().max(500).optional(),
    customerVisible: z.boolean().default(false),
  });
  r.post("/admin/incidents", requireRole("admin"), (req, res) => {
    const c = incident.parse(req.body),
      now = clock(),
      id = randomUUID(),
      u = userOf(res);
    db.prepare(
      "INSERT INTO incidents(id,created_at,updated_at,severity,status,title,customer_message,customer_visible,source,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(id, now.toISOString(), now.toISOString(), c.severity, "open", c.title, c.customerMessage ?? null, c.customerVisible ? 1 : 0, "operator", u.id);
    audit(db, now, "incident.opened", u.id, id);
    res.status(201).json({ id });
  });
  r.post("/admin/incidents/:id/resolve", requireRole("admin"), (req, res) => {
    const now = clock(),
      u = userOf(res);
    const n = db.prepare("UPDATE incidents SET status='resolved',updated_at=? WHERE id=? AND status='open'").run(now.toISOString(), z.uuid().parse(req.params.id)).changes;
    if (!n) throw new HttpError(404, "Open incident not found.");
    audit(db, now, "incident.resolved", u.id, String(req.params.id));
    res.json({ ok: true });
  });
  r.get("/admin/audit", requireRole("admin"), (_req, res) => {
    res.json({ entries: db.prepare("SELECT created_at AS at,actor,action,target,detail FROM audit_log ORDER BY id DESC LIMIT 200").all() });
  });
  return r;
}
