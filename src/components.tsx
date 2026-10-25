import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  ScanLine,
  Check,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
  Bookmark,
  CircleSlash,
  FileText,
} from "lucide-react";
import type { OpportunitySummary, Opportunity, Match, Dimension, Lifecycle } from "./domain";
import { typeLabels } from "./domain";
import { date, money, relativeDays } from "./api";
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link className={"logo " + (light ? "logo-light" : "")} to="/" aria-label="SCOPE home">
      <span className="logo-mark">
        <i />
        <i />
      </span>
      SCOPE
    </Link>
  );
}
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <div className="container nav-wrap">
        <Logo />
        <nav
          aria-label="Main navigation"
          className={open ? "public-nav is-open" : "public-nav"}
          onClick={() => setOpen(false)}
        >
          <NavLink to="/how-it-works">How it works</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/sources">Sources</NavLink>
          <NavLink to="/demo">
            Try the demo <ArrowUpRight size={14} aria-hidden />
          </NavLink>
          <Link className="mobile-login" to="/login">
            Log in
          </Link>
        </nav>
        <div className="nav-actions">
          <Link className="login-link" to="/login">
            Log in
          </Link>
          <Link className="button small forest" to="/signup">
            Try 7 days free <ArrowUpRight size={15} aria-hidden />
          </Link>
        </div>
        <button
          className="icon-button menu-button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div>
          <Logo light />
          <p>Public tenders and funding for Maltese businesses.</p>
        </div>
        <div>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/demo">Try the demo</Link>
        </div>
        <div>
          <Link to="/sources">Sources & coverage</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/cookies">Cookies</Link>
          <Link to="/terms">Terms of use</Link>
        </div>
        <span className="footer-note">
          Independent. Not affiliated with any
          <br />
          government body or funding authority.
        </span>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} SCOPE</span>
        <span>Always check the original official terms.</span>
      </div>
    </footer>
  );
}
export function ArrowLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={17} aria-hidden />
    </Link>
  );
}
export function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className={"eyebrow " + (light ? "light" : "")}>
      <span />
      {children}
    </div>
  );
}
export function Fit({ score }: { score: number }) {
  const level = score >= 60 ? "high" : score >= 30 ? "mid" : "low";
  return (
    <span className={"fit fit-" + level} title="Relevance to your profile. Not an eligibility score.">
      <span className="fit-bars" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {score}% <span>relevance</span>
    </span>
  );
}
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      <AlertTriangle size={18} aria-hidden />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Success({ message }: { message: string }) {
  return message ? (
    <div className="success" role="status">
      <Check size={17} aria-hidden />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading({ label = "Bringing things into focus…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <ScanLine size={24} aria-hidden /> {label}
    </div>
  );
}
const lifecycleText: Record<Lifecycle, string> = {
  open: "Open",
  deadline_passed: "Deadline passed",
  result_published: "Result published",
  superseded: "Replaced by newer notice",
  unknown: "Status to confirm",
};
export function LifecycleChip({ lifecycle, deadline }: { lifecycle?: Lifecycle; deadline: string | null }) {
  const l = lifecycle || "unknown";
  const closed = l === "deadline_passed" || l === "result_published" || l === "superseded";
  const soon = l === "open" && deadline && new Date(deadline).getTime() - Date.now() < 10 * 86400000;
  return (
    <span className={"status-chip " + (closed ? "closed" : l === "open" ? (soon ? "soon" : "open") : "unknown")}>
      {closed ? <CircleSlash size={13} aria-hidden /> : null}
      {l === "open" && deadline ? `Closes ${relativeDays(deadline)}` : lifecycleText[l]}
    </span>
  );
}
export function OpportunityCard({
  o,
  onSave,
  linkPrefix = "/app/opportunities/",
  selectable,
}: {
  o: OpportunitySummary;
  onSave?: (o: OpportunitySummary) => void;
  linkPrefix?: string;
  selectable?: { selected: boolean; disabled: boolean; onToggle: () => void };
}) {
  return (
    <article className={"opportunity-card " + (selectable?.selected ? "is-selected" : "")}>
      <div className="card-top">
        <div className="row">
          <Tag>{typeLabels[o.type]}</Tag>
          <LifecycleChip lifecycle={o.lifecycle} deadline={o.deadline} />
        </div>
        <div className="row card-actions">
          {selectable && (
            <label className="compare-toggle">
              <input type="checkbox" checked={selectable.selected} disabled={selectable.disabled} onChange={selectable.onToggle} />
              Compare
            </label>
          )}
          <button
            className={"save-button " + (o.saved ? "is-saved" : "")}
            aria-label={o.saved ? `Remove ${o.title} from saved` : `Save ${o.title}`}
            aria-pressed={o.saved}
            onClick={() => onSave?.(o)}
            disabled={!onSave}
          >
            <Bookmark size={18} fill={o.saved ? "currentColor" : "none"} aria-hidden />
          </button>
        </div>
      </div>
      <Link to={linkPrefix + o.id} className="opportunity-title">
        <span className="clamp">{o.title}</span>
        <ArrowUpRight size={18} aria-hidden />
      </Link>
      <p className="card-buyer">{o.buyer}</p>
      <dl className="card-meta">
        <div>
          <dt>Value</dt>
          <dd>{money(o.value)}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{o.deadline ? date(o.deadline) : "Not confirmed"}</dd>
        </div>
      </dl>
      {o.match.reasons[0] && <p className="card-reason">{o.match.reasons[0]}</p>}
      <div className="card-bottom">
        <Fit score={o.match.score} />
        <span className="source-label">
          {o.source} · {o.freshness}
        </span>
      </div>
    </article>
  );
}
const dimensionIcon = (s: Dimension["status"]) =>
  s === "positive" ? <Check size={17} aria-hidden /> : s === "blocker" ? <AlertTriangle size={17} aria-hidden /> : <HelpCircle size={17} aria-hidden />;
const dimensionWord: Record<Dimension["status"], string> = {
  positive: "Looks good",
  caution: "Check",
  blocker: "Blocker",
  unknown: "Unknown",
};
export function Dimensions({ match }: { match: Match }) {
  const d = match.dimensions;
  const items: [string, string, Dimension][] = [
    ["Eligibility", "Mandatory conditions from the source", d.eligibility],
    ["Financial fit", "Value, preferences and turnover", d.financial],
    ["Delivery capacity", "People and availability", d.capacity],
  ];
  return (
    <div className="dimensions" aria-label="Assessment summary">
      <div className="dimension relevance">
        <span className="micro">RELEVANCE</span>
        <strong>{match.score}%</strong>
        <span>How closely the subject matches your profile. Not eligibility.</span>
      </div>
      {items.map(([title, caption, dim]) => (
        <div className={"dimension " + dim.status} key={title}>
          <span className="micro">{title.toUpperCase()}</span>
          <strong>
            {dimensionIcon(dim.status)}
            {dim.summary}
          </strong>
          <span>{caption}</span>
          <span className="dimension-word">{dimensionWord[dim.status]}</span>
        </div>
      ))}
    </div>
  );
}
export function EvidencePanel({ o, match }: { o: Opportunity; match: Match }) {
  const fictional = o.status === "fictional";
  const external = fictional ? {} : { target: "_blank", rel: "noopener noreferrer" };
  return (
    <div className="evidence-panel">
      {match.dimensions && <Dimensions match={match} />}
      <div className="detail-columns">
        <section>
          <h3>Why this fits</h3>
          {match.reasons.map((r, i) => (
            <p className="evidence-line" key={i}>
              {/No direct|not established|not published|outside|passed|90 days|Outside|replaces|result notice/.test(r) ? (
                <HelpCircle size={17} aria-hidden />
              ) : (
                <Check size={17} aria-hidden />
              )}
              {r}
            </p>
          ))}
          {match.dimensions && (
            <>
              <h3 className="sub-heading">Financial fit</h3>
              {match.dimensions.financial.notes.map((n, i) => (
                <p className="evidence-line" key={i}>
                  <HelpCircle size={17} aria-hidden />
                  {n}
                </p>
              ))}
              <h3 className="sub-heading">Delivery capacity</h3>
              {match.dimensions.capacity.notes.map((n, i) => (
                <p className="evidence-line" key={i}>
                  <HelpCircle size={17} aria-hidden />
                  {n}
                </p>
              ))}
            </>
          )}
        </section>
        <section>
          <h3>What remains unverified</h3>
          {match.conditions.map((c, i) => (
            <div className={"condition " + c.status} key={i}>
              <div className="row">
                {c.status === "appears_met" ? (
                  <Check size={17} aria-hidden />
                ) : c.status === "unmet" ? (
                  <AlertTriangle size={17} aria-hidden />
                ) : (
                  <HelpCircle size={17} aria-hidden />
                )}
                <strong>{c.label}</strong>
                <span className="condition-status">
                  {c.status === "appears_met" ? "Appears met" : c.status === "unmet" ? "Unmet" : "Unknown"}
                </span>
              </div>
              <p>{c.evidence}</p>
              {fictional ? (
                <span className="source-locator">{c.sourceLocator}</span>
              ) : (
                <a className="source-locator" href={o.sourceUrl} {...external}>
                  {c.sourceLocator}
                  <ExternalLink size={12} aria-hidden />
                  <span className="sr-only">(opens official source in a new tab)</span>
                </a>
              )}
            </div>
          ))}
        </section>
      </div>
      <div className="provenance">
        <div>
          <span className="micro">ORIGINAL EVIDENCE</span>
          <h3>{o.source}</h3>
          {!fictional && (
            <div className="provenance-links">
              <a className="text-link" href={o.sourceUrl} {...external}>
                Read the official source <ExternalLink size={15} aria-hidden />
              </a>
              {o.documentsUrl && (
                <a className="text-link" href={o.documentsUrl} {...external}>
                  Notice PDF <FileText size={15} aria-hidden />
                </a>
              )}
            </div>
          )}
        </div>
        <dl>
          <div>
            <dt>Published</dt>
            <dd>{date(o.publishedAt)}</dd>
          </div>
          <div>
            <dt>Last retrieved</dt>
            <dd>{date(o.fetchedAt)}</dd>
          </div>
          <div>
            <dt>{o.type === "tender" ? "Source record" : "Editorially verified"}</dt>
            <dd>{date(o.verifiedAt)}</dd>
          </div>
          {o.reviewDueAt && (
            <div>
              <dt>Re-verification due</dt>
              <dd>{date(o.reviewDueAt)}</dd>
            </div>
          )}
          <div>
            <dt>Source version</dt>
            <dd>{o.sourceVersion}</dd>
          </div>
        </dl>
      </div>
      <p className="notice">
        <HelpCircle size={17} aria-hidden />
        {fictional
          ? "All records and requirements in this demo are fictional."
          : o.type === "tender"
            ? "Published notice metadata only. A notice may be amended, awarded or cancelled. Review the original documents, deadlines and every requirement before acting."
            : o.type === "tax_credit"
              ? "A tax credit is not a cash grant. Opening status and individual eligibility require confirmation against the official terms."
              : "Reference catalogue: opening status and individual eligibility require confirmation. Aid is usually conditional and part-financed."}
      </p>
    </div>
  );
}
export function CTA() {
  return (
    <section className="closing-cta container">
      <Eyebrow>YOUR NEXT CHAPTER</Eyebrow>
      <h2>
        Good opportunities.
        <br />
        <span>Better perspective.</span>
      </h2>
      <Link className="button forest" to="/signup">
        Find your scope <ArrowRight size={18} aria-hidden />
      </Link>
      <p>Seven days to explore. No card required.</p>
    </section>
  );
}
