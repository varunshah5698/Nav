import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAuthorizedBlob } from '../api/client'
import { formatClock } from '../lib/format'
import { AlertIcon, PauseIcon, PlayIcon } from './icons'
import { Spinner } from './ui'

export interface SeekRequest {
  seconds: number
  nonce: number
}

/**
 * One authenticated fetch per recording per page session. Each fetch is a
 * sensitive access that is written to the audit log, so a re-render or a
 * React strict-mode remount must not produce duplicate access events.
 */
const audioUrls = new Map<string, Promise<string>>()

function loadAudioUrl(path: string): Promise<string> {
  const cached = audioUrls.get(path)
  if (cached) return cached
  const pending = fetchAuthorizedBlob(path).then((blob) => URL.createObjectURL(blob))
  audioUrls.set(path, pending)
  pending.catch(() => audioUrls.delete(path))
  return pending
}

/**
 * Private audio is fetched with the bearer token and played from an in-memory
 * object URL, because an <audio> element cannot attach an Authorization header
 * and VoxSafe never puts tokens in a URL.
 */
export function AudioPlayer({
  audioPath,
  seekRequest,
  onTime,
  disabled,
  disabledLabel,
  durationHint,
  title,
}: {
  audioPath: string | null
  seekRequest: SeekRequest | null
  onTime: (seconds: number) => void
  disabled: boolean
  disabledLabel: string
  durationHint: number | null
  title: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(durationHint ?? 0)

  useEffect(() => {
    if (!audioPath || disabled) {
      setObjectUrl(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    loadAudioUrl(audioPath)
      .then((url) => {
        if (cancelled) return
        setObjectUrl(url)
      })
      .catch(() => {
        if (!cancelled) setError('Audio could not be loaded for this session.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [audioPath, disabled])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !seekRequest) return
    audio.currentTime = Math.max(0, Math.min(seekRequest.seconds, audio.duration || 0))
    setCurrent(audio.currentTime)
    onTime(audio.currentTime)
  }, [seekRequest, onTime])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = rate
  }, [rate])

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setError('Playback was blocked by the browser.')
      }
    } else {
      audio.pause()
    }
  }, [])

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="rounded-[16px] border border-line bg-[#F8FAFD] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-medium text-ink-2">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="playback-rate">
            Playback speed
          </label>
          <select
            id="playback-rate"
            className="h-7 rounded-full border border-line-strong bg-white px-2 text-[10.5px] font-medium text-ink-2"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            disabled={disabled || !objectUrl}
          >
            {[0.75, 1, 1.25, 1.5].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </div>
      </div>

      {disabled ? (
        <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-white px-3 py-3 text-[11.5px] text-muted">
          <AlertIcon size={14} />
          {disabledLabel}
        </div>
      ) : error ? (
        <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[#EFCEC8] bg-clay-soft px-3 py-3 text-[11.5px] text-clay">
          <AlertIcon size={14} />
          {error}
        </div>
      ) : loading || !objectUrl ? (
        <div className="mt-3 flex h-[54px] items-center justify-center">
          <Spinner label="Loading private audio" />
        </div>
      ) : (
        <div className="mt-3">
          <audio
            ref={audioRef}
            src={objectUrl}
            preload="metadata"
            onTimeUpdate={(event) => {
              const t = event.currentTarget.currentTime
              setCurrent(t)
              onTime(t)
            }}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => setError('This audio could not be decoded by the browser.')}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover"
              aria-label={playing ? 'Pause audio' : 'Play audio'}
            >
              {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            </button>
            <div className="flex-1">
              <div className="relative h-2 overflow-hidden rounded-full bg-[#DFE6F2]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/80"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-muted">
                <span className="vs-num">{formatClock(current)}</span>
                <span className="vs-num">{formatClock(duration)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
