'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Square, Play, Pause, RotateCcw, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

type RecorderStatus = 'idle' | 'requesting_permission' | 'recording' | 'stopped' | 'playing' | 'uploading' | 'uploaded' | 'error'

interface AudioRecorderProps {
  itemId: string
  assignmentId: string
  question: string
  instructions?: string
  maxDuration?: number  // seconds
  savedAudioUrl?: string
  onSave: (data: any) => void
}

const AUDIO_FORMATS = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/mp4', extension: 'mp4' },
  { mimeType: 'audio/mpeg', extension: 'mp3' }
]

const CONSTRAINTS = {
  audio: {
    channelCount: 1,
    sampleRate: 48000,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}

export default function AudioRecorderItem({
  itemId,
  assignmentId,
  question,
  instructions,
  maxDuration = 300,
  savedAudioUrl,
  onSave
}: AudioRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>(savedAudioUrl ? 'uploaded' : 'idle')
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(savedAudioUrl || null)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFormat, setSelectedFormat] = useState<typeof AUDIO_FORMATS[0] | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Detect supported audio format on mount
  useEffect(() => {
    const format = AUDIO_FORMATS.find(f =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(f.mimeType)
    )
    if (format) {
      setSelectedFormat(format)
    } else {
      setError('Your browser does not support audio recording. Please use Chrome, Firefox, or Edge.')
    }
  }, [])

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Request microphone permission and start recording
  const startRecording = async () => {
    if (!selectedFormat) {
      setError('Audio recording not supported')
      return
    }

    setStatus('requesting_permission')
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS as MediaStreamConstraints)

      const recorder = new MediaRecorder(stream, {
        mimeType: selectedFormat.mimeType
      })

      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: selectedFormat.mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setStatus('stopped')

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start(1000) // Collect data every second
      setMediaRecorder(recorder)
      setStatus('recording')
      setDuration(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1
          if (newDuration >= maxDuration) {
            stopRecording()
          }
          return newDuration
        })
      }, 1000)

    } catch (err: any) {
      console.error('Microphone access error:', err)

      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied. Please enable microphone access in your browser settings.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.')
      } else if (err.name === 'NotReadableError') {
        setError('Microphone is already in use by another application.')
      } else {
        setError('Failed to access microphone. Please try again.')
      }

      setStatus('error')
    }
  }

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Re-record
  const reRecord = () => {
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl(null)
    setAudioBlob(null)
    setDuration(0)
    setStatus('idle')
    setError(null)
  }

  // Submit audio to backend
  const submitAudio = async () => {
    if (!audioBlob || !selectedFormat) {
      toast.error('No audio recording to submit')
      return
    }

    setStatus('uploading')
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, `recording.${selectedFormat.extension}`)
      formData.append('item_id', itemId)
      formData.append('duration', duration.toString())
      formData.append('mime_type', audioBlob.type)

      const user_id = localStorage.getItem('user_id')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

      const response = await fetch(
        `${apiUrl}/student/clap-assignments/${assignmentId}/submit-audio`,
        {
          method: 'POST',
          body: formData,
          headers: user_id ? { 'x-user-id': user_id } : {}
        }
      )

      if (response.ok) {
        const data = await response.json()
        setStatus('uploaded')
        toast.success('Audio submitted successfully')
        onSave(data)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit audio')
      }

    } catch (err: any) {
      console.error('Upload error:', err)
      setError(err.message || 'Failed to upload audio. Please try again.')
      setStatus('error')
      toast.error(err.message || 'Failed to upload audio')
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl)
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [audioUrl])

  return (
    <div className="space-y-4 p-6 bg-white rounded-lg border">
      {/* Question */}
      <div className="space-y-2">
        <h3 className="text-xl font-medium text-gray-800">{question}</h3>
        {instructions && (
          <p className="text-sm text-gray-600">{instructions}</p>
        )}
        <p className="text-xs text-gray-500">
          Maximum duration: {formatTime(maxDuration)}
        </p>
      </div>

      {/* Error Display */}
      {error && status === 'error' && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-900">Error</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              {error.includes('permission') && (
                <p className="text-xs text-red-600 mt-2">
                  Go to browser settings → Privacy & Security → Microphone → Allow
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recorder Interface */}
      {status === 'idle' && (
        <Button
          onClick={startRecording}
          disabled={!selectedFormat}
          size="lg"
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          <Mic className="w-5 h-5 mr-2" />
          Start Recording
        </Button>
      )}

      {status === 'recording' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4 p-8 bg-red-50 rounded-lg border-2 border-red-200">
            <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse" />
            <span className="text-2xl font-mono font-bold text-red-700">
              {formatTime(duration)}
            </span>
          </div>

          <Button
            onClick={stopRecording}
            variant="destructive"
            size="lg"
            className="w-full"
          >
            <Square className="w-5 h-5 mr-2" />
            Stop Recording
          </Button>
        </div>
      )}

      {status === 'stopped' && audioUrl && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg border">
            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              className="w-full"
            />
            <p className="text-sm text-gray-600 mt-2">
              Duration: {formatTime(duration)}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={reRecord}
              variant="outline"
              className="flex-1"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Re-record
            </Button>
            <Button
              onClick={submitAudio}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              Submit
            </Button>
          </div>
        </div>
      )}

      {status === 'uploading' && (
        <div className="space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 text-center">
            Uploading audio... {uploadProgress}%
          </p>
        </div>
      )}

      {status === 'uploaded' && (
        <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
          <div className="flex items-center gap-2 text-green-700">
            <Check className="w-5 h-5" />
            <span className="font-medium">Audio submitted successfully</span>
          </div>
          {savedAudioUrl && (
            <div className="mt-3">
              <audio controls src={savedAudioUrl} className="w-full" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
