'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Play, Pause, Volume2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl } from '@/lib/api-config'

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
  const [playCount, setPlayCount] = useState(0)
  const [limitReached, setLimitReached] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(
          getApiUrl(`student/clap-items/${itemId}/playback-status?assignment_id=${assignmentId}`),
          { headers: { 'x-user-id': localStorage.getItem('user_id') || '' } }
        )
        const data = await response.json()
        if (response.ok) {
          setPlayCount(data.play_count || 0)
          setLimitReached(data.limit_reached || false)
        }
      } catch (error) {
        console.error('Failed to fetch playback status', error)
      } finally {
        setIsLoading(false)
      }
    }
    if (hasAudioFile) fetchStatus()
    else setIsLoading(false)
  }, [itemId, assignmentId, hasAudioFile])

  const handlePlayPause = () => {
    if (!audioRef.current) return

    if (limitReached) {
      toast.error('You reached your max limit.')
      return
    }

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(err => {
        toast.error('Failed to play audio. Please try again.')
        console.error('Play error:', err)
      })
    }
    setIsPlaying(!isPlaying)
  }

  const handleEnded = async () => {
    setIsPlaying(false)

    try {
      const response = await fetch(
        getApiUrl(`student/clap-items/${itemId}/track-playback`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': localStorage.getItem('user_id') || ''
          },
          body: JSON.stringify({
            assignment_id: assignmentId,
            playback_completed: true
          })
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
    return <div className="text-center p-8 text-gray-500">Loading audio...</div>
  }

  // Legacy URL-based audio (no tracking)
  if (!hasAudioFile && legacyUrl) {
    return (
      <div className="space-y-4">
        {title && <h3 className="text-xl font-medium">{title}</h3>}
        {instructions && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">{instructions}</p>
          </div>
        )}
        <Card className="p-6">
          <audio src={legacyUrl} controls className="w-full" />
        </Card>
      </div>
    )
  }

  // File-based audio with tracking
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

        <audio
          ref={audioRef}
          src={getApiUrl(`student/clap-items/${itemId}/audio?assignment_id=${assignmentId}`)}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="hidden"
        />

        <div className="mb-4 bg-gray-100 rounded-lg p-4 flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="flex items-center gap-4">
              <Button
                onClick={handlePlayPause}
                disabled={limitReached}
                size="icon"
                variant={limitReached ? 'destructive' : 'default'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <div className="flex-1 text-sm text-gray-600">
                {limitReached ? 'Playback disabled' : isPlaying ? 'Playing...' : 'Ready to play'}
              </div>
            </div>
          </div>
        </div>

        {limitReached && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded">
            <AlertCircle className="w-4 h-4" />
            <p>You reached your max limit.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
