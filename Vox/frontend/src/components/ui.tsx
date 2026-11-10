import type { ReactNode } from 'react'
import type { CallAction, CallStatus } from '../api/types'
import { ACTION_META, STATUS_META } from '../lib/format'
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon, LockIcon } from './icons'

export function Card({
  children,
  className = '',
  flush = false,
}: {
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <div className={`${flush ? 'vs-card-flush' : 'vs-card'} ${className}`}>{children}</div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
  className = '',
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="vs-section-title">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  icon,
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'positive' | 'warning' | 'danger'
  icon?: ReactNode
  title?: string
}) {
  const tones = {
    neutral: 'bg-sunken text-ink-2',
    primary: 'bg-primary-soft text-primary',
    positive: 'bg-[#EDF5E9] text-sage-ink',
    warning: 'bg-[#FDF3E3] text-[#8A6127]',
    danger: 'bg-clay-soft text-clay',
  }
  return (
    <span className={`vs-badge ${tones[tone]}`} title={title}>
      {icon}
      {children}
    </span>
  )
}

export function ActionBadge({ action }: { action: CallAction | null }) {
  if (!action) {
    return <Badge tone="neutral">Not assessed</Badge>
  }
  const meta = ACTION_META[action]
  const tone =
    action === 'CONTINUE' ? 'positive' : action === 'REVIEW' ? 'warning' : 'danger'
  return (
    <Badge
      tone={tone}
      icon={<span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.tone.dot }} />}
    >
      {meta.label}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: CallStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.created
  const tone =
    status === 'completed'
      ? 'positive'
      : status === 'failed'
        ? 'danger'
        : status === 'awaiting_review'
          ? 'warning'
          : status === 'queued' || status === 'processing' || status === 'uploading'
            ? 'primary'
            : 'neutral'
  return (
    <Badge
      tone={tone}
      icon={<span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.tone.dot }} />}
    >
      {meta.label}
    </Badge>
  )
}

export function LockBadge({ locked }: { locked: boolean }) {
  return locked ? (
    <Badge tone="danger" icon={<LockIcon size={12} />}>
      Automated prompts locked
    </Badge>
  ) : (
    <Badge tone="neutral">No script lock</Badge>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
}: {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[14px] border border-dashed border-line-strong bg-[#FBFCFE] px-6 text-center ${
        compact ? 'py-8' : 'py-14'
      }`}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-muted">
        {icon ?? <InfoIcon size={20} />}
      </div>
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted" role="status">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="animate-spin"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" fill="none" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      {label ? <span className="text-[12px]">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  optional,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string | null
  children: ReactNode
  optional?: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink-2">
          {label}
          {optional ? <span className="ml-1 font-normal text-faint">(optional)</span> : null}
        </label>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-clay" role="alert">
          <AlertIcon size={13} className="mt-px shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function InfoNote({
  title,
  children,
  tone = 'neutral',
}: {
  title?: string
  children: ReactNode
  tone?: 'neutral' | 'warning' | 'danger' | 'positive'
}) {
  const tones = {
    neutral: 'border-line bg-[#F8FAFD] text-ink-2',
    warning: 'border-[#F0DDBB] bg-[#FEF8EC] text-[#7C5A25]',
    danger: 'border-[#EFCEC8] bg-[#FCF1EF] text-[#8E3E36]',
    positive: 'border-[#D3E6CB] bg-[#F3F9F0] text-[#446045]',
  }
  const icon =
    tone === 'danger' ? (
      <AlertIcon size={15} />
    ) : tone === 'positive' ? (
      <CheckIcon size={15} />
    ) : tone === 'warning' ? (
      <ClockIcon size={15} />
    ) : (
      <InfoIcon size={15} />
    )
  return (
    <div className={`flex gap-2.5 rounded-[12px] border px-3.5 py-3 ${tones[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 text-[12px] leading-relaxed">
        {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  )
}

export function InlineStat({
  label,
  value,
  meta,
}: {
  label: string
  value: ReactNode
  meta?: string
}) {
  return (
    <div>
      <p className="vs-label">{label}</p>
      <p className="mt-1 text-[19px] font-semibold leading-none tracking-[-0.02em] text-ink">
        {value}
      </p>
      {meta ? <p className="mt-1.5 text-[11px] text-muted">{meta}</p> : null}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[10px] bg-sunken ${className}`} />
}
