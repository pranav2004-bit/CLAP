'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Square, Play, Pause, RotateCcw, Check, AlertCircle, Volume2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { getAuthHeaders, API_BASE_URL } from '@/lib/api-config'

type RecorderStatus = 'idle' | 'requesting_permission' | 'recording' | 'stopped' | 'playing' | 'uploading' | 'uploaded' | 'error'

interface AudioDevice {
  deviceId: string
  label: string
}

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

const BASE_AUDIO_CONSTRAINTS = {
  channelCount: 1,
  sampleRate: 48000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
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

  // Device selection state
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [devicesEnumerated, setDevicesEnumerated] = useState(false)

  // Custom player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [playProgress, setPlayProgress] = useState(0)   // 0–1
  const [audioDuration, setAudioDuration] = useState(0) // seconds

  const audioRef = useRef<HTMLAudioElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Ref so stopRecording always has the live MediaRecorder instance,
  // even when called from inside a stale setInterval closure.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

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

  // Enumerate audio input devices.
  // Browsers hide device labels until microphone permission is granted.
  // We call this once on mount (labels may be generic) and again after first permission grant.
  const enumerateAudioDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all
        .filter(d => d.kind === 'audioinput')
        .map((d, idx) => {
          const raw = d.label || `Microphone ${idx + 1}`
          // Truncate long OS-generated device names to ≤40 chars so they fit
          // on narrow mobile screens without overflowing the select dropdown.
          // Keeps the front of the string (the distinguishing prefix like
          // "Default -" or "Communications -") and appends an ellipsis.
          const label = raw.length > 40 ? raw.slice(0, 38) + '…' : raw
          return { deviceId: d.deviceId, label }
        })
      setAudioDevices(inputs)
      setDevicesEnumerated(true)
      // Pre-select the first device if none is chosen yet.
      setSelectedDeviceId(prev => prev || (inputs[0]?.deviceId ?? ''))
    } catch {
      // enumerateDevices failed — continue without selector (fail open).
    }
  }, [])

  useEffect(() => {
    enumerateAudioDevices()

    // Re-enumerate if the user plugs/unplugs a device while the page is open.
    const handler = () => enumerateAudioDevices()
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handler)
      return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
    }
  }, [enumerateAudioDevices])

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

    // Build constraints — pin to the selected device when one is available.
    const audioConstraints: MediaTrackConstraints = { ...BASE_AUDIO_CONSTRAINTS }
    if (selectedDeviceId) {
      audioConstraints.deviceId = { exact: selectedDeviceId }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      } as MediaStreamConstraints)

      // After first grant, re-enumerate so labels populate (Chrome behaviour).
      enumerateAudioDevices()

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

        // Stop all tracks to release the hardware
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start(1000) // Collect data every second
      mediaRecorderRef.current = recorder  // keep ref in sync for stopRecording
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
      } else if (err.name === 'OverconstrainedError') {
        // The pinned device was disconnected between selection and recording start.
        // Fall back to the system default and retry once.
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            audio: BASE_AUDIO_CONSTRAINTS as MediaTrackConstraints
          } as MediaStreamConstraints)
          setSelectedDeviceId('')   // Clear pin so UX reflects reality
          // Restart with fallback stream
          const recorder = new MediaRecorder(fallbackStream, { mimeType: selectedFormat.mimeType })
          chunksRef.current = []
          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
          recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: selectedFormat.mimeType })
            setAudioBlob(blob)
            setAudioUrl(URL.createObjectURL(blob))
            setStatus('stopped')
            fallbackStream.getTracks().forEach(t => t.stop())
          }
          recorder.start(1000)
          mediaRecorderRef.current = recorder  // keep ref in sync for stopRecording
          setMediaRecorder(recorder)
          setStatus('recording')
          setDuration(0)
          timerRef.current = setInterval(() => {
            setDuration(prev => {
              const n = prev + 1
              if (n >= maxDuration) stopRecording()
              return n
            })
          }, 1000)
          toast.warning('Selected microphone disconnected — switched to default device.')
          return
        } catch {
          setError('The selected microphone was disconnected. Please select another microphone and try again.')
        }
      } else {
        setError('Failed to access microphone. Please try again.')
      }

      setStatus('error')
    }
  }

  // Stop recording — always uses the ref so it works correctly even
  // when called from inside a stale setInterval closure.
  const stopRecording = () => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.stop()
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
    setIsPlaying(false)
    setPlayProgress(0)
    setAudioDuration(0)
    mediaRecorderRef.current = null
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
      const authHeaders = getAuthHeaders()

      // Preferred path: request presigned URL and upload directly to S3.
      const presignResponse = await fetch(
        `${API_BASE_URL}/student/clap-assignments/${assignmentId}/audio-upload-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            item_id: itemId,
            mime_type: audioBlob.type,
            extension: selectedFormat.extension,
            file_size: audioBlob.size,
          })
        }
      )

      if (presignResponse.ok) {
        const presignData = await presignResponse.json()

        const uploadResp = await fetch(presignData.upload_url, {
          method: 'PUT',
          headers: presignData.headers || { 'Content-Type': audioBlob.type },
          body: audioBlob,
        })
        if (!uploadResp.ok) {
          throw new Error('Failed direct upload to object storage')
        }

        const finalizeResp = await fetch(
          `${API_BASE_URL}/student/clap-assignments/${assignmentId}/submit-audio`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            body: JSON.stringify({
              item_id: itemId,
              duration,
              mime_type: audioBlob.type,
              s3_object_key: presignData.object_key,
              file_size: audioBlob.size,
            })
          }
        )

        if (!finalizeResp.ok) {
          const errData = await finalizeResp.json()
          throw new Error(errData.error || 'Failed to finalize audio upload')
        }

        const data = await finalizeResp.json()
        setUploadProgress(100)
        setStatus('uploaded')
        toast.success('Audio submitted successfully')
        onSave(data)
        return
      }

      // Fallback path: legacy multipart upload through Django.
      const formData = new FormData()
      formData.append('audio', audioBlob, `recording.${selectedFormat.extension}`)
      formData.append('item_id', itemId)
      formData.append('duration', duration.toString())
      formData.append('mime_type', audioBlob.type)

      const response = await fetch(
        `${API_BASE_URL}/student/clap-assignments/${assignmentId}/submit-audio`,
        {
          method: 'POST',
          body: formData,
          headers: authHeaders,
        }
      )

      if (response.ok) {
        const data = await response.json()
        setUploadProgress(100)
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

      {/* Microphone selector — shown whenever we have ≥2 devices and not yet recording */}
      {devicesEnumerated && audioDevices.length >= 2 && !['recording', 'uploading', 'uploaded'].includes(status) && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Microphone</label>
          <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder="Select microphone" />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {audioDevices.map(d => (
                <SelectItem key={d.deviceId} value={d.deviceId} className="text-sm">
                  <span className="block truncate">{d.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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

      {status === 'requesting_permission' && (
        <div className="flex items-center justify-center gap-3 p-6 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-yellow-700">Requesting microphone access…</p>
        </div>
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
          {/* Custom audio player — white track, black progress, full CSS control */}
          <div className="p-4 bg-white rounded-lg border">
            {/* Hidden audio element — drives everything */}
            <audio
              ref={audioRef}
              src={audioUrl ?? undefined}
              onLoadedMetadata={() => {
                const el = audioRef.current
                if (!el) return
                if (el.duration === Infinity) {
                  // Fix missing WebM duration metadata
                  el.currentTime = 1e101
                } else {
                  setAudioDuration(el.duration)
                }
              }}
              onTimeUpdate={() => {
                const el = audioRef.current
                if (!el) return
                if (el.currentTime === 1e101) {
                  el.currentTime = 0
                  return
                }
                if (el.duration && el.duration !== Infinity) {
                  setAudioDuration(el.duration)
                  setPlayProgress(el.currentTime / el.duration)
                }
              }}
              onEnded={() => { setIsPlaying(false); setPlayProgress(1) }}
            />

            {/* Controls row */}
            <div className="flex items-center gap-3">
              {/* Play / Pause */}
              <button
                onClick={() => {
                  const el = audioRef.current
                  if (!el) return
                  if (isPlaying) { el.pause(); setIsPlaying(false) }
                  else { el.play(); setIsPlaying(true) }
                }}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 transition-colors"
              >
                {isPlaying
                  ? <Pause className="w-4 h-4 fill-white" />
                  : <Play  className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              {/* Time */}
              <span className="flex-shrink-0 text-xs tabular-nums text-gray-500 w-20">
                {formatTime(Math.floor((audioDuration || duration) * playProgress))}
                {' / '}
                {formatTime(Math.floor(audioDuration || duration))}
              </span>

              {/* Progress track — white bg, black fill */}
              <div
                className="flex-1 h-1.5 bg-white border border-gray-300 rounded-full cursor-pointer relative"
                onClick={(e) => {
                  const el = audioRef.current
                  if (!el || !el.duration || el.duration === Infinity) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  el.currentTime = ratio * el.duration
                  setPlayProgress(ratio)
                }}
              >
                <div
                  className="absolute left-0 top-0 h-full bg-gray-900 rounded-full transition-none"
                  style={{ width: `${playProgress * 100}%` }}
                />
              </div>

              {/* Volume icon — visual only */}
              <Volume2 className="flex-shrink-0 w-4 h-4 text-gray-400" />
            </div>
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
            Uploading audio… {uploadProgress}%
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
