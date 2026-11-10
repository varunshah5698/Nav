import { Suspense, lazy, useState } from "react";
import type { ReactNode } from "react";
import ErrorBoundary from "../components/ErrorBoundary";
import { LogoMark } from "../components/Logo";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
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
const MailIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
const LockIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="10" width="16" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.2" />
  </svg>
);
const UserIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.8" />
    {off && <path d="M4 20 20 4" />}
  </svg>
);
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
              Prototype build · credentials stay in this browser (PBKDF2-hashed)
            </p>
          </motion.section>
        </div>
      </div>
    </div>
  );
}

function ShiftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4.5V10h-5.5" />
    </svg>
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

/* ---------- login ---------- */
export function Login() {
  const login = useStore((s) => s.login);
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const msg = await login(email, pass);
      if (msg) setErr(msg);
      else nav("/app/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame
      mode="login"
      title="Welcome back"
      sub={<>Sign in to open <b>your research workspace</b>.</>}
    >
      <form onSubmit={submit} noValidate>
        {err && <Alert>{err}</Alert>}

        <label className="auth-label" htmlFor="auth-email">Email</label>
        <div className="auth-field">
          <span className="fi"><MailIcon /></span>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@lab.edu"
            autoFocus
          />
        </div>

        <div className="auth-gap" />

        <label className="auth-label" htmlFor="auth-pass">Password</label>
        <div className="auth-field">
          <span className="fi"><LockIcon /></span>
          <input
            id="auth-pass"
            type={show ? "text" : "password"}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
          >
            <EyeIcon off={show} />
          </button>
        </div>

        <div className="auth-row">
          <label className="auth-check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me
          </label>
          <span className="auth-hint">Reset via owner (prototype)</span>
        </div>

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? <><span className="auth-spin" /> Signing in</> : <>Enter workspace <ArrowIcon /></>}
        </button>

        <div className="auth-div">or</div>

        <Link className="auth-alt" to="/register">
          <SparkIcon /> Create a free workspace
        </Link>

        <p className="auth-foot">
          Registering seeds a labelled demo graph so you can explore immediately.
        </p>
      </form>
    </Frame>
  );
}

/* ---------- register ---------- */
export function Register() {
  const reg = useStore((s) => s.register);
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (!terms) return setErr("Please accept the research-use terms.");
    if (p1 !== p2) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      const msg = await reg(name, email, p1);
      if (msg) setErr(msg);
      else nav("/app/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame
      mode="register"
      title="Create your workspace"
      sub={<>Isolated per user · <b>PBKDF2-hashed</b> credentials.</>}
    >
      <form onSubmit={submit} noValidate>
        {err && <Alert>{err}</Alert>}

        <label className="auth-label" htmlFor="auth-name">Full name</label>
        <div className="auth-field">
          <span className="fi"><UserIcon /></span>
          <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ada Lovelace" autoFocus />
        </div>

        <div className="auth-gap" />

        <label className="auth-label" htmlFor="auth-reg-email">Email</label>
        <div className="auth-field">
          <span className="fi"><MailIcon /></span>
          <input id="auth-reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@lab.edu" />
        </div>

        <div className="auth-gap" />

        <label className="auth-label" htmlFor="auth-p1">Password <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(8+ chars)</span></label>
        <div className="auth-field">
          <span className="fi"><LockIcon /></span>
          <input id="auth-p1" type={show ? "text" : "password"} value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" placeholder="Create a password" />
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
          >
            <EyeIcon off={show} />
          </button>
        </div>

        <div className="auth-gap" />

        <label className="auth-label" htmlFor="auth-p2">Confirm password</label>
        <div className="auth-field">
          <span className="fi"><LockIcon /></span>
          <input id="auth-p2" type={show ? "text" : "password"} value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" placeholder="Repeat password" />
        </div>

        <div className="auth-row">
          <label className="auth-check">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            I accept the research-use terms
          </label>
        </div>

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? <><span className="auth-spin" /> Creating</> : <>Create workspace <ArrowIcon /></>}
        </button>

        <div className="auth-div">or</div>

        <Link className="auth-alt" to="/login">
          <LockIcon /> Sign in to an existing workspace
        </Link>

        <p className="auth-foot">
          Demo records are labelled and never presented as real results.
        </p>
      </form>
    </Frame>
  );
}
