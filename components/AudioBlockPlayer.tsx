'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Play, Pause, Volume2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'

// ── Module-level audio state ───────────────────────────────────────────────────
//
// _audioBlobCache — completed blob URLs keyed by `${itemId}:${assignmentId}`.
//   Blob URLs are created once per session and reused on every remount.
//   Navigating Next/Previous unmounts the component but does NOT revoke the URL;
//   the next mount gets an instant cache hit with zero network calls.
//
// _audioFetchInProgress — in-flight fetch promises for the same key.
//   Prevents the thundering-herd race condition where a student navigates away
//   before the blob download finishes, comes back, and triggers a second
//   parallel download.  All concurrent mounts for the same key share the same
//   promise; when it resolves, every waiting mount gets the blob URL at once.
//
const _audioBlobCache       = new Map<string, string>()
const _audioFetchInProgress = new Map<string, Promise<string | null>>()

// ── Error codes from the audio endpoint ───────────────────────────────────────
// The backend `code` field allows the UI to distinguish permanent errors
// (no retry button) from transient ones (retry makes sense).
type AudioErrorKind =
  | 'play_limit'   // 403 PLAY_LIMIT_REACHED — not an error; show limit UI
  | 'assignment'   // 403/404 assignment issue — permanent; no retry
  | 'not_found'    // 404 audio file missing  — permanent; no retry
  | 'server'       // 5xx / S3 error          — transient; show retry
  | 'network'      // fetch threw             — transient; show retry
  | null           // no error

// After this many ms of loading, show "slow connection" advisory to the student.
const SLOW_CONNECTION_MS = 10_000

interface AudioBlockPlayerProps {
  itemId:        string
  assignmentId:  string
  title?:        string
  instructions?: string
  playLimit:     number
  hasAudioFile:  boolean
  legacyUrl?:    string
}

export default function AudioBlockPlayer({
  itemId, assignmentId, title, instructions, playLimit,
  hasAudioFile, legacyUrl,
}: AudioBlockPlayerProps) {

  // ── Component state ────────────────────────────────────────────────────────
  const [playCount,         setPlayCount]         = useState(0)
  const [limitReached,      setLimitReached]      = useState(false)
  const [isPlaying,         setIsPlaying]         = useState(false)
  const [isLoading,         setIsLoading]         = useState(true)
  const [audioError,        setAudioError]        = useState<AudioErrorKind>(null)
  const [retryKey,          setRetryKey]          = useState(0)
  const [audioBlobUrl,      setAudioBlobUrl]      = useState<string | null>(null)
  const [playbackProgress,  setPlaybackProgress]  = useState(0)    // 0–1 (playback position)
  const [currentTime,       setCurrentTime]       = useState(0)    // seconds
  const [audioDuration,     setAudioDuration]     = useState(0)    // seconds

  // downloadProgress: null = indeterminate (no Content-Length header),
  //                   0–100 = real percentage (Content-Length present).
  const [downloadProgress,  setDownloadProgress]  = useState<number | null>(null)

  // isSlowConnection: shown after SLOW_CONNECTION_MS of unresolved loading.
  const [isSlowConnection,  setIsSlowConnection]  = useState(false)

  const audioRef       = useRef<HTMLAudioElement>(null)
  const slowTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m.toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  // ── Reset playback UI on item change ──────────────────────────────────────
  // Handles the case where the parent navigates to a different audio item
  // while this component instance is reused.
  useEffect(() => {
    setIsPlaying(false)
    setPlaybackProgress(0)
    setCurrentTime(0)
    setAudioDuration(0)
  }, [itemId])

  // ── Main init effect ───────────────────────────────────────────────────────
  // Runs on mount, on item change, and on manual retry (retryKey increment).
  useEffect(() => {
    let cancelled = false   // set to true on cleanup — suppresses setState calls

    // Reset per-attempt transient state each time init runs
    setIsSlowConnection(false)
    setDownloadProgress(null)
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current)
      slowTimerRef.current = null
    }

    const init = async () => {
      // No audio file configured — nothing to download
      if (!hasAudioFile) {
        if (!cancelled) setIsLoading(false)
        return
      }

      const cacheKey = `${itemId}:${assignmentId}`

      // ── Path 1: instant cache hit ──────────────────────────────────────────
      // Blob was already downloaded this session.  Zero network calls for audio.
      // Still refresh the play-count non-blockingly so the UI stays accurate
      // after the student navigated away and came back.
      const cached = _audioBlobCache.get(cacheKey)
      if (cached) {
        if (!cancelled) {
          setAudioBlobUrl(cached)
          setIsLoading(false)
        }
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

      // ── Start slow-connection advisory timer ───────────────────────────────
      // If the download has not resolved within SLOW_CONNECTION_MS, the student
      // sees a reassuring message so they don't think the app is broken.
      // The timer is always cleared on success, error, or cleanup.
      slowTimerRef.current = setTimeout(() => {
        if (!cancelled) setIsSlowConnection(true)
      }, SLOW_CONNECTION_MS)

      // ── Path 2: in-flight deduplication ───────────────────────────────────
      // Another mount for the same key already started the download.
      // Share its promise — avoids a second parallel HTTP request.
      // Progress tracking is not available for shared-promise waiters;
      // they show an indeterminate spinner until the promise resolves.
      const existing = _audioFetchInProgress.get(cacheKey)
      if (existing) {
        const url = await existing
        if (slowTimerRef.current) { clearTimeout(slowTimerRef.current); slowTimerRef.current = null }
        if (cancelled) return
        if (url) {
          setAudioBlobUrl(url)
          setIsLoading(false)
          setIsSlowConnection(false)
        } else {
          // The shared fetch failed — show retryable error
          setAudioError('server')
          setIsLoading(false)
          setIsSlowConnection(false)
        }
        return
      }

      // ── Path 3: new download ───────────────────────────────────────────────
      // Create a promise shared by any concurrent mounts for the same key.
      const fetchPromise: Promise<string | null> = (async () => {
        try {
          // ── Thundering-herd jitter ─────────────────────────────────────────
          // When 3000 students open the listening component simultaneously every
          // browser fires the audio download at the same millisecond, saturating
          // all 40 Gunicorn sync workers.  A uniform-random delay of 0–3000 ms
          // spreads the burst across a 3-second window, reducing peak concurrency
          // from 3000 simultaneous requests to ~100/s — well within capacity.
          //
          // The playback-status fetch below is unaffected (it is a fast JSON
          // call, not a binary stream), so the Plays counter and limit state
          // appear immediately while the audio blob downloads in the background.
          //
          // Jitter increased from 1500 ms → 3000 ms to better handle large
          // concurrent user counts without degrading the experience for any
          // individual student (3 seconds is imperceptible during page load).
          await new Promise<void>(resolve =>
            setTimeout(resolve, Math.random() * 3000)
          )
          if (cancelled) return null

          // ── Step 1: playback status ────────────────────────────────────────
          // Check play count and limit BEFORE downloading the blob.
          // If the student already exhausted their plays, skip the download
          // entirely — no wasted bandwidth or worker threads.
          const statusRes = await apiFetch(
            getApiUrl(`student/clap-items/${itemId}/playback-status?assignment_id=${assignmentId}`),
            { headers: getAuthHeaders() },
          )
          if (!cancelled && statusRes.ok) {
            const d = await statusRes.json()
            setPlayCount(d.play_count  ?? 0)
            setLimitReached(d.limit_reached ?? false)
            if (d.limit_reached) {
              if (!cancelled) {
                if (slowTimerRef.current) { clearTimeout(slowTimerRef.current); slowTimerRef.current = null }
                setIsLoading(false)
                setIsSlowConnection(false)
              }
              return null
            }
          }

          // ── Step 2: audio blob download with real-time progress ────────────
          const audioRes = await apiFetch(
            getApiUrl(`student/clap-items/${itemId}/audio?assignment_id=${assignmentId}`),
            { headers: getAuthHeaders() },
          )

          // ── Error classification ───────────────────────────────────────────
          if (!audioRes.ok) {
            let errBody: any = {}
            try { errBody = await audioRes.json() } catch (_) {}

            const code = errBody?.code || ''
            const msg  = (errBody?.error || '').toLowerCase()

            if (slowTimerRef.current) { clearTimeout(slowTimerRef.current); slowTimerRef.current = null }

            if (code === 'PLAY_LIMIT_REACHED' || msg.includes('limit')) {
              if (!cancelled) {
                setLimitReached(true)
                setIsLoading(false)
                setIsSlowConnection(false)
              }
              return null
            }
            if (audioRes.status === 403 || audioRes.status === 404) {
              const kind: AudioErrorKind =
                audioRes.status === 404 ? 'not_found' : 'assignment'
              if (!cancelled) {
                setAudioError(kind)
                setIsLoading(false)
                setIsSlowConnection(false)
              }
              return null
            }
            // 5xx or unexpected status
            if (!cancelled) {
              setAudioError('server')
              setIsLoading(false)
              setIsSlowConnection(false)
            }
            return null
          }

          // ── Progress-tracked blob assembly ─────────────────────────────────
          //
          // Strategy A — Content-Length present + ReadableStream supported:
          //   Stream response body chunk-by-chunk, accumulate bytes, report real
          //   percentage to the UI on every chunk.  Handles any file size and any
          //   connection speed; cancelled check inside the loop allows fast exit
          //   when the component unmounts mid-download.
          //
          // Strategy B — Fallback (no Content-Length OR no ReadableStream):
          //   Call response.blob() which downloads the entire body silently.
          //   Shows indeterminate (pulsing) progress bar instead of percentage.
          //   Triggered for: very old browsers, chunked-encoded responses,
          //   environments where body streaming is unavailable.
          //
          const contentLength = audioRes.headers.get('Content-Length')
          const total         = contentLength ? parseInt(contentLength, 10) : 0
          const canStream     = typeof ReadableStream !== 'undefined'
                                && audioRes.body != null
                                && total > 0

          let blobUrl: string

          if (canStream) {
            // ── Strategy A: streamed with progress ────────────────────────────
            const reader = audioRes.body!.getReader()
            const chunks: Uint8Array[] = []
            let received = 0

            while (true) {
              // Check cancellation inside loop — allows immediate abort when
              // the student navigates away mid-download, freeing memory.
              if (cancelled) {
                reader.cancel()
                return null
              }
              const { done, value } = await reader.read()
              if (done) break
              if (value) {
                chunks.push(value)
                received += value.length
                // Cap at 99 until the blob is fully assembled so the UI never
                // flickers to 100% before the player is actually ready.
                const pct = Math.min(99, Math.round((received / total) * 100))
                if (!cancelled) setDownloadProgress(pct)
              }
            }

            const blob = new Blob(chunks, {
              type: audioRes.headers.get('Content-Type') || 'audio/mpeg',
            })
            blobUrl = URL.createObjectURL(blob)

          } else {
            // ── Strategy B: atomic blob (indeterminate progress) ──────────────
            const blob = await audioRes.blob()
            blobUrl = URL.createObjectURL(blob)
          }

          // Store in module-level cache — future remounts are instant
          _audioBlobCache.set(cacheKey, blobUrl)

          if (slowTimerRef.current) { clearTimeout(slowTimerRef.current); slowTimerRef.current = null }
          if (!cancelled) {
            setAudioBlobUrl(blobUrl)
            setDownloadProgress(100)    // snap to 100 after blob is ready
            setIsLoading(false)
            setIsSlowConnection(false)
          }
          return blobUrl

        } catch (err) {
          if (slowTimerRef.current) { clearTimeout(slowTimerRef.current); slowTimerRef.current = null }
          // AbortError = browser cancelled the request (navigation, tab close).
          // Do not show an error — the component is already going away.
          const isAbort = (err as Error)?.name === 'AbortError'
          if (!isAbort && !cancelled) {
            setAudioError('network')
            setIsLoading(false)
            setIsSlowConnection(false)
          }
          return null
        } finally {
          // Always remove the in-progress entry so a future mount (e.g. after
          // Retry) triggers a fresh fetch instead of awaiting a dead promise.
          _audioFetchInProgress.delete(cacheKey)
        }
      })()

      _audioFetchInProgress.set(cacheKey, fetchPromise)
      // Await so the cancelled flag in this closure can suppress setState calls
      // inside fetchPromise when the component unmounts before it resolves.
      await fetchPromise
    }

    init()

    return () => {
      cancelled = true
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current)
        slowTimerRef.current = null
      }
    }
  }, [itemId, assignmentId, hasAudioFile, retryKey])

  // ── Play / Pause ───────────────────────────────────────────────────────────
  const handlePlayPause = async () => {
    if (!audioRef.current || isLoading) return
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

  // ── Track playback completion ──────────────────────────────────────────────
  // Increments the server-side play counter and updates the play limit UI.
  // Fire-and-forget pattern: failure is logged but does not break the UX.
  const handleEnded = async () => {
    setIsPlaying(false)
    try {
      const response = await apiFetch(
        getApiUrl(`student/clap-items/${itemId}/track-playback`),
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body:    JSON.stringify({ assignment_id: assignmentId, playback_completed: true }),
        },
      )
      const data = await response.json()
      if (response.ok) {
        setPlayCount(data.play_count)
        setLimitReached(data.limit_reached)
        if (data.limit_reached) {
          toast.warning('You have used all your plays for this audio.')
        } else if (data.remaining_plays > 0) {
          toast.info(`Plays remaining: ${data.remaining_plays}`)
        }
      }
    } catch (err) {
      console.error('Playback tracking failed:', err)
      // Non-fatal — the student can still play again if the counter is wrong.
      // The server-side limit enforcement (play_count check on next request)
      // prevents any actual limit bypass.
    }
  }

  // ── Derived UI values ──────────────────────────────────────────────────────

  // Play button: three distinct visual states so students always know the status.
  //   gray  + spinner  → audio is downloading (cannot play yet)
  //   red   + disabled → play limit exhausted (no more plays allowed)
  //   indigo + icon    → ready to play / playing / paused
  const playButtonDisabled = isLoading || limitReached || !audioBlobUrl
  const playButtonClass    = isLoading
    ? 'bg-gray-200 text-gray-400 cursor-wait'
    : (limitReached || !audioBlobUrl)
      ? 'bg-red-100 text-red-400 cursor-not-allowed'
      : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white'

  // Status line under the player — always shows exactly what is happening.
  const statusText =
    limitReached
      ? 'Playback limit reached'
      : isLoading
        ? isSlowConnection
          ? 'Slow connection — audio will play once ready…'
          : downloadProgress !== null
            ? `Downloading audio… ${downloadProgress}%`
            : 'Preparing audio…'
        : isPlaying
          ? 'Playing…'
          : 'Ready to play'

  // Permanent errors (no retry button)
  const isPermanentError = audioError === 'assignment' || audioError === 'not_found'
  const errorMessage: Record<NonNullable<AudioErrorKind>, string> = {
    play_limit: 'You have reached your maximum play limit for this audio.',
    assignment: 'This audio item is no longer accessible. Please contact your exam administrator.',
    not_found:  'Audio file not found on the server. Please contact your exam administrator.',
    server:     'Could not load audio due to a server issue. Click Retry to try again.',
    network:    'Could not load audio. Check your connection and click Retry.',
  }

  // ── Legacy URL-based audio (no tracking, no limit) ────────────────────────
  // Used for tests created before the AdminAudioFile feature.
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

  // ── Main render ────────────────────────────────────────────────────────────
  // The card is ALWAYS rendered immediately — title, instructions, and the
  // player skeleton are visible while the audio downloads in the background.
  // The play button communicates loading state directly (spinner) instead of
  // replacing the entire UI with a full-page spinner.  This lets the student
  // read the question or passage while the audio loads on slow connections.
  return (
    <div className="space-y-4">
      {title && <h3 className="text-xl font-medium">{title}</h3>}

      {instructions && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900 whitespace-pre-wrap">{instructions}</p>
        </div>
      )}

      <Card className="p-6">
        {/* ── Header row ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Audio Clip</span>
          </div>
          <span className={`text-sm ${limitReached ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
            Plays: {playCount} / {playLimit}
          </span>
        </div>

        {/* ── Download progress bar ───────────────────────────────────────── */}
        {/* Visible only while the blob is downloading.  Disappears the moment
            the play button activates so it never competes visually with the
            playback progress bar below.                                       */}
        {isLoading && !audioError && (
          <div className="mb-4 space-y-1">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              {downloadProgress !== null ? (
                // Determinate bar — real percentage from ReadableStream
                <div
                  className="h-full bg-indigo-400 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${downloadProgress}%` }}
                />
              ) : (
                // Indeterminate bar — Content-Length unavailable or strategy B
                <div className="h-full w-full bg-indigo-200 rounded-full animate-pulse" />
              )}
            </div>
            {isSlowConnection && (
              <p className="text-xs text-amber-600 text-center">
                Your connection is slow — audio will play automatically once it finishes downloading.
              </p>
            )}
          </div>
        )}

        {/* ── Error state ─────────────────────────────────────────────────── */}
        {audioError && !limitReached && (
          <div className="space-y-3 mb-4">
            <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 p-4 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{errorMessage[audioError]}</p>
            </div>
            {!isPermanentError && (
              <button
                onClick={() => {
                  // Clear stale in-progress entry so init() starts a fresh fetch
                  const cacheKey = `${itemId}:${assignmentId}`
                  _audioFetchInProgress.delete(cacheKey)
                  setAudioError(null)
                  setIsLoading(true)
                  setDownloadProgress(null)
                  setIsSlowConnection(false)
                  setRetryKey(k => k + 1)
                }}
                className="w-full py-2 text-sm font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* ── Player UI ────────────────────────────────────────────────────── */}
        {/* Always rendered (not hidden behind isLoading).  The play button
            reflects loading / ready / playing state via color + icon.       */}
        {!audioError && (
          <>
            {/* Hidden audio element — attached only after blob is ready */}
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
                  // WEBM/Matroska duration bug: Infinity reported until seek trick.
                  if (el.duration === Infinity) {
                    el.currentTime = 1e101
                  } else {
                    setAudioDuration(el.duration)
                  }
                }}
                onTimeUpdate={() => {
                  const el = audioRef.current
                  if (!el) return
                  // Complete the seek-trick to force duration resolution
                  if (el.currentTime === 1e101) { el.currentTime = 0; return }
                  if (el.duration && el.duration !== Infinity) {
                    setAudioDuration(el.duration)
                    setCurrentTime(el.currentTime)
                    setPlaybackProgress(el.currentTime / el.duration)
                  }
                }}
                className="hidden"
              />
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">

                {/* ── Play / Pause / Loading button ──────────────────────── */}
                <button
                  onClick={handlePlayPause}
                  disabled={playButtonDisabled}
                  aria-label={
                    isLoading
                      ? `Loading audio${downloadProgress !== null ? `, ${downloadProgress}%` : ''}`
                      : isPlaying
                        ? 'Pause audio'
                        : 'Play audio'
                  }
                  className={`
                    flex-shrink-0 w-10 h-10
                    flex items-center justify-center
                    rounded-full transition-colors
                    ${playButtonClass}
                  `}
                >
                  {isLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : isPlaying
                      ? <Pause className="w-4 h-4 fill-current" />
                      : <Play  className="w-4 h-4 fill-current ml-0.5" />
                  }
                </button>

                {/* ── Playback scrub bar + timestamps ───────────────────── */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(playbackProgress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className={`
                      w-full h-2 bg-gray-100 rounded-full relative overflow-hidden
                      ${audioBlobUrl && !limitReached && !isLoading ? 'cursor-pointer' : ''}
                    `}
                    onClick={(e) => {
                      const el = audioRef.current
                      if (!el || !el.duration || el.duration === Infinity
                          || limitReached || isLoading) return
                      const rect  = e.currentTarget.getBoundingClientRect()
                      const ratio = Math.max(0, Math.min(1,
                        (e.clientX - rect.left) / rect.width
                      ))
                      el.currentTime = ratio * el.duration
                      setPlaybackProgress(ratio)
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 h-full bg-indigo-600 rounded-full transition-none"
                      style={{ width: `${playbackProgress * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs tabular-nums text-gray-400 select-none">
                    <span>{formatTime(currentTime)}</span>
                    <span>{audioDuration ? formatTime(audioDuration) : '--:--'}</span>
                  </div>
                </div>
              </div>

              {/* ── Status line ────────────────────────────────────────── */}
              <p className={`
                mt-2 text-xs text-center select-none
                ${isSlowConnection
                  ? 'text-amber-500'
                  : limitReached
                    ? 'text-red-500'
                    : 'text-gray-400'}
              `}>
                {statusText}
              </p>
            </div>
          </>
        )}

        {/* ── Play limit banner ─────────────────────────────────────────────── */}
        {limitReached && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg mt-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p>You have reached your maximum play limit for this audio.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
