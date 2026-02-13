'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { 
  Upload, 
  Play, 
  Pause, 
  Trash2, 
  FileAudio, 
  CheckCircle, 
  AlertCircle,
  X
} from 'lucide-react'
import { useAudioStorage } from '@/hooks/useAudioStorage'
import type { StorageBucket } from '@/lib/storage'

interface AudioUploadProps {
  bucket: StorageBucket
  onAudioUploaded?: (fileName: string, url: string) => void
  onAudioDeleted?: (fileName: string) => void
  accept?: string
  maxFileSize?: number
  className?: string
}

export function AudioUpload({
  bucket,
  onAudioUploaded,
  onAudioDeleted,
  accept = 'audio/*',
  maxFileSize = 50 * 1024 * 1024, // 50MB
  className = ''
}: AudioUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const {
    uploads,
    isUploading,
    uploadAudio,
    deleteAudio,
    getPublicUrl,
    getActiveUploads
  } = useAudioStorage({
    bucket,
    onUploadSuccess: (fileName, url) => {
      onAudioUploaded?.(fileName, url)
      setPreviewUrl(url)
    },
    onUploadError: (error) => {
      console.error('Upload error:', error)
    },
    onDeleteSuccess: (fileName) => {
      onAudioDeleted?.(fileName)
      setPreviewUrl(null)
      if (audioRef.current) {
        audioRef.current.pause()
        // audioRef.current = null // Cannot assign to readonly property
      }
    }
  })

  const activeUploads = getActiveUploads()

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    
    // Validate file type
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file')
      return
    }

    // Validate file size
    if (file.size > maxFileSize) {
      alert(`File size exceeds ${maxFileSize / (1024 * 1024)}MB limit`)
      return
    }

    // Upload file
    uploadAudio(file)
  }, [uploadAudio, maxFileSize])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
  }, [handleFileSelect])

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const togglePlayback = useCallback(() => {
    if (!previewUrl || !audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [previewUrl, isPlaying])

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const handleDelete = useCallback(async (fileName: string) => {
    if (confirm('Are you sure you want to delete this audio file?')) {
      await deleteAudio(fileName)
    }
  }, [deleteAudio])

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Area */}
      <Card 
        className={`border-2 border-dashed transition-colors ${
          isDragging 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className="p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isUploading}
          />
          
          <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <CardTitle className="text-lg mb-2">
            {isUploading ? 'Uploading Audio...' : 'Upload Audio File'}
          </CardTitle>
          <p className="text-muted-foreground mb-4">
            Drag and drop an audio file here, or click to browse
          </p>
          <Button 
            onClick={triggerFileSelect}
            disabled={isUploading}
            variant="secondary"
          >
            {isUploading ? 'Uploading...' : 'Select File'}
          </Button>
          
          {isUploading && (
            <div className="mt-4 text-sm text-muted-foreground">
              Uploading... Please wait
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Uploads */}
      {activeUploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-md">Upload Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeUploads.map((upload) => (
              <div key={upload.fileName} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileAudio className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">
                      {upload.fileName}
                    </span>
                  </div>
                  {upload.status === 'completed' && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {upload.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                
                {upload.status === 'uploading' && (
                  <Progress value={upload.progress} className="h-2" />
                )}
                
                {upload.status === 'failed' && upload.error && (
                  <p className="text-sm text-red-500">{upload.error}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Audio Preview */}
      {previewUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-md">Audio Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={togglePlayback}
                variant="outline"
                size="icon"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              
              <div className="flex-1">
                <audio
                  ref={audioRef}
                  src={previewUrl}
                  onEnded={handleAudioEnded}
                  className="hidden"
                />
                <div className="text-sm text-muted-foreground">
                  {activeUploads.find(u => u.status === 'completed')?.fileName || 'Uploaded audio'}
                </div>
              </div>
              
              <Button
                onClick={() => handleDelete(activeUploads.find(u => u.status === 'completed')?.fileName || '')}
                variant="outline"
                size="icon"
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}