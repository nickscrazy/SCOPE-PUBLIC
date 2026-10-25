import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import "./styles.css";
import {
  Home,
  HowItWorks,
  Pricing,
  Demo,
  Sources,
  Legal,
  Cookies,
  PublicLayout,
} from "./public-pages";
import { AuthPage, ForgotPassword, ResetPassword, VerifyEmail } from "./auth-pages";
import {
  AppLayout,
  Dashboard,
  ProfileEditor,
  Opportunities,
  OpportunityDetail,
  SettingsPage,
} from "./app-pages";
import { AdminPage } from "./admin-page";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="container empty-state">
        <h1>We couldn’t bring this view into focus.</h1>
        <p>Please reload to try again. Your saved records are stored securely on the server.</p>
        <a href="/" className="button forest">
          Return to SCOPE
        </a>
      </div>
    ) : (
      this.props.children
    );
  }
}
const meta: Record<string, [string, string]> = {
  "/": [
    "SCOPE — Public tenders and funding for Maltese businesses",
    "SCOPE finds public tenders and government funding programmes for Malta-based SMEs, ranks them against what your business does and shows the source evidence behind every match.",
  ],
  "/how-it-works": [
    "How SCOPE works — Tender and funding matching",
    "How SCOPE matches public tenders and funding programmes to your business profile, and how it separates relevance from eligibility.",
  ],
  "/pricing": ["Pricing — SCOPE", "Start with a seven-day free trial. Free plan with monthly analyses; paid plan when available."],
  "/demo": ["Interactive demo — SCOPE", "Try SCOPE's matching engine with fictional businesses and opportunities. No account needed."],
  "/sources": ["Sources & coverage — SCOPE", "Which official sources SCOPE uses, how fresh they are, and what is not covered."],
  "/privacy": ["Privacy — SCOPE", "What SCOPE stores, why, for how long, and how to export or delete it."],
  "/terms": ["Terms of use — SCOPE", "Terms for using SCOPE."],
  "/cookies": ["Cookies — SCOPE", "SCOPE uses one strictly necessary session cookie and no tracking."],
  "/signup": ["Create your account — SCOPE", "Create a SCOPE account and start a seven-day trial. No card required."],
  "/login": ["Log in — SCOPE", "Log in to SCOPE."],
};
function RouteEffects() {
  const l = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const [title, description] = meta[l.pathname] || ["SCOPE — Your workspace", meta["/"][1]];
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.origin + l.pathname);
    // Workspace and token pages are private: ask crawlers not to index them.
    const robots = document.querySelector('meta[name="robots"]');
    const isPublic = l.pathname in meta && !["/login", "/signup"].includes(l.pathname);
    robots?.setAttribute("content", isPublic ? "index,follow" : "noindex,nofollow");
  }, [l.pathname]);
  return null;
}
function Root() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<ProfileEditor />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="opportunities/:id" element={<OpportunityDetail />} />
          <Route path="saved" element={<Opportunities savedOnly />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route
          path="*"
          element={
            <PublicLayout>
              <div className="container empty-state">
                <h1>Outside the frame.</h1>
                <p>This page doesn’t exist.</p>
                <Link className="button forest" to="/">
                  Back to SCOPE
                </Link>
              </div>
            </PublicLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>,
);
