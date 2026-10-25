import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Plus,
  Minus,
  ScanLine,
  SlidersHorizontal,
  FileCheck2,
  Building2,
  ArrowDown,
  ShieldCheck,
  Globe2,
} from "lucide-react";
import {
  Eyebrow,
  PublicHeader,
  Footer,
  Fit,
  Tag,
  ArrowLink,
  EvidencePanel,
  CTA,
} from "./components";
import { demoOpportunities } from "./demo-data";
import { researchProfile, restaurantProfile } from "./domain";
import { matchOpportunity } from "../server/matching";
import { date } from "./api";
export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
function HeroSculpture() {
  return (
    <div
      className="hero-sculpture"
      aria-label="Illustrative visualisation: your business connects to relevant opportunities and original evidence"
    >
      <div className="sculpture-grid" />
      <span className="coordinate c1">35°53′ N</span>
      <span className="coordinate c2">14°30′ E</span>
      <div className="orbital">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="orbit orbit-three" />
        <div className="orbit orbit-four" />
        <span className="orbit-dot dot-a" />
        <span className="orbit-dot dot-b" />
      </div>
      <div className="sculpture-card rear-card">
        <div className="mini-file">
          <FileCheck2 size={17} />
        </div>
        <span>Original evidence</span>
        <span className="thin-line" />
        <span className="thin-line short" />
      </div>
      <div className="sculpture-card main-card">
        <div className="sculpture-card-top">
          <span className="mini-logo">
            <ScanLine size={22} />
          </span>
          <span className="micro">OPPORTUNITY IN FOCUS</span>
          <span className="tiny-dot" />
        </div>
        <span className="sculpture-title">
          A fit for what
          <br />
          you do best.
        </span>
        <div className="sculpture-tags">
          <span>Research & advisory</span>
          <span>Malta + EU</span>
        </div>
        <div className="sculpture-divider" />
        <div className="sculpture-score">
          <span className="score-ring">
            <Check size={20} />
          </span>
          <div>
            <b>Relevance, explained.</b>
            <span>Every signal. Every source.</span>
          </div>
          <ArrowUpRight size={19} />
        </div>
      </div>
      <div className="profile-node">
        <Building2 size={18} />
        <span>Your business</span>
        <span className="node-dot" />
      </div>
      <div className="sculpture-caption">
        <span className="crosshair">+</span> A clearer view of what’s possible{" "}
        <span className="micro">01 / 03</span>
      </div>
    </div>
  );
}
function ProductPreview() {
  const o = demoOpportunities[0];
  return (
    <div className="preview-frame">
      <div className="preview-chrome">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>SCOPE / YOUR OPPORTUNITIES</span>
        <span className="preview-sample">FICTIONAL EXAMPLE</span>
      </div>
      <div className="preview-content">
        <aside className="preview-side">
          <ScanLine size={23} />
          <span className="preview-side-active">Discover</span>
          <span>Saved</span>
          <span>Business profile</span>
          <span className="preview-side-bottom">Studio Forma</span>
        </aside>
        <div className="preview-feed">
          <div className="row space-between">
            <span className="micro">A MORE FOCUSED VIEW</span>
            <SlidersHorizontal size={16} />
          </div>
          <h3>
            Built around
            <br />
            your business.
          </h3>
          <div className="preview-record">
            <div className="row space-between">
              <Tag>PUBLIC TENDER</Tag>
              <Fit score={matchOpportunity(researchProfile, o).score} />
            </div>
            <h4>{o.title}</h4>
            <p>Fictional regional development agency</p>
            <div className="preview-record-bottom">
              <span>€35,000 · Malta</span>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <p className="preview-feed-note">
            Your capabilities bring the right things into focus.
          </p>
        </div>
        <div className="preview-inspector">
          <span className="micro">THE DETAIL THAT MATTERS</span>
          <h4>
            A match you can
            <br />
            understand.
          </h4>
          <div className="preview-condition">
            <Check size={16} />
            <div>
              <b>Service alignment</b>
              <span>Research and policy analysis</span>
            </div>
            <span className="mini-status green">MATCH</span>
          </div>
          <div className="preview-condition">
            <Check size={16} />
            <div>
              <b>Team capacity</b>
              <span>Your team of 3 meets the example</span>
            </div>
            <span className="mini-status green">MET</span>
          </div>
          <div className="preview-condition">
            <span className="unknown-icon">?</span>
            <div>
              <b>ISO 9001 certification</b>
              <span>Not recorded in your profile</span>
            </div>
            <span className="mini-status amber">UNKNOWN</span>
          </div>
          <div className="preview-source">
            <FileCheck2 size={18} />
            <div>
              <b>Evidence, always attached.</b>
              <span>Trace every condition to its source.</span>
            </div>
            <ArrowUpRight size={15} />
          </div>
        </div>
      </div>
    </div>
  );
}
const faqs = [
  [
    "Are you affiliated with the government?",
    "No. SCOPE is an independent product prototype. We link to official sources and do not represent any authority or funding body.",
  ],
  [
    "Does a high relevance score mean I qualify?",
    "No. Relevance measures alignment with your profile. Mandatory conditions are assessed separately as appears met, unmet or unknown. Original terms and professional advice take precedence.",
  ],
  [
    "Which opportunities can I find?",
    "Published TED notices relating to Malta, when imported, and a small curated catalogue of Maltese funding references. We do not provide complete ePPS coverage. Fictional examples appear only in the public demo.",
  ],
  [
    "What happens after seven days?",
    "Your trial ends automatically and your account moves to Free: three detailed analyses per UTC calendar month and up to five saved opportunities. No card, charge or cancellation required.",
  ],
];
export function Home() {
  const [faq, setFaq] = useState<number | null>(0);
  return (
    <PublicLayout>
      <section className="hero container">
        <div className="hero-copy">
          <Eyebrow>BUSINESS OPPORTUNITY INTELLIGENCE</Eyebrow>
          <h1>
            The right
            <br />
            opportunities.
            <br />
            <span>Within reach.</span>
          </h1>
          <p>
            Public tenders and funding, brought into focus.
            <br className="desktop-break" /> Matched to the business you’ve
            built.
          </p>
          <div className="hero-actions">
            <Link className="button forest" to="/signup">
              Find your opportunities <ArrowUpRight size={18} />
            </Link>
            <Link className="button plain" to="/demo">
              Explore the demo <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-assurance">
            <span className="assurance-dot" />
            Seven days free <i />
            No card required <i />
            Malta + EU
          </div>
        </div>
        <HeroSculpture />
        <div className="hero-foot">
          <span>LESS SEARCHING. MORE POSSIBILITY.</span>
          <a href="#perspective" aria-label="Explore the product">
            <ArrowDown size={18} />
          </a>
          <span>01 — A NEW PERSPECTIVE</span>
        </div>
      </section>
      <section className="attributes">
        <div className="container">
          <span>
            <ScanLine size={19} />
            Matched to your capabilities
          </span>
          <span>
            <FileCheck2 size={19} />
            Linked to original evidence
          </span>
          <span>
            <Globe2 size={19} />
            Tenders + business funding
          </span>
          <span>
            <ShieldCheck size={19} />
            Clear about the unknowns
          </span>
        </div>
      </section>
      <section id="perspective" className="product-section container">
        <div className="section-heading">
          <div>
            <Eyebrow>SEE THE SIGNAL</Eyebrow>
            <h2>
              A world of opportunity.
              <br />
              <span>A view that’s yours.</span>
            </h2>
          </div>
          <div>
            <p>
              Your next contract shouldn’t be buried in another search. SCOPE
              connects your capabilities to opportunities worth a closer look.
            </p>
            <ArrowLink to="/how-it-works">Meet your new perspective</ArrowLink>
          </div>
        </div>
        <ProductPreview />
        <p className="preview-caption">
          <span>ILLUSTRATIVE PRODUCT PREVIEW</span> Fictional business,
          opportunity and requirements. Real matching logic.
        </p>
      </section>
      <section className="steps-section container">
        <div className="section-heading">
          <div>
            <Eyebrow>FROM POSSIBILITY TO PERSPECTIVE</Eyebrow>
            <h2>
              Less legwork.
              <br />
              <span>More clarity.</span>
            </h2>
          </div>
          <ArrowLink to="/how-it-works">How SCOPE works</ArrowLink>
        </div>
        <div className="steps-grid">
          {[
            [
              "01",
              "Start with your business.",
              "Tell us what you do, what you’ve done, and what you’re ready for. Your profile shapes every recommendation.",
            ],
            [
              "02",
              "Find the relevant few.",
              "Discover tenders and funding references ranked by services, sector, geography and commercial preferences.",
            ],
            [
              "03",
              "Go forward, informed.",
              "See the fit, the gaps and the original evidence. Save the opportunities that deserve your attention.",
            ],
          ].map(([n, t, p]) => (
            <div className="step" key={n}>
              <span className="step-number">
                {n}
                <ArrowUpRight size={20} />
              </span>
              <h3>{t}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="evidence-spotlight">
        <div className="container spotlight-grid">
          <div>
            <Eyebrow light>CONVICTION NEEDS EVIDENCE</Eyebrow>
            <h2>
              A reason behind
              <br />
              every recommendation.
            </h2>
            <p>
              A good fit is a starting point. Know which conditions appear met,
              which don’t, and which need a human answer.
            </p>
            <ArrowLink to="/demo">See the thinking behind a match</ArrowLink>
          </div>
          <div className="evidence-art">
            <div className="row space-between">
              <span className="micro">REQUIREMENT / 01</span>
              <FileCheck2 size={20} />
            </div>
            <h3>
              Clarity includes
              <br />
              what we don’t know.
            </h3>
            <div className="evidence-art-line">
              <span>Service experience</span>
              <span className="status-light">
                <Check size={13} /> Appears met
              </span>
            </div>
            <div className="evidence-art-line">
              <span>Required certification</span>
              <span className="status-unknown">? Unknown</span>
            </div>
            <div className="art-source">
              <span className="line-decoration" />
              ORIGINAL SOURCE → CONDITION → YOUR PROFILE
            </div>
            <span className="art-caption">
              Fictional example · never an eligibility guarantee
            </span>
          </div>
        </div>
      </section>
      <section className="faq-section container">
        <div>
          <Eyebrow>THE IMPORTANT QUESTIONS</Eyebrow>
          <h2>
            Clear from
            <br />
            the start.
          </h2>
          <ArrowLink to="/sources">Explore our sources</ArrowLink>
        </div>
        <div>
          {faqs.map(([q, a], i) => (
            <div className="faq" key={q}>
              <button
                aria-expanded={faq === i}
                aria-controls={"faq-" + i}
                onClick={() => setFaq(faq === i ? null : i)}
              >
                {q}
                {faq === i ? <Minus size={18} /> : <Plus size={18} />}
              </button>
              <div id={"faq-" + i} hidden={faq !== i}>
                <p>{a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <CTA />
    </PublicLayout>
  );
}
export function HowItWorks() {
  return (
    <PublicLayout>
      <section className="page-hero container">
        <Eyebrow>THE PRODUCT / HOW IT WORKS</Eyebrow>
        <h1>
          Find the fit.
          <br />
          <span>Understand the detail.</span>
        </h1>
        <p>
          A thoughtful first filter for your next business opportunity. Built
          around your capabilities, with the evidence in view.
        </p>
      </section>
      <section className="container lifecycle">
        {[
          [
            Building2,
            "01 / YOUR BUSINESS",
            "A profile with substance.",
            "Services, experience, credentials and their expiry dates. Team capacity, financial bands, geography, contract preferences and your intended role. Share what you know; leave the rest unknown.",
          ],
          [
            SlidersHorizontal,
            "02 / RELEVANCE",
            "Ranked for a reason.",
            "A deterministic model weighs service overlap (35), sector (20), geography (15), value (10), credentials (10), role (5) and experience (5). Change your profile and the ranking changes.",
          ],
          [
            FileCheck2,
            "03 / THE EVIDENCE",
            "Confidence, with context.",
            "Relevance and mandatory conditions are separate. Each condition carries a source locator and a status: appears met, unmet or unknown. Missing information never becomes a positive answer.",
          ],
        ].map(([Icon, n, t, p]) => {
          const I = Icon as typeof Building2;
          return (
            <article key={String(n)}>
              <I size={27} />
              <div>
                <span className="micro">{String(n)}</span>
                <h2>{String(t)}</h2>
                <p>{String(p)}</p>
              </div>
            </article>
          );
        })}
      </section>
      <section className="container how-preview">
        <ProductPreview />
        <ArrowLink to="/demo">
          Try changing a business profile yourself
        </ArrowLink>
      </section>
      <CTA />
    </PublicLayout>
  );
}
export function Pricing() {
  return (
    <PublicLayout>
      <section className="page-hero centered container">
        <Eyebrow>ROOM FOR YOUR AMBITION</Eyebrow>
        <h1>
          A clearer view.
          <br />
          <span>At your own pace.</span>
        </h1>
        <p>
          Start with seven days of full access. No payment details.
          <br />
          Continue on Free when your trial ends.
        </p>
        <span className="launch-note">
          Launch pricing under evaluation · Paid subscriptions unavailable
        </span>
      </section>
      <section className="pricing-grid container">
        {[
          {
            name: "Free",
            price: "0",
            desc: "A place to start looking.",
            features: [
              "Browse all available opportunities",
              "3 detailed analyses / calendar month",
              "Up to 5 saved opportunities",
              "One business profile",
            ],
            to: "/signup?plan=free",
            cta: "Start with Free",
          },
          {
            name: "Solo",
            price: "19",
            desc: "For your independent ambition.",
            features: [
              "Unlimited detailed analyses*",
              "Unlimited saved opportunities*",
              "Transparent qualification checks",
              "One business profile",
            ],
            to: "/signup",
            cta: "Try Solo features for 7 days",
          },
          {
            name: "Team",
            price: "59",
            desc: "A direction we’re exploring.",
            features: [
              "Proposed shared workspace",
              "Proposed team member access",
              "Proposed shared shortlists",
              "Not included in this prototype",
            ],
            to: null,
            cta: "Paid access unavailable",
          },
        ].map((p, i) => (
          <article
            className={"pricing-card " + (i === 1 ? "featured" : "")}
            key={p.name}
          >
            {i === 1 && (
              <span className="plan-badge">EXPLORE ON YOUR FREE TRIAL</span>
            )}
            <span className="micro">{p.name}</span>
            <div className="price">
              €{p.price}
              <span>/ month</span>
            </div>
            <p>{p.desc}</p>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={16} />
                  {f}
                </li>
              ))}
            </ul>
            {p.to ? (
              <Link
                className={"button " + (i === 1 ? "signal" : "outline")}
                to={p.to}
              >
                {p.cta}
                <ArrowUpRight size={17} />
              </Link>
            ) : (
              <button className="button outline" disabled>
                {p.cta}
              </button>
            )}
            <span className="pricing-foot">
              {i === 0
                ? "Free, with no time limit."
                : i === 1
                  ? "Experimental price. No checkout available."
                  : "Future concept. No team access available."}
            </span>
          </article>
        ))}
      </section>
      <section className="pricing-explanation container">
        <p>
          * Trial access is subject to reasonable request limits. After seven
          days, Free limits apply automatically. Existing saves remain
          accessible if you exceed the Free save allowance, but you cannot add
          more until below five.
        </p>
        <p>
          No charges, automated emails or recurring payments are enabled. Prices
          are product hypotheses, not an offer to purchase.
        </p>
      </section>
      <CTA />
    </PublicLayout>
  );
}
export function Demo() {
  const [business, setBusiness] = useState<"research" | "restaurant">(
      "research",
    ),
    [cert, setCert] = useState(false),
    [selected, setSelected] = useState("demo-research");
  const p =
    business === "research"
      ? {
          ...researchProfile,
          qualifications: [
            ...researchProfile.qualifications,
            ...(cert
              ? [{ name: "ISO 9001", acquiredAt: null, expiresAt: null }]
              : []),
          ],
        }
      : restaurantProfile;
  const records = demoOpportunities
    .map((o) => ({ ...o, match: matchOpportunity(p, o) }))
    .sort((a, b) => b.match.score - a.match.score);
  const o = records.find((o) => o.id === selected) || records[0];
  return (
    <PublicLayout>
      <section className="container demo-intro">
        <Eyebrow>A WORKING PREVIEW</Eyebrow>
        <div className="section-heading">
          <h1>
            Change the business.
            <br />
            <span>Change the perspective.</span>
          </h1>
          <p>
            Explore the same matching engine used in the app. Every business,
            opportunity and requirement here is <strong>fictional</strong>.
          </p>
        </div>
      </section>
      <section className="container demo-workspace">
        <div className="demo-controls">
          <div>
            <span className="micro">01 / CHOOSE A BUSINESS</span>
            <div className="segmented">
              <button
                className={business === "research" ? "selected" : ""}
                onClick={() => {
                  setBusiness("research");
                  setSelected("demo-research");
                }}
              >
                Research studio <span>3 people</span>
              </button>
              <button
                className={business === "restaurant" ? "selected" : ""}
                onClick={() => {
                  setBusiness("restaurant");
                  setSelected("demo-catering");
                }}
              >
                Restaurant <span>8 people</span>
              </button>
            </div>
          </div>
          <div className="demo-profile">
            <span className="micro">PROFILE SIGNALS</span>
            <p>
              {p.services.join(" + ")} · €5–50k projects · {p.staff} staff
            </p>
            {business === "research" && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={cert}
                  onChange={(e) => setCert(e.target.checked)}
                />
                Add ISO 9001 to the profile
              </label>
            )}
          </div>
          <span className="demo-label">FICTIONAL DATA / REAL LOGIC</span>
        </div>
        <div className="demo-split">
          <div className="demo-records">
            <span className="micro">02 / YOUR RANKED OPPORTUNITIES</span>
            {records.map((r) => (
              <button
                className={"demo-record " + (r.id === o.id ? "selected" : "")}
                onClick={() => setSelected(r.id)}
                key={r.id}
              >
                <div className="row space-between">
                  <Tag>{r.type}</Tag>
                  <Fit score={r.match.score} />
                </div>
                <h3>{r.title}</h3>
                <p>{r.buyer}</p>
                <span className="demo-record-arrow">
                  <span>Inspect the match</span>
                  <ArrowRight size={17} />
                </span>
              </button>
            ))}
          </div>
          <div className="demo-detail">
            <span className="micro">03 / UNDERSTAND YOUR FIT</span>
            <h2>{o.title}</h2>
            <EvidencePanel o={o} match={o.match} />
          </div>
        </div>
      </section>
      <section className="demo-bottom container">
        <div>
          <h2>Your business has its own scope.</h2>
          <p>
            Build your profile and explore source-backed records in the app.
          </p>
        </div>
        <Link className="button forest" to="/signup">
          Try 7 days free <ArrowUpRight size={18} />
        </Link>
      </section>
    </PublicLayout>
  );
}
export function Sources() {
  return (
    <PublicLayout>
      <section className="page-hero container">
        <Eyebrow>SOURCES & COVERAGE</Eyebrow>
        <h1>
          Original sources.
          <br />
          <span>Honest boundaries.</span>
        </h1>
        <p>
          We organise public information to support your judgement. We do not
          replace the official documents.
        </p>
      </section>
      <section className="container prose sources-prose">
        <h2>Published procurement notices</h2>
        <p>
          SCOPE’s server-side adapter uses the official{" "}
          <a
            href="https://docs.ted.europa.eu/api/latest/search.html"
            target="_blank"
            rel="noreferrer"
          >
            EU TED published-notices Search API
          </a>
          . Operator imports are scoped to Malta-related published notices.
          Publication does not mean an opportunity is still open: notices may be
          historic, amended or awarded. Each record retains its publication
          identity, retrieval time and original source link. Unknown deadlines
          remain unknown.
        </p>
        <h2>A curated Maltese funding catalogue</h2>
        <p>
          Funding entries are references to official schemes, not verified
          offers of aid. A source check confirms only the facts stated in the
          catalogue. Programme opening status, application cut-offs, eligible
          costs, aid ceilings and your company’s eligibility require a current
          review.
        </p>
        <div className="source-table">
          <div>
            <strong>SME Enhance</strong>
            <a
              href="https://fondi.eu/what-funding-is-available/sme-enhance/"
              target="_blank"
              rel="noreferrer"
            >
              FONDI ↗
            </a>
            <span>
              Reference page checked {date("2026-10-25")} · individual
              eligibility unassessed
            </span>
          </div>
          <div>
            <strong>Digitalise your SME</strong>
            <a
              href="https://fondi.eu/what-funding-is-available/digitalise-your-sme/"
              target="_blank"
              rel="noreferrer"
            >
              FONDI ↗
            </a>
            <span>Official reference · see per-record check and freshness</span>
          </div>
          <div>
            <strong>Micro Invest 2026–2030</strong>
            <a
              href="https://maltaenterprise.com/node/1917"
              target="_blank"
              rel="noreferrer"
            >
              Malta Enterprise ↗
            </a>
            <span>
              Tax credit · access returned 403 during build; current terms
              unverified. Brief indicates submissions from 2027.
            </span>
          </div>
        </div>
        <h2>No automated ePPS access</h2>
        <p>
          SCOPE does not scrape Malta’s ePPS, circumvent access restrictions or
          claim complete Maltese tender coverage. No ePPS attachments are
          fetched. An authorised feed would require separate agreement and
          implementation.
        </p>
        <h2>Freshness, failure and uncertainty</h2>
        <p>
          Every detail includes its source URL, last retrieval and source-check
          timestamp. Checks older than seven days carry a stale warning. Failed
          TED imports preserve the previous catalogue and surface a cached-data
          warning. The public demo is entirely fictional and does not enter the
          account catalogue.
        </p>
        <h2>Independent by design</h2>
        <p>
          No government affiliation, partnerships or eligibility guarantees are
          implied. Free public assistance is also available from{" "}
          <a href="https://sem.gov.mt/" target="_blank" rel="noreferrer">
            SEM
          </a>
          . Original official terms always take precedence.
        </p>
      </section>
    </PublicLayout>
  );
}
export function Legal({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <PublicLayout>
      <section className="page-hero container">
        <Eyebrow>PRODUCT PROTOTYPE / {kind.toUpperCase()}</Eyebrow>
        <h1>
          {kind === "privacy" ? "Your business." : "Clear expectations."}
          <br />
          <span>
            {kind === "privacy" ? "Your information." : "From the beginning."}
          </span>
        </h1>
      </section>
      <section className="container prose">
        {kind === "privacy" ? (
          <>
            <h2>What this prototype stores</h2>
            <p>
              Your email, a salted scrypt password hash, a server-side session,
              declared business profile, saved opportunities, trial dates and
              monthly analysis usage. Financial information is limited to bands.
              Please do not enter bank details, tax credentials or confidential
              client documents.
            </p>
            <h2>Purpose and control</h2>
            <p>
              Profile information is used for deterministic matching in your
              account. There are no advertising trackers or model providers. The
              app uses one necessary, HttpOnly session cookie for up to 30 days.
              You can export and delete your business profile in account
              settings. Saved items and account records remain; account deletion
              currently requires a database operator.
            </p>
            <h2>Before a public launch</h2>
            <p>
              This is a local evaluation prototype, not a publicly offered
              service. Controller identity, contact details, retention schedule,
              jurisdictional rights process, processor agreements and backup
              deletion processes must be completed before accepting public
              customer data. No full GDPR compliance claim is made.
            </p>
          </>
        ) : (
          <>
            <h2>An evaluation product</h2>
            <p>
              SCOPE is a working product prototype for review. Pricing is
              experimental. No paid subscription or payment checkout is
              available. Do not rely on it as your sole source for legal,
              financial or procurement decisions.
            </p>
            <h2>Information and eligibility</h2>
            <p>
              Matches indicate relevance, not eligibility or entitlement to aid.
              Information can be incomplete or stale. Check original notice
              documents and scheme terms, and obtain professional advice where
              appropriate. We do not submit applications, tenders or communicate
              with authorities on your behalf.
            </p>
            <h2>Trial and Free</h2>
            <p>
              A trial lasts exactly seven days from server-recorded activation
              and can start once per account. It ends automatically with no
              payment. Free includes three distinct detailed analyses per UTC
              calendar month and five saved opportunities. Reopening an already
              analysed record that month does not consume another credit. Trial
              usage does not consume Free credits. Creating multiple accounts to
              evade limits is outside the intended evaluation use.
            </p>
            <h2>Acceptable use</h2>
            <p>
              Use only authorised business information. Do not attempt
              unauthorised access or bulk extraction. Rate limits protect
              accounts and analyses. Full commercial terms, service levels and a
              legal entity remain prerequisites for launch.
            </p>
          </>
        )}
      </section>
    </PublicLayout>
  );
}
