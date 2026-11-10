import { Suspense, lazy, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useReducedMotion } from '../lib/useReducedMotion'

const AcousticScene = lazy(() => import('./AcousticScene'))

function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'),
    )
  } catch {
    return false
  }
}

function StaticWave() {
  const points = Array.from({ length: 96 }, (_, i) => {
    const p = i / 95
    const y = 70 + Math.sin(p * Math.PI * 3.2) * 34 * Math.sin(Math.PI * p)
    return `${p * 520},${y.toFixed(1)}`
  }).join(' ')
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <svg
        viewBox="0 0 520 140"
        className="h-full w-full max-w-[560px]"
        role="img"
        aria-label="Illustration of an acoustic waveform"
      >
        <defs>
          <linearGradient id="waveStroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#4D5BAD" />
            <stop offset="55%" stopColor="#8FA4E4" />
            <stop offset="100%" stopColor="#78A3B2" />
          </linearGradient>
        </defs>
        <g opacity="0.28">
          {[38, 52, 88, 102].map((y) => (
            <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="#C3CAFC" strokeDasharray="3 6" />
          ))}
        </g>
        <polyline
          points={points}
          fill="none"
          stroke="url(#waveStroke)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <polyline
          points={points}
          fill="none"
          stroke="url(#waveStroke)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.35"
          transform="translate(0 12) scale(1 0.86)"
        />
      </svg>
    </div>
  )
}

/**
 * Loads the WebGL scene only when it can actually run, with a designed static
 * fallback for no-WebGL, reduced-motion and server-rendered contexts.
 */
export function SceneHost({
  progressRef,
  compact = false,
  className = '',
}: {
  progressRef?: MutableRefObject<number>
  compact?: boolean
  className?: string
}) {
  const reduced = useReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    if (reduced) return
    if (!supportsWebGL()) return
    const el = holder.current
    if (!el) return
    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !cancelled) {
          setEnabled(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [reduced])

  return (
    <div ref={holder} className={`relative ${className}`} aria-hidden="true">
      {mounted && enabled ? (
        <Suspense fallback={<StaticWave />}>
          <AcousticScene progressRef={progressRef} compact={compact} reduced={reduced} />
        </Suspense>
      ) : (
        <div className="animate-fade-in h-full w-full">
          <StaticWave />
        </div>
      )}
    </div>
  )
}
