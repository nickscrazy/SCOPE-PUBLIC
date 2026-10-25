import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, ArrowLeft, MailCheck } from "lucide-react";
import { Logo, Eyebrow, ErrorMessage } from "./components";
import { post } from "./api";

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <Logo light />
        <div>
          <Eyebrow light>TENDERS + FUNDING / MALTA</Eyebrow>
          <h1>
            Ambition,
            <br />
            with a clearer
            <br />
            <span>direction.</span>
          </h1>
          <p>The next opportunity begins with the business you’ve already built.</p>
          <div className="auth-brand-line" />
        </div>
        <span className="micro">INDEPENDENT · NO OFFICIAL AFFILIATION</span>
      </aside>
      <main className="auth-main" id="main">
        <Link to="/" className="text-link">
          <ArrowLeft size={16} />
          Back to SCOPE
        </Link>
        {children}
        <div className="auth-bottom">SCOPE · Business opportunity intelligence</div>
      </main>
    </div>
  );
}
export function PasswordField({
  value,
  onChange,
  autoComplete,
  label = "Password",
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="label-row">
        {label}
      </label>
      {autoComplete === "new-password" && (
        <span className="label-hint" id={id + "-hint"}>
          At least 12 characters. A memorable phrase works well.
        </span>
      )}
      <span className="password-field">
        <input
          id={id}
          aria-describedby={autoComplete === "new-password" ? id + "-hint" : undefined}
          name="password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={autoComplete === "new-password" ? 12 : 1}
          maxLength={128}
        />
        <button
          type="button"
          className="reveal"
          onClick={() => setShow(!show)}
          aria-pressed={show}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? "Hide" : "Show"}
        </button>
      </span>
    </div>
  );
}
export function AuthPage({ mode }: { mode: "signup" | "login" }) {
  const signup = mode === "signup",
    [params] = useSearchParams(),
    free = params.get("plan") === "free",
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/auth/" + (signup ? "register" : "login"), signup ? { email, password, startTrial: !free } : { email, password });
      navigate(signup ? "/app/profile?welcome=1" : "/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <Eyebrow>{signup ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</Eyebrow>
        <h2>{signup ? (free ? "A focused place to start." : "Find your scope.") : "Back in perspective."}</h2>
        <p>
          {signup
            ? free
              ? "Create a Free account. You can start your seven-day trial later."
              : "Seven days of full access, starting when you confirm your email. No card, no automatic charge."
            : "Log in to your opportunities, just as you left them."}
        </p>
        <ErrorMessage message={error} />
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourbusiness.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
          />
        </label>
        <PasswordField value={password} onChange={setPassword} autoComplete={signup ? "new-password" : "current-password"} />
        {!signup && (
          <Link className="small-link" to="/forgot-password">
            Forgotten your password?
          </Link>
        )}
        {signup && (
          <p className="small-text muted">
            By creating an account you agree to the <Link to="/terms">terms</Link> and acknowledge the{" "}
            <Link to="/privacy">privacy notice</Link>. We’ll email you a link to confirm your address.
          </p>
        )}
        <button className="button forest full-width" disabled={busy}>
          {busy ? "One moment…" : signup ? (free ? "Create Free account" : "Start my 7-day trial") : "Log in"}
          <ArrowRight size={18} />
        </button>
        <p className="auth-switch">
          {signup ? "Already have an account?" : "New to SCOPE?"}{" "}
          <Link to={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Create an account"}</Link>
        </p>
        {signup && (
          <div className="auth-points">
            <span>
              <Check size={14} />
              No card required
            </span>
            <span>
              <Check size={14} />
              Export or delete your data any time
            </span>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
export function ForgotPassword() {
  const [email, setEmail] = useState(""),
    [done, setDone] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await post<{ message: string }>("/auth/forgot-password", { email });
      setDone(r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <Eyebrow>ACCOUNT RECOVERY</Eyebrow>
        <h2>Reset your password.</h2>
        <p>Enter the email address on your account. We’ll send a link that works once and expires in an hour.</p>
        <ErrorMessage message={error} />
        {done ? (
          <div className="success" role="status">
            <MailCheck size={18} />
            {done}
          </div>
        ) : (
          <>
            <label>
              Email address
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
            </label>
            <button className="button forest full-width" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
              <ArrowRight size={18} />
            </button>
          </>
        )}
        <p className="auth-switch">
          Remembered it? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
export function ResetPassword() {
  const [params] = useSearchParams(),
    token = params.get("token") || "",
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <Eyebrow>ACCOUNT RECOVERY</Eyebrow>
        <h2>Choose a new password.</h2>
        <ErrorMessage message={error} />
        {done ? (
          <>
            <div className="success" role="status">
              <Check size={18} />
              Your password has been changed and every session was signed out.
            </div>
            <Link className="button forest full-width" to="/login">
              Log in <ArrowRight size={18} />
            </Link>
          </>
        ) : !/^[a-f0-9]{64}$/.test(token) ? (
          <p>
            This reset link is incomplete. <Link to="/forgot-password">Request a new one</Link>.
          </p>
        ) : (
          <>
            <p>For your security, every device signed in to your account will be signed out.</p>
            <PasswordField value={password} onChange={setPassword} autoComplete="new-password" label="New password" />
            <button className="button forest full-width" disabled={busy}>
              {busy ? "Saving…" : "Set new password"}
              <ArrowRight size={18} />
            </button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
export function VerifyEmail() {
  const [params] = useSearchParams(),
    token = params.get("token") || "",
    [state, setState] = useState<"working" | "done" | "error">("working"),
    [message, setMessage] = useState(""),
    started = useRef(false);
  useEffect(() => {
    // Strict mode mounts twice in development; a token is single-use.
    if (started.current) return;
    started.current = true;
    post<{ trialStarted: boolean; purpose: string }>("/auth/verify-email", { token })
      .then((r) => {
        setState("done");
        setMessage(
          r.purpose === "change_email"
            ? "Your new email address is confirmed."
            : r.trialStarted
              ? "Your email is confirmed and your seven-day trial has started."
              : "Your email is confirmed.",
        );
      })
      .catch((e) => {
        setState("error");
        setMessage((e as Error).message);
      });
  }, [token]);
  return (
    <AuthLayout>
      <div className="auth-form">
        <Eyebrow>EMAIL CONFIRMATION</Eyebrow>
        <h2>{state === "working" ? "Confirming…" : state === "done" ? "You’re confirmed." : "That link didn’t work."}</h2>
        {state === "done" && (
          <>
            <div className="success" role="status">
              <MailCheck size={18} />
              {message}
            </div>
            <Link className="button forest full-width" to="/app">
              Continue to SCOPE <ArrowRight size={18} />
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <ErrorMessage message={message} />
            <p>Log in and request a new confirmation email from your account.</p>
            <Link className="button outline full-width" to="/app/settings">
              Go to account settings
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
