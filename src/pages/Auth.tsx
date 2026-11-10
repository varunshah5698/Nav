import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import ErrorBoundary from "../components/ErrorBoundary";
import { LogoMark } from "../components/Logo";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAction, useMutation } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
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
const ShieldCheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 20 6v5.5c0 5.2-3.3 8.2-8 9.5-4.7-1.3-8-4.3-8-9.5V6Z" />
    <path d="m8.7 12 2.2 2.2 4.4-4.4" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="m7.8 12.2 2.8 2.8 5.7-5.7" />
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
              Sessions secured by Convex Auth · email/password + Google OAuth 2.0
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

/* ---------- auth plumbing ---------- */
function useRedirectIfSignedIn() {
  const nav = useNavigate();
  const { isLoading, isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isLoading && isAuthenticated) nav("/app/dashboard", { replace: true });
  }, [isLoading, isAuthenticated, nav]);
}

function authErrorMessage(e: unknown, register: boolean) {
  const data = (e as { data?: unknown })?.data;
  const code = typeof data === "string" ? data : (data as { code?: string } | undefined)?.code ?? "";
  const msg = e instanceof Error ? e.message : typeof data === "string" ? data : "";
  if (code === "TooManyFailedAttempts" || /too many/i.test(msg)) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (/already exists/i.test(msg)) return "An account with this email already exists. Sign in instead.";
  if (/at least 8|too short|invalid password/i.test(msg)) return "Password must be at least 8 characters.";
  return register
    ? "Could not create the account. If you already signed up, use Sign in."
    : "Email or password is incorrect.";
}

/* ---------- email + password ---------- */
function PasswordForm({ mode }: { mode: Mode }) {
  const { signIn } = useAuthActions();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const register = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setErr("Enter a valid email address.");
    if (pass.length < 8) return setErr("Password must be at least 8 characters.");
    if (register && pass !== confirm) return setErr("Passwords do not match.");

    setBusy(true);
    try {
      await signIn("password", { email: mail, password: pass, flow: register ? "signUp" : "signIn" });
      nav("/app/dashboard", { replace: true });
    } catch (e) {
      setErr(authErrorMessage(e, register));
      setBusy(false);
    }
  }

  return (
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

      <label className="auth-label" htmlFor="auth-pass">
        Password <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(8+ chars)</span>
      </label>
      <div className="auth-field">
        <span className="fi"><LockIcon /></span>
        <input
          id="auth-pass"
          type={show ? "text" : "password"}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete={register ? "new-password" : "current-password"}
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

      {!register && (
        <div className="auth-forgot-row">
          <Link to="/forgot-password" className="auth-inline-link">Forgot password?</Link>
        </div>
      )}

      {register && (
        <>
          <div className="auth-gap" />
          <label className="auth-label" htmlFor="auth-confirm">Confirm password</label>
          <div className="auth-field">
            <span className="fi"><LockIcon /></span>
            <input
              id="auth-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="Repeat password"
            />
          </div>
        </>
      )}

      <button className="auth-submit" type="submit" disabled={busy}>
        {busy
          ? <><span className="auth-spin" /> {register ? "Creating account" : "Signing in"}</>
          : <>{register ? "Create account" : "Sign in"} <ArrowIcon /></>}
      </button>
    </form>
  );
}

/* ---------- google ---------- */
function GoogleButton({ mode }: { mode: Mode }) {
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
      setErr(authErrorMessage(e, mode === "register"));
      setBusy(false);
    }
  }

  return (
    <>
      {err && <Alert>{err}</Alert>}
      <button className="auth-google" type="button" onClick={go} disabled={busy}>
        {busy ? <span className="auth-spin auth-spin-dark" aria-hidden="true" /> : <GoogleMark />}
        <span>{busy ? "Opening Google…" : mode === "register" ? "Sign up with Google" : "Sign in with Google"}</span>
        {!busy && <ArrowIcon />}
      </button>
    </>
  );
}

function AuthOptions({ mode }: { mode: Mode }) {
  return (
    <>
      <PasswordForm mode={mode} />
      <div className="auth-div">or</div>
      <GoogleButton mode={mode} />
      <p className="auth-foot">
        {mode === "register"
          ? <>Already have an account? <Link to="/login">Sign in</Link></>
          : <>New here? <Link to="/register">Create an account</Link></>}
      </p>
      <p className="auth-foot">
        Your workspace, graph and sources are saved to Convex and restored every time you sign in.
      </p>
    </>
  );
}

/* ---------- pages ---------- */
export function Login() {
  useRedirectIfSignedIn();
  const [params] = useSearchParams();
  return (
    <Frame mode="login" title="Welcome back" sub={<>Sign in to open <b>your research workspace</b>.</>}>
      {params.get("reset") === "1" && (
        <div className="auth-success" role="status">
          <ShieldCheckIcon />
          <span>Password updated. Sign in with your new password.</span>
        </div>
      )}
      <AuthOptions mode="login" />
    </Frame>
  );
}

export function Register() {
  useRedirectIfSignedIn();
  return (
    <Frame mode="register" title="Create your account" sub={<>Email and password, or <b>continue with Google</b>.</>}>
      <AuthOptions mode="register" />
    </Frame>
  );
}
/* ---------- forgot password ---------- */
type ResetStep = "email" | "otp" | "password" | "done";

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function passwordScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Za-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;
  return score;
}

export function ForgotPassword() {
  const requestReset = useAction(api.passwordReset.requestPasswordReset);
  const verifyOtp = useMutation(api.passwordReset.verifyPasswordResetOtp);
  const completeReset = useAction(api.passwordReset.completePasswordReset);
  const nav = useNavigate();

  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requestedAt, setRequestedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (step !== "otp") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step !== "done") return;
    const timer = window.setTimeout(() => nav("/login?reset=1", { replace: true }), 4200);
    return () => window.clearTimeout(timer);
  }, [step, nav]);

  const resendLeft = requestedAt ? Math.max(0, 60 - Math.floor((now - requestedAt) / 1000)) : 0;
  const expiresLeft = requestedAt ? Math.max(0, 300 - Math.floor((now - requestedAt) / 1000)) : 0;
  const fullCode = digits.join("");
  const score = passwordScore(password);

  const stepCopy =
    step === "email"
      ? { title: "Reset your password", sub: <>Enter the email on your account. We will send a <b>six-digit code</b> to verify it.</> }
      : step === "otp"
        ? { title: "Check your email", sub: <>We sent a code to <b>{email}</b>. It expires in five minutes.</> }
        : step === "password"
          ? { title: "Choose a new password", sub: <>Use at least eight characters including a letter and a number.</> }
          : { title: "Password updated", sub: <>Your password has been changed and existing sessions were signed out.</> };

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    setLocked(false);
    try {
      await requestReset({ email: normalized });
      setEmail(normalized);
      setDigits(Array(6).fill(""));
      setRequestedAt(Date.now());
      setNow(Date.now());
      setStep("otp");
      window.setTimeout(() => otpRefs.current[0]?.focus(), 60);
    } catch {
      setError("Could not send a code right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (busy || resendLeft > 0) return;
    setBusy(true);
    setError("");
    try {
      await requestReset({ email });
      setDigits(Array(6).fill(""));
      setLocked(false);
      setRequestedAt(Date.now());
      setNow(Date.now());
      window.setTimeout(() => otpRefs.current[0]?.focus(), 60);
    } catch {
      setError("Could not resend the code. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy || fullCode.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const result = await verifyOtp({ email, code: fullCode });
      if (!result.ok) {
        setError(result.error ?? "Invalid or expired code.");
        if (result.locked) setLocked(true);
        return;
      }
      setToken(result.token ?? "");
      setStep("password");
    } catch {
      setError("Could not verify the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use at least eight characters including a letter and a number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await completeReset({ token, password });
      if (!result.ok) {
        setError(result.error ?? "Could not update the password.");
        return;
      }
      setStep("done");
    } catch {
      setError("Could not update the password. Request a new code and try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      fillDigits(clean, index);
      return;
    }
    const next = [...digits];
    next[index] = clean.slice(-1);
    setDigits(next);
    if (clean && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function fillDigits(value: string, start = 0) {
    const source = value.replace(/\D/g, "").slice(0, 6 - start);
    if (!source) return;
    const next = [...digits];
    source.split("").forEach((digit, offset) => { next[start + offset] = digit; });
    setDigits(next);
    otpRefs.current[Math.min(start + source.length, 5)]?.focus();
  }

  function onOtpKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      otpRefs.current[index + 1]?.focus();
    }
  }

  if (step === "done") {
    return (
      <Frame mode="login" title={stepCopy.title} sub={stepCopy.sub}>
        <div className="auth-success auth-success-large" role="status">
          <span className="auth-success-icon"><CheckCircleIcon /></span>
          <div>
            <b>All set.</b>
            <p>You can now sign in with your new password. Redirecting you to sign in…</p>
          </div>
        </div>
        <button className="auth-submit" type="button" onClick={() => nav("/login?reset=1", { replace: true })}>
          Back to sign in <ArrowIcon />
        </button>
      </Frame>
    );
  }

  return (
    <Frame mode="login" title={stepCopy.title} sub={stepCopy.sub}>
      {error && <Alert>{error}</Alert>}

      {step === "email" && (
        <form onSubmit={requestCode} noValidate>
          <label className="auth-label" htmlFor="reset-email">Email</label>
          <div className="auth-field">
            <span className="fi"><MailIcon /></span>
            <input id="reset-email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@lab.edu" autoFocus required />
          </div>
          <p className="auth-hint" style={{ marginTop: 10 }}>
            For privacy, we show the same confirmation whether or not an account exists.
          </p>
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? <><span className="auth-spin" aria-hidden="true" /> Sending code</> : <>Send reset code <ArrowIcon /></>}
          </button>
          <p className="auth-foot">
            Remembered it? <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={verify} noValidate>
          <div className="auth-otp" role="group" aria-label="Six-digit verification code">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => { otpRefs.current[index] = element; }}
                className={`auth-otp-box${digit ? " filled" : ""}`}
                value={digit}
                onChange={(e) => updateDigit(index, e.target.value)}
                onKeyDown={(e) => onOtpKeyDown(index, e)}
                onPaste={(e) => {
                  e.preventDefault();
                  fillDigits(e.clipboardData.getData("text"), index);
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                aria-label={`Digit ${index + 1} of 6`}
                disabled={locked}
              />
            ))}
          </div>
          <div className="auth-countdown" aria-live="polite">
            {locked
              ? "Too many attempts. Request a new code."
              : expiresLeft > 0
                ? `Code expires in ${formatClock(expiresLeft)}`
                : "Code expired. Request a new one."}
          </div>
          <button className="auth-submit" type="submit" disabled={busy || fullCode.length !== 6 || locked || expiresLeft === 0}>
            {busy ? <><span className="auth-spin" aria-hidden="true" /> Verifying</> : <>Verify code <ArrowIcon /></>}
          </button>
          <div className="auth-resend-row">
            {resendLeft > 0 ? (
              <span className="auth-hint">Resend code in {formatClock(resendLeft)}</span>
            ) : (
              <button type="button" className="auth-inline-link" onClick={resendCode} disabled={busy}>
                Resend code
              </button>
            )}
            <button type="button" className="auth-inline-link" onClick={() => { setStep("email"); setError(""); }}>
              Use a different email
            </button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={savePassword} noValidate>
          <label className="auth-label" htmlFor="new-password">New password</label>
          <div className="auth-field">
            <span className="fi"><LockIcon /></span>
            <input id="new-password" type={showPassword ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
              placeholder="At least 8 characters" autoFocus required />
            <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
              <EyeIcon off={showPassword} />
            </button>
          </div>
          <div className={`auth-strength score-${score}`} aria-label={`Password strength: ${["very weak", "weak", "fair", "good", "strong"][score]}`}>
            <div className="auth-strength-bars">{[0, 1, 2, 3].map((i) => <i key={i} className={i < score ? "on" : ""} />)}</div>
            <span>{["Too weak", "Weak", "Fair", "Good", "Strong"][score]}</span>
          </div>
          <div className="auth-gap" />
          <label className="auth-label" htmlFor="confirm-password">Confirm password</label>
          <div className="auth-field">
            <span className="fi"><LockIcon /></span>
            <input id="confirm-password" type={showPassword ? "text" : "password"} value={confirm}
              onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
              placeholder="Repeat your password" required />
          </div>
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? <><span className="auth-spin" aria-hidden="true" /> Updating password</> : <>Update password <ArrowIcon /></>}
          </button>
          <p className="auth-foot">
            <button type="button" className="auth-inline-link" onClick={() => { setStep("otp"); setError(""); }}>
              Use a new code
            </button>
          </p>
        </form>
      )}
    </Frame>
  );
}
