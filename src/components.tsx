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
} from "lucide-react";
import type { OpportunitySummary, Opportunity, Match } from "./domain";
import { date, money } from "./api";
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      className={"logo " + (light ? "logo-light" : "")}
      to="/"
      aria-label="SCOPE home"
    >
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
          <NavLink to="/how-it-works">The product</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/sources">Our sources</NavLink>
          <NavLink to="/demo">
            Explore demo <ArrowUpRight size={14} />
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
            Try 7 days free <ArrowUpRight size={15} />
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
          <p>Opportunity, in perspective.</p>
        </div>
        <div>
          <Link to="/how-it-works">The product</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/demo">Explore the demo</Link>
        </div>
        <div>
          <Link to="/sources">Sources & coverage</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms of use</Link>
        </div>
        <span className="footer-note">
          Built for independent ambition.
          <br />
          Malta + European Union
        </span>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} SCOPE · Product prototype</span>
        <span>Independent intelligence. No official affiliation.</span>
      </div>
    </footer>
  );
}
export function ArrowLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={17} />
    </Link>
  );
}
export function Eyebrow({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div className={"eyebrow " + (light ? "light" : "")}>
      <span />
      {children}
    </div>
  );
}
export function Fit({ score }: { score: number }) {
  return (
    <span className="fit">
      <span className="fit-bars">
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
      <AlertTriangle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <ScanLine size={24} /> Bringing things into focus…
    </div>
  );
}
export function OpportunityCard({
  o,
  onSave,
  linkPrefix = "/app/opportunities/",
}: {
  o: OpportunitySummary;
  onSave?: (o: OpportunitySummary) => void;
  linkPrefix?: string;
}) {
  return (
    <article className="opportunity-card">
      <div className="card-top">
        <div className="row">
          <Tag>
            {o.type === "tax_credit"
              ? "Tax credit"
              : o.type === "grant"
                ? "Funding programme"
                : "Public tender"}
          </Tag>
          <span className="micro">{o.geography}</span>
        </div>
        <button
          className={"save-button " + (o.saved ? "is-saved" : "")}
          aria-label={o.saved ? `Unsave ${o.title}` : `Save ${o.title}`}
          onClick={() => onSave?.(o)}
          disabled={!onSave}
        >
          <Bookmark size={18} fill={o.saved ? "currentColor" : "none"} />
        </button>
      </div>
      <Link to={linkPrefix + o.id} className="opportunity-title">
        {o.title}
        <ArrowUpRight size={18} />
      </Link>
      <p className="card-buyer">{o.buyer}</p>
      <div className="card-meta">
        <span>{money(o.value)}</span>
        <span>
          {o.deadline ? `Deadline ${date(o.deadline)}` : "Deadline unconfirmed"}
        </span>
      </div>
      <div className="card-bottom">
        <Fit score={o.match.score} />
        <span className="source-label">
          {o.source} <span>↗</span>
        </span>
      </div>
      <div className="freshness">{o.freshness}</div>
    </article>
  );
}
export function EvidencePanel({ o, match }: { o: Opportunity; match: Match }) {
  return (
    <div className="evidence-panel">
      <div className="detail-fit">
        <div>
          <Eyebrow>INDICATIVE FIT</Eyebrow>
          <h2>A clearer starting point.</h2>
        </div>
        <Fit score={match.score} />
      </div>
      <div className="detail-columns">
        <section>
          <h3>Why this fits</h3>
          {match.reasons.map((r, i) => (
            <p className="evidence-line" key={i}>
              {/No direct|not established|outside|passed|90 days/.test(r) ? (
                <HelpCircle size={17} />
              ) : (
                <Check size={17} />
              )}
              {r}
            </p>
          ))}
          <p className="muted small-text">
            Relevance measures subject fit. It does not establish eligibility.
          </p>
        </section>
        <section>
          <h3>Conditions & qualification gaps</h3>
          {match.conditions.map((c, i) => (
            <div className={"condition " + c.status} key={i}>
              <div className="row">
                {c.status === "appears_met" ? (
                  <Check size={17} />
                ) : c.status === "unmet" ? (
                  <AlertTriangle size={17} />
                ) : (
                  <HelpCircle size={17} />
                )}
                <strong>{c.label}</strong>
                <span className="condition-status">
                  {c.status === "appears_met"
                    ? "Appears met"
                    : c.status === "unmet"
                      ? "Unmet"
                      : "Unknown"}
                </span>
              </div>
              <p>{c.evidence}</p>
              <a
                href={o.sourceUrl}
                target={o.status === "fictional" ? undefined : "_blank"}
                rel="noreferrer"
              >
                {c.sourceLocator}
                <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </section>
      </div>
      <div className="provenance">
        <div>
          <span className="micro">ORIGINAL EVIDENCE</span>
          <h3>{o.source}</h3>
          <a
            className="text-link"
            href={o.sourceUrl}
            target={o.status === "fictional" ? undefined : "_blank"}
            rel="noreferrer"
          >
            Read original source <ExternalLink size={15} />
          </a>
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
            <dt>Source checked</dt>
            <dd>{date(o.verifiedAt)}</dd>
          </div>
          <div>
            <dt>Source version</dt>
            <dd>{o.sourceVersion}</dd>
          </div>
        </dl>
      </div>
      <p className="notice">
        <HelpCircle size={17} />
        {o.status === "fictional"
          ? "All records and requirements in this demo are fictional."
          : o.type === "tender"
            ? "Published notice metadata only. A notice may be historic, amended or awarded. Review original documents, deadlines and all requirements before acting."
            : "Reference catalogue: opening status and individual eligibility require confirmation. Aid may be conditional; a tax credit is not a cash grant."}
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
        Find your scope <ArrowRight size={18} />
      </Link>
      <p>Seven days to explore. No card required.</p>
    </section>
  );
}
