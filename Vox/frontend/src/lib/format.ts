import type { CallAction, CallStatus } from '../api/types'

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '0:00'
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = value.endsWith('Z') || value.includes('+') ? value : `${value}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = value.endsWith('Z') || value.includes('+') ? value : `${value}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function relativeFromNow(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = value.endsWith('Z') || value.includes('+') ? value : `${value}Z`
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Date.now() - then
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface Tone {
  bg: string
  text: string
  dot: string
}

export const ACTION_META: Record<CallAction, { label: string; tone: Tone }> = {
  CONTINUE: {
    label: 'Continue',
    tone: { bg: 'bg-[#EDF5E9]', text: 'text-[#4F6B50]', dot: '#7B9D7C' },
  },
  REVIEW: {
    label: 'Review',
    tone: { bg: 'bg-[#FDF3E3]', text: 'text-[#8A6127]', dot: '#D9A14C' },
  },
  HANDOFF_IMMEDIATE: {
    label: 'Immediate handoff',
    tone: { bg: 'bg-clay-soft', text: 'text-clay', dot: '#C2564C' },
  },
}

export const STATUS_META: Record<CallStatus, { label: string; tone: Tone }> = {
  created: {
    label: 'Draft',
    tone: { bg: 'bg-sunken', text: 'text-ink-2', dot: '#A6B0C2' },
  },
  awaiting_upload: {
    label: 'Awaiting audio',
    tone: { bg: 'bg-sunken', text: 'text-ink-2', dot: '#A6B0C2' },
  },
  uploading: {
    label: 'Uploading',
    tone: { bg: 'bg-primary-soft', text: 'text-primary', dot: '#8FA4E4' },
  },
  queued: {
    label: 'Queued',
    tone: { bg: 'bg-primary-soft', text: 'text-primary', dot: '#8FA4E4' },
  },
  processing: {
    label: 'Analyzing',
    tone: { bg: 'bg-primary-soft', text: 'text-primary', dot: '#4D5BAD' },
  },
  active: {
    label: 'Active',
    tone: { bg: 'bg-primary-soft', text: 'text-primary', dot: '#4D5BAD' },
  },
  completed: {
    label: 'Complete',
    tone: { bg: 'bg-[#EDF5E9]', text: 'text-sage-ink', dot: '#7B9D7C' },
  },
  awaiting_review: {
    label: 'Awaiting human review',
    tone: { bg: 'bg-[#FDF3E3]', text: 'text-[#8A6127]', dot: '#D9A14C' },
  },
  failed: {
    label: 'Processing failed',
    tone: { bg: 'bg-clay-soft', text: 'text-clay', dot: '#C2564C' },
  },
}

export const STATE_LABEL: Record<string, string> = {
  calm: 'Calm',
  engaged: 'Engaged',
  frustrated: 'Frustrated',
  distressed: 'Distressed',
  unclear: 'Unclear',
}

export const STATE_COLOR: Record<string, string> = {
  calm: '#7B9D7C',
  engaged: '#78A3B2',
  frustrated: '#E0B264',
  distressed: '#C2564C',
  unclear: '#A6B0C2',
}

export function ruleShortLabel(ruleId: string): string {
  switch (ruleId) {
    case 'R1':
      return 'Sustained distress'
    case 'R2':
      return 'Distressed state'
    case 'R3':
      return 'Frustration watch'
    case 'R4':
      return 'Insufficient speech evidence'
    case 'R5':
      return 'Commitment credibility (disabled)'
    default:
      return ruleId
  }
}

export function formatOperator(op: string): string {
  switch (op) {
    case 'gte':
      return '≥'
    case 'lte':
      return '≤'
    case 'gt':
      return '>'
    case 'lt':
      return '<'
    default:
      return op
  }
}

export function formatFeatureName(feature: string): string {
  if (feature.startsWith('p_')) {
    return `P(${feature.slice(2).replace(/_/g, ' ')})`
  }
  return feature.replace(/_/g, ' ').replace(/\bema\b/gi, 'smoothed')
}
