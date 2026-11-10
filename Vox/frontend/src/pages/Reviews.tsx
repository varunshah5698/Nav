import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { callsApi } from '../api/client'
import type { CallAction } from '../api/types'
import { AppShell } from '../components/AppShell'
import {
  ActionBadge,
  Card,
  EmptyState,
  SectionHeader,
  Skeleton,
  StatusBadge,
} from '../components/ui'
import { AlertIcon, ArrowRightIcon, LockIcon, WaveformIcon } from '../components/icons'
import { formatDateTime, formatDuration } from '../lib/format'

type Filter = 'all' | 'flagged' | CallAction

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All calls' },
  { id: 'flagged', label: 'Any flag' },
  { id: 'HANDOFF_IMMEDIATE', label: 'Immediate handoff' },
  { id: 'REVIEW', label: 'Review' },
  { id: 'CONTINUE', label: 'Continue' },
]

export default function Reviews() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const calls = useQuery({
    queryKey: ['calls', 'reviews'],
    queryFn: () => callsApi.list(100),
  })

  const rows = useMemo(() => {
    const all = calls.data?.calls ?? []
    const term = search.trim().toLowerCase()
    return all.filter((call) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'flagged'
            ? call.action === 'REVIEW' || call.action === 'HANDOFF_IMMEDIATE'
            : call.action === filter
      const matchesSearch =
        !term ||
        (call.original_filename ?? '').toLowerCase().includes(term) ||
        call.id.toLowerCase().includes(term)
      return matchesFilter && matchesSearch
    })
  }, [calls.data, filter, search])

  const counts = useMemo(() => {
    const all = calls.data?.calls ?? []
    return {
      total: all.length,
      handoff: all.filter((c) => c.action === 'HANDOFF_IMMEDIATE').length,
      review: all.filter((c) => c.action === 'REVIEW').length,
      locked: all.filter((c) => c.script_locked).length,
    }
  }, [calls.data])

  return (
    <AppShell
      title="Reviews"
      description="Recorded calls and the highest action each one produced"
      actions={
        <Link to="/app" className="vs-btn vs-btn-primary hidden sm:inline-flex">
          New intake
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Calls in workspace', value: counts.total },
          { label: 'Immediate handoffs', value: counts.handoff },
          { label: 'Review actions', value: counts.review },
          { label: 'Active script locks', value: counts.locked },
        ].map((stat) => (
          <Card key={stat.label} className="px-4 py-3.5">
            <p className="vs-label">{stat.label}</p>
            <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {calls.isLoading ? '—' : stat.value}
            </p>
            <p className="mt-1.5 text-[10.5px] text-faint">
              Computed from stored call records
            </p>
          </Card>
        ))}
      </div>

      <Card className="mt-4" flush>
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-sunken p-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="vs-tab"
                data-active={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="call-search" className="sr-only">
              Search calls
            </label>
            <input
              id="call-search"
              className="vs-input h-9 w-full max-w-[260px] text-[12px]"
              placeholder="Search file name or call ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="border-t border-line">
          {calls.isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : calls.isError ? (
            <div className="p-4">
              <EmptyState
                icon={<AlertIcon size={18} />}
                title="Calls could not be loaded"
                description="The API returned an error. Check system status and try again."
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<WaveformIcon size={18} />}
                title={
                  calls.data?.total === 0
                    ? 'No calls have been processed yet'
                    : 'No calls match this filter'
                }
                description={
                  calls.data?.total === 0
                    ? 'Real recordings you upload will appear here with their highest policy action. Sample calls are never inserted.'
                    : 'Change the action filter or clear the search to see other stored calls.'
                }
                action={
                  calls.data?.total === 0 ? (
                    <Link to="/app" className="vs-btn vs-btn-primary">
                      Upload a recording
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto vs-scroll">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-line text-left">
                    {['Recording', 'Created', 'Duration', 'Status', 'Highest action', 'Flags'].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((call) => (
                    <tr
                      key={call.id}
                      className="group border-b border-line/70 last:border-0 hover:bg-[#FAFBFE]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/app/calls/${call.id}`}
                          className="flex items-center gap-2 text-[12.5px] font-medium text-ink hover:text-primary"
                        >
                          <span className="max-w-[260px] truncate">
                            {call.original_filename ?? 'Untitled recording'}
                          </span>
                          <ArrowRightIcon
                            size={13}
                            className="text-faint transition-transform group-hover:translate-x-0.5"
                          />
                        </Link>
                        <span className="vs-mono mt-0.5 block text-[9.5px] text-faint">
                          {call.id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-ink-2">
                        {formatDateTime(call.created_at)}
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-ink-2">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={call.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ActionBadge action={call.action} />
                          {call.script_locked ? (
                            <span className="vs-badge bg-clay-soft text-clay">
                              <LockIcon size={11} /> Locked
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-ink-2">
                        {call.episode_count > 0 ? (
                          <span>
                            {call.episode_count} moment
                            {call.episode_count === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="text-faint">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <SectionHeader
          title="How to read this list"
          description="Actions are the maximum severity produced by the active policy across all windows of a call. A 'Review' action caused only by insufficient speech is not evidence of distress."
        />
      </Card>
    </AppShell>
  )
}
