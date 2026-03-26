'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Play, Pause, Volume2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { authStorage } from '@/lib/auth-storage'

// ── Module-level blob cache ────────────────────────────────────────────────────
// Keyed by `${itemId}:${assignmentId}`.
// Blob URLs are created once and reused on every remount — navigating between
// questions (Next/Previous) unmounts the component but the fetched audio is
// retained here so no re-fetch (and no flicker / "Could not load" error) occurs.
// Blob URLs are only revoked when the browser tab is closed (GC handles it).
const _audioBlobCache = new Map<string, string>()

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
  hasAudioFile, legacyUrl
}: AudioBlockPlayerProps) {
  const [playCount, setPlayCount]       = useState(0)
  const [limitReached, setLimitReached] = useState(false)
  const [isPlaying, setIsPlaying]       = useState(false)
  const [isLoading, setIsLoading]       = useState(true)
  const [audioError, setAudioError]     = useState(false)
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null)
  const [progress, setProgress]         = useState(0)   // 0–1
  const [currentTime, setCurrentTime]   = useState(0)   // seconds
  const [audioDuration, setAudioDuration] = useState(0) // seconds
  const audioRef = useRef<HTMLAudioElement>(null)

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m.toString().padStart(2,'0')}:${Math.floor(s % 60).toString().padStart(2,'0')}`
  }

  useEffect(() => {
    // Abort controller — cancels in-flight fetches when the component unmounts
    // (e.g. student navigates away before audio finishes downloading).
    const controller = new AbortController()

    const init = async () => {
      try {
        if (!hasAudioFile) { setIsLoading(false); return }

        // ── Cache hit: audio already downloaded this session ──────────────────
        const cacheKey = `${itemId}:${assignmentId}`
        const cached = _audioBlobCache.get(cacheKey)
        if (cached) {
          setAudioBlobUrl(cached)
          // Still refresh play-count from server so the counter is accurate
          apiFetch(
            getApiUrl(`student/clap-items/${itemId}/playback-status?assignment_id=${assignmentId}`),
            { headers: getAuthHeaders(), signal: controller.signal }
          ).then(r => r.ok ? r.json() : null).then(d => {
            if (!d || controller.signal.aborted) return
            setPlayCount(d.play_count || 0)
            setLimitReached(d.limit_reached || false)
          }).catch(() => {/* non-critical */})
          setIsLoading(false)
          return
        }

        // ── Cache miss: first time loading this audio item ────────────────────

        // 1. Fetch playback status with proper JWT auth
        const statusRes = await apiFetch(
          getApiUrl(`student/clap-items/${itemId}/playback-status?assignment_id=${assignmentId}`),
          { headers: getAuthHeaders(), signal: controller.signal }
        )
        if (controller.signal.aborted) return
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setPlayCount(statusData.play_count || 0)
          setLimitReached(statusData.limit_reached || false)
        }

        // 2. Fetch the audio file as a blob using proper JWT auth
        //    (native <audio> cannot send Authorization headers, so we pre-fetch)
        const audioRes = await apiFetch(
          getApiUrl(`student/clap-items/${itemId}/audio?assignment_id=${assignmentId}`),
          { headers: getAuthHeaders(), signal: controller.signal }
        )
        if (controller.signal.aborted) return
        if (!audioRes.ok) {
          setAudioError(true)
          return
        }
        const blob = await audioRes.blob()
        if (controller.signal.aborted) return

        const blobUrl = URL.createObjectURL(blob)
        // Store in module-level cache — survives Next/Previous navigation
        _audioBlobCache.set(cacheKey, blobUrl)
        setAudioBlobUrl(blobUrl)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('Audio init failed', error)
        setAudioError(true)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    init()

    // On unmount: cancel any in-flight fetch.
    // Do NOT revoke the blob URL — it is intentionally kept in the cache
    // so that navigating back to this question does not trigger a re-fetch.
    return () => { controller.abort() }
  }, [itemId, assignmentId, hasAudioFile])

  const handlePlayPause = async () => {
    if (!audioRef.current) return
    if (limitReached) {
      toast.error('You have reached your maximum play limit.')
      return
    }

    if (isPlaying) {
      audioRef.current.pause()
      // setIsPlaying(false) is driven by the onPause event below
    } else {
      try {
        await audioRef.current.play()
        // setIsPlaying(true) is driven by the onPlay event below
      } catch (err) {
        toast.error('Failed to play audio. Please try again.')
        console.error('Play error:', err)
      }
    }
  }

  const handleEnded = async () => {
    setIsPlaying(false)
    try {
      const response = await apiFetch(
        getApiUrl(`student/clap-items/${itemId}/track-playback`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ assignment_id: assignmentId, playback_completed: true })
        }
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
    } catch (error) {
      console.error('Playback tracking failed', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading audio...</span>
      </div>
    )
  }

  // Legacy URL-based audio (no tracking)
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

  // File-based audio with play-limit tracking
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

        {audioError && !limitReached ? (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-4 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p>Could not load audio. Please refresh the page or contact support.</p>
          </div>
        ) : (
          <>
            {/* Hidden audio element using the authenticated blob URL */}
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

            {/* Full-width audio player */}
            <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                {/* Play / Pause */}
                <button
                  onClick={handlePlayPause}
                  disabled={limitReached || !audioBlobUrl}
                  className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors
                    ${limitReached
                      ? 'bg-red-100 text-red-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                >
                  {isPlaying
                    ? <Pause className="w-4 h-4 fill-current" />
                    : <Play  className="w-4 h-4 fill-current ml-0.5" />}
                </button>

                {/* Progress area */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Track — clickable scrub bar */}
                  <div
                    className={`w-full h-2 bg-gray-100 rounded-full relative overflow-hidden
                      ${audioBlobUrl && !limitReached ? 'cursor-pointer' : ''}`}
                    onClick={(e) => {
                      const el = audioRef.current
                      if (!el || !el.duration || el.duration === Infinity || limitReached) return
                      const rect = e.currentTarget.getBoundingClientRect()
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

                  {/* Time display */}
                  <div className="flex justify-between text-xs tabular-nums text-gray-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{audioDuration ? formatTime(audioDuration) : '--:--'}</span>
                  </div>
                </div>
              </div>

              {/* Status text */}
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
