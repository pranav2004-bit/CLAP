// Storage utilities — audio file operations via Django backend API.
// All storage is on AWS S3, managed server-side through Django presigned URLs.
import { getAuthHeaders, API_BASE_URL } from '@/lib/api-config'

// Storage bucket identifiers (logical names — Django resolves the actual S3 bucket)
export const STORAGE_BUCKETS = {
  TEST_AUDIO: 'test-audio',    // Listening test audio files
  RECORDINGS: 'recordings',    // Speaking test recordings
  TEMP_FILES: 'temp-files'     // Temporary file storage
} as const

export type StorageBucket = keyof typeof STORAGE_BUCKETS

/**
 * Upload audio file via Django backend (presigned S3 PUT).
 */
export async function uploadAudioFile(
  bucket: StorageBucket,
  fileName: string,
  file: File | Blob,
  options?: { upsert?: boolean; contentType?: string }
): Promise<{ success: boolean; data?: { path: string; fullPath: string }; error?: string }> {
  try {
    const validAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac']
    if (file instanceof File && !validAudioTypes.includes(file.type)) {
      return { success: false, error: 'Invalid audio file type. Supported formats: MP3, WAV, WEBM, OGG, AAC' }
    }

    const bucketName = STORAGE_BUCKETS[bucket]
    const contentType = options?.contentType || (file instanceof File ? file.type : 'audio/mpeg')

    // Request presigned upload URL from Django
    const presignRes = await fetch(`${API_BASE_URL}/admin/audio/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ bucket: bucketName, file_name: fileName, content_type: contentType })
    })

    if (!presignRes.ok) {
      const err = await presignRes.json().catch(() => ({}))
      return { success: false, error: err.error || 'Failed to get upload URL' }
    }

    const { upload_url, object_key, headers: putHeaders } = await presignRes.json()

    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, ...putHeaders },
      body: file
    })

    if (!putRes.ok) {
      return { success: false, error: 'Direct S3 upload failed' }
    }

    return {
      success: true,
      data: { path: object_key, fullPath: `${API_BASE_URL}/admin/audio/url/${encodeURIComponent(object_key)}` }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Upload failed' }
  }
}

/**
 * Get public/signed URL for an audio file via Django.
 */
export function getAudioPublicUrl(bucket: StorageBucket, fileName: string): string {
  const bucketName = STORAGE_BUCKETS[bucket]
  return `${API_BASE_URL}/admin/audio/url/${encodeURIComponent(`${bucketName}/${fileName}`)}`
}

/**
 * Stream/download audio file via Django presigned URL.
 */
export async function streamAudioFile(
  bucket: StorageBucket,
  fileName: string
): Promise<{ success: boolean; data?: { url: string; blob?: Blob }; error?: string }> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    const res = await fetch(
      `${API_BASE_URL}/admin/audio/url/${encodeURIComponent(`${bucketName}/${fileName}`)}`,
      { headers: getAuthHeaders() }
    )

    if (!res.ok) return { success: false, error: 'Failed to fetch audio URL' }

    const { url } = await res.json()
    const audioRes = await fetch(url)
    if (!audioRes.ok) return { success: false, error: 'Failed to download audio' }

    const blob = await audioRes.blob()
    return { success: true, data: { url: URL.createObjectURL(blob), blob } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Streaming failed' }
  }
}

/**
 * List files in a storage bucket via Django.
 */
export async function listAudioFiles(
  bucket: StorageBucket,
  options?: { limit?: number; offset?: number }
): Promise<{
  success: boolean
  data?: Array<{ name: string; id: string; updated_at: string; created_at: string; last_accessed_at: string; metadata: Record<string, any> }>
  error?: string
}> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    const params = new URLSearchParams({ bucket: bucketName })
    if (options?.limit)  params.set('limit',  String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))

    const res = await fetch(`${API_BASE_URL}/admin/audio/list?${params}`, { headers: getAuthHeaders() })
    if (!res.ok) return { success: false, error: 'Failed to list files' }
    const data = await res.json()
    return { success: true, data: data.files || [] }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Listing failed' }
  }
}

/**
 * Delete audio file via Django.
 */
export async function deleteAudioFile(
  bucket: StorageBucket,
  fileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    const res = await fetch(`${API_BASE_URL}/admin/audio/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ bucket: bucketName, file_name: fileName })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.error || 'Deletion failed' }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Deletion failed' }
  }
}

/**
 * Get a time-limited signed URL for a private audio file via Django.
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  fileName: string,
  expiresIn = 3600
): Promise<{ success: boolean; data?: { signedUrl: string }; error?: string }> {
  try {
    const bucketName = STORAGE_BUCKETS[bucket]
    const res = await fetch(`${API_BASE_URL}/admin/audio/signed-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ bucket: bucketName, file_name: fileName, expires_in: expiresIn })
    })
    if (!res.ok) return { success: false, error: 'Failed to generate signed URL' }
    const { signed_url } = await res.json()
    return { success: true, data: { signedUrl: signed_url } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Signed URL generation failed' }
  }
}

/**
 * Placeholder — metadata updates are managed server-side.
 */
export async function updateFileMetadata(
  _bucket: StorageBucket,
  _fileName: string,
  _metadata: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  return { success: true }
}

// ── Pure utility functions ────────────────────────────────────────────────────

export const AUDIO_UTILS = {
  validateFileSize: (file: File): { valid: boolean; error?: string } => {
    const maxSize = 50 * 1024 * 1024 // 50 MB
    if (file.size > maxSize) {
      return { valid: false, error: `File size exceeds 50MB limit. Current size: ${(file.size / (1024 * 1024)).toFixed(2)}MB` }
    }
    return { valid: true }
  },

  generateFileName: (originalName: string, prefix = ''): string => {
    const timestamp = Date.now()
    const extension = originalName.split('.').pop() || 'mp3'
    return `${prefix}${timestamp}.${extension}`
  },

  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}
