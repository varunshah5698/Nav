import { Link } from 'react-router-dom'
import { ArrowRightIcon, LogoMark } from '../components/icons'

export default function NotFound() {
  return (
    <div className="vs-shell flex min-h-screen items-center justify-center px-4">
      <div className="vs-card w-full max-w-[440px] p-7 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary text-white">
          <LogoMark size={21} />
        </span>
        <p className="mt-4 text-[11px] font-medium text-muted">404</p>
        <h1 className="mt-1 text-[21px] font-semibold tracking-[-0.02em] text-ink">
          That page does not exist
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Version 1 of VoxSafe has four workspaces: audio intake, reviews, the
          decision policy, and system status.
        </p>
        <Link to="/app" className="vs-btn vs-btn-primary mt-5">
          Open intake <ArrowRightIcon size={14} />
        </Link>
      </div>
    </div>
  )
}
