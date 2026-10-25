import { useCallback, useEffect, useState } from "react";
import { Upload, RefreshCw, Plus, History } from "lucide-react";
import { useAccount } from "./app-pages";
import { api, date, dateTime, post } from "./api";
import { Eyebrow, ErrorMessage, Loading, Success, Tag } from "./components";
import { typeLabels, type Condition, type Opportunity, type OpportunityType } from "./domain";

type Overview = {
  role: string;
  scheduler: { enabled: boolean; hoursUtc: number[]; staleAfterHours: number };
  syncRuns: { id: string; startedAt: string; finishedAt: string | null; status: string; count: number; error: string | null; trigger: string | null; detail: Record<string, unknown> | null }[];
  consecutiveTedFailures: number;
  counts: { source: string; lifecycle: string; n: number }[];
  users: { total: number; verified: number };
  subscriptions: { status: string; n: number }[];
  incidents: { id: string; title: string; severity: string; status: string; customer_visible: number; source: string; updated_at: string; customer_message: string | null }[];
  inboundPending: number;
  billingEnabled: boolean;
  emailProvider: string;
  inboundWebhookEnabled: boolean;
};
type Reference = { id: string; title: string; source: string; type: OpportunityType; sourceUrl: string; verifiedAt: string | null; reviewDueAt: string | null; overdue: boolean; state: string; data: Opportunity };
type Draft = { id: string; opportunityId: string; state: string; author: string; submittedBy: string | null; evidenceNote: string | null; updatedAt: string; data: DraftData };
type DraftData = Pick<Opportunity, "sourceId" | "title" | "buyer" | "description" | "sector" | "tags" | "cpv" | "geography" | "value" | "deadline" | "publishedAt" | "sourceUrl" | "conditions" | "role"> & {
  id?: string;
  source: "FONDI" | "SEM" | "Malta Enterprise" | "Servizz";
  type: Exclude<OpportunityType, "tender">;
};
type Inbound = { id: string; receivedAt: string; channel: string; senderDomain: string | null; subject: string; candidates: { kind: string; url: string; publicationNumber?: string }[]; ignoredLinks: number; attachmentsIgnored: number; status: string; note: string | null };

const blankDraft = (): DraftData => ({
  sourceId: "",
  source: "FONDI",
  title: "",
  buyer: "",
  type: "grant",
  description: "",
  sector: "",
  tags: [],
  cpv: [],
  geography: "Malta",
  value: null,
  deadline: null,
  publishedAt: null,
  sourceUrl: "https://",
  conditions: [{ label: "", field: "unknown", sourceLocator: "" }],
  role: ["bidder", "subcontractor", "consortium"],
});
function useAct() {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const m = await fn();
      if (m) setMessage(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { error, message, busy, act };
}

function OperationsTab() {
  const { account } = useAccount();
  const [o, setO] = useState<Overview | null>(null);
  const { error, message, busy, act } = useAct();
  const [incident, setIncident] = useState({ title: "", severity: "minor", customerMessage: "", customerVisible: false });
  const load = useCallback(() => api<Overview>("/admin/overview").then(setO), []);
  useEffect(() => {
    void act(load);
  }, [load]);
  if (!o) return <Loading />;
  const admin = account.role === "admin";
  return (
    <>
      <ErrorMessage message={error} />
      <Success message={message} />
      <div className="dashboard-stats">
        <div>
          <span className="micro">TED SOURCE</span>
          <strong>{o.syncRuns.find((r) => r.status === "success") ? date(o.syncRuns.find((r) => r.status === "success")!.startedAt) : "Never"}</strong>
          <span>
            Last successful refresh · {o.consecutiveTedFailures ? `${o.consecutiveTedFailures} consecutive failure(s)` : "no current failures"}
          </span>
        </div>
        <div>
          <span className="micro">SCHEDULER</span>
          <strong>{o.scheduler.enabled ? "On" : "Off"}</strong>
          <span>{o.scheduler.enabled ? `Daily at ${o.scheduler.hoursUtc.map((h) => `${String(h).padStart(2, "0")}:00`).join(" & ")} UTC` : "Enable with TED_SYNC_ENABLED=true"}</span>
        </div>
        <div>
          <span className="micro">ACCOUNTS</span>
          <strong>{o.users.total}</strong>
          <span>
            {o.users.verified ?? 0} verified · billing {o.billingEnabled ? "on" : "off"} · email {o.emailProvider}
          </span>
        </div>
      </div>
      <section className="admin-section">
        <div className="section-row">
          <h2>Source synchronisation</h2>
          {admin && (
            <button className="button outline small" disabled={busy} onClick={() => act(async () => {
              const r = await post<{ status: string; count?: number; reason?: string; error?: string }>("/admin/ted-sync", {});
              await load();
              return r.status === "success" ? `TED refresh complete: ${r.count} notices in window.` : r.reason || r.error || "Refresh failed.";
            })}>
              <RefreshCw size={15} aria-hidden /> Refresh TED now
            </button>
          )}
        </div>
        <div className="table-scroll" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Trigger</th>
                <th scope="col">Status</th>
                <th scope="col">Notices</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {o.syncRuns.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.startedAt)}</td>
                  <td>{r.trigger ?? "—"}</td>
                  <td>
                    <Tag>{r.status.toUpperCase()}</Tag>
                  </td>
                  <td>{r.count}</td>
                  <td>
                    {r.error ??
                      (r.detail
                        ? `${r.detail.changed} changed · ${r.detail.superseded} superseded · ${r.detail.closedByResult} closed by result${r.detail.capped ? " · window capped" : ""}`
                        : "")}
                  </td>
                </tr>
              ))}
              {!o.syncRuns.length && (
                <tr>
                  <td colSpan={5}>No synchronisation has run on this server.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="small-text muted">
          Catalogue: {o.counts.map((c) => `${c.source} ${c.lifecycle.replace("_", " ")} ${c.n}`).join(" · ") || "empty"}
        </p>
      </section>
      <section className="admin-section">
        <h2>Incidents</h2>
        <ul className="incident-list">
          {o.incidents.map((i) => (
            <li key={i.id}>
              <Tag>{i.status.toUpperCase()}</Tag>
              <span>
                <strong>{i.title}</strong> · {i.severity} · {i.source}
                {i.customer_visible ? " · shown to customers" : ""} · {dateTime(i.updated_at)}
              </span>
              {admin && i.status === "open" && (
                <button className="text-link" onClick={() => act(async () => {
                  await post(`/admin/incidents/${i.id}/resolve`);
                  await load();
                  return "Incident resolved.";
                })}>
                  Resolve
                </button>
              )}
            </li>
          ))}
          {!o.incidents.length && <li>No incidents recorded.</li>}
        </ul>
        {admin && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await post("/admin/incidents", incident);
                setIncident({ title: "", severity: "minor", customerMessage: "", customerVisible: false });
                await load();
                return "Incident opened.";
              });
            }}
          >
            <label>
              Title
              <input required minLength={3} maxLength={200} value={incident.title} onChange={(e) => setIncident({ ...incident, title: e.target.value })} />
            </label>
            <label>
              Severity
              <select value={incident.severity} onChange={(e) => setIncident({ ...incident, severity: e.target.value })}>
                <option value="info">Info</option>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
              </select>
            </label>
            <label>
              Customer message (optional)
              <input maxLength={500} value={incident.customerMessage} onChange={(e) => setIncident({ ...incident, customerMessage: e.target.value })} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={incident.customerVisible} onChange={(e) => setIncident({ ...incident, customerVisible: e.target.checked })} />
              Show banner to customers
            </label>
            <button className="button outline small" disabled={busy}>
              <Plus size={15} aria-hidden /> Open incident
            </button>
          </form>
        )}
      </section>
    </>
  );
}

function DraftForm({ initial, onSubmit, busy }: { initial: DraftData; onSubmit: (d: DraftData) => void; busy: boolean }) {
  const [d, setD] = useState<DraftData>(initial);
  const set = <K extends keyof DraftData>(k: K, v: DraftData[K]) => setD((p) => ({ ...p, [k]: v }));
  const setCondition = (i: number, c: Partial<Condition>) => set("conditions", d.conditions.map((x, j) => (j === i ? ({ ...x, ...c } as Condition) : x)));
  return (
    <form
      className="draft-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(d);
      }}
    >
      <div className="form-grid">
        <label>
          Source authority
          <select value={d.source} onChange={(e) => set("source", e.target.value as DraftData["source"])}>
            {["FONDI", "SEM", "Malta Enterprise", "Servizz"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Kind of support
          <select value={d.type} onChange={(e) => set("type", e.target.value as DraftData["type"])}>
            {(["grant", "tax_credit", "loan", "other_incentive"] as const).map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Title
        <input required minLength={2} maxLength={500} value={d.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <div className="form-grid">
        <label>
          Administering body
          <input maxLength={250} value={d.buyer} onChange={(e) => set("buyer", e.target.value)} />
        </label>
        <label>
          Stable source identifier
          <input required maxLength={120} value={d.sourceId} onChange={(e) => set("sourceId", e.target.value)} placeholder="e.g. sme-enhance" />
        </label>
      </div>
      <label>
        Official source URL (approved government hosts only)
        <input type="url" required value={d.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} />
      </label>
      <label>
        Factual summary (only what the source states)
        <textarea rows={4} maxLength={10000} value={d.description} onChange={(e) => set("description", e.target.value)} />
      </label>
      <div className="form-grid">
        <label>
          Sector
          <input maxLength={100} value={d.sector} onChange={(e) => set("sector", e.target.value)} />
        </label>
        <label>
          Tags (comma separated)
          <input value={d.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 30))} />
        </label>
        <label>
          Closing date (if published)
          <input type="date" value={d.deadline?.slice(0, 10) ?? ""} onChange={(e) => set("deadline", e.target.value ? new Date(e.target.value + "T23:59:59Z").toISOString() : null)} />
        </label>
        <label>
          Maximum aid (€, if published)
          <input type="number" min="0" value={d.value ?? ""} onChange={(e) => set("value", e.target.value === "" ? null : Number(e.target.value))} />
        </label>
      </div>
      <fieldset>
        <legend>Conditions stated by the source</legend>
        {d.conditions.map((c, i) => (
          <div className="condition-editor" key={i}>
            <label>
              Condition
              <input required maxLength={250} value={c.label} onChange={(e) => setCondition(i, { label: e.target.value })} />
            </label>
            <label>
              Type
              <select value={c.field} onChange={(e) => setCondition(i, { field: e.target.value as Condition["field"], value: undefined })}>
                <option value="unknown">Needs individual assessment</option>
                <option value="certificate">Named certificate</option>
                <option value="staff">Minimum staff</option>
                <option value="turnover">Minimum turnover (€)</option>
                <option value="geography">Establishment</option>
              </select>
            </label>
            {c.field !== "unknown" && (
              <label>
                Threshold / value
                <input
                  required
                  type={c.field === "staff" || c.field === "turnover" ? "number" : "text"}
                  value={c.value ?? ""}
                  onChange={(e) => setCondition(i, { value: c.field === "staff" || c.field === "turnover" ? Number(e.target.value) : e.target.value })}
                />
              </label>
            )}
            <label>
              Where in the source
              <input required maxLength={500} value={c.sourceLocator} onChange={(e) => setCondition(i, { sourceLocator: e.target.value })} />
            </label>
            {d.conditions.length > 1 && (
              <button type="button" className="text-link" onClick={() => set("conditions", d.conditions.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" className="text-link" onClick={() => set("conditions", [...d.conditions, { label: "", field: "unknown", sourceLocator: "" }])}>
          <Plus size={14} aria-hidden /> Add condition
        </button>
      </fieldset>
      <button className="button forest small" disabled={busy}>
        Save draft
      </button>
    </form>
  );
}
function CatalogueTab() {
  const { account } = useAccount();
  const [data, setData] = useState<{ references: Reference[]; drafts: Draft[] } | null>(null),
    [editing, setEditing] = useState<{ draftId?: string; initial: DraftData } | null>(null),
    [history, setHistory] = useState<{ id: string; rows: { actor: string; action: string; note: string | null; createdAt: string }[] } | null>(null),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [checked, setChecked] = useState<Record<string, boolean>>({});
  const { error, message, busy, act } = useAct();
  const load = useCallback(() => api<{ references: Reference[]; drafts: Draft[] }>("/admin/catalogue").then(setData), []);
  useEffect(() => {
    void act(load);
  }, [load]);
  if (!data) return <Loading />;
  const reviewer = account.role === "reviewer" || account.role === "admin";
  return (
    <>
      <ErrorMessage message={error} />
      <Success message={message} />
      {editing ? (
        <section className="admin-section">
          <div className="section-row">
            <h2>{editing.draftId ? "Edit draft" : "New funding reference"}</h2>
            <button className="text-link" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
          <p className="small-text muted">Drafts are invisible to customers. A different reviewer must confirm the official source before publication.</p>
          <DraftForm
            initial={editing.initial}
            busy={busy}
            onSubmit={(d) =>
              act(async () => {
                if (editing.draftId) await api(`/admin/drafts/${editing.draftId}`, { method: "PUT", body: JSON.stringify(d) });
                else await post("/admin/drafts", d);
                setEditing(null);
                await load();
                return "Draft saved.";
              })
            }
          />
        </section>
      ) : (
        <button className="button forest small" onClick={() => setEditing({ initial: blankDraft() })}>
          <Plus size={15} aria-hidden /> New funding reference
        </button>
      )}
      <section className="admin-section">
        <h2>Drafts and reviews</h2>
        {!data.drafts.length && <p className="muted">No open drafts.</p>}
        {data.drafts.map((d) => (
          <article className="admin-card" key={d.id}>
            <div className="row space-between">
              <strong>{d.data.title}</strong>
              <Tag>{d.state === "in_review" ? "IN REVIEW" : "DRAFT"}</Tag>
            </div>
            <p className="small-text">
              {typeLabels[d.data.type]} · {d.data.source} · updated {dateTime(d.updatedAt)}
              {d.author === account.id ? " · you are the author" : ""}
            </p>
            {d.evidenceNote && <p className="small-text">Evidence note: {d.evidenceNote}</p>}
            <div className="row wrap">
              {d.state === "draft" && (
                <>
                  <button className="button plain small" onClick={() => setEditing({ draftId: d.id, initial: d.data })}>
                    Edit
                  </button>
                  <input
                    aria-label="Evidence note for reviewer"
                    placeholder="What did you check, where, and when?"
                    value={notes[d.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })}
                  />
                  <button className="button outline small" disabled={busy} onClick={() => act(async () => {
                    await post(`/admin/drafts/${d.id}/submit`, { evidenceNote: notes[d.id] ?? "" });
                    await load();
                    return "Submitted for review.";
                  })}>
                    Submit for review
                  </button>
                </>
              )}
              {d.state === "in_review" && (
                <>
                  <button className="button plain small" onClick={() => act(async () => {
                    await post(`/admin/drafts/${d.id}/withdraw`);
                    await load();
                    return "Withdrawn to draft.";
                  })}>
                    Withdraw
                  </button>
                  {reviewer && (
                    <>
                      <input aria-label="Review note" placeholder="Review note" value={notes[d.id] ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
                      <label className="checkbox-label">
                        <input type="checkbox" checked={!!checked[d.id]} onChange={(e) => setChecked({ ...checked, [d.id]: e.target.checked })} />I opened the official source today and it supports every stated fact
                      </label>
                      <button className="button forest small" disabled={busy} onClick={() => act(async () => {
                        await post(`/admin/drafts/${d.id}/decision`, { approve: true, note: notes[d.id] ?? "", sourceChecked: !!checked[d.id] });
                        await load();
                        return "Approved and published.";
                      })}>
                        Approve & publish
                      </button>
                      <button className="button plain small" disabled={busy} onClick={() => act(async () => {
                        await post(`/admin/drafts/${d.id}/decision`, { approve: false, note: notes[d.id] ?? "" });
                        await load();
                        return "Rejected.";
                      })}>
                        Reject
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className="admin-section">
        <h2>Published references</h2>
        <div className="table-scroll" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Kind</th>
                <th scope="col">Verified</th>
                <th scope="col">Re-verify by</th>
                <th scope="col">State</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.references.map((r) => (
                <tr key={r.id} className={r.overdue ? "overdue" : ""}>
                  <td>
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {r.title}
                    </a>
                    <br />
                    <small>{r.source}</small>
                  </td>
                  <td>{typeLabels[r.type]}</td>
                  <td>{date(r.verifiedAt)}</td>
                  <td>{r.overdue ? <Tag>OVERDUE</Tag> : date(r.reviewDueAt)}</td>
                  <td>{r.state}</td>
                  <td className="row wrap">
                    <button className="text-link" onClick={() => act(async () => {
                      const h = await api<{ history: { actor: string; action: string; note: string | null; createdAt: string }[] }>(`/admin/catalogue/${r.id}/history`);
                      setHistory({ id: r.id, rows: h.history });
                    })}>
                      <History size={14} aria-hidden /> History
                    </button>
                    {r.state === "published" && (
                      <button
                        className="text-link"
                        onClick={() =>
                          setEditing({
                            initial: {
                              id: r.id,
                              sourceId: r.data.sourceId,
                              source: r.data.source as DraftData["source"],
                              title: r.data.title,
                              buyer: r.data.buyer,
                              type: r.data.type as DraftData["type"],
                              description: r.data.description,
                              sector: r.data.sector,
                              tags: r.data.tags,
                              cpv: r.data.cpv,
                              geography: "Malta",
                              value: r.data.value,
                              deadline: r.data.deadline,
                              publishedAt: r.data.publishedAt,
                              sourceUrl: r.data.sourceUrl,
                              conditions: r.data.conditions,
                              role: r.data.role,
                            },
                          })
                        }
                      >
                        Revise / re-verify
                      </button>
                    )}
                    {reviewer && r.state === "published" && (
                      <button className="text-link" onClick={() => act(async () => {
                        const note = window.prompt("Reason for retiring this reference (shown in history):");
                        if (!note) return;
                        await post(`/admin/catalogue/${r.id}/retire`, { note });
                        await load();
                        return "Reference retired from the customer catalogue.";
                      })}>
                        Retire
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history && (
          <div className="admin-card">
            <div className="row space-between">
              <strong>History · {history.id}</strong>
              <button className="text-link" onClick={() => setHistory(null)}>
                Close
              </button>
            </div>
            <ol className="history-list">
              {history.rows.map((h, i) => (
                <li key={i}>
                  {dateTime(h.createdAt)} · {h.action.replace("_", " ")} · {h.actor.slice(0, 8)}
                  {h.note ? ` — ${h.note}` : ""}
                </li>
              ))}
              {!history.rows.length && <li>No editorial events (seeded before the workflow existed).</li>}
            </ol>
          </div>
        )}
      </section>
    </>
  );
}
function InboundTab() {
  const [messages, setMessages] = useState<Inbound[] | null>(null);
  const { error, message, busy, act } = useAct();
  const load = useCallback(() => api<{ messages: Inbound[] }>("/admin/inbound").then((r) => setMessages(r.messages)), []);
  useEffect(() => {
    void act(load);
  }, [load]);
  async function upload(file: File) {
    await act(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error("Messages larger than 2 MiB are not accepted.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await post<{ duplicate: boolean; candidates: number }>("/admin/inbound", { message: btoa(binary) });
      await load();
      return r.duplicate ? "This message was already received." : `Message parsed: ${r.candidates} candidate reference(s). Nothing has been imported yet.`;
    });
  }
  return (
    <>
      <ErrorMessage message={error} />
      <Success message={message} />
      <section className="admin-section">
        <h2>Tender alert emails</h2>
        <p className="small-text muted">
          Upload an alert email (.eml) you are authorised to use. Links are classified, never opened. TED notices are imported by publication number from the official TED API only after you choose Import. ePPS links are listed for manual follow-up; they are never fetched. Attachments are discarded unread.
        </p>
        <label className="upload-field">
          <Upload size={16} aria-hidden /> Choose .eml file
          <input type="file" accept=".eml,message/rfc822" disabled={busy} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
      </section>
      <section className="admin-section">
        {!messages ? (
          <Loading />
        ) : !messages.length ? (
          <p className="muted">No messages received.</p>
        ) : (
          messages.map((m) => (
            <article className="admin-card" key={m.id}>
              <div className="row space-between">
                <strong>{m.subject}</strong>
                <Tag>{m.status.toUpperCase()}</Tag>
              </div>
              <p className="small-text">
                {dateTime(m.receivedAt)} · {m.channel} · from {m.senderDomain ?? "unknown domain"} · {m.ignoredLinks} other link(s) ignored · {m.attachmentsIgnored} attachment(s) discarded
                {m.note ? ` · ${m.note}` : ""}
              </p>
              <ul className="candidate-list">
                {m.candidates.map((c, i) => (
                  <li key={i}>
                    <Tag>{c.kind === "ted" ? "TED" : c.kind === "epps" ? "ePPS · MANUAL" : "OFFICIAL"}</Tag>
                    {c.kind === "ted" ? `Notice ${c.publicationNumber}` : <span className="url-text">{c.url}</span>}
                  </li>
                ))}
                {!m.candidates.length && <li>No recognised official references.</li>}
              </ul>
              {m.status === "pending" && (
                <div className="row">
                  <button className="button forest small" disabled={busy || !m.candidates.some((c) => c.kind === "ted")} onClick={() => act(async () => {
                    const r = await post<{ imported: number; requested: number }>(`/admin/inbound/${m.id}/import`);
                    await load();
                    return `Imported ${r.imported} of ${r.requested} TED notice(s) from the official API.`;
                  })}>
                    Import TED notices
                  </button>
                  <button className="button plain small" disabled={busy} onClick={() => act(async () => {
                    await post(`/admin/inbound/${m.id}/dismiss`);
                    await load();
                    return "Dismissed.";
                  })}>
                    Dismiss
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </>
  );
}
function AuditTab() {
  const [rows, setRows] = useState<{ at: string; actor: string | null; action: string; target: string | null; detail: string | null }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ entries: typeof rows }>("/admin/audit").then((r) => setRows(r.entries)).catch((e) => setError((e as Error).message));
  }, []);
  if (error) return <ErrorMessage message={error} />;
  if (!rows) return <Loading />;
  return (
    <section className="admin-section">
      <h2>Audit log</h2>
      <p className="small-text muted">Pseudonymous account identifiers only; no email addresses, IPs or content. Retained for the configured audit period.</p>
      <div className="table-scroll" tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Action</th>
              <th scope="col">Actor</th>
              <th scope="col">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows!.map((r, i) => (
              <tr key={i}>
                <td>{dateTime(r.at)}</td>
                <td>{r.action}</td>
                <td>{r.actor?.slice(0, 16) ?? "—"}</td>
                <td>{r.target?.slice(0, 16) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function AdminPage() {
  const { account } = useAccount();
  const tabs = [
    ["operations", "Operations"],
    ["catalogue", "Funding catalogue"],
    ["inbound", "Alert emails"],
    ...(account.role === "admin" ? [["audit", "Audit log"]] : []),
  ];
  const [tab, setTab] = useState("operations");
  if (account.role === "user")
    return (
      <div className="empty-state">
        <h1>Operations</h1>
        <p>This area is for the SCOPE operations team.</p>
      </div>
    );
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>OPERATIONS · {account.role.toUpperCase()}</Eyebrow>
          <h1>Sources, catalogue and service health.</h1>
          <p>Every action here is recorded in the audit log.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Operations sections">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-controls={"panel-" + id} id={"tab-" + id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={"panel-" + tab} aria-labelledby={"tab-" + tab}>
        {tab === "operations" && <OperationsTab />}
        {tab === "catalogue" && <CatalogueTab />}
        {tab === "inbound" && <InboundTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </>
  );
}
