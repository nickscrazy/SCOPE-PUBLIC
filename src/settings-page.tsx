import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Download, Trash2, LogOut, MonitorSmartphone } from "lucide-react";
import { useAccount } from "./app-pages";
import { api, date, dateTime, post, usePublicConfig } from "./api";
import { Eyebrow, ErrorMessage, Success, Tag } from "./components";
import { PasswordField } from "./auth-pages";

type Session = { id: string; client: string; createdAt: string | null; lastSeenAt: string | null; current: boolean };

function PlanCard() {
  const { account, refresh } = useAccount();
  const config = usePublicConfig();
  const [params] = useSearchParams();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(
      params.get("billing") === "success"
        ? "Thank you. Your plan updates as soon as the payment provider confirms the subscription — usually within a minute."
        : params.get("billing") === "cancelled"
          ? "Checkout was cancelled. Nothing was charged."
          : "",
    ),
    [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const startTrial = () =>
    act(async () => {
      await post("/trial");
      await refresh();
      setMessage("Your seven-day trial has started. No card or charge.");
    });
  const checkout = () =>
    act(async () => {
      const r = await post<{ url: string }>("/billing/checkout");
      window.location.assign(r.url);
    });
  const portal = () =>
    act(async () => {
      const r = await post<{ url: string }>("/billing/portal");
      window.location.assign(r.url);
    });
  const sub = account.subscription;
  return (
    <section className="settings-card" aria-labelledby="plan-heading">
      <span className="micro">YOUR CURRENT PLAN</span>
      <div className="row space-between">
        <h2 id="plan-heading">{account.plan === "solo" ? "Solo" : account.plan === "trial" ? "Seven-day trial" : "Free"}</h2>
        <Tag>{account.plan === "free" ? "€0 / MONTH" : account.plan === "trial" ? "TRIAL · NO CHARGE" : sub?.cancelAtPeriodEnd ? "ENDS AT PERIOD END" : sub?.status.toUpperCase()}</Tag>
      </div>
      <ErrorMessage message={error} />
      <Success message={message} />
      {account.plan === "trial" && (
        <p>
          Started {date(account.trialStartedAt)}. Ends {date(account.trialEndsAt)} (UTC), then Free applies automatically. Unlimited detailed analyses and saves within fair-use limits. Nothing to cancel.
        </p>
      )}
      {account.plan === "free" && (
        <>
          <p>
            {account.analysesUsed} of {account.analysesLimit} detailed analyses used this calendar month (UTC). Up to {account.savesLimit} saved opportunities.
          </p>
          {account.trialAvailable &&
            (account.emailVerified ? (
              <button className="button forest small" disabled={busy} onClick={startTrial}>
                Start 7-day trial <ArrowUpRight size={16} aria-hidden />
              </button>
            ) : (
              <p className="notice">Confirm your email address to start your seven-day trial.</p>
            ))}
          {!account.trialAvailable && <p className="notice">Your trial has ended. Your profile and saved records remain available on Free.</p>}
        </>
      )}
      {account.plan === "solo" && sub && (
        <p>
          Status: {sub.status.replace("_", " ")}.{" "}
          {sub.currentPeriodEnd && (sub.cancelAtPeriodEnd ? `Access continues until ${date(sub.currentPeriodEnd)}.` : `Renews ${date(sub.currentPeriodEnd)}.`)}
          {sub.status === "past_due" && " Your last payment failed — update your payment method to keep access."}
        </p>
      )}
      <div className="plan-unavailable">
        <span className="micro">SOLO · {config?.soloPriceLabel ?? "€19"} / MONTH</span>
        {config?.billingEnabled ? (
          account.plan === "solo" || sub ? (
            <button className="button outline small" disabled={busy} onClick={portal}>
              Manage billing <ArrowUpRight size={16} aria-hidden />
            </button>
          ) : (
            <>
              <p>Unlimited detailed analyses and saves. Cancel any time from the billing portal. VAT may apply; the final price is shown at checkout.</p>
              <button className="button forest small" disabled={busy || !account.emailVerified} onClick={checkout}>
                Upgrade to Solo <ArrowUpRight size={16} aria-hidden />
              </button>
              {!account.emailVerified && <p className="small-text muted">Confirm your email address first.</p>}
            </>
          )
        ) : (
          <p>Paid subscriptions are not yet available on this service. Nothing will be charged. Free and the trial are fully functional.</p>
        )}
        <Link to="/pricing">Compare plans</Link>
      </div>
    </section>
  );
}
function SecurityCard() {
  const { account, refresh } = useAccount();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [newEmail, setNewEmail] = useState(""),
    [emailPassword, setEmailPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const loadSessions = useCallback(async () => {
    try {
      setSessions((await api<{ sessions: Session[] }>("/account/sessions")).sessions);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);
  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card" aria-labelledby="security-heading">
      <span className="micro">SIGN-IN & SECURITY</span>
      <h2 id="security-heading">Your account, protected.</h2>
      <ErrorMessage message={error} />
      <Success message={message} />
      <div className="field-static">
        <span className="field-label">Email address</span>
        <strong>{account.email}</strong>
        <Tag>{account.emailVerified ? "CONFIRMED" : "NOT CONFIRMED"}</Tag>
      </div>
      <details className="settings-disclosure">
        <summary>Change email address</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const r = await post<{ verificationSent: boolean }>("/account/email", { newEmail, password: emailPassword });
              setEmailPassword("");
              return r.verificationSent ? `We sent a confirmation link to ${newEmail}. Your address changes when you open it.` : "Email delivery is not configured on this server.";
            });
          }}
        >
          <label>
            New email address
            <input type="email" autoComplete="email" required maxLength={254} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </label>
          <PasswordField value={emailPassword} onChange={setEmailPassword} autoComplete="current-password" label="Current password" />
          <button className="button outline small" disabled={busy}>
            Send confirmation link
          </button>
        </form>
      </details>
      <details className="settings-disclosure">
        <summary>Change password</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const r = await post<{ otherSessionsRevoked: number }>("/account/password", { currentPassword: current, newPassword: next });
              setCurrent("");
              setNext("");
              await loadSessions();
              await refresh();
              return `Password changed. ${r.otherSessionsRevoked} other session${r.otherSessionsRevoked === 1 ? "" : "s"} signed out.`;
            });
          }}
        >
          <PasswordField value={current} onChange={setCurrent} autoComplete="current-password" label="Current password" />
          <PasswordField value={next} onChange={setNext} autoComplete="new-password" label="New password" />
          <button className="button outline small" disabled={busy}>
            Change password
          </button>
        </form>
      </details>
      <h3>Signed-in devices</h3>
      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.id}>
            <MonitorSmartphone size={18} aria-hidden />
            <span>
              <strong>{s.client}</strong>
              {s.current && <Tag>THIS DEVICE</Tag>}
              <small>Last active {dateTime(s.lastSeenAt)}</small>
            </span>
            {!s.current && (
              <button
                className="text-link"
                onClick={() =>
                  act(async () => {
                    await api("/account/sessions/" + s.id, { method: "DELETE", body: "{}" });
                    await loadSessions();
                    return "Device signed out.";
                  })
                }
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <button
          className="button outline small"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const r = await post<{ revoked: number }>("/account/sessions/revoke-others");
              await loadSessions();
              return `${r.revoked} other session${r.revoked === 1 ? "" : "s"} signed out.`;
            })
          }
        >
          <LogOut size={15} aria-hidden /> Sign out everywhere else
        </button>
      )}
      <p className="small-text muted">
        Forgotten your password? <button className="inline-link" onClick={async () => { await post("/auth/logout"); navigate("/forgot-password"); }}>Reset it</button>.
      </p>
    </section>
  );
}
function DataCard() {
  const navigate = useNavigate();
  const [confirmProfile, setConfirmProfile] = useState(false),
    [deleting, setDeleting] = useState(false),
    [password, setPassword] = useState(""),
    [typed, setTyped] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function deleteProfile() {
    try {
      await api("/profile", { method: "DELETE", body: "{}" });
      setConfirmProfile(false);
      setMessage("Your business profile has been deleted. Your account and saved records remain.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/account", { method: "DELETE", body: JSON.stringify({ password, confirm: typed }) });
      navigate("/?account=deleted");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="settings-card" aria-labelledby="data-heading">
      <span className="micro">YOUR DATA</span>
      <h2 id="data-heading">Always in your hands.</h2>
      <ErrorMessage message={error} />
      <Success message={message} />
      <h3>Export</h3>
      <p>Download everything held about your account: profile, saved records, usage, plan, devices and account activity.</p>
      <div className="row">
        <a href="/api/account/export" className="button outline small" download>
          <Download size={16} aria-hidden />
          Export all account data
        </a>
        <a href="/api/profile/export" className="button plain small" download>
          Profile only (JSON)
        </a>
      </div>
      <hr />
      <h3>Business profile</h3>
      {confirmProfile ? (
        <div className="delete-confirm" role="alertdialog" aria-label="Confirm profile deletion">
          <p>Delete your business profile permanently? Your account and saved opportunities remain.</p>
          <button className="button danger small" onClick={deleteProfile}>
            Delete profile
          </button>
          <button className="button plain small" onClick={() => setConfirmProfile(false)}>
            Keep profile
          </button>
        </div>
      ) : (
        <button className="text-link delete-link" onClick={() => setConfirmProfile(true)}>
          <Trash2 size={15} aria-hidden />
          Delete business profile
        </button>
      )}
      <hr />
      <h3>Delete account</h3>
      <p>Permanently deletes your account, profile, saved records, sessions and any subscription link. An active paid subscription is cancelled first. Encrypted backups expire on the schedule in the privacy notice.</p>
      {deleting ? (
        <form className="delete-confirm" onSubmit={deleteAccount}>
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" label="Current password" />
          <label>
            Type DELETE to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" required pattern="DELETE" />
          </label>
          <div className="row">
            <button className="button danger small" disabled={typed !== "DELETE" || !password}>
              Delete my account
            </button>
            <button type="button" className="button plain small" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="text-link delete-link" onClick={() => setDeleting(true)}>
          <Trash2 size={15} aria-hidden />
          Delete account…
        </button>
      )}
    </section>
  );
}
export function SettingsPage() {
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>ACCOUNT & PLAN</Eyebrow>
          <h1>Your account, your terms.</h1>
          <p>Plan, security and the information held about you.</p>
        </div>
      </div>
      <div className="settings-grid">
        <PlanCard />
        <SecurityCard />
        <DataCard />
      </div>
      <p className="small-text muted">
        See the <Link to="/privacy">privacy notice</Link> for retention periods and your rights.
      </p>
    </>
  );
}
