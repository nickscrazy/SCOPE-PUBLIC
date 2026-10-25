import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  Link,
} from "react-router-dom";
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
  PublicLayout,
} from "./public-pages";
import { AuthPage } from "./auth-pages";
import {
  AppLayout,
  Dashboard,
  ProfileEditor,
  Opportunities,
  OpportunityDetail,
  SettingsPage,
} from "./app-pages";
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
        <p>
          Please reload to try again. Your saved records are stored securely on
          the server.
        </p>
        <a href="/" className="button forest">
          Return to SCOPE
        </a>
      </div>
    ) : (
      this.props.children
    );
  }
}
function ScrollReset() {
  const l = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const titles: Record<string, string> = {
      "/": "Opportunity, in perspective.",
      "/pricing": "Plans & pricing",
      "/demo": "Explore the demo",
      "/how-it-works": "How it works",
      "/sources": "Sources & coverage",
    };
    document.title = `SCOPE — ${titles[l.pathname] || "Your workspace"}`;
  }, [l.pathname]);
  return null;
}
function Root() {
  return (
    <BrowserRouter>
      <ScrollReset />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<ProfileEditor />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="opportunities/:id" element={<OpportunityDetail />} />
          <Route path="saved" element={<Opportunities savedOnly />} />
          <Route path="settings" element={<SettingsPage />} />
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
