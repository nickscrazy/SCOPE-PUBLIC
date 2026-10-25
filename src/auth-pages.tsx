import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, ArrowLeft } from "lucide-react";
import { Logo, Eyebrow, ErrorMessage } from "./components";
import { api } from "./api";
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
      await api("/auth/" + (signup ? "register" : "login"), {
        method: "POST",
        body: JSON.stringify({ email, password, startTrial: !free }),
      });
      navigate(signup ? "/app/profile" : "/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <Logo light />
        <div>
          <Eyebrow light>MADE FOR YOUR NEXT CHAPTER</Eyebrow>
          <h1>
            Ambition,
            <br />
            with a clearer
            <br />
            <span>direction.</span>
          </h1>
          <p>
            The next opportunity begins with the business you’ve already built.
          </p>
          <div className="auth-brand-line" />
        </div>
        <span className="micro">INDEPENDENT INTELLIGENCE / MALTA + EU</span>
      </aside>
      <main className="auth-main">
        <Link to="/" className="text-link">
          <ArrowLeft size={16} />
          Back to SCOPE
        </Link>
        <form className="auth-form" onSubmit={submit}>
          <Eyebrow>{signup ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</Eyebrow>
          <h2>
            {signup
              ? free
                ? "A focused place to start."
                : "Find your scope."
              : "Back in perspective."}
          </h2>
          <p>
            {signup
              ? free
                ? "Create your Free account. Your seven-day trial can start later."
                : "Seven days of full access. No card. No automatic charge."
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
          <label>
            Password<span className="label-hint">At least 12 characters</span>
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          {signup && (
            <p className="small-text muted">
              By creating an account, you agree to the{" "}
              <Link to="/terms">evaluation terms</Link> and acknowledge the{" "}
              <Link to="/privacy">privacy notice</Link>. Use authorised business
              information only.
            </p>
          )}
          <button className="button forest full-width" disabled={busy}>
            {busy
              ? "One moment…"
              : signup
                ? free
                  ? "Create Free account"
                  : "Start my 7-day trial"
                : "Log in"}
            <ArrowRight size={18} />
          </button>
          <p className="auth-switch">
            {signup ? "Already have an account?" : "New to SCOPE?"}{" "}
            <Link to={signup ? "/login" : "/signup"}>
              {signup ? "Log in" : "Create an account"}
            </Link>
          </p>
          {signup && (
            <div className="auth-points">
              <span>
                <Check size={14} />
                Real business matching
              </span>
              <span>
                <Check size={14} />
                Your data stays in your account
              </span>
            </div>
          )}
        </form>
        <div className="auth-bottom">
          SCOPE · Business opportunity intelligence
        </div>
      </main>
    </div>
  );
}
