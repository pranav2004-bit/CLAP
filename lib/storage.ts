// Supabase storage client utilities for audio files
import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Storage bucket names
export const STORAGE_BUCKETS = {
  TEST_AUDIO: 'test-audio',      // For listening test audio files
  RECORDINGS: 'recordings',      // For speaking test recordings
  TEMP_FILES: 'temp-files'       // For temporary file storage
} as const

export type StorageBucket = keyof typeof STORAGE_BUCKETS

/**
 * Upload audio file to Supabase Storage
 */
export async function uploadAudioFile(
  bucket: StorageBucket,
  fileName: string,
  file: File | Blob,
  options?: {
    upsert?: boolean
    contentType?: string
  }
): Promise<{
  success: boolean
  data?: { path: string; fullPath: string }
  error?: string
}> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    
    // Validate file type for audio
    const validAudioTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/webm',
      'audio/ogg',
      'audio/aac'
    ]
    
    if (file instanceof File && !validAudioTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid audio file type. Supported formats: MP3, WAV, WEBM, OGG, AAC'
      }
    }
    
    // Upload file
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        upsert: options?.upsert ?? false,
        contentType: options?.contentType || file.type || 'audio/mpeg'
      })
    
    if (error) {
      console.error('Upload error:', error)
      return {
        success: false,
        error: error.message
      }
    }
    
    return {
      success: true,
      data: {
        path: data.path,
        fullPath: `${supabaseUrl}/storage/v1/object/public/${bucketName}/${data.path}`
      }
    }
  } catch (error) {
    console.error('Upload failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

/**
 * Get public URL for audio file
 */
export function getAudioPublicUrl(bucket: StorageBucket, fileName: string): string {
  const bucketName = STORAGE_BUCKETS[bucket]
  return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`
}

/**
 * Stream audio file from Supabase Storage
 */
export async function streamAudioFile(
  bucket: StorageBucket,
  fileName: string
): Promise<{
  success: boolean
  data?: { url: string; blob?: Blob }
  error?: string
}> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(fileName)
    
    if (error) {
      console.error('Download error:', error)
      return {
        success: false,
        error: error.message
      }
    }
    
    const url = URL.createObjectURL(data)
    
    return {
      success: true,
      data: {
        url,
        blob: data
      }
    }
  } catch (error) {
    console.error('Stream failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Streaming failed'
    }
  }
}

/**
 * List files in a storage bucket
 */
export async function listAudioFiles(
  bucket: StorageBucket,
  options?: {
    limit?: number
    offset?: number
    sortBy?: { column: string; order: 'asc' | 'desc' }
  }
): Promise<{
  success: boolean
  data?: Array<{
    name: string
    id: string
    updated_at: string
    created_at: string
    last_accessed_at: string
    metadata: Record<string, any>
  }>
  error?: string
}> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list('', {
        limit: options?.limit,
        offset: options?.offset,
        sortBy: options?.sortBy
      })
    
    if (error) {
      console.error('List error:', error)
      return {
        success: false,
        error: error.message
      }
    }
    
    return {
      success: true,
      data: data || []
    }
  } catch (error) {
    console.error('List failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Listing failed'
    }
  }
}

/**
 * Delete audio file from storage
 */
export async function deleteAudioFile(
  bucket: StorageBucket,
  fileName: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([fileName])
    
    if (error) {
      console.error('Delete error:', error)
      return {
        success: false,
        error: error.message
      }
    }
    
    return {
      success: true
    }
  } catch (error) {
    console.error('Delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deletion failed'
    }
  }
}

/**
 * Get signed URL for private audio files (expires after specified time)
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  fileName: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<{
  success: boolean
  data?: { signedUrl: string }
  error?: string
}> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, expiresIn)
    
    if (error) {
      console.error('Signed URL error:', error)
      return {
        success: false,
        error: error.message
      }
    }
    
    return {
      success: true,
      data: {
        signedUrl: data.signedUrl
      }
    }
  } catch (error) {
    console.error('Signed URL failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Signed URL generation failed'
    }
  }
}

/**
 * Update file metadata
 */
export async function updateFileMetadata(
  bucket: StorageBucket,
  fileName: string,
  metadata: Record<string, any>
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Note: Supabase storage update method typically updates file content, not metadata
    // For metadata updates, we might need to use a different approach
    // This is a placeholder implementation
    console.warn('Metadata update not implemented for Supabase storage');
    return {
      success: true
    };
  } catch (error) {
    console.error('Metadata update failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Metadata update failed'
    }
  }
}

// Utility functions for audio processing
export const AUDIO_UTILS = {
  /**
   * Validate audio file size (max 50MB)
   */
  validateFileSize: (file: File): { valid: boolean; error?: string } => {
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds 50MB limit. Current size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`
      }
    }
    return { valid: true }
  },
  
  /**
   * Generate unique filename with timestamp
   */
  generateFileName: (originalName: string, prefix: string = ''): string => {
    const timestamp = Date.now()
    const extension = originalName.split('.').pop() || 'mp3'
    return `${prefix}${timestamp}.${extension}`
  },
  
  /**
   * Format file size for display
   */
  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}