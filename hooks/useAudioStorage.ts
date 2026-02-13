'use client'

import { useState, useCallback, useRef } from 'react'
import { 
  uploadAudioFile, 
  streamAudioFile, 
  deleteAudioFile, 
  getAudioPublicUrl,
  STORAGE_BUCKETS,
  AUDIO_UTILS
} from '@/lib/storage'
import type { StorageBucket } from '@/lib/storage'

interface UseAudioStorageProps {
  bucket: StorageBucket
  onUploadSuccess?: (fileName: string, url: string) => void
  onUploadError?: (error: string) => void
  onDeleteSuccess?: (fileName: string) => void
  onDeleteError?: (error: string) => void
}

interface UploadProgress {
  fileName: string
  progress: number
  status: 'uploading' | 'completed' | 'failed'
  error?: string
}

export function useAudioStorage({
  bucket,
  onUploadSuccess,
  onUploadError,
  onDeleteSuccess,
  onDeleteError
}: UseAudioStorageProps) {
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Upload audio file
  const uploadAudio = useCallback(async (
    file: File,
    customFileName?: string
  ): Promise<{
    success: boolean
    data?: { fileName: string; url: string }
    error?: string
  }> => {
    try {
      setIsUploading(true)
      
      // Validate file
      const sizeValidation = AUDIO_UTILS.validateFileSize(file)
      if (!sizeValidation.valid) {
        throw new Error(sizeValidation.error)
      }
      
      // Generate filename
      const fileName = customFileName || AUDIO_UTILS.generateFileName(file.name, 'audio_')
      
      // Set initial upload state
      setUploads(prev => ({
        ...prev,
        [fileName]: {
          fileName,
          progress: 0,
          status: 'uploading'
        }
      }))

      // Upload file
      const result = await uploadAudioFile(bucket, fileName, file, {
        upsert: false,
        contentType: file.type
      })

      if (result.success && result.data) {
        // Update upload state
        setUploads(prev => ({
          ...prev,
          [fileName]: {
            fileName,
            progress: 100,
            status: 'completed'
          }
        }))

        // Callback
        onUploadSuccess?.(fileName, result.data.fullPath)
        
        return {
          success: true,
          data: {
            fileName,
            url: result.data.fullPath
          }
        }
      } else {
        throw new Error(result.error || 'Upload failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      
      // Update upload state with error
      setUploads(prev => {
        const erroredUploads = { ...prev }
        Object.keys(erroredUploads).forEach(key => {
          if (erroredUploads[key].status === 'uploading') {
            erroredUploads[key] = {
              ...erroredUploads[key],
              status: 'failed',
              error: errorMessage
            }
          }
        })
        return erroredUploads
      })

      onUploadError?.(errorMessage)
      
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setIsUploading(false)
    }
  }, [bucket, onUploadSuccess, onUploadError])

  // Stream audio file
  const streamAudio = useCallback(async (
    fileName: string
  ): Promise<{
    success: boolean
    data?: { url: string; blob: Blob }
    error?: string
  }> => {
    try {
      const result = await streamAudioFile(bucket, fileName)
      
      if (result.success && result.data) {
        return {
          success: true,
          data: {
            url: result.data.url,
            blob: result.data.blob!
          }
        }
      } else {
        throw new Error(result.error || 'Streaming failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed'
      return {
        success: false,
        error: errorMessage
      }
    }
  }, [bucket])

  // Get public URL for audio file
  const getPublicUrl = useCallback((
    fileName: string
  ): string => {
    return getAudioPublicUrl(bucket, fileName)
  }, [bucket])

  // Delete audio file
  const deleteAudio = useCallback(async (
    fileName: string
  ): Promise<{
    success: boolean
    error?: string
  }> => {
    try {
      setIsDeleting(true)
      
      const result = await deleteAudioFile(bucket, fileName)
      
      if (result.success) {
        // Remove from uploads state
        setUploads(prev => {
          const newUploads = { ...prev }
          delete newUploads[fileName]
          return newUploads
        })
        
        onDeleteSuccess?.(fileName)
        return { success: true }
      } else {
        throw new Error(result.error || 'Deletion failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Deletion failed'
      onDeleteError?.(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setIsDeleting(false)
    }
  }, [bucket, onDeleteSuccess, onDeleteError])

  // Cancel ongoing upload
  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      
      // Update upload states to cancelled
      setUploads(prev => {
        const cancelledUploads = { ...prev }
        Object.keys(cancelledUploads).forEach(key => {
          if (cancelledUploads[key].status === 'uploading') {
            cancelledUploads[key] = {
              ...cancelledUploads[key],
              status: 'failed',
              error: 'Upload cancelled'
            }
          }
        })
        return cancelledUploads
      })
      
      setIsUploading(false)
    }
  }, [])

  // Clear upload history
  const clearUploadHistory = useCallback(() => {
    setUploads({})
  }, [])

  // Get upload progress for specific file
  const getUploadProgress = useCallback((fileName: string): UploadProgress | undefined => {
    return uploads[fileName]
  }, [uploads])

  // Get all active uploads
  const getActiveUploads = useCallback((): UploadProgress[] => {
    return Object.values(uploads).filter(upload => 
      upload.status === 'uploading' || upload.status === 'completed'
    )
  }, [uploads])

  return {
    // State
    uploads,
    isUploading,
    isDeleting,
    
    // Actions
    uploadAudio,
    streamAudio,
    deleteAudio,
    cancelUpload,
    clearUploadHistory,
    
    // Utilities
    getPublicUrl,
    getUploadProgress,
    getActiveUploads,
    
    // Derived state
    hasActiveUploads: Object.keys(uploads).some(key => uploads[key].status === 'uploading'),
    uploadCount: Object.keys(uploads).length
  }
}

// Hook specifically for test audio management
export function useTestAudio() {
  return useAudioStorage({
    bucket: 'TEST_AUDIO'
  })
}

// Hook specifically for speaking test recordings
export function useRecordingStorage() {
  return useAudioStorage({
    bucket: 'RECORDINGS',
    onUploadSuccess: (fileName, url) => {
      console.log('Recording uploaded successfully:', fileName)
    },
    onUploadError: (error) => {
      console.error('Recording upload failed:', error)
    }
  })
}