import { useQuery } from '@tanstack/react-query'
import { systemApi } from '../api/client'
import { AppShell } from '../components/AppShell'
import { Badge, Card, InfoNote, SectionHeader, Skeleton } from '../components/ui'
import { CheckIcon, InfoIcon, PulseIcon, WaveformIcon } from '../components/icons'
import { formatDateTime } from '../lib/format'

function CheckRow({
  label,
  ok,
  detail,
}: {
  label: string
  ok: boolean
  detail?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/70 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-ink">{label}</p>
        {detail ? <p className="mt-0.5 break-words text-[10.5px] text-muted">{detail}</p> : null}
      </div>
      <Badge
        tone={ok ? 'positive' : 'danger'}
        icon={ok ? <CheckIcon size={11} /> : <InfoIcon size={11} />}
      >
        {ok ? 'Operational' : 'Unavailable'}
      </Badge>
    </div>
  )
}

export default function Status() {
  const health = useQuery({
    queryKey: ['health', 'page'],
    queryFn: systemApi.health,
    refetchInterval: 10000,
  })

  const worker = health.data?.checks.inference_worker as
    | { healthy?: boolean; queued_jobs?: number; running_jobs?: number; last_seen_seconds_ago?: number }
    | undefined
  const model = health.data?.checks.model as
    | { version?: string; kind?: string; calibrated?: boolean | null }
    | undefined
  const policy = health.data?.checks.policy as { version?: string } | undefined
  const decoder = health.data?.checks.audio_decoder as { ok?: boolean; binary?: string } | undefined
  const database = health.data?.checks.database as { ok?: boolean } | undefined

  return (
    <AppShell
      title="System status"
      description="Live service checks from the backend, not cached decoration"
    >
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionHeader
              title="Service checks"
              description={`Checked ${formatDateTime(health.data?.checked_at)}`}
              action={
                health.data ? (
                  <Badge tone={health.data.status === 'ok' ? 'positive' : 'danger'}>
                    {health.data.status === 'ok' ? 'All checks passing' : 'Degraded'}
                  </Badge>
                ) : null
              }
            />

            {health.isLoading ? (
              <div className="mt-4 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : health.isError || !health.data ? (
              <div className="mt-4 rounded-[12px] border border-[#EFCEC8] bg-clay-soft px-3.5 py-3 text-[11.5px] text-clay">
                The status endpoint could not be reached. Treat the platform as
                unavailable and do not rely on any prior assessment.
              </div>
            ) : (
              <div className="mt-3">
                <CheckRow
                  label="API"
                  ok
                  detail="This response was served by the authenticated API."
                />
                <CheckRow
                  label="Database"
                  ok={Boolean(database?.ok)}
                  detail={database?.ok ? 'Connection and schema responding' : 'Query failed'}
                />
                <CheckRow
                  label="Audio decoder"
                  ok={Boolean(decoder?.ok)}
                  detail={decoder?.binary ? `ffmpeg at ${decoder.binary}` : 'ffmpeg not found'}
                />
                <CheckRow
                  label="Decision policy"
                  ok={Boolean(policy?.version)}
                  detail={policy?.version ? `Active version ${policy.version}` : 'No valid active policy'}
                />
                <CheckRow
                  label="Inference worker"
                  ok={Boolean(worker?.healthy)}
                  detail={
                    worker?.last_seen_seconds_ago === undefined
                      ? 'No heartbeat recorded'
                      : `Last heartbeat ${worker.last_seen_seconds_ago}s ago · ${worker.queued_jobs ?? 0} queued · ${worker.running_jobs ?? 0} running`
                  }
                />
              </div>
            )}

            <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
              A missing heartbeat is reported as unavailable. VoxSafe never treats
              absent telemetry as healthy.
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <WaveformIcon size={15} className="text-primary" />
                <h2 className="text-[13px] font-semibold text-ink">Scoring model</h2>
              </div>
              <dl className="mt-3 space-y-2">
                {[
                  ['Version', model?.version ?? '—'],
                  ['Type', model?.kind ?? '—'],
                  ['Calibrated', model?.calibrated === null ? '—' : model?.calibrated ? 'Yes' : 'No'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <dt className="text-[11px] text-muted">{label}</dt>
                    <dd className="text-[11px] font-medium text-ink-2">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
                No model artifact hash is shown as verified beyond the recorded
                baseline digest, and no evaluation metrics are displayed because no
                valid evaluation results exist.
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <PulseIcon size={15} className="text-primary" />
                <h2 className="text-[13px] font-semibold text-ink">Queue</h2>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-[12px] bg-[#F8FAFD] px-3 py-2.5">
                  <p className="vs-label">Queued jobs</p>
                  <p className="mt-1 text-[20px] font-semibold leading-none text-ink">
                    {worker?.queued_jobs ?? '—'}
                  </p>
                </div>
                <div className="rounded-[12px] bg-[#F8FAFD] px-3 py-2.5">
                  <p className="vs-label">Running</p>
                  <p className="mt-1 text-[20px] font-semibold leading-none text-ink">
                    {worker?.running_jobs ?? '—'}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
                Jobs are claimed by a conditional update, so the same job cannot be
                processed twice. Interrupted jobs are requeued on worker restart.
              </p>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-ink">What is verified here</h2>
            <ul className="mt-3 space-y-2">
              {[
                'Database connectivity and schema availability',
                'Presence of a valid, parseable active policy',
                'Audio decoder availability',
                'Inference worker heartbeat and queue depth',
                'Recorded model identity tied to this deployment',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#EDF5E9] text-sage-ink">
                    <CheckIcon size={10} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </Card>

          <InfoNote tone="warning" title="Not verified in version 1">
            Model accuracy targets — distress recall ≥ 0.95, arousal CCC ≥ 0.60,
            valence CCC ≥ 0.35 and a group recall gap under five percentage points
            — require consented, annotated evaluation data. This build does not
            report them as met.
          </InfoNote>

          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-ink">Deployment notes</h2>
            <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted">
              <li>Single-process SQLite by default; set DATABASE_URL for PostgreSQL.</li>
              <li>Local file storage replaces S3/MinIO in this development build.</li>
              <li>The in-process worker replaces Redis + RQ; the job contract is unchanged.</li>
              <li>Audio access is authenticated and audited; tokens never appear in URLs.</li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
