'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Play, Pause, Volume2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'

// ── Module-level audio state ───────────────────────────────────────────────────
//
// _audioBlobCache  — completed blob URLs keyed by `${itemId}:${assignmentId}`.
//   Blob URLs are created once per session and reused on every remount.
//   Navigating Next/Previous unmounts the component but does NOT revoke the URL;
//   the next mount gets an instant cache hit with no network call.
//
// _audioFetchInProgress — in-flight fetch promises for the same key.
//   Prevents the race condition where the student navigates away before the blob
//   download finishes, comes back, and triggers a second parallel download.
//   All mounts that arrive while a download is already running share the same
//   promise; when it resolves they all get the blob URL simultaneously.
//
const _audioBlobCache       = new Map<string, string>()
const _audioFetchInProgress = new Map<string, Promise<string | null>>()

// ── Error codes from the audio endpoint ───────────────────────────────────────
// The backend returns a `code` field on 4xx responses so the frontend can
// distinguish "play limit reached" (not an error — show limit UI) from
// "assignment expired" (informational) from a real fetch failure (show retry).
type AudioErrorKind =
  | 'play_limit'        // 403 PLAY_LIMIT_REACHED — don't show error, show limit UI
  | 'assignment'        // 403/404 assignment issue — show specific message
  | 'not_found'         // 404 audio file missing
  | 'server'            // 5xx / S3 error — transient, retry makes sense
  | 'network'           // fetch threw (offline, DNS, timeout)
  | null                // no error

interface AudioBlockPlayerProps {
  itemId: string
  assignmentId: string
  title?: string
  instructions?: string
  playLimit: number
  hasAudioFile: boolean
  legacyUrl?: string
}

export default function AudioBlockPlayer({
  itemId, assignmentId, title, instructions, playLimit,
  hasAudioFile, legacyUrl,
}: AudioBlockPlayerProps) {
  const [playCount, setPlayCount]         = useState(0)
  const [limitReached, setLimitReached]   = useState(false)
  const [isPlaying, setIsPlaying]         = useState(false)
  const [isLoading, setIsLoading]         = useState(true)
  const [audioError, setAudioError]       = useState<AudioErrorKind>(null)
  const [audioBlobUrl, setAudioBlobUrl]   = useState<string | null>(null)
  const [progress, setProgress]           = useState(0)   // 0–1
  const [currentTime, setCurrentTime]     = useState(0)   // seconds
  const [audioDuration, setAudioDuration] = useState(0)   // seconds
  const audioRef = useRef<HTMLAudioElement>(null)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m.toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  // ── Reset state on item change (when parent navigates to a different audio item) ──
  useEffect(() => {
    setIsPlaying(false)
    setProgress(0)
    setCurrentTime(0)
    setAudioDuration(0)
  }, [itemId])

  // ── Main init effect ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false  // local flag: true after cleanup runs

    const init = async () => {
      if (!hasAudioFile) { if (!cancelled) setIsLoading(false); return }

      const cacheKey = `${itemId}:${assignmentId}`

      // ── 1. Instant cache hit — blob already downloaded this session ────────
      const cached = _audioBlobCache.get(cacheKey)
      if (cached) {
        if (!cancelled) {
          setAudioBlobUrl(cached)
          setIsLoading(false)
        }
        // Non-blocking play-count refresh — failure is silent (not critical UX)
        apiFetch(
          getApiUrl(`student/clap-items/${itemId}/playback-status?assignment_id=${assignmentId}`),
          { headers: getAuthHeaders() },
        ).then(r => r.ok ? r.json() : null).then(d => {
          if (cancelled || !d) return
          setPlayCount(d.play_count  ?? 0)
          setLimitReached(d.limit_reached ?? false)
        }).catch(() => { /* non-critical */ })
        return
      }

      // ── 2. In-flight deduplication — another mount already started this fetch ──
      //    Await the existing promise instead of spawning a parallel download.
      const existing = _audioFetchInProgress.get(cacheKey)
      if (existing) {
        const url = await existing
        if (cancelled) return
        if (url) {
          setAudioBlobUrl(url)
          setIsLoading(false)
        } else {
          // The shared fetch failed — show a retryable error
          setAudioError('server')
          setIsLoading(false)
        }
        return
      }

      // ── 3. Cache miss + no in-flight fetch — start a new download ─────────
      // Wrap in a promise that is shared across any concurrent mounts for the
      // same cacheKey.  Resolves with the blob URL on success, null on failure.
      const fetchPromise: Promise<string | null> = (async () => {
        try {
          // 3a. Playback status (play count / limit check)
          const statusRes = await apiFetch(
            getApiUrl(`student/clap-items/${itemId}/playback-status?assignment_id=${assignmentId}`),
            { headers: getAuthHeaders() },
          )
          if (!cancelled && statusRes.ok) {
            const d = await statusRes.json()
            setPlayCount(d.play_count  ?? 0)
            setLimitReached(d.limit_reached ?? false)
            // If limit already reached, skip audio download — player will show limit UI
            if (d.limit_reached) {
              if (!cancelled) setIsLoading(false)
              return null
            }
          }

          // 3b. Audio blob download
          const audioRes = await apiFetch(
            getApiUrl(`student/clap-items/${itemId}/audio?assignment_id=${assignmentId}`),
            { headers: getAuthHeaders() },
          )

          if (!audioRes.ok) {
            // Parse error code from response body for specific UI handling
            let errBody: any = {}
            try { errBody = await audioRes.json() } catch (_) { /* ignore */ }

            const code: string = errBody?.code || ''
            const msg: string  = (errBody?.error || '').toLowerCase()

            if (code === 'PLAY_LIMIT_REACHED' || msg.includes('limit')) {
              // Play limit exhausted — not a load error; show limit UI
              if (!cancelled) {
                setLimitReached(true)
                setIsLoading(false)
              }
              return null
            }
            if (audioRes.status === 403 || audioRes.status === 404) {
              if (msg.includes('assignment') || msg.includes('not found')) {
                if (!cancelled) { setAudioError('assignment'); setIsLoading(false) }
              } else if (audioRes.status === 404) {
                if (!cancelled) { setAudioError('not_found'); setIsLoading(false) }
              } else {
                if (!cancelled) { setAudioError('assignment'); setIsLoading(false) }
              }
              return null
            }
            // 5xx or unexpected
            if (!cancelled) { setAudioError('server'); setIsLoading(false) }
            return null
          }

          const blob   = await audioRes.blob()
          const blobUrl = URL.createObjectURL(blob)
          _audioBlobCache.set(cacheKey, blobUrl)
          if (!cancelled) {
            setAudioBlobUrl(blobUrl)
            setIsLoading(false)
          }
          return blobUrl

        } catch (err) {
          const isAbort = (err as Error)?.name === 'AbortError'
          if (!isAbort && !cancelled) {
            setAudioError('network')
            setIsLoading(false)
          }
          return null
        } finally {
          // Always clean up the in-progress entry so future mounts do a fresh fetch
          _audioFetchInProgress.delete(cacheKey)
        }
      })()

      _audioFetchInProgress.set(cacheKey, fetchPromise)
      await fetchPromise   // wait so the cancelled flag can suppress setState calls above
    }

    init()

    return () => {
      // Signal all pending setState calls in this closure to be ignored.
      // We do NOT abort the underlying HTTP request — the fetch may be shared
      // with another mount (in-flight deduplication).  Aborting it would break
      // the other mount.  The _audioFetchInProgress cleanup in the finally block
      // ensures a fresh fetch if the last consumer unmounts before the blob lands.
      cancelled = true
    }
  }, [itemId, assignmentId, hasAudioFile])

  // ── Play / Pause ───────────────────────────────────────────────────────────
  const handlePlayPause = async () => {
    if (!audioRef.current) return
    if (limitReached) {
      toast.error('You have reached your maximum play limit.')
      return
    }
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      try {
        await audioRef.current.play()
      } catch (err) {
        toast.error('Failed to play audio. Please try again.')
        console.error('Play error:', err)
      }
    }
  }

  // ── Track completion (increments server-side play counter) ────────────────
  const handleEnded = async () => {
    setIsPlaying(false)
    try {
      const response = await apiFetch(
        getApiUrl(`student/clap-items/${itemId}/track-playback`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ assignment_id: assignmentId, playback_completed: true }),
        },
      )
      const data = await response.json()
      if (response.ok) {
        setPlayCount(data.play_count)
        setLimitReached(data.limit_reached)
        if (data.limit_reached) {
          toast.warning('You have used all your plays for this audio.')
        } else {
          toast.info(`Plays remaining: ${data.remaining_plays}`)
        }
      }
    } catch (err) {
      console.error('Playback tracking failed', err)
    }
  }

  // ── Loading spinner ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading audio...</span>
      </div>
    )
  }

  // ── Legacy URL-based audio (no tracking) ──────────────────────────────────
  if (!hasAudioFile && legacyUrl) {
    return (
      <div className="space-y-4">
        {title && <h3 className="text-xl font-medium">{title}</h3>}
        {instructions && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900 whitespace-pre-wrap">{instructions}</p>
          </div>
        )}
        <Card className="p-6">
          <audio src={legacyUrl} controls className="w-full" />
        </Card>
      </div>
    )
  }

  // ── Error messages keyed by kind ───────────────────────────────────────────
  const errorMessage: Record<NonNullable<AudioErrorKind>, string> = {
    play_limit:  'You have reached your maximum play limit for this audio.',
    assignment:  'This audio item is no longer accessible. Please contact your exam administrator.',
    not_found:   'Audio file not found on the server. Please contact your exam administrator.',
    server:      'Could not load audio due to a server issue. Click Retry to try again.',
    network:     'Could not load audio. Check your internet connection and click Retry.',
  }

  // ── File-based audio with play-limit tracking ──────────────────────────────
  return (
    <div className="space-y-4">
      {title && <h3 className="text-xl font-medium">{title}</h3>}

      {instructions && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900 whitespace-pre-wrap">{instructions}</p>
        </div>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium">Audio Clip</span>
          </div>
          <div className="text-sm">
            <span className={limitReached ? 'text-red-600 font-bold' : 'text-gray-600'}>
              Plays: {playCount} / {playLimit}
            </span>
          </div>
        </div>

        {/* ── Error state — retryable vs permanent ─────────────────────────── */}
        {audioError && !limitReached && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 p-4 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{errorMessage[audioError]}</p>
            </div>
            {/* Only show Retry for transient errors — not for assignment/not_found */}
            {(audioError === 'server' || audioError === 'network') && (
              <button
                onClick={() => {
                  const cacheKey = `${itemId}:${assignmentId}`
                  // Clear any stale in-progress entry so init() starts fresh
                  _audioFetchInProgress.delete(cacheKey)
                  setAudioError(null)
                  setIsLoading(true)
                }}
                className="w-full py-2 text-sm font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* ── Player UI ────────────────────────────────────────────────────── */}
        {!audioError && (
          <>
            {audioBlobUrl && (
              <audio
                ref={audioRef}
                src={audioBlobUrl}
                onEnded={handleEnded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onLoadedMetadata={() => {
                  const el = audioRef.current
                  if (!el) return
                  if (el.duration === Infinity) {
                    el.currentTime = 1e101
                  } else {
                    setAudioDuration(el.duration)
                  }
                }}
                onTimeUpdate={() => {
                  const el = audioRef.current
                  if (!el) return
                  if (el.currentTime === 1e101) { el.currentTime = 0; return }
                  if (el.duration && el.duration !== Infinity) {
                    setAudioDuration(el.duration)
                    setCurrentTime(el.currentTime)
                    setProgress(el.currentTime / el.duration)
                  }
                }}
                className="hidden"
              />
            )}

            <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlayPause}
                  disabled={limitReached || !audioBlobUrl}
                  className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors
                    ${limitReached || !audioBlobUrl
                      ? 'bg-red-100 text-red-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                >
                  {isPlaying
                    ? <Pause className="w-4 h-4 fill-current" />
                    : <Play  className="w-4 h-4 fill-current ml-0.5" />}
                </button>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div
                    className={`w-full h-2 bg-gray-100 rounded-full relative overflow-hidden
                      ${audioBlobUrl && !limitReached ? 'cursor-pointer' : ''}`}
                    onClick={(e) => {
                      const el = audioRef.current
                      if (!el || !el.duration || el.duration === Infinity || limitReached) return
                      const rect  = e.currentTarget.getBoundingClientRect()
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                      el.currentTime = ratio * el.duration
                      setProgress(ratio)
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 h-full bg-indigo-600 rounded-full transition-none"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs tabular-nums text-gray-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{audioDuration ? formatTime(audioDuration) : '--:--'}</span>
                  </div>
                </div>
              </div>

              <p className="mt-2 text-xs text-center text-gray-400">
                {limitReached
                  ? 'Playback limit reached'
                  : !audioBlobUrl
                    ? 'Loading…'
                    : isPlaying
                      ? 'Playing…'
                      : 'Ready to play'}
              </p>
            </div>
          </>
        )}

        {/* ── Play limit banner ─────────────────────────────────────────────── */}
        {limitReached && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p>You have reached your maximum play limit for this audio.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
