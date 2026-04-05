// Auth utilities — all authentication goes through the Django backend JWT API.
import { authStorage } from '@/lib/auth-storage'

// ── Shared types ─────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  role: 'student' | 'admin' | 'sub_admin'
  full_name: string | null
  created_at: string
}

export interface Test {
  id: string
  name: string
  type: 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary'
  duration_minutes: number
  total_questions: number
  instructions: string | null
  created_at: string
}

export interface Question {
  id: string
  test_id: string
  question_text: string
  question_type: 'mcq' | 'fill_blank' | 'essay' | 'audio_response'
  options: string[] | null
  correct_answer: string | null
  audio_url: string | null
  image_url: string | null
  points: number
  order_index: number
  created_at: string
}

export interface TestAttempt {
  id: string
  user_id: string
  test_id: string
  started_at: string
  completed_at: string | null
  score: number | null
  max_score: number | null
  status: 'in_progress' | 'completed' | 'abandoned'
  answers: Record<string, any> | null
  created_at: string
}

// ── Auth functions ───────────────────────────────────────────────────────────

export const signIn = async (identifier: string, password: string, role: 'student' | 'admin' | 'sub_admin' = 'student') => {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password, role })
    })

    const data = await response.json()
    if (!response.ok) {
      return { data: null, error: { message: data.error || 'Invalid credentials' } }
    }

    // Store JWT access token — used by getAuthHeaders() for all subsequent API calls
    if (data.access_token) {
      authStorage.set('access_token', data.access_token)
      if (data.expires_in) {
        authStorage.set('token_expires_at', String(Date.now() + data.expires_in * 1000))
      }
    }

    return {
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          user_metadata: {
            full_name: data.user.full_name,
            role: data.user.role,
            profile_completed: data.user.profile_completed
          }
        }
      },
      error: null
    }
  } catch (error: any) {
    console.error('Login error:', error)
    if (error.message?.includes('fetch') || error.message?.includes('NetworkError')) {
      return { data: null, error: { message: 'Cannot connect to the server right now. Please try again later.' } }
    }
    return { data: null, error: { message: error.message || 'Authentication failed' } }
  }
}

export const signOut = async () => {
  authStorage.clear()
  return { error: null }
}
