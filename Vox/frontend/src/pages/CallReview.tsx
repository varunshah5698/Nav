import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from 'recharts'
import { callsApi } from '../api/client'
import type { Episode, TimelineResponse, WindowPoint } from '../api/types'
import { AppShell } from '../components/AppShell'
import { AudioPlayer, type SeekRequest } from '../components/AudioPlayer'
import { Timeline } from '../components/Timeline'
import {
  ActionBadge,
  Badge,
  Card,
  EmptyState,
  InfoNote,
  InlineStat,
  LockBadge,
  SectionHeader,
  Skeleton,
  StatusBadge,
} from '../components/ui'
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  FileIcon,
  HeadphonesIcon,
  InfoIcon,
  LockIcon,
  ShieldIcon,
  WaveformIcon,
} from '../components/icons'
import {
  formatClock,
  formatDateTime,
  formatDuration,
  formatFeatureName,
  formatOperator,
  ruleShortLabel,
  STATE_COLOR,
  STATE_LABEL,
} from '../lib/format'

const PROCESSING_STATES = new Set(['queued', 'processing', 'uploading', 'awaiting_upload'])

function ProcessingState({ callId }: { callId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <WaveformIcon size={18} />
          </span>
          <div>
            <h2 className="vs-section-title">Analyzing the recording</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Call <span className="vs-mono">{callId.slice(0, 8)}</span> is in the
              processing queue.
            </p>
          </div>
        </div>

        <div className="mt-6 flex h-14 items-end gap-1" aria-hidden="true">
          {[18, 34, 52, 40, 64, 30, 46, 22, 38, 56, 28, 44, 20, 50, 36, 60, 26, 42].map(
            (height, index) => (
              <span
                key={index}
                className="w-full rounded-sm bg-primary/25"
                style={{
                  height: `${height}%`,
                  animation: `pulse 1.6s ease-in-out ${index * 60}ms infinite`,
                }}
              />
            ),
          )}
        </div>

        <ol className="mt-6 space-y-3">
          {[
            ['Normalizing audio', 'ffmpeg → mono, 16 kHz, peak-normalized PCM'],
            ['Detecting speech', 'Voice activity detection separates speech from silence'],
            ['Scoring windows', '3 s windows, 1.5 s hop, exponential smoothing'],
            ['Evaluating policy', 'Escalate-only rules; a handoff persists with its audit event'],
          ].map(([title, detail]) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-faint">
                <ClockIcon size={11} />
              </span>
              <div>
                <p className="text-[12px] font-medium text-ink">{title}</p>
                <p className="text-[11px] text-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-[13px] font-semibold text-ink">Timing, stated honestly</h2>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            A three-second window cannot produce a complete first score before
            three seconds of audio have accumulated. VoxSafe reports window
            accumulation and inference latency separately rather than claiming a
            sub-two-second first result.
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-[10px] bg-[#F8FAFD] px-3 py-2">
              <span className="text-[11px] text-ink-2">First scorable window</span>
              <span className="vs-mono text-[10px] text-muted">3.0 s of audio</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-[#F8FAFD] px-3 py-2">
              <span className="text-[11px] text-ink-2">Window hop</span>
              <span className="vs-mono text-[10px] text-muted">1.5 s</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-[#F8FAFD] px-3 py-2">
              <span className="text-[11px] text-ink-2">Scoring target</span>
              <span className="vs-mono text-[10px] text-muted">&lt; 2 s per window</span>
            </div>
          </div>
        </Card>
        <InfoNote tone="warning" title="Do not treat this call as calm">
          Until scoring completes there is no vocal-state assessment. No
          automated conclusion may be drawn from the delay.
        </InfoNote>
      </div>
    </div>
  )
}

function FailedState({ message, callId }: { message: string | null; callId: string }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay">
          <AlertIcon size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="vs-section-title">Processing failed</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
            {message ?? 'The analysis pipeline could not produce a result.'}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Call <span className="vs-mono">{callId.slice(0, 8)}</span> has no
            vocal-state timeline. An unassessed call must not be treated as calm,
            and this recording should be handled by a person.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/app" className="vs-btn vs-btn-primary">
              Upload another recording
            </Link>
            <Link to="/app/status" className="vs-btn vs-btn-secondary">
              Check system status
            </Link>
          </div>
          <p className="mt-4 border-t border-line pt-3 text-[10.5px] text-faint">
            The failure was recorded in the audit trail with the reason returned
            by the pipeline.
          </p>
        </div>
      </div>
    </Card>
  )
}

const KIND_LABEL: Record<Episode['kind'], string> = {
  distress: 'Distress indication',
  review: 'Review indication',
  insufficient_evidence: 'Insufficient speech evidence',
}

function EpisodeCard({ episode }: { episode: Episode }) {
  const isHandoff = episode.action === 'HANDOFF_IMMEDIATE'
  return (
    <div
      className={`rounded-[14px] border p-4 ${
        isHandoff ? 'border-[#EFCEC8] bg-[#FDF7F6]' : 'border-[#F0DDBB] bg-[#FEFBF4]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ActionBadge action={episode.action} />
          <span className="text-[10.5px] font-medium text-ink-2">
            {KIND_LABEL[episode.kind]}
          </span>
        </div>
        <span className="vs-mono text-[10px] text-muted">
          {formatClock(episode.start_seconds)} – {formatClock(episode.end_seconds)}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {episode.evidence.map((rule) => (
          <div key={rule.rule_id} className="rounded-[10px] border border-white/80 bg-white/70 p-2.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
              <span className="vs-mono text-[9.5px] text-muted">{rule.rule_id}</span>
              {ruleShortLabel(rule.rule_id)}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {rule.conditions.map((condition) => (
                <span key={condition.feature} className="vs-mono text-[9.5px] text-muted">
                  {formatFeatureName(condition.feature)}{' '}
                  {formatOperator(condition.op)} {condition.value}
                  <span className="ml-1 text-ink-2">
                    (observed {Number(condition.observed).toFixed(2)})
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-white/80 pt-2.5 sm:grid-cols-4">
        {[
          ['Arousal', episode.peak.arousal_ema.toFixed(2)],
          ['Valence', episode.peak.valence_ema.toFixed(2)],
          ['P(distressed)', episode.peak.p_distressed.toFixed(2)],
          ['State', STATE_LABEL[episode.peak.dominant_state] ?? episode.peak.dominant_state],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[9.5px] uppercase tracking-[0.05em] text-faint">{label}</dt>
            <dd className="mt-0.5 text-[11.5px] font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {episode.kind === 'insufficient_evidence' ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[#8A6127]">
          <InfoIcon size={12} className="mt-px shrink-0" />
          This moment is flagged because there was too little usable speech, not
          because distress was detected. It still requires a human to look.
        </p>
      ) : null}
    </div>
  )
}

function Assessment({ windows }: { windows: WindowPoint[] }) {
  const counts = useMemo(() => {
    const base: Record<string, number> = {
      calm: 0,
      engaged: 0,
      frustrated: 0,
      distressed: 0,
      unclear: 0,
    }
    windows.forEach((w) => {
      base[w.state] = (base[w.state] ?? 0) + 1
    })
    return base
  }, [windows])

  const data = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }))

  const total = windows.length || 1
  const peak = windows.reduce(
    (acc, w) => ({
      arousal: Math.max(acc.arousal, w.arousal_ema),
      distress: Math.max(acc.distress, w.probabilities.distressed ?? 0),
    }),
    { arousal: -1, distress: 0 },
  )
  const flagged = windows.filter((w) => w.action !== 'CONTINUE').length

  return (
    <Card className="p-5">
      <SectionHeader
        title="Vocal-state estimate"
        description="Distribution of the discrete label across scored windows."
      />
      <div className="mt-3 h-[168px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={3}
                cornerRadius={6}
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={STATE_COLOR[entry.name] ?? '#D6DFEC'} />
                ))}
              </Pie>
              <ChartTooltip
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #E5EBF4',
                  fontSize: 11,
                  boxShadow: '0 8px 24px -14px rgba(67,79,95,0.3)',
                }}
                formatter={(value: number, name: string) => [
                  `${value} windows (${Math.round((value / total) * 100)}%)`,
                  STATE_LABEL[name] ?? name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-[11.5px] text-muted">
            No scored windows
          </div>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {Object.entries(counts).map(([state, count]) => (
          <li key={state} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11.5px] text-ink-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: STATE_COLOR[state] }}
              />
              {STATE_LABEL[state]}
            </span>
            <span className="vs-num text-[11px] text-muted">
              {count} <span className="text-faint">/ {windows.length}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <InlineStat label="Windows" value={windows.length} />
        <InlineStat label="Flagged" value={flagged} />
        <InlineStat label="Peak P(distress)" value={peak.distress.toFixed(2)} />
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
        These are acoustic model estimates with uncertainty. They are not a
        diagnosis, a credibility finding, or a statement about what the borrower
        actually feels.
      </p>
    </Card>
  )
}

function Decisions({ windows }: { windows: WindowPoint[] }) {
  const [showAll, setShowAll] = useState(false)
  const flagged = windows.filter((w) => w.action !== 'CONTINUE')
  const rows = showAll ? flagged : flagged.slice(0, 8)

  return (
    <Card className="p-5">
      <SectionHeader
        title="Window-level decisions"
        description="Only windows whose action exceeded Continue are listed. Values shown are the smoothed features the policy actually consumed."
      />
      {flagged.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            compact
            icon={<CheckIcon size={18} />}
            title="No window exceeded Continue"
            description="No policy rule fired for any scored window in this call."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto vs-scroll">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Window', 'Action', 'Rules', 'Arousal', 'Valence', 'P(distressed)'].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-2 py-2 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-faint"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((window) => (
                  <tr key={window.index} className="border-b border-line/70 last:border-0">
                    <td className="px-2 py-2 vs-mono text-[10px] text-muted">
                      {formatClock(window.start)}
                    </td>
                    <td className="px-2 py-2">
                      <ActionBadge action={window.action} />
                    </td>
                    <td className="px-2 py-2 text-[10.5px] text-ink-2">
                      {window.rules.length ? window.rules.join(' · ') : '—'}
                    </td>
                    <td className="px-2 py-2 vs-num text-[10.5px] text-ink-2">
                      {window.arousal_ema.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 vs-num text-[10.5px] text-ink-2">
                      {window.valence_ema.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 vs-num text-[10.5px] text-ink-2">
                      {(window.probabilities.distressed ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {flagged.length > 8 ? (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="mt-3 text-[11px] font-medium text-primary hover:text-primary-hover"
            >
              {showAll ? 'Show fewer windows' : `Show all ${flagged.length} flagged windows`}
            </button>
          ) : null}
        </>
      )}
    </Card>
  )
}

function AuditTrail({ callId }: { callId: string }) {
  const audit = useQuery({
    queryKey: ['audit', callId],
    queryFn: () => callsApi.audit(callId),
  })

  return (
    <Card className="p-5">
      <SectionHeader
        title="Audit trail for this call"
        description="Append-only events with a hash chain. Verification is restricted to auditor and administrator roles."
      />
      {audit.isLoading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : audit.isError ? (
        <p className="mt-3 text-[11.5px] text-clay">
          Audit events could not be loaded.
        </p>
      ) : audit.data && audit.data.events.length > 0 ? (
        <ul className="mt-3 divide-y divide-line/70">
          {audit.data.events.map((event) => (
            <li key={event.seq} className="py-2.5">
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2">
                  <span className="vs-mono w-7 shrink-0 text-[9.5px] text-faint">
                    {String(event.seq).padStart(4, '0')}
                  </span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8FA4E4]" />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink">
                    {event.event}
                  </span>
                  <span className="hidden shrink-0 text-[10px] text-muted sm:inline">
                    {formatDateTime(event.occurred_at)}
                  </span>
                  <span className="vs-mono hidden shrink-0 text-[9px] text-faint md:inline">
                    {event.hash.slice(0, 10)}…
                  </span>
                </summary>
                <div className="mt-2 rounded-[10px] bg-[#F8FAFD] p-2.5">
                  <p className="vs-mono text-[9px] text-faint">
                    prev {event.prev_hash.slice(0, 18)}…
                  </p>
                  <p className="vs-mono mt-1 text-[9px] text-faint">
                    hash {event.hash.slice(0, 18)}…
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[9.5px] leading-relaxed text-ink-2">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11.5px] text-muted">No audit events found.</p>
      )}
    </Card>
  )
}

function Provenance({ data }: { data: TimelineResponse }) {
  const { call, model, policy } = data
  return (
    <Card className="p-5">
      <SectionHeader title="Provenance" description="Exactly what produced these decisions." />
      <dl className="mt-3 space-y-2.5">
        {[
          ['Model', model.version ?? '—'],
          ['Model type', model.kind ?? '—'],
          ['Policy', policy.version ?? '—'],
          ['Windows', String(data.windows.length)],
          ['Audio expires', call.audio.expires_at ? formatDateTime(call.audio.expires_at) : '—'],
          ['Consent reference', call.consent_reference ?? 'Not recorded'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="max-w-[60%] break-words text-right text-[11px] font-medium text-ink-2">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 border-t border-line pt-3">
        <p className="vs-mono break-all text-[9px] leading-relaxed text-faint">
          artifact {model.artifact_digest ?? '—'}
        </p>
      </div>

      {model.kind === 'heuristic-baseline' ? (
        <div className="mt-3">
          <InfoNote tone="warning" title="Unvalidated baseline">
            This build ships a hand-authored acoustic baseline, not a trained or
            calibrated affect model. Dimensional outputs are interpretable
            proxies. Validation targets (CCC, distress recall, group recall gap)
            are not yet verified.
          </InfoNote>
        </div>
      ) : null}
    </Card>
  )
}

export default function CallReview() {
  const { callId } = useParams<{ callId: string }>()
  const [playhead, setPlayhead] = useState(0)
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null)

  const timeline = useQuery({
    queryKey: ['timeline', callId],
    queryFn: () => callsApi.timeline(callId as string),
    enabled: Boolean(callId),
    refetchInterval: (query) => {
      const status = query.state.data?.call.status
      return status && PROCESSING_STATES.has(status) ? 1500 : false
    },
  })

  const data = timeline.data
  const duration = data?.call.duration_seconds ?? 0

  const requestSeek = (seconds: number) => {
    setPlayhead(seconds)
    setSeekRequest({ seconds, nonce: Date.now() })
  }

  const openEpisodes = useMemo(
    () => (data?.episodes ?? []).slice().sort((a, b) => b.severity - a.severity),
    [data],
  )

  if (!callId) return null

  return (
    <AppShell
      title={
        data?.call.original_filename
          ? data.call.original_filename
          : 'Call review'
      }
      description={
        data
          ? `Call ${data.call.id.slice(0, 8)} · uploaded ${formatDateTime(data.call.created_at)}`
          : 'Loading call…'
      }
      actions={
        <Link to="/app/reviews" className="vs-btn vs-btn-secondary hidden sm:inline-flex">
          All reviews
        </Link>
      }
    >
      {timeline.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Skeleton className="h-[340px] w-full" />
            <Skeleton className="h-[340px] w-full" />
          </div>
        </div>
      ) : timeline.isError ? (
        <EmptyState
          icon={<AlertIcon size={18} />}
          title="This call could not be loaded"
          description="It may not exist, or your role may not have access to it."
          action={
            <Link to="/app/reviews" className="vs-btn vs-btn-primary">
              Back to reviews
            </Link>
          }
        />
      ) : !data ? null : PROCESSING_STATES.has(data.call.status) ? (
        <ProcessingState callId={callId} />
      ) : data.call.status === 'failed' ? (
        <FailedState message={data.call.error_message} callId={callId} />
      ) : (
        <div className="space-y-4">
          {/* Safety banner */}
          {data.call.action === 'HANDOFF_IMMEDIATE' ? (
            <div className="animate-fade-up rounded-[18px] border border-[#EFCEC8] bg-[linear-gradient(180deg,#FDF6F4_0%,#FBEFEC_100%)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-clay shadow-sm">
                    <AlertIcon size={19} />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#7E342C]">
                      Immediate human handoff required
                    </h2>
                    <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-[#8E3E36]">
                      A distress rule fired and the deterministic policy returned{' '}
                      <span className="font-semibold">HANDOFF_IMMEDIATE</span>. Automated
                      payment prompts are locked on the server. Do not continue
                      collection pressure; a supervisor must take over this
                      conversation.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <LockBadge locked={data.call.script_locked} />
                  <Badge tone="danger" icon={<HeadphonesIcon size={12} />}>
                    Human support
                  </Badge>
                </div>
              </div>
              {data.handoff ? (
                <div className="mt-3 grid gap-2 border-t border-[#EFCEC8] pt-3 sm:grid-cols-4">
                  {[
                    ['Handoff', data.handoff.id.slice(0, 8)],
                    ['Raised', formatDateTime(data.handoff.raised_at)],
                    ['Trigger', data.handoff.trigger_rule],
                    ['Status', data.handoff.status],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[9.5px] uppercase tracking-[0.05em] text-[#A97067]">
                        {label}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium capitalize text-[#7E342C]">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-[10.5px] leading-relaxed text-[#A97067]">
                Supervisor acknowledgment and reason-bearing lock release are not
                part of this version. The handoff stays open and the lock stays
                engaged until an authorized supervisor acts through the API.
              </p>
            </div>
          ) : data.call.action === 'REVIEW' ? (
            <div className="rounded-[18px] border border-[#F0DDBB] bg-[#FEFBF4] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white text-[#8A6127] shadow-sm">
                  <ClockIcon size={17} />
                </span>
                <div>
                  <h2 className="text-[13.5px] font-semibold text-[#7C5A25]">
                    Flagged for human review
                  </h2>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#8A6127]">
                    Policy returned <span className="font-medium">REVIEW</span>{' '}
                    — {openEpisodes.length} moment
                    {openEpisodes.length === 1 ? '' : 's'} need a person to look.
                    Script lock is not engaged for review-only actions; no
                    automated conclusion about the borrower may be drawn.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] border border-[#D3E6CB] bg-[#F6FAF4] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white text-sage-ink shadow-sm">
                  <CheckIcon size={17} />
                </span>
                <div>
                  <h2 className="text-[13.5px] font-semibold text-[#446045]">
                    No rule exceeded Continue
                  </h2>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-sage-ink">
                    Every scored window stayed below the review threshold under
                    policy {policyLabel(data)}. This is the absence of a flag, not
                    a certification that the borrower was comfortable.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.52fr_1fr] [&>*]:min-w-0">
            <div className="space-y-4">
              <Card className="p-5">
                <SectionHeader
                  title="Audio and synchronized timeline"
                  description="Click anywhere on the timeline to seek. The playhead follows playback."
                  action={<StatusBadge status={data.call.status} />}
                />
                <div className="mt-4">
                  <AudioPlayer
                    audioPath={data.call.audio.available ? data.call.audio.url : null}
                    seekRequest={seekRequest}
                    onTime={setPlayhead}
                    disabled={!data.call.audio.available}
                    disabledLabel={
                      data.call.audio.expired
                        ? 'Audio expired under the retention policy. The timeline and decisions remain available.'
                        : 'No audio is stored for this call.'
                    }
                    durationHint={duration}
                    title={`${formatDuration(duration)} recording · ${data.windows.length} scored windows`}
                  />
                </div>
                <div className="mt-4">
                  {data.windows.length > 0 ? (
                    <Timeline
                      windows={data.windows}
                      duration={duration || data.windows[data.windows.length - 1].end}
                      playhead={playhead}
                      onSeek={requestSeek}
                      episodes={data.episodes}
                    />
                  ) : (
                    <EmptyState
                      compact
                      icon={<WaveformIcon size={18} />}
                      title="No scored windows"
                      description="The pipeline produced no window-level results for this call."
                    />
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <SectionHeader
                  title="Flagged moments"
                  description="Grouped contiguous windows whose policy action exceeded Continue. Evidence is copied from the rules that actually fired."
                  action={
                    <Badge tone="neutral">
                      {openEpisodes.length} moment{openEpisodes.length === 1 ? '' : 's'}
                    </Badge>
                  }
                />
                <div className="mt-4 space-y-3">
                  {openEpisodes.length > 0 ? (
                    openEpisodes.map((episode) => (
                      <EpisodeCard
                        key={`${episode.start_seconds}-${episode.kind}`}
                        episode={episode}
                      />
                    ))
                  ) : (
                    <EmptyState
                      compact
                      icon={<CheckIcon size={18} />}
                      title="No risky moments flagged"
                      description="No policy rule fired across this call's scored windows."
                    />
                  )}
                </div>
              </Card>

              <Decisions windows={data.windows} />
              <AuditTrail callId={data.call.id} />
            </div>

            <div className="space-y-4">
              {data.call.action === 'HANDOFF_IMMEDIATE' ? (
                <Card className="p-5">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-clay-soft text-clay">
                      <LockIcon size={16} />
                    </span>
                    <div>
                      <h2 className="text-[13px] font-semibold text-ink">Script lock</h2>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                        Automated payment prompts are disabled server-side for
                        this call. The lock is independent of the browser: closing
                        this page does not release it.
                      </p>
                      <p className="mt-2 text-[10.5px] font-medium text-clay">
                        Release requires supervisor role, an acknowledged handoff
                        and a documented reason.
                      </p>
                    </div>
                  </div>
                </Card>
              ) : null}

              <Assessment windows={data.windows} />
              <Provenance data={data} />

              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <ShieldIcon size={15} className="text-primary" />
                  <h2 className="text-[13px] font-semibold text-ink">What this does not mean</h2>
                </div>
                <ul className="mt-3 space-y-2">
                  {[
                    'It is not a diagnosis of the borrower’s mental state.',
                    'It is not a lie-detection or credibility result.',
                    'It is not a credit, eligibility or profiling signal.',
                    'It does not authorize automated pressure of any kind.',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#8FA4E4]" />
                      {line}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-5">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-sunken text-muted">
                    <FileIcon size={15} />
                  </span>
                  <div>
                    <h2 className="text-[12.5px] font-semibold text-ink">
                      Need a different recording?
                    </h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Upload another call from the intake workspace. Each call
                      keeps its own immutable decision and audit record.
                    </p>
                    <Link
                      to="/app"
                      className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary-hover"
                    >
                      Open intake <ArrowRightIcon size={12} />
                    </Link>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function policyLabel(data: TimelineResponse) {
  return data.policy.version ?? 'unknown'
}
