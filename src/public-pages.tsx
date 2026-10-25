import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { researchProfile, restaurantProfile, typeLabels } from "./domain";
import { matchOpportunity } from "../server/matching";
import { date, usePublicConfig } from "./api";
import { Success } from "./components";
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
    "No. SCOPE is independent. We link to official sources and do not represent any government department, contracting authority or funding body.",
  ],
  [
    "Does a high relevance score mean I qualify?",
    "No. Relevance measures alignment with your profile. Mandatory conditions are assessed separately as appears met, unmet or unknown. Original terms and professional advice take precedence.",
  ],
  [
    "Which opportunities can I find?",
    "Contract notices from Maltese buyers published on the EU’s TED platform, refreshed twice daily, and a reviewed catalogue of Maltese funding programmes and tax credits. Many lower-value Maltese tenders appear only on ePPS, which SCOPE does not cover. The sources page lists exactly what is included.",
  ],
  [
    "What happens after seven days?",
    "Your trial ends automatically and your account moves to Free: three detailed analyses per calendar month and up to five saved opportunities. No card, no charge and nothing to cancel. The trial starts when you confirm your email address.",
  ],
];
export function Home() {
  const [faq, setFaq] = useState<number | null>(0);
  const [params] = useSearchParams();
  return (
    <PublicLayout>
      {params.get("account") === "deleted" && (
        <div className="container">
          <Success message="Your account and its data have been deleted. Thank you for trying SCOPE." />
        </div>
      )}
      <section className="hero container">
        <div className="hero-copy">
          <Eyebrow>PUBLIC TENDERS & FUNDING FOR MALTESE SMEs</Eyebrow>
          <h1>
            The right
            <br />
            opportunities.
            <br />
            <span>Within reach.</span>
          </h1>
          <p>
            SCOPE finds public tenders and government funding for Malta-based
            businesses and ranks them against what you actually do.{" "}
            <br className="desktop-break" />
            Every match shows its official source — and what still needs
            checking.
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
            Independent of government
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
            <ScanLine size={19} aria-hidden />
            Ranked by what you do
          </span>
          <span>
            <FileCheck2 size={19} aria-hidden />
            Linked to the official source
          </span>
          <span>
            <Globe2 size={19} aria-hidden />
            TED tenders + Maltese funding
          </span>
          <span>
            <ShieldCheck size={19} aria-hidden />
            Relevance is never eligibility
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
            "A transparent model weighs service overlap (up to 30), the official procurement classification (CPV, 20), sector (15), geography (10), value range (10), credentials (10), role (5) and experience (5). Closed or replaced notices are down-ranked. Change your profile and the ranking changes.",
          ],
          [
            FileCheck2,
            "03 / THE EVIDENCE",
            "Confidence, with context.",
            "Relevance, eligibility, financial fit and delivery capacity are assessed separately. Each condition carries a source locator and a status: appears met, unmet or unknown. Missing information never becomes a positive answer.",
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
  const config = usePublicConfig();
  const billing = !!config?.billingEnabled;
  const solo = config?.soloPriceLabel ?? "€19";
  const rows: [string, string, string][] = [
    ["Browse all active opportunities", "Yes", "Yes"],
    ["Detailed analyses (conditions, financial fit, capacity)", "3 per month", "Unlimited*"],
    ["Saved opportunities", "Up to 5", "Unlimited*"],
    ["Side-by-side comparison of saved records", "Yes", "Yes"],
    ["Business profiles", "One", "One"],
    ["Data export and deletion", "Yes", "Yes"],
  ];
  return (
    <PublicLayout>
      <section className="page-hero centered container">
        <Eyebrow>PLANS & PRICING</Eyebrow>
        <h1>
          A clearer view.
          <br />
          <span>At your own pace.</span>
        </h1>
        <p>
          Start with seven days of full access. No payment details.
          <br />
          Continue on Free when your trial ends{billing ? ", or move to Solo." : "."}
        </p>
        {!billing && <span className="launch-note">Paid subscriptions are not yet available. Nothing can be charged.</span>}
      </section>
      <section className="pricing-grid two container">
        <article className="pricing-card">
          <span className="micro">Free</span>
          <div className="price">
            €0<span>/ month</span>
          </div>
          <p>A place to start looking.</p>
          <ul>
            <li>
              <Check size={16} aria-hidden />
              Browse every active opportunity
            </li>
            <li>
              <Check size={16} aria-hidden />3 detailed analyses each calendar month
            </li>
            <li>
              <Check size={16} aria-hidden />
              Up to 5 saved opportunities
            </li>
            <li>
              <Check size={16} aria-hidden />
              Includes a one-time 7-day full trial
            </li>
          </ul>
          <Link className="button outline" to="/signup">
            Start free trial <ArrowUpRight size={17} aria-hidden />
          </Link>
          <span className="pricing-foot">Free, with no time limit. No card.</span>
        </article>
        <article className="pricing-card featured">
          <span className="plan-badge">{billing ? "FOR REGULAR BIDDERS" : "COMING SOON"}</span>
          <span className="micro">Solo</span>
          <div className="price">
            {solo}
            <span>/ month</span>
          </div>
          <p>For businesses that bid or apply regularly.</p>
          <ul>
            <li>
              <Check size={16} aria-hidden />
              Unlimited detailed analyses*
            </li>
            <li>
              <Check size={16} aria-hidden />
              Unlimited saved opportunities*
            </li>
            <li>
              <Check size={16} aria-hidden />
              Everything in Free
            </li>
            <li>
              <Check size={16} aria-hidden />
              Cancel any time from the billing portal
            </li>
          </ul>
          {billing ? (
            <Link className="button signal" to="/signup">
              Start with the trial <ArrowUpRight size={17} aria-hidden />
            </Link>
          ) : (
            <Link className="button signal" to="/signup">
              Try every Solo feature free for 7 days <ArrowUpRight size={17} aria-hidden />
            </Link>
          )}
          <span className="pricing-foot">
            {billing ? "Upgrade from Account & plan. VAT may apply; final price at checkout." : "Not yet purchasable. The trial includes every Solo feature."}
          </span>
        </article>
      </section>
      <section className="container plan-table-wrap">
        <table className="plan-table">
          <caption className="sr-only">Plan comparison</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Free</th>
              <th scope="col">Solo / trial</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([f, a, b]) => (
              <tr key={f}>
                <th scope="row">{f}</th>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="pricing-explanation container">
        <p>* Within fair-use request limits. After the seven-day trial, Free limits apply automatically. Saves above the Free allowance stay accessible; you can add more once below five.</p>
        <p>Shared team workspaces are not offered. SCOPE does not submit tenders or applications and does not guarantee eligibility or awards.</p>
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
                  <Tag>{typeLabels[r.type]}</Tag>
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
        <p>We organise public information to support your judgement. We do not replace the official documents.</p>
      </section>
      <section className="container prose sources-prose">
        <h2>Public tenders from TED</h2>
        <p>
          SCOPE uses the official{" "}
          <a href="https://docs.ted.europa.eu/api/latest/search.html" target="_blank" rel="noopener noreferrer">
            EU TED Search API
          </a>{" "}
          to import contract notices from Maltese buyers, refreshed twice a day over a rolling 90-day window. TED publishes notices above EU thresholds and some below; it does not contain every Maltese public tender.
        </p>
        <p>
          Notices that belong to the same procedure are linked. When a buyer publishes a change notice, the earlier notice is marked as replaced. When a result (award) notice appears, the procedure is marked as closed. Notices whose deadline has passed are hidden from Discover by default. Deadlines are only shown when the notice states a single, time-zoned closing time; multi-lot deadlines stay “not confirmed”.
        </p>
        <h2>Maltese funding programmes and tax credits</h2>
        <p>
          Funding entries are references to official schemes, written by an editor from the official page and published only after a second reviewer has checked the source. Each shows when it was verified and when it is due for re-verification; overdue entries are flagged. Grants, tax credits, loans and other incentives are labelled separately. Opening status, eligible costs, aid ceilings and your eligibility always require confirmation.
        </p>
        <div className="source-table">
          <div>
            <strong>SME Enhance</strong>
            <a href="https://fondi.eu/what-funding-is-available/sme-enhance/" target="_blank" rel="noopener noreferrer">
              FONDI
            </a>
            <span>Grant reference · first checked {date("2026-10-25")}</span>
          </div>
          <div>
            <strong>Digitalise your SME</strong>
            <a href="https://fondi.eu/what-funding-is-available/digitalise-your-sme/" target="_blank" rel="noopener noreferrer">
              FONDI
            </a>
            <span>Grant reference · first checked {date("2026-10-25")}</span>
          </div>
          <div>
            <strong>Micro Invest 2026–2030</strong>
            <a href="https://maltaenterprise.com/node/1917" target="_blank" rel="noopener noreferrer">
              Malta Enterprise
            </a>
            <span>Tax credit · official page refused automated access (HTTP 403); shown as unverified until an editor confirms it</span>
          </div>
        </div>
        <h2>Tender alert emails</h2>
        <p>
          The operations team can forward tender alert emails they are entitled to receive. SCOPE reads them as untrusted text: links are recognised but never opened, attachments are discarded, and TED notices are then requested from the official TED API. Links to ePPS are kept for manual follow-up only.
        </p>
        <h2>No automated ePPS access</h2>
        <p>
          SCOPE does not scrape Malta’s ePPS, circumvent access restrictions or claim complete Maltese tender coverage. The ePPS terms of use prohibit automated retrieval. An authorised feed would require a separate agreement.
        </p>
        <h2>Freshness and failure</h2>
        <p>
          Every record shows its source link, retrieval date and verification date. If the TED refresh fails or is more than 36 hours old, records are marked as possibly out of date; earlier data is never deleted because of a failed refresh.
        </p>
        <h2>Independent by design</h2>
        <p>
          No government affiliation, partnership or eligibility guarantee is implied. Free public assistance is available from{" "}
          <a href="https://sem.gov.mt/" target="_blank" rel="noopener noreferrer">
            SEM
          </a>{" "}
          and the administering authorities. Official terms always take precedence.
        </p>
      </section>
    </PublicLayout>
  );
}
function OperatorNotice() {
  const config = usePublicConfig();
  if (!config) return null;
  const l = config.legal;
  return l.configured ? (
    <div className="operator-box">
      <h2>Who operates SCOPE</h2>
      <p>
        {l.operatorName}
        <br />
        {l.operatorAddress}
        <br />
        Contact: <a href={"mailto:" + l.contactEmail}>{l.contactEmail}</a>
      </p>
      {!l.reviewed && <p className="small-text">This notice has not yet been reviewed by a lawyer.</p>}
    </div>
  ) : (
    <div className="operator-box warning">
      <h2>Operator details not yet published</h2>
      <p>
        The legal entity operating this installation has not been configured. Until it is, this service is an evaluation deployment and should not be used for real business data.
      </p>
    </div>
  );
}
export function Legal({ kind }: { kind: "privacy" | "terms" }) {
  const config = usePublicConfig();
  const contact = config?.legal.contactEmail;
  return (
    <PublicLayout>
      <section className="page-hero container">
        <Eyebrow>{kind === "privacy" ? "PRIVACY NOTICE" : "TERMS OF USE"}</Eyebrow>
        <h1>
          {kind === "privacy" ? "Your business." : "Clear expectations."}
          <br />
          <span>{kind === "privacy" ? "Your information." : "From the beginning."}</span>
        </h1>
      </section>
      <section className="container prose">
        <OperatorNotice />
        {kind === "privacy" ? (
          <>
            <h2>What we hold</h2>
            <ul>
              <li>Account: email address, a salted scrypt password hash, confirmation status, plan and trial dates.</li>
              <li>Business profile you enter: services, sectors, experience, past projects, credentials and dates, staff and capacity figures, a turnover band (never accounts or bank details), preferences.</li>
              <li>Activity: saved opportunities, monthly analysis counts, signed-in devices (browser family and operating system only, plus last-active time).</li>
              <li>Billing (only if you subscribe): a customer and subscription reference from the payment provider and the subscription status. Card details are handled by the payment provider, not by SCOPE.</li>
              <li>Security records: an audit log of account events (for example sign-in or password change) keyed to a pseudonymous account identifier, without email addresses or IP addresses.</li>
            </ul>
            <h2>Why</h2>
            <p>
              To provide the service you ask for (account, matching, saved records, billing), to keep it secure and to meet legal obligations. Matching is a deterministic calculation in your account; no profile data is sent to AI model providers or advertisers. There are no advertising or analytics trackers.
            </p>
            <h2>How long</h2>
            <ul>
              <li>Account and profile: until you delete them. Unconfirmed accounts are deleted after 30 days.</li>
              <li>Expired sessions and used links: removed within a day of expiry. Monthly usage counts: about 13 months.</li>
              <li>Audit log: 12 months by default. After account deletion its entries are kept only under a pseudonym.</li>
              <li>Encrypted backups: rolling 30 days by default; deleted data disappears from backups when they expire.</li>
            </ul>
            <h2>Your controls</h2>
            <p>
              In Account & plan you can export all data held about your account, delete your business profile, or delete your account entirely. An active paid subscription is cancelled when you delete your account.
              {contact ? (
                <>
                  {" "}
                  For any other request, including access, correction, objection or complaints, contact <a href={"mailto:" + contact}>{contact}</a>.
                </>
              ) : null}{" "}
              You may also complain to your data protection authority (in Malta, the Information and Data Protection Commissioner).
            </p>
            <h2>Processors</h2>
            <p>The operator’s hosting provider, email delivery provider and, if you subscribe, payment provider process data on its behalf. The operator publishes the current list on request.</p>
          </>
        ) : (
          <>
            <h2>The service</h2>
            <p>
              SCOPE helps you find and assess public tenders and funding programmes. It organises public information; it does not submit tenders or applications, and it does not communicate with authorities for you.
            </p>
            <h2>Information and eligibility</h2>
            <p>
              Relevance scores indicate subject fit, not eligibility or entitlement to aid. Information can be incomplete, amended or out of date. Always check the original notice, documents and scheme terms, and take professional advice where appropriate. Your profile facts are self-declared and are not verified by SCOPE.
            </p>
            <h2>Plans</h2>
            <p>
              The trial lasts seven days from email confirmation and can be used once per account. Free includes three distinct detailed analyses per calendar month (UTC) and five saved opportunities. Re-opening a record already analysed that month is free. Paid plans, where offered, are billed through the payment provider and can be cancelled at any time with effect at the end of the paid period.
            </p>
            <h2>Acceptable use</h2>
            <p>
              Use only business information you are entitled to share. Do not attempt unauthorised access, automated bulk extraction or circumvention of plan limits, including by creating multiple accounts. Fair-use request limits apply.
            </p>
            <h2>Not yet included</h2>
            <p>Liability limits, governing law and service levels must be set by the operator with legal advice before public launch.</p>
          </>
        )}
      </section>
    </PublicLayout>
  );
}
export function Cookies() {
  return (
    <PublicLayout>
      <section className="page-hero container">
        <Eyebrow>COOKIES</Eyebrow>
        <h1>
          One cookie.
          <br />
          <span>Strictly necessary.</span>
        </h1>
        <p>SCOPE uses no advertising, analytics or tracking cookies, so there is nothing to consent to.</p>
      </section>
      <section className="container prose">
        <table className="plan-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Purpose</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">scope_session</th>
              <td>Keeps you signed in. HttpOnly, SameSite=Lax, Secure over HTTPS. Set only when you log in.</td>
              <td>Up to 30 days, or until you log out</td>
            </tr>
          </tbody>
        </table>
        <p>Fonts are served from SCOPE itself; no third-party requests are made when you browse the site. If you subscribe, the payment provider’s own checkout pages set their own cookies under their policy.</p>
      </section>
    </PublicLayout>
  );
}
