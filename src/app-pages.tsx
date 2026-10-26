import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  LayoutDashboard,
  ScanLine,
  Bookmark,
  Building2,
  Settings,
  LogOut,
  Search,
  SlidersHorizontal,
  Menu,
  X,
  FileCheck2,
  MailWarning,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import type { Account, Profile, Ranked, OpportunitySummary } from "./domain";
import { opportunityTypes, typeLabels } from "./domain";
import { api, ApiError, date, money, post, relativeDays, usePublicConfig } from "./api";
import { Logo, Eyebrow, ErrorMessage, Loading, OpportunityCard, EvidencePanel, Tag, Fit, LifecycleChip, Success } from "./components";
export { ProfileEditor } from "./profile-editor";
export { SettingsPage } from "./settings-page";

type AppContextType = { account: Account; refresh: () => Promise<void> };
const AppContext = createContext<AppContextType>(null!);
export const useAccount = () => useContext(AppContext);

function VerificationBanner({ account }: { account: Account }) {
  const [state, setState] = useState<"idle" | "sent" | "error">("idle"),
    [message, setMessage] = useState("");
  if (account.emailVerified) return null;
  async function resend() {
    try {
      const r = await post<{ verificationSent: boolean }>("/auth/resend-verification");
      setState(r.verificationSent ? "sent" : "error");
      setMessage(r.verificationSent ? `Sent to ${account.email}.` : "Email delivery is not configured on this server.");
    } catch (e) {
      setState("error");
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="app-banner" role="status">
      <MailWarning size={18} aria-hidden />
      <span>
        <strong>Confirm your email address.</strong>{" "}
        {account.trialPending ? "Your seven-day trial starts when you confirm." : "Confirming secures your account and enables password recovery."}{" "}
        {message}
      </span>
      {state !== "sent" && (
        <button className="button outline small" onClick={resend}>
          Resend link
        </button>
      )}
    </div>
  );
}
function IncidentBanner() {
  const config = usePublicConfig();
  if (!config?.incident) return null;
  return (
    <div className="app-banner warning" role="status">
      <AlertTriangle size={18} aria-hidden />
      <span>
        <strong>{config.incident.title}.</strong> {config.incident.message}
      </span>
    </div>
  );
}
export function AppLayout() {
  const [account, setAccount] = useState<Account | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    navigate = useNavigate(),
    location = useLocation();
  const refresh = useCallback(async () => {
    try {
      setAccount(await api<Account>("/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) navigate("/login", { replace: true });
      else setError((e as Error).message);
    }
  }, [navigate]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  async function logout() {
    try {
      await post("/auth/logout");
      navigate("/login");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!account)
    return (
      <div className="container">
        <ErrorMessage message={error} />
        <Loading />
      </div>
    );
  const nav: [typeof ScanLine, string, string][] = [
    [LayoutDashboard, "/app", "Overview"],
    [ScanLine, "/app/opportunities", "Discover"],
    [Bookmark, "/app/saved", "Saved"],
    [Building2, "/app/profile", "Business profile"],
    [Settings, "/app/settings", "Account & plan"],
  ];
  if (account.role !== "user") nav.push([ShieldCheck, "/app/admin", "Operations"]);
  const planLabel = account.plan === "solo" ? "Solo plan" : account.plan === "trial" ? "7-day trial" : "Free plan";
  return (
    <AppContext.Provider value={{ account, refresh }}>
      <div className="app-shell">
        <a className="skip-link" href="#app-main">
          Skip to content
        </a>
        <div className="app-mobile-header">
          <Logo />
          <button className="icon-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="app-sidebar" aria-label={open ? "Close navigation" : "Open navigation"}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        <aside id="app-sidebar" className={"app-sidebar " + (open ? "is-open" : "")}>
          <Logo light />
          <nav aria-label="Workspace">
            {nav.map(([Icon, path, label]) => (
              <NavLink to={path} key={path} end={path === "/app"}>
                <Icon size={18} aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Link className="sidebar-plan" to="/app/settings">
              <span className="tiny-dot" aria-hidden />
              {planLabel}
              <ArrowUpRight size={15} aria-hidden />
            </Link>
            <span className="sidebar-email" title={account.email}>
              {account.email}
            </span>
            <button className="logout" onClick={logout}>
              <LogOut size={16} aria-hidden />
              Log out
            </button>
          </div>
        </aside>
        <div className="app-main-wrap">
          <header className="app-topbar">
            <span>{planLabel}{account.analysesLimit !== null ? ` · ${account.analysesUsed} of ${account.analysesLimit} analyses used this month` : ""}</span>
            <Link to="/sources">
              Sources & coverage <ArrowUpRight size={13} aria-hidden />
            </Link>
          </header>
          <main id="app-main" className="app-main" tabIndex={-1}>
            <VerificationBanner account={account} />
            <IncidentBanner />
            <ErrorMessage message={error} />
            <Outlet />
          </main>
          <footer className="app-footer">
            <span>Independent · Always check the original official terms.</span>
            <span className="row">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
            </span>
          </footer>
        </div>
      </div>
    </AppContext.Provider>
  );
}

type Feed = {
  opportunities: OpportunitySummary[];
  total: number;
  closedHidden: number;
  sectors: string[];
  hasProfile: boolean;
  ted: { lastStatus: string | null; lastSuccessAt: string | null; stale: boolean };
};
function useSaveToggle(reload: () => Promise<void>, setError: (s: string) => void) {
  const { refresh } = useAccount();
  return async (o: OpportunitySummary) => {
    try {
      await api("/saves/" + encodeURIComponent(o.id), { method: o.saved ? "DELETE" : "POST", body: "{}" });
      await reload();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
}
export function Dashboard() {
  const [feed, setFeed] = useState<Feed | null>(null),
    [saved, setSaved] = useState<Feed | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState("");
  const { account } = useAccount();
  const load = useCallback(async () => {
    try {
      const [f, s, p] = await Promise.all([
        api<Feed>("/opportunities"),
        api<Feed>("/opportunities?saved=true&sort=deadline"),
        api<{ profile: Profile | null }>("/profile"),
      ]);
      setFeed(f);
      setSaved(s);
      setProfile(p.profile);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = useSaveToggle(load, setError);
  const closingSoon = saved?.opportunities.filter((o) => o.lifecycle === "open" && o.deadline && new Date(o.deadline).getTime() - Date.now() < 14 * 86400000) ?? [];
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>OVERVIEW</Eyebrow>
          <h1>{profile ? `${profile.companyName}, in focus.` : "Good things start with focus."}</h1>
          <p>{profile ? "Your strongest current matches, and what needs attention." : "Describe your business to make these matches yours."}</p>
        </div>
        <Link to="/app/profile" className="button outline small">
          {profile ? "Edit profile" : "Build your profile"}
          <ArrowUpRight size={16} aria-hidden />
        </Link>
      </div>
      <ErrorMessage message={error} />
      <div className="dashboard-stats">
        <div>
          <span className="micro">ACTIVE OPPORTUNITIES</span>
          <strong>{feed?.total ?? "—"}</strong>
          <span>Open or status to confirm{feed?.closedHidden ? ` · ${feed.closedHidden} closed hidden` : ""}</span>
        </div>
        <div>
          <span className="micro">YOUR SHORTLIST</span>
          <strong>{saved?.total ?? "—"}</strong>
          <span>
            {closingSoon.length ? `${closingSoon.length} closing within 14 days · ` : ""}
            <Link to="/app/saved">Open shortlist</Link>
          </span>
        </div>
        <div>
          <span className="micro">{account.plan === "trial" ? "YOUR TRIAL" : account.plan === "solo" ? "YOUR PLAN" : "MONTHLY ANALYSES"}</span>
          <strong>
            {account.plan === "trial"
              ? Math.max(0, Math.ceil((new Date(account.trialEndsAt!).getTime() - Date.now()) / 86400000)) + " days left"
              : account.plan === "solo"
                ? "Solo"
                : `${account.analysesUsed} / ${account.analysesLimit}`}
          </strong>
          <span>
            {account.plan === "trial"
              ? `Ends ${date(account.trialEndsAt)} · no charge`
              : account.plan === "solo"
                ? "Unlimited analyses and saves"
                : "Detailed analyses this month (UTC) · "}
            {account.plan === "free" && <Link to="/app/settings">See options</Link>}
          </span>
        </div>
      </div>
      {!profile && (
        <div className="onboarding-callout">
          <Building2 size={30} aria-hidden />
          <div>
            <h2>Start with what makes your business, yours.</h2>
            <p>Services, credentials, capacity and preferences. Four short steps; leave anything unknown blank.</p>
          </div>
          <Link to="/app/profile" className="button forest small">
            Create profile <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      )}
      {closingSoon.length > 0 && (
        <section className="attention">
          <h2>Closing soon on your shortlist</h2>
          <ul>
            {closingSoon.slice(0, 4).map((o) => (
              <li key={o.id}>
                <Link to={"/app/opportunities/" + o.id}>{o.title}</Link>
                <span>Deadline {date(o.deadline)} ({relativeDays(o.deadline)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="section-row">
        <div>
          <Eyebrow>WORTH A CLOSER LOOK</Eyebrow>
          <h2>{profile ? "Your leading matches" : "Explore the catalogue"}</h2>
        </div>
        <Link className="text-link" to="/app/opportunities">
          View all <ArrowUpRight size={17} aria-hidden />
        </Link>
      </div>
      <SourceNotice feed={feed} />
      {!feed ? (
        <Loading />
      ) : feed.opportunities.length ? (
        <div className="opportunity-grid">
          {feed.opportunities.slice(0, 4).map((o) => (
            <OpportunityCard key={o.id} o={o} onSave={save} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ScanLine size={28} aria-hidden />
          <h3>No active records yet.</h3>
          <p>Records appear once the operator imports TED notices and publishes funding references. The fictional demo shows how matching works.</p>
          <Link className="text-link" to="/demo">
            Try the demo <ArrowUpRight size={15} aria-hidden />
          </Link>
        </div>
      )}
      <div className="dashboard-principle">
        <FileCheck2 size={22} aria-hidden />
        <div>
          <h3>Relevant doesn’t mean eligible.</h3>
          <p>Open an opportunity to see source evidence, explicit conditions, financial fit and what still needs confirmation.</p>
        </div>
        <Link to="/how-it-works" aria-label="How matching works">
          <ArrowUpRight size={20} aria-hidden />
        </Link>
      </div>
    </>
  );
}
function SourceNotice({ feed }: { feed: Feed | null }) {
  if (!feed) return null;
  const t = feed.ted;
  const warning = t.stale;
  return (
    <div className={"source-notice " + (warning ? "warning" : "")}>
      <span className="tiny-dot" aria-hidden />
      <span>
        {t.lastStatus === "failed"
          ? "The latest TED refresh failed. Earlier records are kept and may be out of date."
          : t.lastSuccessAt
            ? `TED notices last refreshed ${date(t.lastSuccessAt)}${warning ? " — refresh overdue" : ""}. Published does not always mean open.`
            : "No TED refresh is recorded on this server yet."}{" "}
        Funding opening status always needs confirmation.
      </span>
      <Link to="/sources">
        Coverage <ArrowUpRight size={13} aria-hidden />
      </Link>
    </div>
  );
}
export function Opportunities({ savedOnly = false }: { savedOnly?: boolean }) {
  const [feed, setFeed] = useState<Feed | null>(null),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [type, setType] = useState("all"),
    [status, setStatus] = useState(savedOnly ? "all" : "active"),
    [sort, setSort] = useState(savedOnly ? "deadline" : "relevance"),
    [deadline, setDeadline] = useState("all"),
    [sector, setSector] = useState(""),
    [source, setSource] = useState(""),
    [fit, setFit] = useState("0"),
    [maxValue, setMaxValue] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [compare, setCompare] = useState<string[]>([]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const p = new URLSearchParams({
          q,
          type,
          deadline,
          status,
          sort,
          minScore: fit,
          ...(savedOnly ? { saved: "true" } : {}),
          ...(sector ? { sector } : {}),
          ...(source ? { source } : {}),
          ...(maxValue ? { maxValue } : {}),
        });
        setFeed(await api<Feed>("/opportunities?" + p, { signal }));
        setError("");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      }
    },
    [q, type, deadline, status, sort, fit, savedOnly, sector, source, maxValue],
  );
  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => void load(ac.signal), 180);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [load]);
  const save = useSaveToggle(() => load(), setError);
  const compared = feed?.opportunities.filter((o) => compare.includes(o.id)) ?? [];
  const activeFilters = [deadline !== "all", !!sector, !!source, fit !== "0", !!maxValue].filter(Boolean).length;
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>{savedOnly ? "YOUR SHORTLIST" : "DISCOVER"}</Eyebrow>
          <h1>{savedOnly ? "Possibilities, kept close." : "See what’s within reach."}</h1>
          <p>{savedOnly ? "Saved records stay here between sessions, including ones that have since closed." : "Public tenders and funding references, ranked for your business."}</p>
        </div>
      </div>
      <div className="filter-bar" role="search">
        <label className="search-field">
          <Search size={18} aria-hidden />
          <input aria-label="Search opportunities" placeholder="Search titles, buyers, subjects…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={120} />
        </label>
        <label>
          <span className="sr-only">Opportunity type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {opportunityTypes.map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Open or to confirm</option>
            <option value="closed">Closed or replaced</option>
            <option value="all">Any status</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="relevance">Most relevant</option>
            <option value="deadline">Closing soonest</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        <button className={"button outline small " + (advanced ? "active" : "")} onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} aria-controls="advanced-filters">
          <SlidersHorizontal size={17} aria-hidden />
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>
      {advanced && (
        <div className="advanced-filters" id="advanced-filters">
          <label>
            Deadline
            <select value={deadline} onChange={(e) => setDeadline(e.target.value)}>
              <option value="all">Any</option>
              <option value="upcoming">Known and upcoming</option>
              <option value="unknown">Not confirmed</option>
            </select>
          </label>
          <label>
            Sector
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">All sectors</option>
              {(feed?.sectors ?? []).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {["TED", "FONDI", "Malta Enterprise", "SEM", "Servizz"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum relevance
            <select value={fit} onChange={(e) => setFit(e.target.value)}>
              <option value="0">Any</option>
              <option value="30">30% and above</option>
              <option value="60">60% and above</option>
            </select>
          </label>
          <label>
            Maximum known value (€)
            <input type="number" min="0" inputMode="numeric" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="No limit" />
          </label>
          {activeFilters > 0 && (
            <button
              className="text-link"
              onClick={() => {
                setDeadline("all");
                setSector("");
                setSource("");
                setFit("0");
                setMaxValue("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <ErrorMessage message={error} />
      <SourceNotice feed={feed} />
      <div className="feed-count" aria-live="polite">
        <span>
          {feed ? `${feed.total} ${savedOnly ? "saved" : feed.total === 1 ? "record" : "records"}` : "Loading…"}
          {feed?.closedHidden ? ` · ${feed.closedHidden} closed hidden` : ""}
        </span>
        {savedOnly && compare.length > 0 && <span>{compare.length} of 3 selected to compare</span>}
      </div>
      {savedOnly && compared.length >= 2 && <Comparison records={compared} onClear={() => setCompare([])} />}
      {!feed ? (
        <Loading />
      ) : feed.opportunities.length ? (
        <div className="opportunity-grid">
          {feed.opportunities.map((o) => (
            <OpportunityCard
              key={o.id}
              o={o}
              onSave={save}
              selectable={
                savedOnly
                  ? {
                      selected: compare.includes(o.id),
                      disabled: !compare.includes(o.id) && compare.length >= 3,
                      onToggle: () => setCompare((c) => (c.includes(o.id) ? c.filter((x) => x !== o.id) : [...c, o.id])),
                    }
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ScanLine size={30} aria-hidden />
          <h2>{savedOnly ? "Your shortlist starts here." : "Nothing in this view."}</h2>
          <p>{savedOnly ? "Save an opportunity from Discover to keep it close." : "Try a broader search or include closed records. Some source deadlines are not published."}</p>
          {savedOnly && (
            <Link className="button forest small" to="/app/opportunities">
              Discover opportunities <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </>
  );
}
function Comparison({ records, onClear }: { records: OpportunitySummary[]; onClear: () => void }) {
  const rows: [string, (o: OpportunitySummary) => React.ReactNode][] = [
    ["Type", (o) => typeLabels[o.type]],
    ["Status", (o) => <LifecycleChip lifecycle={o.lifecycle} deadline={o.deadline} />],
    ["Deadline", (o) => (o.deadline ? `${date(o.deadline)} (${relativeDays(o.deadline)})` : "Not confirmed")],
    ["Value", (o) => money(o.value)],
    ["Relevance", (o) => <Fit score={o.match.score} />],
    ["Buyer / authority", (o) => o.buyer],
    ["Source", (o) => `${o.source} · ${o.freshness}`],
  ];
  return (
    <section className="comparison" aria-label="Comparison of selected opportunities">
      <div className="section-row">
        <h2>Side by side</h2>
        <button className="text-link" onClick={onClear}>
          Clear comparison
        </button>
      </div>
      <div className="comparison-scroll" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Attribute</span>
              </th>
              {records.map((o) => (
                <th scope="col" key={o.id}>
                  <Link to={"/app/opportunities/" + o.id}>{o.title}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {records.map((o) => (
                  <td key={o.id}>{cell(o)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-text muted">Eligibility and conditions are compared on each record’s detail page; relevance is not eligibility.</p>
    </section>
  );
}
type Detail = Omit<Ranked, "supersededBy"> & { supersededBy: { id: string; sourceId: string } | null };
export function OpportunityDetail() {
  const { id } = useParams(),
    [o, setO] = useState<Detail | null>(null),
    [error, setError] = useState<ApiError | null>(null),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const { refresh, account } = useAccount();
  useEffect(() => {
    setO(null);
    setLoading(true);
    setError(null);
    api<{ opportunity: Detail }>("/opportunities/" + encodeURIComponent(id || ""))
      .then((r) => {
        setO(r.opportunity);
        return refresh();
      })
      .catch((e) => setError(e as ApiError))
      .finally(() => setLoading(false));
  }, [id, refresh]);
  async function save() {
    if (!o) return;
    try {
      await api("/saves/" + encodeURIComponent(o.id), { method: o.saved ? "DELETE" : "POST", body: "{}" });
      setO({ ...o, saved: !o.saved });
      setNotice(o.saved ? "Removed from your shortlist." : "Saved to your shortlist.");
      await refresh();
    } catch (e) {
      setError(e as ApiError);
    }
  }
  const closed = o && (o.lifecycle === "superseded" || o.lifecycle === "result_published" || o.lifecycle === "deadline_passed");
  return (
    <>
      <Link className="text-link back-link" to="/app/opportunities">
        <ArrowLeft size={16} aria-hidden />
        Back to Discover
      </Link>
      {error && error.code !== "ANALYSIS_LIMIT" && <ErrorMessage message={error.message} />}
      {loading ? (
        <Loading />
      ) : o ? (
        <>
          <div className="detail-header">
            <div className="row">
              <Tag>{typeLabels[o.type]}</Tag>
              <LifecycleChip lifecycle={o.lifecycle} deadline={o.deadline} />
              <span className="micro">
                {o.geography} / {o.source}
              </span>
            </div>
            <h1>{o.title}</h1>
            <p>{o.buyer}</p>
            <div className="detail-meta">
              <span>{money(o.value)}</span>
              <span>
                {(o.lotDeadlines?.length ?? 0) > 1 ? "Next lot deadline: " : "Deadline: "}
                {o.deadline ? `${date(o.deadline)} (${relativeDays(o.deadline)})` : "not confirmed"}
                {o.deadlineApproximate && o.deadline ? " · closing time not stated" : ""}
              </span>
              <button className={"button small " + (o.saved ? "outline" : "forest")} onClick={save} aria-pressed={o.saved}>
                <Bookmark size={16} fill={o.saved ? "currentColor" : "none"} aria-hidden />
                {o.saved ? "Saved · remove" : "Save opportunity"}
              </button>
            </div>
            <Success message={notice} />
          </div>
          {closed && (
            <div className="app-banner warning" role="note">
              <AlertTriangle size={18} aria-hidden />
              <span>
                {o.lifecycle === "superseded" ? (
                  <>
                    A later notice replaces this one.{" "}
                    {o.supersededBy && <Link to={"/app/opportunities/" + o.supersededBy.id}>Open notice {o.supersededBy.sourceId}</Link>}
                  </>
                ) : o.lifecycle === "result_published" ? (
                  "TED has published a result notice for this procedure. It is very likely no longer open for bids."
                ) : (o.lotCount ?? 0) > 1 ? (
                  `Every published lot deadline has passed (${o.lotCount} lots). Check the source for amendments or extensions.`
                ) : (
                  "The published deadline has passed. Check the source for amendments or extensions."
                )}
              </span>
            </div>
          )}
          <div className={"source-notice " + (/overdue|requires|over 7/.test(o.freshness) ? "warning" : "")}>
            <span className="tiny-dot" aria-hidden />
            {o.freshness}
          </div>
          <div className="detail-summary">
            <span className="micro">IN BRIEF</span>
            <p>{o.description}</p>
          </div>
          <EvidencePanel o={{ ...o, supersededBy: o.supersededBy?.id ?? null }} match={o.match} />
        </>
      ) : error?.code === "ANALYSIS_LIMIT" ? (
        <div className="empty-state">
          <h2>You’ve used this month’s detailed analyses.</h2>
          <p>{error.message}</p>
          <div className="row center">
            <Link className="button forest small" to="/app/settings">
              {account.trialAvailable ? "Start your free trial" : "See plan options"} <ArrowUpRight size={15} aria-hidden />
            </Link>
            <Link className="button outline small" to="/app/saved">
              Your shortlist
            </Link>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h2>This record isn’t available.</h2>
          <p>It may have been retired from the catalogue.</p>
        </div>
      )}
    </>
  );
}
