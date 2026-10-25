import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import PostalMime from "postal-mime";
import type { DB } from "./db.js";
import { transaction, upsertOpportunities } from "./db.js";
import { OFFICIAL_HOSTS } from "./catalogue.js";
import { TED_URL, TED_FIELDS, normalizeNotice, recomputeTedLifecycle, type FetchLike } from "./ted.js";
import { audit } from "./auth.js";

/**
 * Email-notification ingestion. Messages (tender alerts forwarded by an authorised operator)
 * are hostile input:
 *  - the raw message, HTML and attachments are never stored, rendered or opened;
 *  - links are only *classified*; no link from a message is ever fetched (no SSRF surface);
 *  - a TED link yields a publication number, which is then requested from the fixed official
 *    TED API endpoint after an editor approves the import;
 *  - ePPS links are kept as manual references only (ePPS terms forbid automated retrieval).
 */
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
export type Candidate =
  | { kind: "ted"; publicationNumber: string; url: string }
  | { kind: "epps"; url: string }
  | { kind: "official"; url: string };
const URL_PATTERN = /https?:\/\/[^\s"'<>()\]\\]{4,2000}/gi;
// Strips control and bidirectional-override characters from untrusted header text.
const clean = (s: string, max: number) =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export function classifyLink(raw: string): Candidate | null {
  let u: URL;
  try {
    u = new URL(raw.replace(/[.,;:!?]+$/, ""));
  } catch {
    return null;
  }
  if (u.username || u.password || u.port || (u.protocol !== "https:" && u.protocol !== "http:")) return null;
  const host = u.hostname.toLowerCase();
  if (host === "ted.europa.eu") {
    const m = (u.pathname + "?" + u.search).match(/(?:^|[^\d])(\d{1,8}-20\d{2})(?![\d])/);
    return m ? { kind: "ted", publicationNumber: m[1], url: `https://ted.europa.eu/en/notice/-/detail/${m[1]}` } : null;
  }
  if (host === "www.etenders.gov.mt" || host === "etenders.gov.mt")
    return { kind: "epps", url: "https://" + host + u.pathname.slice(0, 300) };
  if (OFFICIAL_HOSTS.includes(host) && u.protocol === "https:")
    return { kind: "official", url: u.origin + u.pathname.slice(0, 400) };
  return null;
}
export async function parseNotificationEmail(raw: Buffer) {
  if (raw.length > MAX_MESSAGE_BYTES) throw new Error("Message exceeds 2 MiB.");
  const email = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });
  const text = [email.text || "", email.html || ""].join("\n");
  const links = [...new Set(text.match(URL_PATTERN) || [])].slice(0, 500);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  let ignored = 0;
  for (const link of links) {
    const c = classifyLink(link.replace(/&amp;/g, "&"));
    if (!c) {
      ignored++;
      continue;
    }
    const key = c.kind === "ted" ? "ted:" + c.publicationNumber : c.url;
    if (!seen.has(key) && candidates.length < 50) {
      seen.add(key);
      candidates.push(c);
    }
  }
  const from = email.from?.address || "";
  return {
    hash: createHash("sha256").update(raw).digest("hex"),
    senderDomain: clean(from.includes("@") ? from.split("@").pop()! : "", 120) || null,
    subject: clean(email.subject || "", 200) || "(no subject)",
    candidates,
    ignoredLinks: ignored,
    attachmentsIgnored: email.attachments?.length || 0,
  };
}
export async function recordInboundMessage(db: DB, raw: Buffer, channel: "upload" | "webhook", actor: string | null, now: Date) {
  const parsed = await parseNotificationEmail(raw);
  return transaction(db, () => {
    const existing = db.prepare("SELECT id FROM inbound_messages WHERE message_hash=?").get(parsed.hash) as { id: string } | undefined;
    if (existing) return { id: existing.id, duplicate: true, ...parsed };
    const id = randomUUID();
    db.prepare(
      "INSERT INTO inbound_messages(id,received_at,channel,message_hash,sender_domain,subject,candidates,ignored_links,attachments_ignored,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(id, now.toISOString(), channel, parsed.hash, parsed.senderDomain, parsed.subject, JSON.stringify(parsed.candidates), parsed.ignoredLinks, parsed.attachmentsIgnored, "pending");
    audit(db, now, "inbound.received", actor ?? "inbound-webhook", id, { channel, candidates: parsed.candidates.length });
    return { id, duplicate: false, ...parsed };
  });
}
/** Imports approved TED candidates by publication number from the official API only. */
export async function importInboundMessage(db: DB, id: string, actor: string, now: Date, fetcher: FetchLike = fetch) {
  const row = db.prepare("SELECT candidates,status FROM inbound_messages WHERE id=?").get(id) as { candidates: string; status: string } | undefined;
  if (!row) return { status: 404 as const, error: "Message not found." };
  if (row.status !== "pending") return { status: 409 as const, error: "Message already reviewed." };
  const numbers = (JSON.parse(row.candidates) as Candidate[])
    .filter((c): c is Extract<Candidate, { kind: "ted" }> => c.kind === "ted")
    .map((c) => c.publicationNumber)
    .filter((n) => /^\d{1,8}-20\d{2}$/.test(n))
    .slice(0, 50);
  let imported = 0;
  if (numbers.length) {
    const r = await fetcher(TED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: `publication-number IN (${numbers.join(" ")}) AND notice-type IN (cn-standard cn-social)`, fields: TED_FIELDS, page: 1, limit: 50, scope: "ALL", paginationMode: "PAGE_NUMBER" }),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { status: 502 as const, error: `TED HTTP ${r.status}` };
    const body = (await r.json()) as { notices?: Record<string, unknown>[] };
    const records = (body.notices || []).slice(0, 50).map((n) => normalizeNotice(n, now));
    // Scope guard: only notices that the TED API itself returns for the requested numbers.
    const wanted = new Set(numbers);
    const accepted = records.filter((o) => wanted.has(o.sourceId));
    transaction(db, () => {
      upsertOpportunities(db, accepted, now);
      recomputeTedLifecycle(db);
    });
    imported = accepted.length;
  }
  db.prepare("UPDATE inbound_messages SET status='imported',reviewed_by=?,reviewed_at=?,note=? WHERE id=?").run(actor, now.toISOString(), `${imported} TED notice(s) imported`, id);
  audit(db, now, "inbound.imported", actor, id, { imported });
  return { status: 200 as const, imported, requested: numbers.length };
}
export function dismissInboundMessage(db: DB, id: string, actor: string, now: Date) {
  const r = db.prepare("UPDATE inbound_messages SET status='dismissed',reviewed_by=?,reviewed_at=? WHERE id=? AND status='pending'").run(actor, now.toISOString(), id);
  if (r.changes) audit(db, now, "inbound.dismissed", actor, id);
  return r.changes > 0;
}
/** HMAC for the inbound webhook: X-Scope-Timestamp + X-Scope-Signature: sha256=hex(HMAC(secret, `${ts}.${body}`)). */
export function verifyInboundSignature(body: Buffer, timestamp: string | undefined, signature: string | undefined, secret: string, nowSeconds: number) {
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const m = /^sha256=([a-f0-9]{64})$/.exec(signature || "");
  if (!m) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.`).update(body).digest();
  const given = Buffer.from(m[1], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
