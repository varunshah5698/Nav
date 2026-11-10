import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { SceneHost } from '../three/SceneHost'
import {
  ArrowRightIcon,
  LockIcon,
  LogoMark,
  ShieldIcon,
  WaveformIcon,
} from '../components/icons'
import { Spinner } from '../components/ui'

export default function Login() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from =
    (location.state as { from?: string } | null)?.from ?? '/app'

  useEffect(() => {
    document.title = 'Sign in — VoxSafe'
  }, [])

  if (status === 'authenticated') {
    return <Navigate to={from} replace />
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 429
            ? err.messageText
            : err.status === 401
              ? 'Email or password is incorrect.'
              : err.messageText,
        )
      } else {
        setError('Could not reach VoxSafe. Check that the API is running.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="vs-shell flex min-h-screen items-stretch p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-24px)] w-full max-w-[1220px] overflow-hidden rounded-[26px] border border-line bg-surface shadow-card lg:grid-cols-[1.02fr_0.98fr]">
        {/* Visual panel */}
        <aside className="relative hidden overflow-hidden bg-[linear-gradient(155deg,#EDF1FB_0%,#E4E9F7_55%,#EAF2EC_100%)] p-9 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -left-24 top-1/3 h-[380px] w-[380px] rounded-full border border-white/70" />
          <div className="pointer-events-none absolute -left-10 top-[38%] h-[240px] w-[240px] rounded-full border border-dashed border-[#C9D4EC]" />

          <Link to="/" className="relative flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-white">
              <LogoMark size={19} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
              VoxSafe
            </span>
          </Link>

          <div className="relative">
            <div className="relative mx-auto h-[300px] w-full max-w-[440px]">
              <SceneHost compact className="h-full w-full" />
            </div>
            <h2 className="mt-6 max-w-[20ch] text-[27px] font-semibold leading-[1.14] tracking-[-0.03em] text-ink">
              Listen for strain, not for words.
            </h2>
            <p className="mt-3 max-w-[40ch] text-[12.5px] leading-relaxed text-ink-2">
              VoxSafe works from acoustic characteristics only. It does not
              transcribe the call, identify the speaker, or decide whether
              anything said is true.
            </p>
          </div>

          <div className="relative grid gap-2.5">
            {[
              {
                icon: <WaveformIcon size={14} />,
                text: '3-second windows with a 1.5-second hop',
              },
              {
                icon: <ShieldIcon size={14} />,
                text: 'Escalate-only policy, validated on the server',
              },
              {
                icon: <LockIcon size={14} />,
                text: 'Distress engages a server-side script lock',
              },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-2.5 rounded-[12px] border border-white/70 bg-white/55 px-3 py-2 backdrop-blur-sm"
              >
                <span className="text-primary">{item.icon}</span>
                <span className="text-[11.5px] text-ink-2">{item.text}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Form panel */}
        <section className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-14">
          <div className="mx-auto w-full max-w-[380px]">
            <div className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-white">
                <LogoMark size={19} />
              </span>
              <span className="text-[15px] font-semibold text-ink">VoxSafe</span>
            </div>

            <p className="mt-8 text-[11px] font-medium text-muted lg:mt-0">
              Secure workspace access
            </p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-ink">
              Sign in to VoxSafe
            </h1>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              For authorized collections and supervision staff. Every sign-in is
              written to the audit log.
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[12px] font-medium text-ink-2"
                >
                  Work email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  className="vs-input"
                  placeholder="you@organisation.com"
                  value={email}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="password" className="text-[12px] font-medium text-ink-2">
                    Password
                  </label>
                  <span className="text-[10.5px] text-faint">
                    Contact your administrator for a reset
                  </span>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="vs-input"
                  placeholder="••••••••••"
                  value={password}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              {error ? (
                <div
                  className="rounded-[10px] border border-[#EFCEC8] bg-clay-soft px-3 py-2.5 text-[11.5px] leading-relaxed text-clay"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                className="vs-btn vs-btn-primary h-11 w-full text-[13px]"
                disabled={submitting || !email || !password}
              >
                {submitting ? (
                  <>
                    <Spinner size={14} /> Signing in
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRightIcon size={15} />
                  </>
                )}
              </button>
            </form>

            {import.meta.env.DEV ? (
              <div className="mt-6 rounded-[12px] border border-dashed border-line-strong bg-[#F8FAFD] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
                  Local development accounts
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  agent@voxsafe.app · supervisor@voxsafe.app · auditor@voxsafe.app
                  <br />
                  Password: <span className="font-mono text-[10.5px]">voxsafe-demo-2026</span>
                </p>
                <p className="mt-1.5 text-[10.5px] text-faint">
                  Created with the operator CLI. Delete these accounts before any
                  shared deployment.
                </p>
              </div>
            ) : null}

            <p className="mt-6 text-[10.5px] leading-relaxed text-faint">
              By signing in you accept that call audio and decisions are retained
              under the configured retention policy and that your access is
              audited.
            </p>

            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
            >
              ← Back to the overview
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
