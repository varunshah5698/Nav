import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SceneHost } from '../three/SceneHost'
import { useReducedMotion } from '../lib/useReducedMotion'
import { useAuth } from '../auth/AuthContext'
import {
  ArrowRightIcon,
  CheckIcon,
  HeadphonesIcon,
  LogoMark,
  LockIcon,
  ShieldIcon,
  WaveformIcon,
} from '../components/icons'

gsap.registerPlugin(ScrollTrigger)

const SPECS = [
  { label: 'Audio', value: '16 kHz mono' },
  { label: 'Windows', value: '3.0 s / 1.5 s hop' },
  { label: 'Decisions', value: 'Escalate-only' },
]

const STEPS = [
  {
    number: '01',
    title: 'A real call becomes measurable',
    body: 'Recorded audio is normalized to 16 kHz mono, segmented into three-second windows every 1.5 seconds, and screened for speech. Silence is marked as silence and never scored as calm.',
  },
  {
    number: '02',
    title: 'Acoustic evidence, not words',
    body: 'A separate scoring layer estimates arousal, valence and dominance from prosody, then smooths those estimates across the call. No transcription is created. No speaker identity is stored.',
  },
  {
    number: '03',
    title: 'Policy decides, a human handles it',
    body: 'A versioned, deterministic rule set picks the highest applicable severity. A distress rule can only raise the outcome; nothing in the model can lower it. Immediate handoff locks automated prompts server-side.',
  },
]

const GUARDRAILS = [
  'No speech-to-text and no transcript-based sentiment analysis.',
  'No speaker embeddings, voiceprints or voice identification.',
  'No lie detection, credit scoring or borrower profiling.',
  'No automated payment pressure driven by an emotional score.',
  'No claim that a missing result means a calm borrower.',
]

export default function Landing() {
  const progress = useRef(0)
  const pinTarget = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const { status } = useAuth()
  const authed = status === 'authenticated'

  useEffect(() => {
    if (reduced) return
    const el = pinTarget.current
    if (!el) return
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        progress.current = self.progress
      },
    })
    return () => trigger.kill()
  }, [reduced])

  return (
    <div className="vs-shell min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-[#EEF2FA]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="VoxSafe home">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-white">
              <LogoMark size={19} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
              VoxSafe
            </span>
            <span className="ml-1 hidden rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-medium text-muted sm:inline">
              v1
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-[12.5px] font-medium text-ink-2 md:flex">
            <a href="#how" className="transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#limits" className="transition-colors hover:text-ink">
              What it won&apos;t do
            </a>
            <a href="#accountability" className="transition-colors hover:text-ink">
              Accountability
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to={authed ? '/app' : '/login'}
              className="vs-btn vs-btn-secondary hidden sm:inline-flex"
            >
              Supervisor login
            </Link>
            <Link to={authed ? '/app' : '/login'} className="vs-btn vs-btn-primary">
              {authed ? 'Open workspace' : 'Enter VoxSafe'}
              <ArrowRightIcon size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: scroll-driven acoustic sculpture */}
      <section ref={pinTarget} className="relative lg:h-[175vh]">
        <div className="relative mx-auto flex w-full max-w-[1180px] flex-col items-center gap-8 px-4 pb-10 pt-12 sm:px-6 lg:sticky lg:top-16 lg:min-h-[calc(100vh-64px)] lg:flex-row lg:gap-6 lg:pb-0 lg:pt-0">
          <div className="relative z-10 w-full lg:w-[52%]">
            <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ink-2">
              <ShieldIcon size={13} />
              Acoustic borrower protection
            </span>
            <h1 className="mt-5 text-[38px] font-semibold leading-[1.03] tracking-[-0.035em] text-ink sm:text-[52px] lg:text-[56px]">
              Understand the voice.
              <br />
              <span className="text-primary">Protect the person.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-2 sm:text-[15px]">
              VoxSafe analyzes vocal characteristics during debt-collection
              calls to identify potential distress and bring human support into
              the conversation.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#how" className="vs-btn vs-btn-primary h-11 px-5 text-[13px]">
                Explore VoxSafe
                <ArrowRightIcon size={15} />
              </a>
              <Link
                to={authed ? '/app' : '/login'}
                className="vs-btn vs-btn-secondary h-11 px-5 text-[13px]"
              >
                Supervisor login
              </Link>
            </div>
            <dl className="mt-9 grid max-w-[430px] grid-cols-3 gap-3 border-t border-line-strong/70 pt-5">
              {SPECS.map((spec) => (
                <div key={spec.label}>
                  <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                    {spec.label}
                  </dt>
                  <dd className="mt-1 text-[11.5px] font-medium text-ink-2">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative w-full lg:w-[48%]">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(195,202,252,0.85),rgba(195,202,252,0)_68%)] blur-[2px] sm:h-[440px] sm:w-[440px]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 sm:h-[300px] sm:w-[300px]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#C9D4EC] sm:h-[380px] sm:w-[380px]" />
            <SceneHost
              progressRef={progress}
              className="relative h-[300px] w-full sm:h-[400px] lg:h-[460px]"
            />
            <div className="absolute bottom-0 left-0 hidden rounded-[12px] border border-line bg-white/80 px-3 py-2 backdrop-blur-sm sm:block">
              <p className="vs-mono text-[10px] text-muted">vocal-state estimate</p>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-ink-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4D5BAD]" /> arousal
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-ink-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#78A3B2]" /> valence
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-ink-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B4DAAA]" /> dominance
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Signal to safety */}
      <section id="how" className="relative border-t border-white/70 bg-[var(--vs-page)]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="vs-label">From signal to safety</p>
              <h2 className="mt-2 max-w-[22ch] text-[28px] font-semibold leading-[1.12] tracking-[-0.03em] text-ink sm:text-[34px]">
                One connected path from audio to a human decision.
              </h2>
            </div>
            <p className="max-w-[38ch] text-[13px] leading-relaxed text-muted">
              Probabilistic estimates and deterministic enforcement are kept in
              separate layers on purpose. The model estimates. The policy
              decides. The supervisor handles the situation.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <article
                key={step.number}
                className="vs-card flex flex-col p-5 transition-shadow hover:shadow-raised"
              >
                <div className="flex items-center justify-between">
                  <span className="vs-mono text-[10px] text-faint">{step.number}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sunken text-primary">
                    {step.number === '01' ? (
                      <WaveformIcon size={16} />
                    ) : step.number === '02' ? (
                      <ShieldIcon size={16} />
                    ) : (
                      <HeadphonesIcon size={16} />
                    )}
                  </span>
                </div>
                <h3 className="mt-4 text-[15px] font-semibold leading-snug text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{step.body}</p>
              </article>
            ))}
          </div>

          {/* Escalate-only diagram */}
          <div className="vs-card mt-4 overflow-hidden">
            <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="max-w-[46ch]">
                <p className="vs-label">Severity can only increase</p>
                <h3 className="mt-1.5 text-[16px] font-semibold text-ink">
                  Continue → Review → Immediate handoff
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  Every rule is evaluated, then the maximum severity is applied.
                  A later calm window cannot erase an earlier distress
                  indication, and no model output can lower an action a rule has
                  already raised.
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                {[
                  { label: 'Continue', tone: 'bg-[#EDF5E9] text-sage-ink border-[#D3E6CB]' },
                  { label: 'Review', tone: 'bg-[#FDF3E3] text-[#8A6127] border-[#F0DDBB]' },
                  {
                    label: 'Immediate handoff',
                    tone: 'bg-clay-soft text-clay border-[#EFCEC8]',
                  },
                ].map((item, index) => (
                  <div key={item.label} className="flex items-center gap-2 sm:gap-3">
                    {index > 0 ? (
                      <ArrowRightIcon size={14} className="shrink-0 text-faint" />
                    ) : null}
                    <span
                      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[10.5px] font-medium ${item.tone}`}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Limits */}
      <section id="limits" className="bg-[var(--vs-page)] px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="mx-auto grid w-full max-w-[1180px] gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="vs-card p-6 sm:p-7">
            <p className="vs-label">Explicitly out of scope</p>
            <h2 className="mt-2 max-w-[24ch] text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink">
              A safety signal is not a verdict about a person.
            </h2>
            <ul className="mt-6 space-y-3">
              {GUARDRAILS.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#EDF5E9] text-sage-ink">
                    <CheckIcon size={11} />
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-ink-2">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="vs-card flex flex-col justify-between p-6 sm:p-7">
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                <LockIcon size={18} />
              </span>
              <h2 className="mt-4 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">
                Distress stops automated pressure.
              </h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                When policy returns <span className="font-medium text-ink-2">HANDOFF_IMMEDIATE</span>,
                VoxSafe creates a handoff record, engages the script lock on the
                server and writes both transitions to the audit chain. The lock
                cannot be cleared from the interface alone.
              </p>
            </div>
            <div className="mt-6 rounded-[12px] border border-line bg-[#F8FAFD] p-3.5">
              <p className="vs-mono text-[10px] text-muted">handoff path</p>
              <ol className="mt-2 space-y-1.5 text-[11.5px] text-ink-2">
                <li className="flex justify-between gap-3">
                  <span>Policy rule fires</span>
                  <span className="vs-mono text-faint">t + 0 ms</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Handoff persisted + locked</span>
                  <span className="vs-mono text-faint">same transaction</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Audit chain appended</span>
                  <span className="vs-mono text-faint">sha-256</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Supervisor acknowledgment</span>
                  <span className="vs-mono text-faint">human action</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Accountability */}
      <section
        id="accountability"
        className="border-y border-white/70 bg-[linear-gradient(180deg,#F7F9FD_0%,#EEF2FA_100%)] px-4 py-16 sm:px-6 sm:py-20"
      >
        <div className="mx-auto w-full max-w-[1180px]">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="vs-label">Accountability layer</p>
              <h2 className="mt-2 text-[28px] font-semibold leading-[1.14] tracking-[-0.03em] text-ink sm:text-[32px]">
                Every decision is linked to the version that produced it.
              </h2>
              <p className="mt-3 max-w-[44ch] text-[13px] leading-relaxed text-muted">
                Decisions record their model version, policy version and the
                exact rules that fired. Each audit event carries the previous
                event&apos;s hash, so a broken link is detectable by recomputation —
                not by trusting a status badge.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-2 text-[12.5px] font-semibold text-primary hover:text-primary-hover"
              >
                Open the audit view
                <ArrowRightIcon size={14} />
              </Link>
            </div>
            <div className="space-y-2">
              <p className="mb-1 text-[9.5px] font-medium uppercase tracking-[0.07em] text-faint">
                Schematic of chain structure — not live records
              </p>
              {[
                { seq: '0041', event: 'call.analysis_completed', meta: 'pol-2026.11.1 · baseline-acoustic-v1' },
                { seq: '0042', event: 'handoff.created', meta: 'R1, R3 · window 2' },
                { seq: '0043', event: 'script_lock.engaged', meta: 'server-side state' },
                { seq: '0044', event: 'handoff.acknowledged', meta: 'supervisor · resumed_human' },
              ].map((row, index) => (
                <div
                  key={row.seq}
                  className="vs-card flex items-center gap-3 px-4 py-3"
                  style={{ marginLeft: `${index * 10}px` }}
                >
                  <span className="vs-mono text-[10px] text-faint">{row.seq}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8FA4E4]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-ink">{row.event}</p>
                    <p className="truncate text-[10.5px] text-muted">{row.meta}</p>
                  </div>
                  <span className="vs-mono text-[9.5px] text-faint">0x…a91c</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-[var(--vs-page)] px-4 py-20 sm:px-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(600px_240px_at_50%_0%,rgba(195,202,252,0.55),transparent_70%)]" />
        <div className="relative mx-auto max-w-[820px] text-center">
          <p className="vs-label">The point of the system</p>
          <h2 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink sm:text-[42px]">
            Technology should recognize when a human needs to step in.
          </h2>
          <p className="mx-auto mt-4 max-w-[58ch] text-[13.5px] leading-relaxed text-muted">
            VoxSafe may estimate a vocal state, but it never replaces human
            judgment. When distress is detected, the system makes intervention
            easier, faster and auditable.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to={authed ? '/app' : '/login'} className="vs-btn vs-btn-primary h-11 px-5 text-[13px]">
              Enter VoxSafe
              <ArrowRightIcon size={15} />
            </Link>
            <a href="#how" className="vs-btn vs-btn-secondary h-11 px-5 text-[13px]">
              Explore the platform
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/70 bg-[#EEF2FA]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-primary text-white">
              <LogoMark size={15} />
            </span>
            <span className="text-[12px] font-medium text-ink-2">
              VoxSafe v1 — recorded-call intake and risky-moment flagging
            </span>
          </div>
          <p className="text-[10.5px] text-muted">
            Acoustic estimates are not psychological diagnoses. Thresholds require
            validation before operational use.
          </p>
        </div>
      </footer>
    </div>
  )
}
