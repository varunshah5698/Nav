import { useMemo, useRef, useState } from 'react'
import type { Episode, WindowPoint } from '../api/types'
import { formatClock, STATE_LABEL } from '../lib/format'

const WIDTH = 1000

const LANES = [
  { key: 'arousal', label: 'Arousal', color: '#4D5BAD' },
  { key: 'valence', label: 'Valence', color: '#78A3B2' },
  { key: 'dominance', label: 'Dominance', color: '#7B9D7C' },
] as const

const ACTION_FILL: Record<string, string> = {
  CONTINUE: '#DCE9D6',
  REVIEW: '#F2D7A8',
  HANDOFF_IMMEDIATE: '#D98A80',
}

const LANE_HEIGHT = 44
const LANE_GAP = 10
const TOP_PAD = 16
const STATE_HEIGHT = 12
const ACTION_HEIGHT = 8

export function Timeline({
  windows,
  duration,
  playhead,
  onSeek,
  episodes,
}: {
  windows: WindowPoint[]
  duration: number
  playhead: number
  onSeek: (seconds: number) => void
  episodes: Episode[]
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; index: number } | null>(null)

  const lanesBottom = TOP_PAD + LANES.length * (LANE_HEIGHT + LANE_GAP)
  const stateY = lanesBottom - LANE_GAP + 2
  const actionY = stateY + STATE_HEIGHT + 8
  const height = actionY + ACTION_HEIGHT + 34

  const durationValue = Math.max(duration, 0.1)

  const paths = useMemo(() => {
    return LANES.map((lane) => {
      const points = windows.map((w) => {
        const x = (w.start + (w.end - w.start) / 2) / durationValue * WIDTH
        const value = w[`${lane.key}_ema` as const] as number
        const y =
          TOP_PAD +
          LANES.findIndex((l) => l.key === lane.key) * (LANE_HEIGHT + LANE_GAP) +
          LANE_HEIGHT / 2 -
          value * (LANE_HEIGHT / 2 - 4)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      return points.join(' ')
    })
  }, [windows, durationValue])

  const windowWidth = windows[0]
    ? Math.max(2, ((windows[0].end - windows[0].start) / durationValue) * WIDTH)
    : 2

  const seekFromEvent = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(ratio * durationValue)
  }

  if (windows.length === 0) return null

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full touch-none select-none"
        role="slider"
        tabIndex={0}
        aria-label="Call timeline. Use arrow keys to seek."
        aria-valuemin={0}
        aria-valuemax={Math.round(durationValue)}
        aria-valuenow={Math.round(playhead)}
        aria-valuetext={`${formatClock(playhead)} of ${formatClock(durationValue)}`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            const delta = event.key === 'ArrowRight' ? 1 : -1
            onSeek(Math.max(0, Math.min(durationValue, playhead + delta)))
          }
        }}
        onClick={(event) => seekFromEvent(event.clientX)}
        onMouseMove={(event) => {
          const el = ref.current
          if (!el) return
          const rect = el.getBoundingClientRect()
          const px = ((event.clientX - rect.left) / rect.width) * WIDTH
          const seconds = (px / WIDTH) * durationValue
          let best = 0
          let bestDistance = Number.POSITIVE_INFINITY
          windows.forEach((w, i) => {
            const mid = (w.start + w.end) / 2
            const distance = Math.abs(mid - seconds)
            if (distance < bestDistance) {
              bestDistance = distance
              best = i
            }
          })
          setHover({ x: px, index: best })
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* risk episodes */}
        {episodes.map((episode) => {
          const x = (episode.start_seconds / durationValue) * WIDTH
          const w = Math.max(
            3,
            ((episode.end_seconds - episode.start_seconds) / durationValue) * WIDTH,
          )
          return (
            <rect
              key={`${episode.start_seconds}-${episode.kind}`}
              x={x}
              y={6}
              width={w}
              height={height - 28}
              fill={episode.severity === 2 ? '#C2564C' : '#D9A14C'}
              opacity={0.07}
            />
          )
        })}

        {LANES.map((lane, laneIndex) => {
          const y = TOP_PAD + laneIndex * (LANE_HEIGHT + LANE_GAP)
          return (
            <g key={lane.key}>
              <line
                x1={0}
                x2={WIDTH}
                y1={y + LANE_HEIGHT / 2}
                y2={y + LANE_HEIGHT / 2}
                stroke="#E5EBF4"
                strokeDasharray="3 5"
              />
              <text x={0} y={y - 2} fontSize="9" fill="#A6B0C2" fontFamily="inherit">
                {lane.label}
              </text>
              <polyline
                points={paths[laneIndex]}
                fill="none"
                stroke={lane.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}

        {/* speech / silence strip */}
        {windows.map((w) => {
          const x = (w.start / durationValue) * WIDTH
          return (
            <rect
              key={`speech-${w.index}`}
              x={x}
              y={stateY}
              width={windowWidth}
              height={STATE_HEIGHT}
              rx={2}
              fill={w.speech_ratio > 0.05 ? '#C9D4EC' : '#EDF1F8'}
              opacity={w.speech_ratio > 0.05 ? 0.5 + w.speech_ratio * 0.5 : 1}
            />
          )
        })}

        {/* action strip */}
        {windows.map((w) => {
          const x = (w.start / durationValue) * WIDTH
          return (
            <rect
              key={`action-${w.index}`}
              x={x}
              y={actionY}
              width={windowWidth}
              height={ACTION_HEIGHT}
              rx={2}
              fill={ACTION_FILL[w.action] ?? '#DCE9D6'}
            />
          )
        })}

        {/* axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={ratio * WIDTH}
              x2={ratio * WIDTH}
              y1={height - 18}
              y2={height - 14}
              stroke="#A6B0C2"
            />
            <text
              x={ratio * WIDTH}
              y={height - 4}
              fontSize="9"
              fill="#A6B0C2"
              textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}
              fontFamily="inherit"
            >
              {formatClock(ratio * durationValue)}
            </text>
          </g>
        ))}

        {hover ? (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={4}
            y2={height - 20}
            stroke="#4D5BAD"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.5}
          />
        ) : null}

        <line
          x1={(playhead / durationValue) * WIDTH}
          x2={(playhead / durationValue) * WIDTH}
          y1={4}
          y2={height - 20}
          stroke="#060607"
          strokeWidth={1.6}
        />
        <circle
          cx={(playhead / durationValue) * WIDTH}
          cy={4}
          r={3.5}
          fill="#060607"
        />
      </svg>

      {hover ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[10px] border border-line bg-white px-2.5 py-2 shadow-raised"
          style={{ left: `${(hover.x / WIDTH) * 100}%` }}
        >
          <p className="vs-mono text-[9.5px] text-muted">
            {formatClock(windows[hover.index].start)} – {formatClock(windows[hover.index].end)}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-ink">
            {STATE_LABEL[windows[hover.index].state] ?? windows[hover.index].state}
            <span className="ml-1.5 font-normal text-muted">
              {Math.round(windows[hover.index].confidence * 100)}%
            </span>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            arousal {windows[hover.index].arousal_ema.toFixed(2)} · valence{' '}
            {windows[hover.index].valence_ema.toFixed(2)}
          </p>
          {windows[hover.index].rules.length ? (
            <p className="mt-1 text-[10px] font-medium text-clay">
              {windows[hover.index].rules.join(' · ')}
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-sage-ink">No rule fired</p>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        {LANES.map((lane) => (
          <span key={lane.key} className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
            <span className="h-[2px] w-4 rounded-full" style={{ background: lane.color }} />
            {lane.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
          <span className="h-2 w-4 rounded-sm bg-[#C9D4EC]" />
          Speech activity
        </span>
        <span className="flex items-center gap-3 pl-1 text-[10.5px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: ACTION_FILL.CONTINUE }} />
            continue
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: ACTION_FILL.REVIEW }} />
            review
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: ACTION_FILL.HANDOFF_IMMEDIATE }}
            />
            immediate
          </span>
        </span>
      </div>
    </div>
  )
}
