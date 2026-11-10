import { Suspense, lazy, useEffect, useState } from "react";
import type { ReactNode } from "react";
import ErrorBoundary from "../components/ErrorBoundary";
import { LogoMark } from "../components/Logo";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import "../styles/auth.css";

const Universe = lazy(() => import("../components/AuthScene"));

/* CSS-only stand-in for environments without WebGL */
function StaticOrb() {
  return (
    <div className="auth-static" aria-hidden="true">
      <div className="auth-static-inner">
        <div className="auth-orb" />
        <div className="auth-orbit o1" />
        <div className="auth-orbit o2" />
        <div className="auth-orbit o3" />
      </div>
    </div>
  );
}

/* ---------- icons ---------- */
const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H6M11 6l-6 6 6 6" />
  </svg>
);
const AlertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </svg>
);
const SparkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5Z" />
    <path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" opacity=".6" />
  </svg>
);
const GraphIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="5" cy="6" r="2.2" />
    <circle cx="19" cy="9" r="2.2" />
    <circle cx="9" cy="18" r="2.2" />
    <path d="m6.8 7.6 9.4 1M7.6 16.5 17.3 11" strokeLinecap="round" />
  </svg>
);
const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

function ShiftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4.5V10h-5.5" />
    </svg>
  );
}

/* ---------- shell ---------- */
type Mode = "login" | "register";

function Frame({ mode, title, sub, children }: { mode: Mode; title: string; sub: ReactNode; children: ReactNode }) {
  const hero =
    mode === "login"
      ? { eyebrow: "Research workspace", lead: <>Pick up where your <em>graph</em> left off.</>, blurb: "Sign in to reconnect every paper, dataset, agent run and result you have already mapped." }
      : { eyebrow: "New workspace", lead: <>Start your research <em>universe</em>.</>, blurb: "One connected graph for papers, datasets, agents and reproducible experiments — seeded with a labelled demo." };

  return (
    <div className="auth">
      <div className="auth-canvas" aria-hidden="true">
        <ErrorBoundary fallback={<StaticOrb />}>
          <Suspense fallback={<StaticOrb />}>
            <Universe />
          </Suspense>
        </ErrorBoundary>
      </div>
      <div className="auth-veil" aria-hidden="true" />

      <div className="auth-inner">
        <header className="auth-top">
          <Link to="/" className="auth-brand">
            <LogoMark size={34} className="auth-mark" title="ResearchGraph" />
            <b>ResearchGraph</b>
            <span>Connected research</span>
          </Link>
          <Link to="/" className="auth-back">
            <BackIcon /> Back to site
          </Link>
        </header>

        <div className="auth-body">
          <motion.section
            className="auth-hero"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="auth-eyebrow"><i /> {hero.eyebrow}</span>
            <h1>{hero.lead}</h1>
            <p>{hero.blurb}</p>
            <ul className="auth-feats">
              <li><b><GraphIcon /></b> Graph-linked papers &amp; datasets <small>12 node types</small></li>
              <li><b><SparkIcon /></b> Specialist agents with approval gates <small>7 agents</small></li>
              <li><b><ShiftIcon /></b> Reproducible runs, saved to memory <small>9 kinds</small></li>
            </ul>
          </motion.section>

          <motion.section
            className="auth-panel"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.85, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="auth-card">
              <h2>{title}</h2>
              <p className="auth-sub">{sub}</p>
              {children}
            </div>
            <p className="auth-legal">
              Sessions secured by Convex Auth · Google OAuth 2.0
            </p>
          </motion.section>
        </div>
      </div>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <motion.p
      className="auth-alert"
      role="alert"
      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
      transition={{ duration: 0.22 }}
    >
      <AlertIcon /> <span>{children}</span>
    </motion.p>
  );
}

/* ---------- google auth ---------- */
function useRedirectIfSignedIn() {
  const nav = useNavigate();
  const { isLoading, isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isLoading && isAuthenticated) nav("/app/dashboard", { replace: true });
  }, [isLoading, isAuthenticated, nav]);
}

function GoogleForm({ cta, foot }: { cta: string; foot: ReactNode }) {
  const { signIn } = useAuthActions();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      await signIn("google", { redirectTo: "/app/dashboard" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Google sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      {err && <Alert>{err}</Alert>}
      <button className="auth-google" type="button" onClick={go} disabled={busy}>
        {busy ? <span className="auth-spin auth-spin-dark" aria-hidden="true" /> : <GoogleMark />}
        <span>{busy ? "Opening Google…" : cta}</span>
        {!busy && <ArrowIcon />}
      </button>

      <ul className="auth-assure">
        <li>Verified by Google — ResearchGraph never sees your password.</li>
        <li>Your workspace is private to your Google account.</li>
        <li>Sessions refresh automatically; sign out from the account menu.</li>
      </ul>

      <p className="auth-foot">
        Only your name, email and profile photo are stored. Your workspace, graph and sources are saved to
        Convex and restored every time you sign in with this Google account.
      </p>
      <p className="auth-foot">{foot}</p>
    </>
  );
}

/* ---------- login ---------- */
export function Login() {
  useRedirectIfSignedIn();
  return (
    <Frame
      mode="login"
      title="Welcome back"
      sub={<>Sign in to open <b>your research workspace</b>.</>}
    >
      <GoogleForm
        cta="Sign in with Google"
        foot={<>New here? <Link to="/register">Create an account</Link></>}
      />
    </Frame>
  );
}

/* ---------- register ---------- */
export function Register() {
  useRedirectIfSignedIn();
  return (
    <Frame
      mode="register"
      title="Create your account"
      sub={<>First time? <b>Sign up with Google</b> — no new password to remember.</>}
    >
      <GoogleForm
        cta="Sign up with Google"
        foot={<>Already have an account? <Link to="/login">Sign in</Link></>}
      />
    </Frame>
  );
}
