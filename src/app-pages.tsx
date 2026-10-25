import {
  useEffect,
  useState,
  createContext,
  useContext,
  useCallback,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
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
  Plus,
  Trash2,
  Check,
  Download,
  Search,
  SlidersHorizontal,
  Menu,
  X,
  FileCheck2,
} from "lucide-react";
import type { Account, Profile, Ranked, OpportunitySummary } from "./domain";
import { emptyProfile, profileSchema } from "./domain";
import { api, ApiError, date, money } from "./api";
import {
  Logo,
  Eyebrow,
  ErrorMessage,
  Loading,
  OpportunityCard,
  EvidencePanel,
  Tag,
} from "./components";
type AppContextType = { account: Account; refresh: () => Promise<void> };
const AppContext = createContext<AppContextType>(null!);
export const useAccount = () => useContext(AppContext);
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
      if (e instanceof ApiError && e.status === 401)
        navigate("/login", { replace: true });
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
      await api("/auth/logout", { method: "POST", body: "{}" });
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
  return (
    <AppContext.Provider value={{ account, refresh }}>
      <div className="app-shell">
        <a className="skip-link" href="#app-main">
          Skip to content
        </a>
        <div className="app-mobile-header">
          <Logo />
          <button
            className="icon-button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Toggle app navigation"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        <aside className={"app-sidebar " + (open ? "is-open" : "")}>
          <Logo />
          <span className="sidebar-label">YOUR WORKSPACE</span>
          <nav aria-label="Workspace">
            {[
              [LayoutDashboard, "/app", "Overview"],
              [ScanLine, "/app/opportunities", "Discover"],
              [Bookmark, "/app/saved", "Saved opportunities"],
              [Building2, "/app/profile", "Business profile"],
              [Settings, "/app/settings", "Account & plan"],
            ].map(([Icon, path, label]) => {
              const I = Icon as typeof ScanLine;
              return (
                <NavLink
                  to={String(path)}
                  key={String(path)}
                  end={path === "/app"}
                >
                  <I size={18} />
                  {String(label)}
                </NavLink>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-plan">
              <span className="tiny-dot" />
              {account.plan === "trial" ? "7-day trial" : "Free plan"}
              <Link to="/app/settings">
                <ArrowUpRight size={15} />
                <span className="sr-only">Manage plan</span>
              </Link>
            </div>
            <span className="sidebar-email">{account.email}</span>
            <button className="logout" onClick={logout}>
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </aside>
        <div className="app-main-wrap">
          <header className="app-topbar">
            <span>YOUR BUSINESS. A WIDER PERSPECTIVE.</span>
            <Link to="/sources">
              Sources & coverage <ArrowUpRight size={13} />
            </Link>
          </header>
          <main id="app-main" className="app-main">
            <ErrorMessage message={error} />
            <Outlet />
          </main>
          <footer className="app-footer">
            Independent intelligence · Always check the original terms.
            <Link to="/privacy">Privacy & data</Link>
          </footer>
        </div>
      </div>
    </AppContext.Provider>
  );
}
type Feed = {
  opportunities: OpportunitySummary[];
  hasProfile: boolean;
  sources: {
    source: string;
    status: string;
    started_at: string;
    count: number;
    error: string | null;
  }[];
};
export function Dashboard() {
  const [feed, setFeed] = useState<Feed | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState("");
  const { account } = useAccount();
  const load = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([
        api<Feed>("/opportunities"),
        api<{ profile: Profile | null }>("/profile"),
      ]);
      setFeed(f);
      setProfile(p.profile);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(o: OpportunitySummary) {
    try {
      await api("/saves/" + o.id, {
        method: o.saved ? "DELETE" : "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>YOUR PERSPECTIVE</Eyebrow>
          <h1>
            {profile
              ? `${profile.companyName}, in focus.`
              : "Good things start with focus."}
          </h1>
          <p>
            {profile
              ? "A starting point for your next opportunity."
              : "Tell us about your business to make these matches yours."}
          </p>
        </div>
        <Link to="/app/profile" className="button outline small">
          {profile ? "Edit your profile" : "Build your profile"}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <ErrorMessage message={error} />
      <div className="dashboard-stats">
        <div>
          <span className="micro">AVAILABLE REFERENCES</span>
          <strong>{feed?.opportunities.length ?? "—"}</strong>
          <span>Published notices & funding references</span>
        </div>
        <div>
          <span className="micro">YOUR SHORTLIST</span>
          <strong>
            {feed?.opportunities.filter((o) => o.saved).length ?? "—"}
          </strong>
          <Link to="/app/saved">Revisit your saved opportunities ↗</Link>
        </div>
        <div>
          <span className="micro">
            {account.plan === "trial" ? "YOUR TRIAL" : "MONTHLY ANALYSES"}
          </span>
          <strong>
            {account.plan === "trial"
              ? Math.max(
                  0,
                  Math.ceil(
                    (new Date(account.trialEndsAt!).getTime() - Date.now()) /
                      86400000,
                  ),
                ) + " days"
              : `${account.analysesUsed} / 3`}
          </strong>
          <span>
            {account.plan === "trial"
              ? `Ends ${date(account.trialEndsAt)} · no charge`
              : "UTC calendar month · Free plan"}
          </span>
        </div>
      </div>
      {!profile && (
        <div className="onboarding-callout">
          <Building2 size={30} />
          <div>
            <h3>Start with what makes your business, yours.</h3>
            <p>
              A short profile gives every recommendation a more useful context.
            </p>
          </div>
          <Link to="/app/profile" className="button forest small">
            Create profile <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <div className="section-row">
        <div>
          <Eyebrow>WORTH A CLOSER LOOK</Eyebrow>
          <h2>{profile ? "Your leading matches" : "Explore the catalogue"}</h2>
        </div>
        <Link className="text-link" to="/app/opportunities">
          View all <ArrowUpRight size={17} />
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
          <ScanLine size={28} />
          <h3>No records imported yet.</h3>
          <p>
            The operator can seed official funding references and run the TED
            import. Try the fictional public demo in the meantime.
          </p>
          <Link to="/demo">Explore demo ↗</Link>
        </div>
      )}
      <div className="dashboard-principle">
        <FileCheck2 size={22} />
        <div>
          <h3>Relevant doesn’t mean eligible.</h3>
          <p>
            Open an opportunity to see source evidence, explicit conditions and
            the information that still needs confirmation.
          </p>
        </div>
        <Link to="/how-it-works">
          <ArrowUpRight size={20} />
          <span className="sr-only">How matching works</span>
        </Link>
      </div>
    </>
  );
}
function SourceNotice({ feed }: { feed: Feed | null }) {
  const failed = feed?.sources.find((s) => s.source === "TED");
  return (
    <div
      className={
        "source-notice " + (failed?.status === "failed" ? "warning" : "")
      }
    >
      <span className="tiny-dot" />
      <span>
        {failed?.status === "failed"
          ? "Latest TED import failed. Prior records are retained and may be stale."
          : failed?.status === "success"
            ? `TED metadata last imported ${date(failed.started_at)}. Published does not mean open.`
            : "No live TED sync is recorded here. Any TED records shown are cached imports."}{" "}
        Funding opening status requires confirmation.
      </span>
      <Link to="/sources">Coverage ↗</Link>
    </div>
  );
}
export function Opportunities({ savedOnly = false }: { savedOnly?: boolean }) {
  const [feed, setFeed] = useState<Feed | null>(null),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [type, setType] = useState("all"),
    [deadline, setDeadline] = useState("all"),
    [sector, setSector] = useState(""),
    [source, setSource] = useState(""),
    [fit, setFit] = useState("0"),
    [maxValue, setMaxValue] = useState(""),
    [location, setLocation] = useState(""),
    [showSaved, setShowSaved] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [sectors, setSectors] = useState<string[]>([]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const p = new URLSearchParams({
          q,
          type,
          deadline,
          minScore: fit,
          ...(savedOnly || showSaved ? { saved: "true" } : {}),
          ...(sector ? { sector } : {}),
          ...(source ? { source } : {}),
          ...(location ? { location } : {}),
          ...(maxValue ? { maxValue } : {}),
        });
        const data = await api<Feed>("/opportunities?" + p, { signal });
        setFeed(data);
        setError("");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      }
    },
    [
      q,
      type,
      deadline,
      fit,
      savedOnly,
      showSaved,
      sector,
      source,
      location,
      maxValue,
    ],
  );
  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => void load(ac.signal), 180);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [load]);
  useEffect(() => {
    void api<Feed>("/opportunities")
      .then((f) =>
        setSectors([...new Set(f.opportunities.map((o) => o.sector))]),
      )
      .catch(() => {});
  }, []);
  async function save(o: OpportunitySummary) {
    try {
      await api("/saves/" + o.id, {
        method: o.saved ? "DELETE" : "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>
            {savedOnly ? "YOUR SHORTLIST" : "THE OPPORTUNITY LANDSCAPE"}
          </Eyebrow>
          <h1>
            {savedOnly
              ? "Possibilities, kept close."
              : "See what’s within reach."}
          </h1>
          <p>
            {savedOnly
              ? "Your saved records stay here between sessions."
              : "Ranked for relevance. Grounded in original sources."}
          </p>
        </div>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search opportunities"
            placeholder="Search opportunities, buyers, subjects…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Opportunity type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            <option value="tender">Public tenders</option>
            <option value="grant">Grants</option>
            <option value="tax_credit">Tax credits</option>
          </select>
        </label>
        <button
          className={"button outline small " + (advanced ? "active" : "")}
          onClick={() => setAdvanced(!advanced)}
          aria-expanded={advanced}
        >
          <SlidersHorizontal size={17} />
          Filters
        </button>
      </div>
      {advanced && (
        <div className="advanced-filters">
          <label>
            Deadline
            <select
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            >
              <option value="all">Any / unconfirmed</option>
              <option value="upcoming">Upcoming, known date</option>
              <option value="unknown">Unknown deadline</option>
            </select>
          </label>
          <label>
            Sector
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">All sectors</option>
              {sectors.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {["TED", "FONDI", "Malta Enterprise", "SEM"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Geography
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">All locations</option>
              <option>Malta</option>
              <option>EU</option>
            </select>
          </label>
          <label>
            Minimum relevance
            <select value={fit} onChange={(e) => setFit(e.target.value)}>
              <option value="0">Any fit</option>
              <option value="30">30% and above</option>
              <option value="60">60% and above</option>
            </select>
          </label>
          <label>
            Maximum known value (€)
            <input
              type="number"
              min="0"
              value={maxValue}
              onChange={(e) => setMaxValue(e.target.value)}
              placeholder="No limit"
            />
          </label>
          {!savedOnly && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showSaved}
                onChange={(e) => setShowSaved(e.target.checked)}
              />
              Saved only
            </label>
          )}
        </div>
      )}
      <ErrorMessage message={error} />
      <SourceNotice feed={feed} />
      <div className="feed-count">
        <span>
          {feed?.opportunities.length ?? "…"}{" "}
          {savedOnly ? "saved opportunities" : "records in view"}
        </span>
        <span>Ordered by relevance ↓</span>
      </div>
      {!feed ? (
        <Loading />
      ) : feed.opportunities.length ? (
        <div className="opportunity-grid">
          {feed.opportunities.map((o) => (
            <OpportunityCard key={o.id} o={o} onSave={save} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ScanLine size={30} />
          <h2>
            {savedOnly
              ? "Your shortlist starts here."
              : "Nothing in this view yet."}
          </h2>
          <p>
            {savedOnly
              ? "Save an opportunity from Discover to keep it close."
              : "Try a broader filter. Some source deadlines are unknown."}
          </p>
          {savedOnly && (
            <Link className="button forest small" to="/app/opportunities">
              Discover opportunities <ArrowRight size={16} />
            </Link>
          )}
        </div>
      )}
    </>
  );
}
export function OpportunityDetail() {
  const { id } = useParams(),
    [o, setO] = useState<Ranked | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const { refresh } = useAccount();
  useEffect(() => {
    setO(null);
    setLoading(true);
    setError("");
    api<{ opportunity: Ranked }>(
      "/opportunities/" + encodeURIComponent(id || ""),
    )
      .then((r) => {
        setO(r.opportunity);
        return refresh();
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, refresh]);
  async function save() {
    if (!o) return;
    try {
      await api("/saves/" + o.id, {
        method: o.saved ? "DELETE" : "POST",
        body: "{}",
      });
      setO({ ...o, saved: !o.saved });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Link className="text-link back-link" to="/app/opportunities">
        <ArrowLeft size={16} />
        Back to opportunities
      </Link>
      <ErrorMessage message={error} />
      {loading ? (
        <Loading />
      ) : o ? (
        <>
          <div className="detail-header">
            <div className="row">
              <Tag>
                {o.type === "tax_credit"
                  ? "Tax credit"
                  : o.type === "tender"
                    ? "Public tender"
                    : "Funding programme"}
              </Tag>
              <span className="micro">
                {o.geography} / {o.source}
              </span>
            </div>
            <h1>{o.title}</h1>
            <p>{o.buyer}</p>
            <div className="detail-meta">
              <span>{money(o.value)}</span>
              <span>Deadline: {date(o.deadline)}</span>
              <button
                className={"button small " + (o.saved ? "outline" : "forest")}
                onClick={save}
              >
                <Bookmark size={16} fill={o.saved ? "currentColor" : "none"} />
                {o.saved ? "Saved · remove" : "Save opportunity"}
              </button>
            </div>
          </div>
          <div className="source-notice warning">
            <span className="tiny-dot" />
            {o.freshness}
          </div>
          <div className="detail-summary">
            <span className="micro">IN BRIEF</span>
            <p>{o.description}</p>
          </div>
          <EvidencePanel o={o} match={o.match} />
        </>
      ) : (
        <div className="empty-state">
          <h2>This analysis isn’t available.</h2>
          <Link className="button forest small" to="/app/settings">
            View your plan <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
    </>
  );
}
export function ProfileEditor() {
  const [p, setP] = useState<Profile>(emptyProfile),
    [loaded, setLoaded] = useState(false),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    api<{ profile: Profile | null }>("/profile")
      .then((r) => {
        if (r.profile) setP(r.profile);
        setLoaded(true);
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    const valid = profileSchema.safeParse(p);
    if (!valid.success) {
      setError(valid.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      await api("/profile", {
        method: "PUT",
        body: JSON.stringify(valid.data),
      });
      setSaved(true);
      navigate("/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const number = (value: string) => (value === "" ? null : Number(value));
  if (!loaded && !error) return <Loading />;
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>YOUR BUSINESS, IN CONTEXT</Eyebrow>
          <h1>
            The better we know you,
            <br />
            the clearer the view.
          </h1>
          <p>Tell us what you know. Leave uncertain information blank.</p>
        </div>
      </div>
      <div className="profile-layout">
        <aside className="profile-progress">
          {[
            "Business & services",
            "Experience & credentials",
            "People & capacity",
            "Commercial preferences",
          ].map((s, i) => (
            <button
              key={s}
              className={step === i ? "active" : ""}
              onClick={() => setStep(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s}
            </button>
          ))}
          <p>
            Your declared details guide relevance. They are not independently
            verified.
          </p>
        </aside>
        <form className="profile-form" onSubmit={submit}>
          <span className="micro">STEP {step + 1} OF 4</span>
          <h2>
            {
              [
                "Start with your strengths.",
                "What have you built on?",
                "Room to take on more.",
                "The right kind of opportunity.",
              ][step]
            }
          </h2>
          <ErrorMessage message={error} />
          {saved && <p role="status">Profile saved.</p>}
          {step === 0 && (
            <>
              <label>
                Business name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={p.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  placeholder="Your registered or trading name"
                />
              </label>
              <label>
                Services
                <span className="label-hint">
                  Separate each service with a comma
                </span>
                <CommaInput
                  value={p.services}
                  onChange={(v) => update("services", v)}
                  required
                  placeholder="Research, policy analysis, web development"
                />
              </label>
              <label>
                Sectors
                <span className="label-hint">
                  Separate each sector with a comma
                </span>
                <CommaInput
                  value={p.sectors}
                  onChange={(v) => update("sectors", v)}
                  placeholder="Research, digital, hospitality"
                />
              </label>
              <label>
                Business experience
                <textarea
                  rows={4}
                  maxLength={3000}
                  value={p.experience}
                  onChange={(e) => update("experience", e.target.value)}
                  placeholder="What do you specialise in? What experience would you bring?"
                />
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <label>
                Relevant past projects
                <textarea
                  rows={4}
                  maxLength={3000}
                  value={p.projects}
                  onChange={(e) => update("projects", e.target.value)}
                  placeholder="Briefly describe relevant work. Omit confidential client details."
                />
              </label>
              <div className="section-row">
                <h3>Qualifications & certificates</h3>
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    update("qualifications", [
                      ...p.qualifications,
                      { name: "", acquiredAt: null, expiresAt: null },
                    ])
                  }
                  disabled={p.qualifications.length >= 20}
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
              {!p.qualifications.length && (
                <p className="muted small-text">
                  No credentials recorded. Missing credentials will be marked
                  unknown.
                </p>
              )}
              {p.qualifications.map((q, i) => (
                <div className="credential-row" key={i}>
                  <label>
                    Name
                    <input
                      value={q.name}
                      required
                      maxLength={120}
                      onChange={(e) =>
                        update(
                          "qualifications",
                          p.qualifications.map((c, j) =>
                            j === i ? { ...c, name: e.target.value } : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Acquired (optional)
                    <input
                      type="date"
                      value={q.acquiredAt || ""}
                      onChange={(e) =>
                        update(
                          "qualifications",
                          p.qualifications.map((c, j) =>
                            j === i
                              ? { ...c, acquiredAt: e.target.value || null }
                              : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Expires (optional)
                    <input
                      type="date"
                      value={q.expiresAt || ""}
                      onChange={(e) =>
                        update(
                          "qualifications",
                          p.qualifications.map((c, j) =>
                            j === i
                              ? { ...c, expiresAt: e.target.value || null }
                              : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={"Remove qualification " + (i + 1)}
                    onClick={() =>
                      update(
                        "qualifications",
                        p.qualifications.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </>
          )}
          {step === 2 && (
            <>
              <div className="form-grid">
                <label>
                  Permanent staff
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={p.staff ?? ""}
                    onChange={(e) => update("staff", number(e.target.value))}
                    placeholder="Unknown"
                  />
                </label>
                <label>
                  Contractors
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={p.contractors ?? ""}
                    onChange={(e) =>
                      update("contractors", number(e.target.value))
                    }
                    placeholder="Unknown"
                  />
                </label>
              </div>
              <label>
                Available capacity (full-time equivalents)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  max="10000"
                  value={p.capacity ?? ""}
                  onChange={(e) => update("capacity", number(e.target.value))}
                  placeholder="Unknown"
                />
              </label>
              <label>
                Annual turnover band
                <select
                  value={p.turnover}
                  onChange={(e) =>
                    update("turnover", e.target.value as Profile["turnover"])
                  }
                >
                  <option value="unknown">Prefer to leave unknown</option>
                  <option value="under50k">Under €50,000</option>
                  <option value="50k-250k">€50,000–€250,000</option>
                  <option value="250k-1m">€250,000–€1 million</option>
                  <option value="1m-5m">€1–5 million</option>
                  <option value="over5m">Over €5 million</option>
                </select>
              </label>
              <p className="notice">
                Only financial bands are needed. Do not share accounts, tax
                records or bank details.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <fieldset>
                <legend>Preferred geography</legend>
                <div className="row">
                  {(["Malta", "EU"] as const).map((g) => (
                    <label key={g} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={p.geographies.includes(g)}
                        onChange={(e) =>
                          update(
                            "geographies",
                            e.target.checked
                              ? [...p.geographies, g]
                              : p.geographies.filter((v) => v !== g),
                          )
                        }
                      />
                      {g === "EU" ? "European Union" : g}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="form-grid">
                <label>
                  Minimum project value (€)
                  <input
                    type="number"
                    min="0"
                    max="10000000000"
                    value={p.minValue}
                    onChange={(e) => update("minValue", Number(e.target.value))}
                    required
                  />
                </label>
                <label>
                  Maximum project value (€)
                  <input
                    type="number"
                    min={p.minValue}
                    max="10000000000"
                    value={p.maxValue}
                    onChange={(e) => update("maxValue", Number(e.target.value))}
                    required
                  />
                </label>
              </div>
              <label>
                Intended role
                <select
                  value={p.role}
                  onChange={(e) =>
                    update("role", e.target.value as Profile["role"])
                  }
                >
                  <option value="bidder">Lead bidder</option>
                  <option value="subcontractor">Subcontractor</option>
                  <option value="consortium">Consortium member</option>
                </select>
              </label>
              <label>
                Interested in
                <select
                  value={p.interests}
                  onChange={(e) =>
                    update("interests", e.target.value as Profile["interests"])
                  }
                >
                  <option value="both">Tenders and business funding</option>
                  <option value="tenders">Public tenders</option>
                  <option value="grants">Grants and tax credits</option>
                </select>
              </label>
            </>
          )}
          <div className="profile-form-actions">
            <button
              type="button"
              className="button plain"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button className="button forest" disabled={busy}>
              {busy
                ? "Saving…"
                : step === 3
                  ? "Save & see my matches"
                  : "Continue"}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
function CommaInput({
  value,
  onChange,
  ...props
}: {
  value: string[];
  onChange: (v: string[]) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => {
    setText(value.join(", "));
  }, []);
  return (
    <input
      {...props}
      value={text}
      maxLength={2000}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
export function SettingsPage() {
  const { account, refresh } = useAccount(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  async function trial() {
    setBusy(true);
    try {
      await api("/trial", { method: "POST", body: "{}" });
      await refresh();
      setMessage("Your seven-day trial has started. No card or charge.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    try {
      await api("/profile", { method: "DELETE", body: "{}" });
      setConfirm(false);
      setMessage(
        "Your business profile has been deleted. Your saved records remain.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>ACCOUNT & PLAN</Eyebrow>
          <h1>Always in your hands.</h1>
          <p>Your account, access and business information.</p>
        </div>
      </div>
      <ErrorMessage message={error} />
      {message && (
        <div className="success" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      <div className="settings-grid">
        <section className="settings-card">
          <span className="micro">YOUR CURRENT PLAN</span>
          <div className="row space-between">
            <h2>{account.plan === "trial" ? "Seven-day trial" : "Free"}</h2>
            <Tag>{account.plan === "trial" ? "ACTIVE" : "€0 / MONTH"}</Tag>
          </div>
          {account.plan === "trial" ? (
            <>
              <p>
                Started {date(account.trialStartedAt)}. Ends{" "}
                {date(account.trialEndsAt)} (UTC), then Free applies
                automatically.
              </p>
              <p>
                Unlimited detailed analyses and saves within reasonable request
                limits. No payment method. Nothing to cancel.
              </p>
            </>
          ) : (
            <>
              <p>
                {account.analysesUsed} of 3 detailed analyses used this UTC
                calendar month. Up to 5 saved opportunities.
              </p>
              {account.trialAvailable ? (
                <button
                  className="button forest small"
                  disabled={busy}
                  onClick={trial}
                >
                  Start 7-day trial <ArrowUpRight size={16} />
                </button>
              ) : (
                <p className="notice">
                  Your trial has ended. Your profile and saved records remain
                  available on Free.
                </p>
              )}
            </>
          )}
          <div className="plan-unavailable">
            <span className="micro">PAID SUBSCRIPTIONS</span>
            <p>
              Unavailable in this prototype. No checkout or recurring billing is
              enabled.
            </p>
            <Link to="/pricing">View experimental plans ↗</Link>
          </div>
        </section>
        <section className="settings-card">
          <span className="micro">YOUR ACCOUNT</span>
          <h2>Business, kept personal.</h2>
          <label>
            Email address
            <input value={account.email} readOnly />
          </label>
          <p className="small-text muted">
            Email changes and password recovery require an operator in this
            local prototype. No customer communications are sent.
          </p>
          <hr />
          <h3>Your business profile</h3>
          <p>
            Export or delete the structured information used to make your
            matches.
          </p>
          <a href="/api/profile/export" className="button outline small">
            <Download size={16} />
            Export profile JSON
          </a>
          {confirm ? (
            <div className="delete-confirm">
              <p>
                Delete your profile permanently? Your account and saved
                opportunities will remain.
              </p>
              <button className="button danger small" onClick={remove}>
                Delete profile
              </button>
              <button
                className="button plain small"
                onClick={() => setConfirm(false)}
              >
                Keep profile
              </button>
            </div>
          ) : (
            <button
              className="text-link delete-link"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={15} />
              Delete business profile
            </button>
          )}
        </section>
      </div>
      <p className="small-text muted">
        Account created for evaluation. See{" "}
        <Link to="/privacy">privacy and data limitations</Link> before entering
        sensitive information.
      </p>
    </>
  );
}
