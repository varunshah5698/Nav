import { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { systemApi } from '../api/client'
import {
  CallsIcon,
  LogoMark,
  LogoutIcon,
  PolicyIcon,
  PulseIcon,
  UploadIcon,
} from './icons'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/app', label: 'Intake', icon: <UploadIcon size={19} />, end: true },
  { to: '/app/reviews', label: 'Reviews', icon: <CallsIcon size={19} /> },
  { to: '/app/policy', label: 'Policy', icon: <PolicyIcon size={19} /> },
  { to: '/app/status', label: 'Status', icon: <PulseIcon size={19} /> },
]

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-white shadow-[0_10px_24px_-14px_rgba(77,91,173,0.9)]">
        <LogoMark size={19} />
      </span>
      <span className="hidden flex-col leading-none sm:flex">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">VoxSafe</span>
        <span className="mt-1 text-[10.5px] font-medium tracking-[0.02em] text-muted">
          Borrower protection
        </span>
      </span>
    </div>
  )
}

function HealthPill() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: systemApi.health,
    refetchInterval: 15000,
    staleTime: 5000,
  })
  const ok = data?.status === 'ok'
  const label = data ? (ok ? 'Systems nominal' : 'Degraded service') : 'Checking systems'
  return (
    <span
      className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium md:inline-flex ${
        ok
          ? 'border-[#D3E6CB] bg-[#F3F9F0] text-[#446045]'
          : 'border-[#EFCEC8] bg-[#FCF1EF] text-[#8E3E36]'
      }`}
      title={data?.degraded.length ? `Degraded: ${data.degraded.join(', ')}` : undefined}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: ok ? '#7B9D7C' : '#C2564C' }}
      />
      {label}
    </span>
  )
}

function UserChip() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  const initials = user.full_name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-[12.5px] font-semibold text-ink">{user.full_name}</p>
        <p className="text-[10.5px] capitalize text-muted">{user.role.replace('_', ' ')}</p>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DCE3F7] text-[12px] font-semibold text-primary">
        {initials || 'VS'}
      </span>
      <button
        type="button"
        className="vs-rail-tile h-9 w-9"
        title="Sign out"
        aria-label="Sign out"
        onClick={async () => {
          await logout()
          navigate('/login', { replace: true })
        }}
      >
        <LogoutIcon size={17} />
      </button>
    </div>
  )
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} — VoxSafe`
  }, [title])

  return (
    <div className="vs-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--vs-content-max)] gap-4 px-3 py-3 sm:gap-5 sm:px-5 sm:py-5">
        {/* Desktop rail */}
        <aside className="sticky top-5 hidden h-[calc(100vh-40px)] w-[var(--vs-rail-width)] shrink-0 flex-col items-center justify-between rounded-[24px] border border-line bg-surface py-4 shadow-card md:flex">
          <div className="flex flex-col items-center gap-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary text-white">
              <LogoMark size={20} />
            </span>
            <nav className="flex flex-col items-center gap-1.5" aria-label="Workspaces">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `vs-rail-tile${isActive ? ' is-active' : ''}`
                  }
                  title={item.label}
                  aria-label={item.label}
                >
                  {item.icon}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9.5px] font-medium tracking-[0.08em] text-faint">V1</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-[10px] font-semibold text-muted">
              PR
            </span>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 pb-20 md:pb-0">
          <header className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-surface px-4 py-3 shadow-card sm:px-5">
            <div className="flex min-w-0 items-center gap-3 sm:gap-5">
              <div className="md:hidden">
                <Wordmark />
              </div>
              <div className="hidden min-w-0 md:block">
                <Wordmark />
              </div>
              <div className="hidden h-8 w-px shrink-0 bg-line lg:block" />
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-0.5 hidden truncate text-[11px] text-muted sm:block">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <HealthPill />
              {actions}
              <UserChip />
            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-3 bottom-3 z-20 flex items-center justify-around rounded-[18px] border border-line bg-surface px-2 py-2 shadow-raised md:hidden"
        aria-label="Workspaces"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex flex-1 flex-col items-center gap-1 rounded-[12px] px-1 py-1.5 text-[10px] font-medium text-muted"
            aria-label={item.label}
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${
                    isActive ? 'bg-primary text-white' : 'text-muted'
                  }`}
                >
                  {item.icon}
                </span>
                <span className={isActive ? 'text-ink' : undefined}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
