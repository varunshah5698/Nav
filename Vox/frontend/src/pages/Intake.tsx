import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, callsApi } from '../api/client'
import type { CallSummary } from '../api/types'
import { AppShell } from '../components/AppShell'
import {
  ActionBadge,
  Card,
  EmptyState,
  Field,
  InfoNote,
  SectionHeader,
  Skeleton,
  StatusBadge,
} from '../components/ui'
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  FileIcon,
  LockIcon,
  UploadIcon,
  WaveformIcon,
} from '../components/icons'
import { formatBytes, formatDateTime, formatDuration, relativeFromNow } from '../lib/format'

const ACCEPTED = ['.wav', '.mp3', '.opus', '.ogg', '.m4a', '.webm']
const MAX_MB = 50

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!ACCEPTED.some((ext) => name.endsWith(ext))) {
    return 'Unsupported format. Upload WAV, MP3 or Opus audio.'
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return `File is larger than the ${MAX_MB} MB intake limit.`
  }
  if (file.size === 0) return 'File is empty.'
  return null
}

function CallRow({ call }: { call: CallSummary }) {
  return (
    <Link
      to={`/app/calls/${call.id}`}
      className="vs-dashed-row group flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-[#FAFBFE] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-sunken text-muted">
          <FileIcon size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink">
            {call.original_filename ?? 'Untitled recording'}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
            <span>{formatDateTime(call.created_at)}</span>
            <span className="text-line-strong">·</span>
            <span className="vs-num">{formatDuration(call.duration_seconds)}</span>
            <span className="text-line-strong">·</span>
            <span className="vs-mono text-[9.5px]">{call.id.slice(0, 8)}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {call.script_locked ? (
          <span className="vs-badge bg-clay-soft text-clay">
            <LockIcon size={11} /> Locked
          </span>
        ) : null}
        {call.episode_count > 0 ? (
          <span className="vs-badge bg-sunken text-ink-2">
            {call.episode_count} risk moment{call.episode_count === 1 ? '' : 's'}
          </span>
        ) : null}
        <StatusBadge status={call.status} />
        {call.action ? <ActionBadge action={call.action} /> : null}
        <ArrowRightIcon
          size={14}
          className="ml-1 text-faint transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  )
}

export default function Intake() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [consent, setConsent] = useState(false)
  const [consentReference, setConsentReference] = useState('')
  const [recordingDate, setRecordingDate] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<'idle' | 'creating' | 'uploading' | 'queued'>('idle')

  const calls = useQuery({
    queryKey: ['calls'],
    queryFn: () => callsApi.list(25),
    refetchInterval: (query) => {
      const data = query.state.data
      const busy = data?.calls.some(
        (c) => c.status === 'queued' || c.status === 'processing' || c.status === 'uploading',
      )
      return busy ? 2500 : false
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Select an audio file first.')
      setStage('creating')
      const created = await callsApi.create({
        original_filename: file.name,
        size_bytes: file.size,
        recording_date: recordingDate || null,
        consent_confirmed: consent,
        consent_reference: consentReference.trim() || null,
      })
      setStage('uploading')
      await callsApi.upload(created.id, file, setProgress)
      setStage('queued')
      return created
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['calls'] })
      navigate(`/app/calls/${created.id}`)
    },
    onError: (error) => {
      setStage('idle')
      setProgress(0)
      setFileError(
        error instanceof ApiError ? error.messageText : 'Upload failed. Try again.',
      )
    },
  })

  const busy = mutation.isPending
  const busyLabel = useMemo(() => {
    if (stage === 'creating') return 'Registering call record…'
    if (stage === 'uploading') return `Uploading audio… ${progress}%`
    if (stage === 'queued') return 'Queued for analysis…'
    return ''
  }, [stage, progress])

  const choose = (selected: File | null) => {
    setFileError(null)
    if (!selected) {
      setFile(null)
      return
    }
    const problem = validateFile(selected)
    if (problem) {
      setFileError(problem)
      setFile(null)
      return
    }
    setFile(selected)
  }

  return (
    <AppShell
      title="Audio intake"
      description="Upload a recorded collection call for acoustic analysis"
      actions={
        <button
          type="button"
          className="vs-btn vs-btn-secondary hidden sm:inline-flex"
          onClick={() => calls.refetch()}
        >
          Refresh
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <SectionHeader
              title="New call recording"
              description="VoxSafe normalizes the upload to 16 kHz mono, detects speech and scores 3-second windows every 1.5 seconds. Nothing is transcribed."
            />

            <div
              className={`mt-5 rounded-[16px] border-2 border-dashed px-5 py-8 text-center transition-colors ${
                dragging
                  ? 'border-primary bg-primary-soft/40'
                  : file
                    ? 'border-[#CFE0C8] bg-[#F6FAF4]'
                    : 'border-line-strong bg-[#FAFBFE]'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                choose(event.dataTransfer.files?.[0] ?? null)
              }}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E6F1E2] text-sage-ink">
                    <CheckIcon size={20} />
                  </span>
                  <p className="text-[13px] font-semibold text-ink">{file.name}</p>
                  <p className="text-[11px] text-muted">
                    {formatBytes(file.size)} · ready to upload
                  </p>
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-medium text-primary hover:text-primary-hover"
                    onClick={() => {
                      setFile(null)
                      if (inputRef.current) inputRef.current.value = ''
                    }}
                    disabled={busy}
                  >
                    Choose a different file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-primary">
                    <UploadIcon size={20} />
                  </span>
                  <p className="text-[13px] font-semibold text-ink">
                    Drop a call recording here
                  </p>
                  <p className="max-w-[36ch] text-[11.5px] leading-relaxed text-muted">
                    WAV, MP3 or Opus. Up to {MAX_MB} MB and at least 3 seconds of
                    audio so one full window can be scored.
                  </p>
                  <button
                    type="button"
                    className="vs-btn vs-btn-secondary mt-2"
                    onClick={() => inputRef.current?.click()}
                  >
                    Browse files
                  </button>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(',')}
                className="sr-only"
                aria-label="Call recording file"
                onChange={(event) => choose(event.target.files?.[0] ?? null)}
              />
            </div>

            {fileError ? (
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-clay" role="alert">
                <AlertIcon size={13} className="mt-px shrink-0" />
                {fileError}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Recording date"
                htmlFor="recording-date"
                hint="optional"
                optional
              >
                <input
                  id="recording-date"
                  type="date"
                  className="vs-input"
                  value={recordingDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setRecordingDate(event.target.value)}
                />
              </Field>
              <Field
                label="Consent reference"
                htmlFor="consent-reference"
                hint="optional"
                optional
              >
                <input
                  id="consent-reference"
                  className="vs-input"
                  placeholder="e.g. case note or notice ID"
                  value={consentReference}
                  maxLength={200}
                  onChange={(event) => setConsentReference(event.target.value)}
                />
              </Field>
            </div>

            <label
              htmlFor="consent"
              className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-line bg-[#F8FAFD] px-3.5 py-3"
            >
              <input
                id="consent"
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[#4D5BAD]"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={busy}
              />
              <span className="text-[11.5px] leading-relaxed text-ink-2">
                I confirm this recording was made with the required borrower
                notice or consent, and that I am authorized to process it.
                <span className="mt-0.5 block text-[10.5px] text-muted">
                  Uploads without confirmed consent are refused by the API.
                </span>
              </span>
            </label>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10.5px] leading-relaxed text-muted">
                Audio is retained for the configured retention window; timelines
                and decisions are retained separately.
              </p>
              <button
                type="button"
                className="vs-btn vs-btn-primary h-10 shrink-0 px-5"
                disabled={!file || !consent || busy}
                onClick={() => mutation.mutate()}
              >
                {busy ? busyLabel : 'Upload and analyze'}
                {!busy ? <ArrowRightIcon size={15} /> : null}
              </button>
            </div>

            {busy ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{
                      width:
                        stage === 'uploading'
                          ? `${Math.max(6, progress)}%`
                          : stage === 'queued'
                            ? '100%'
                            : '12%',
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[10.5px] text-muted" role="status">
                  {busyLabel}
                </p>
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <SectionHeader
              title="What happens to this audio"
              description="The same deterministic pipeline runs for every recording. No model output can skip a step."
            />
            <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {[
                'Decoded to mono 16 kHz PCM and peak-normalized',
                'Voice activity detection marks speech and silence',
                '3 s windows every 1.5 s receive acoustic descriptors',
                'Smoothed features enter the versioned policy engine',
                'Highest severity wins: Continue, Review or Handoff',
                'Immediate handoff engages the server-side script lock',
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="vs-mono mt-0.5 text-[9.5px] text-faint">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[11.5px] leading-relaxed text-ink-2">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <InfoNote tone="warning" title="Absence of evidence is not calm">
                If a call has too little usable speech, rule R4 returns a review
                action. Silence is stored as silence and scored as{' '}
                <span className="font-medium">unclear</span>, never as calm.
              </InfoNote>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card flush>
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <div>
                <h2 className="vs-section-title">Recent calls</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  {calls.data ? `${calls.data.total} in this workspace` : 'Loading…'}
                </p>
              </div>
              <Link
                to="/app/reviews"
                className="text-[11px] font-medium text-primary hover:text-primary-hover"
              >
                Open reviews
              </Link>
            </div>
            <div className="max-h-[520px] overflow-y-auto vs-scroll border-t border-line">
              {calls.isLoading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : calls.isError ? (
                <div className="p-4">
                  <EmptyState
                    compact
                    icon={<AlertIcon size={18} />}
                    title="Calls could not be loaded"
                    description="The API did not return call records. Check the system status before uploading."
                  />
                </div>
              ) : calls.data && calls.data.calls.length > 0 ? (
                calls.data.calls.map((call) => <CallRow key={call.id} call={call} />)
              ) : (
                <div className="p-4">
                  <EmptyState
                    compact
                    icon={<WaveformIcon size={18} />}
                    title="No calls have been processed yet"
                    description="This workspace has no stored call records. Upload a real recording to create the first one; VoxSafe never fills this list with sample calls."
                  />
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary-soft text-primary">
                <LockIcon size={16} />
              </span>
              <div>
                <h2 className="text-[13px] font-semibold text-ink">
                  V1 scope: recorded calls only
                </h2>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  Live telephony ingestion, supervisor acknowledgment and policy
                  editing are not part of version 1. This build covers one
                  complete path: a real recording becomes an auditable set of
                  flagged moments.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-ink">Handling guidance</h2>
            <ul className="mt-3 space-y-2">
              {[
                'Do not upload recordings you are not authorized to process.',
                'A flagged moment is a prompt for a human, not a finding about a borrower.',
                'Never read raw vocal-state values to a borrower or into a script.',
                'If processing fails, treat the call as unassessed.',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#8FA4E4]" />
                  <span className="text-[11.5px] leading-relaxed text-ink-2">{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-[10.5px] text-faint">
              Last workspace activity{' '}
              {calls.data?.calls[0]
                ? relativeFromNow(calls.data.calls[0].created_at)
                : '—'}
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
