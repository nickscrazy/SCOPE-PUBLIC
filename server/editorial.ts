import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DB } from "./db.js";
import { transaction, upsertOpportunities, contentHash } from "./db.js";
import { curatedRecordSchema } from "./catalogue.js";
import type { Role } from "../src/domain.js";
import type { Opportunity } from "../src/domain.js";
import { audit } from "./auth.js";

/**
 * Maltese funding catalogue workflow:
 *   editor drafts → editor submits → a different reviewer approves (attesting a source check) → published.
 * Every step is recorded in editorial_events and the audit log. Approval sets verifiedAt and a
 * re-verification due date; overdue records are flagged to customers as needing confirmation.
 */
export class EditorialError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const draftInputSchema = curatedRecordSchema
  .omit({ fetchedAt: true, verifiedAt: true, status: true, sourceVersion: true, id: true })
  .extend({ id: z.string().regex(/^[a-z0-9-]{3,100}$/).optional() });
export type DraftInput = z.infer<typeof draftInputSchema>;
type DraftRow = {
  id: string;
  opportunity_id: string;
  data: string;
  state: string;
  author: string;
  submitted_by: string | null;
  reviewer: string | null;
  decision_note: string | null;
  evidence_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};
const canEdit = (r: Role) => r === "editor" || r === "reviewer" || r === "admin";
const canReview = (r: Role) => r === "reviewer" || r === "admin";
function event(db: DB, now: Date, opportunityId: string, draftId: string | null, actor: string, action: string, note: string | null, hash: string | null = null) {
  db.prepare(
    "INSERT INTO editorial_events(opportunity_id,draft_id,actor,action,note,content_hash,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(opportunityId, draftId, actor, action, note, hash, now.toISOString());
  audit(db, now, "editorial." + action, actor, opportunityId, { draft: draftId });
}
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "reference";
function getDraft(db: DB, id: string) {
  const d = db.prepare("SELECT * FROM grant_drafts WHERE id=?").get(id) as DraftRow | undefined;
  if (!d) throw new EditorialError("Draft not found.", 404);
  return d;
}
export function createDraft(db: DB, actor: { id: string; role: Role }, input: unknown, now: Date) {
  if (!canEdit(actor.role)) throw new EditorialError("Editor role required.", 403);
  const data = draftInputSchema.parse(input);
  return transaction(db, () => {
    const existing = data.id
      ? (db.prepare("SELECT source FROM opportunities WHERE id=?").get(data.id) as { source: string } | undefined)
      : undefined;
    if (existing && existing.source === "TED")
      throw new EditorialError("TED notices are not editable.", 400);
    const opportunityId = data.id ?? `${slug(data.source)}-${slug(data.title)}`;
    if (!data.id && db.prepare("SELECT 1 FROM opportunities WHERE id=?").get(opportunityId))
      throw new EditorialError("A reference with this title already exists; edit it instead.", 409);
    const id = randomUUID();
    db.prepare(
      "INSERT INTO grant_drafts(id,opportunity_id,data,state,author,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    ).run(id, opportunityId, JSON.stringify({ ...data, id: opportunityId }), "draft", actor.id, now.toISOString(), now.toISOString());
    event(db, now, opportunityId, id, actor.id, "draft_created", null);
    return { id, opportunityId };
  });
}
export function updateDraft(db: DB, actor: { id: string; role: Role }, id: string, input: unknown, now: Date) {
  if (!canEdit(actor.role)) throw new EditorialError("Editor role required.", 403);
  const data = draftInputSchema.parse(input);
  return transaction(db, () => {
    const d = getDraft(db, id);
    if (d.state !== "draft") throw new EditorialError("Only drafts can be edited. Withdraw it from review first.", 409);
    db.prepare("UPDATE grant_drafts SET data=?,updated_at=? WHERE id=?").run(
      JSON.stringify({ ...data, id: d.opportunity_id }),
      now.toISOString(),
      id,
    );
    event(db, now, d.opportunity_id, id, actor.id, "draft_updated", null);
  });
}
export function submitDraft(db: DB, actor: { id: string; role: Role }, id: string, evidenceNote: string, now: Date) {
  if (!canEdit(actor.role)) throw new EditorialError("Editor role required.", 403);
  const note = z.string().trim().min(10, "Describe the source evidence you checked.").max(2000).parse(evidenceNote);
  return transaction(db, () => {
    const d = getDraft(db, id);
    if (d.state !== "draft") throw new EditorialError("This draft is not editable.", 409);
    db.prepare("UPDATE grant_drafts SET state='in_review',submitted_by=?,evidence_note=?,updated_at=? WHERE id=?").run(actor.id, note, now.toISOString(), id);
    event(db, now, d.opportunity_id, id, actor.id, "submitted", note);
  });
}
export function withdrawDraft(db: DB, actor: { id: string; role: Role }, id: string, now: Date) {
  if (!canEdit(actor.role)) throw new EditorialError("Editor role required.", 403);
  return transaction(db, () => {
    const d = getDraft(db, id);
    if (d.state !== "in_review") throw new EditorialError("Only drafts in review can be withdrawn.", 409);
    db.prepare("UPDATE grant_drafts SET state='draft',updated_at=? WHERE id=?").run(now.toISOString(), id);
    event(db, now, d.opportunity_id, id, actor.id, "withdrawn", null);
  });
}
export function decideDraft(
  db: DB,
  actor: { id: string; role: Role },
  id: string,
  decision: { approve: boolean; note: string; sourceChecked: boolean },
  now: Date,
  options: { allowSelfApproval: boolean; reviewDays: number },
) {
  if (!canReview(actor.role)) throw new EditorialError("Reviewer role required.", 403);
  const note = z.string().trim().min(3).max(2000).parse(decision.note);
  return transaction(db, () => {
    const d = getDraft(db, id);
    if (d.state !== "in_review") throw new EditorialError("Only submitted drafts can be decided.", 409);
    if (!options.allowSelfApproval && (d.author === actor.id || d.submitted_by === actor.id))
      throw new EditorialError("A different reviewer must approve this draft (four-eyes rule).", 403);
    if (!decision.approve) {
      db.prepare("UPDATE grant_drafts SET state='rejected',reviewer=?,decision_note=?,decided_at=?,updated_at=? WHERE id=?").run(actor.id, note, now.toISOString(), now.toISOString(), id);
      event(db, now, d.opportunity_id, id, actor.id, "rejected", note);
      return { published: false };
    }
    if (!decision.sourceChecked)
      throw new EditorialError("Confirm that you checked the official source before approving.", 400);
    const data = draftInputSchema.parse(JSON.parse(d.data));
    const record = curatedRecordSchema.parse({
      ...data,
      id: d.opportunity_id,
      fetchedAt: now.toISOString(),
      verifiedAt: now.toISOString(),
      status: "reference",
      sourceVersion: `editorial-${now.toISOString().slice(0, 10)}-${id.slice(0, 8)}`,
    }) as Opportunity;
    upsertOpportunities(db, [record], now, {
      reviewDueAt: new Date(now.getTime() + options.reviewDays * 86400000).toISOString(),
    });
    db.prepare("UPDATE opportunities SET editorial_state='published',review_due_at=? WHERE id=?").run(
      new Date(now.getTime() + options.reviewDays * 86400000).toISOString(),
      d.opportunity_id,
    );
    db.prepare("UPDATE grant_drafts SET state='approved',reviewer=?,decision_note=?,decided_at=?,updated_at=? WHERE id=?").run(actor.id, note, now.toISOString(), now.toISOString(), id);
    event(db, now, d.opportunity_id, id, actor.id, "approved_published", note, contentHash(record));
    return { published: true };
  });
}
export function retireReference(db: DB, actor: { id: string; role: Role }, opportunityId: string, note: string, now: Date) {
  if (!canReview(actor.role)) throw new EditorialError("Reviewer role required.", 403);
  const reason = z.string().trim().min(3).max(2000).parse(note);
  return transaction(db, () => {
    const o = db.prepare("SELECT source,editorial_state FROM opportunities WHERE id=?").get(opportunityId) as { source: string; editorial_state: string } | undefined;
    if (!o) throw new EditorialError("Reference not found.", 404);
    if (o.source === "TED") throw new EditorialError("TED notices follow their source lifecycle.", 400);
    db.prepare("UPDATE opportunities SET editorial_state='retired' WHERE id=?").run(opportunityId);
    event(db, now, opportunityId, null, actor.id, "retired", reason);
  });
}
export function listCatalogue(db: DB, now: Date) {
  const refs = (db
    .prepare("SELECT id,source,data,editorial_state,review_due_at,last_seen_at FROM opportunities WHERE source!='TED' ORDER BY id")
    .all() as { id: string; source: string; data: string; editorial_state: string; review_due_at: string | null }[]).map((r) => {
    const o = JSON.parse(r.data) as Opportunity;
    return {
      id: r.id,
      title: o.title,
      source: r.source,
      type: o.type,
      sourceUrl: o.sourceUrl,
      verifiedAt: o.verifiedAt,
      deadline: o.deadline,
      reviewDueAt: r.review_due_at,
      overdue: !o.verifiedAt || (!!r.review_due_at && new Date(r.review_due_at) < now),
      state: r.editorial_state,
      data: o,
    };
  });
  const drafts = (db.prepare("SELECT * FROM grant_drafts WHERE state IN ('draft','in_review') ORDER BY updated_at DESC").all() as DraftRow[]).map((d) => ({
    id: d.id,
    opportunityId: d.opportunity_id,
    state: d.state,
    author: d.author,
    submittedBy: d.submitted_by,
    evidenceNote: d.evidence_note,
    updatedAt: d.updated_at,
    data: JSON.parse(d.data),
  }));
  return { references: refs, drafts };
}
export function editorialHistory(db: DB, opportunityId: string) {
  return db
    .prepare("SELECT actor,action,note,draft_id AS draftId,content_hash AS contentHash,created_at AS createdAt FROM editorial_events WHERE opportunity_id=? ORDER BY id DESC LIMIT 100")
    .all(opportunityId);
}
