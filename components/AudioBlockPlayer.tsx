'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Play, Pause, Volume2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { authStorage } from '@/lib/auth-storage'

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
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    // Track the blob URL in a ref so the cleanup always has the latest value
    let blobUrl: string | null = null

    const init = async () => {
      try {
        if (!hasAudioFile) return

        // 1. Fetch playback status with proper JWT auth
        const statusRes = await apiFetch(
          getApiUrl(`student/clap-items/${itemId}/playback-status?assignment_id=${assignmentId}`),
          { headers: getAuthHeaders() }
        )
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setPlayCount(statusData.play_count || 0)
          setLimitReached(statusData.limit_reached || false)
        }

        // 2. Fetch the audio file as a blob using proper JWT auth
        //    (native <audio> cannot send Authorization headers, so we pre-fetch)
        const audioRes = await apiFetch(
          getApiUrl(`student/clap-items/${itemId}/audio?assignment_id=${assignmentId}`),
          { headers: getAuthHeaders() }
        )
        if (!audioRes.ok) {
          setAudioError(true)
          return
        }
        const blob = await audioRes.blob()
        blobUrl = URL.createObjectURL(blob)
        setAudioBlobUrl(blobUrl)
      } catch (error) {
        console.error('Audio init failed', error)
        setAudioError(true)
      } finally {
        setIsLoading(false)
      }
    }

    init()

    // Revoke the object URL on unmount to free memory
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
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

        {audioError ? (
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
                className="hidden"
              />
            )}

            <div className="mb-4 bg-gray-100 rounded-lg p-4 flex items-center justify-center">
              <div className="w-full max-w-md">
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handlePlayPause}
                    disabled={limitReached || !audioBlobUrl}
                    size="icon"
                    variant={limitReached ? 'destructive' : 'default'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <div className="flex-1 text-sm text-gray-600">
                    {limitReached
                      ? 'Playback limit reached'
                      : isPlaying
                        ? 'Playing...'
                        : 'Ready to play'}
                  </div>
                </div>
              </div>
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
