import { useQuery } from '@tanstack/react-query'
import { systemApi } from '../api/client'
import { AppShell } from '../components/AppShell'
import {
  ActionBadge,
  Card,
  EmptyState,
  InfoNote,
  SectionHeader,
  Skeleton,
} from '../components/ui'
import { AlertIcon, InfoIcon, ShieldIcon } from '../components/icons'

export default function Policy() {
  const policy = useQuery({
    queryKey: ['policy', 'active'],
    queryFn: systemApi.activePolicy,
  })

  return (
    <AppShell
      title="Decision policy"
      description="The deterministic rules that convert estimates into actions"
    >
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionHeader
              title="Active policy"
              description="Read-only in version 1. Editing, review and two-person activation are not exposed yet."
              action={
                policy.data ? (
                  <span className="vs-mono text-[10px] text-muted">{policy.data.version}</span>
                ) : null
              }
            />

            {policy.isLoading ? (
              <div className="mt-4 space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : policy.isError ? (
              <div className="mt-4">
                <EmptyState
                  icon={<AlertIcon size={18} />}
                  title="Policy could not be loaded"
                  description="No valid active policy is available. Analysis will refuse to run without one."
                />
              </div>
            ) : policy.data ? (
              <>
                <p className="mt-3 max-w-[75ch] text-[12px] leading-relaxed text-ink-2">
                  {policy.data.description}
                </p>

                <div className="mt-5 space-y-3">
                  {policy.data.rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-[14px] border border-line bg-[#FBFCFE] p-3.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="vs-mono rounded-[6px] bg-sunken px-1.5 py-0.5 text-[9.5px] text-muted">
                            {rule.id}
                          </span>
                          <p className="text-[12.5px] font-semibold text-ink">
                            {rule.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {rule.requires_feature ? (
                            <span className="vs-badge bg-sunken text-muted">
                              needs {rule.requires_feature}
                            </span>
                          ) : null}
                          <ActionBadge action={rule.action} />
                        </div>
                      </div>
                      <p className="vs-mono mt-2 break-words text-[10px] leading-relaxed text-ink-2">
                        {rule.expression}
                      </p>
                      {!rule.enabled ? (
                        <p className="mt-1.5 text-[10.5px] text-faint">
                          Rule is currently disabled.
                        </p>
                      ) : null}
                      {rule.requires_feature === 'credibility' ? (
                        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
                          Disabled by default. Credibility is review-only, is never
                          a lie-detection result, and can never trigger an immediate
                          handoff.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <details className="mt-4 rounded-[12px] border border-line bg-[#F8FAFD] px-3.5 py-3">
                  <summary className="cursor-pointer text-[11px] font-medium text-ink-2">
                    View canonical YAML
                  </summary>
                  <pre className="mt-2 max-h-[320px] overflow-auto vs-scroll whitespace-pre-wrap break-words text-[10px] leading-relaxed text-ink-2">
                    {policy.data.yaml}
                  </pre>
                </details>
              </>
            ) : null}
          </Card>

          <Card className="p-5">
            <SectionHeader
              title="Why the order matters"
              description="The evaluator is independent of the frontend and is covered by property tests."
            />
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              {[
                ['1', 'Every rule evaluated', 'Each enabled rule is checked against the smoothed features.'],
                ['2', 'Maximum severity applied', 'Continue 0 → Review 1 → Immediate handoff 2, never the last rule.'],
                ['3', 'Human action required', 'A handoff persists with its audit event and server-side lock.'],
              ].map(([number, title, body]) => (
                <div key={number} className="rounded-[12px] border border-line bg-[#FBFCFE] p-3">
                  <span className="vs-mono text-[9.5px] text-faint">0{number}</span>
                  <p className="mt-1 text-[11.5px] font-semibold text-ink">{title}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldIcon size={15} className="text-primary" />
              <h2 className="text-[13px] font-semibold text-ink">Threshold status</h2>
            </div>
            <div className="mt-3 space-y-2.5">
              {[
                ['Source', 'Build-guide defaults R1–R5'],
                ['Calibration', 'None — thresholds are provisional'],
                ['Validation data', 'No in-domain annotated set'],
                ['Approval workflow', 'Not exposed in version 1'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-muted">{label}</span>
                  <span className="max-w-[58%] text-right text-[11px] font-medium text-ink-2">
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <InfoNote tone="warning" title="Do not treat these as tuned">
                A threshold that looks reasonable is not evidence that it is
                correct. These values must be recalibrated against consented,
                annotated, in-domain calls before operational reliance.
              </InfoNote>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <InfoIcon size={15} className="text-muted" />
              <h2 className="text-[13px] font-semibold text-ink">Insufficient evidence</h2>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Rule R4 returns <span className="font-medium text-ink-2">REVIEW</span>{' '}
              whenever fewer than eight seconds of usable speech exist in the last
              thirty. This is deliberate: an unassessable or quiet call must not be
              recorded as calm.
            </p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
              Short recordings will therefore show a review action at their start
              even when the voice is settled.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
