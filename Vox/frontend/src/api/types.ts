export type Role = 'agent' | 'supervisor' | 'admin' | 'auditor' | 'ml_admin'

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
  tenant_id: string
  created_at: string
  last_login_at: string | null
}

export interface TokenPair {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  user: User
}

export type CallAction = 'CONTINUE' | 'REVIEW' | 'HANDOFF_IMMEDIATE'

export type CallStatus =
  | 'created'
  | 'awaiting_upload'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'active'
  | 'completed'
  | 'awaiting_review'
  | 'failed'

export interface CallSummary {
  id: string
  status: CallStatus
  source: 'upload' | 'live'
  created_at: string
  duration_seconds: number | null
  original_filename: string | null
  action: CallAction | null
  script_locked: boolean
  model_version: string | null
  policy_version: string | null
  error_message: string | null
  episode_count: number
}

export interface WindowPoint {
  index: number
  start: number
  end: number
  arousal: number
  valence: number
  dominance: number
  arousal_ema: number
  valence_ema: number
  dominance_ema: number
  state: 'calm' | 'engaged' | 'frustrated' | 'distressed' | 'unclear'
  probabilities: Record<string, number>
  speech_ratio: number
  quality_status: string
  action: CallAction
  rules: string[]
  confidence: number
}

export interface Evidence {
  rule_id: string
  description: string
  action: CallAction
  conditions: Array<{
    feature: string
    op: string
    value: number
    observed: number
  }>
}

export interface Episode {
  start_seconds: number
  end_seconds: number
  action: CallAction
  severity: number
  kind: 'distress' | 'review' | 'insufficient_evidence'
  window_indices: number[]
  evidence: Evidence[]
  peak: {
    arousal_ema: number
    valence_ema: number
    p_distressed: number
    p_frustrated: number
    dominant_state: string
    quality_status: string
  }
}

export interface Handoff {
  id: string
  call_id: string
  raised_at: string
  trigger_rule: string
  trigger_severity: number
  action: CallAction
  status: 'open' | 'acknowledged'
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolution: string | null
  resolution_notes: string | null
}

export interface TimelineResponse {
  call: {
    id: string
    status: CallStatus
    source: string
    created_at: string
    started_at: string | null
    ended_at: string | null
    duration_seconds: number | null
    original_filename: string | null
    action: CallAction | null
    script_locked: boolean
    model_version: string | null
    policy_version: string | null
    error_message: string | null
    consent_confirmed: boolean
    consent_reference: string | null
    audio: {
      available: boolean
      expired: boolean
      expires_at: string | null
      url: string | null
    }
    episode_count: number
  }
  handoff: Handoff | null
  windows: WindowPoint[]
  episodes: Episode[]
  summary: Record<string, unknown> | null
  policy: {
    version: string | null
    description: string | null
    active_version: string | null
  }
  model: {
    version: string | null
    name: string | null
    kind: string | null
    artifact_digest: string | null
    calibrated: boolean | null
    notes: string | null
  }
}

export interface AuditEvent {
  seq: number
  occurred_at: string
  actor_id: string | null
  actor_role: string | null
  event: string
  call_id: string | null
  model_version?: string | null
  policy_version?: string | null
  payload: Record<string, unknown>
  prev_hash: string
  hash: string
}

export interface UploadAccepted {
  call_id: string
  status: CallStatus
  filename: string
  size_bytes: number
  duration_seconds: number
  sample_rate: number
  channels: number
  job_id: string
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  checked_at: string
  version: string
  checks: Record<string, Record<string, unknown>>
  degraded: string[]
}

export interface PolicyRuleView {
  id: string
  description: string
  action: CallAction
  expression: string
  requires_feature: string | null
  enabled: boolean
}

export interface ActivePolicy {
  version: string
  description: string
  yaml: string
  rules: PolicyRuleView[]
}
