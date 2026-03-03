// Supabase Client Configuration
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Force validation - throw error if not configured properly
if (!supabaseUrl || supabaseUrl.includes('your_actual')) {
  throw new Error('❌ CRITICAL: Supabase URL not configured properly in .env.local')
}

if (!supabaseAnonKey || supabaseAnonKey.includes('your_actual')) {
  throw new Error('❌ CRITICAL: Supabase anon key not configured properly in .env.local')
}

console.log('✅ Supabase configuration loaded:', {
  url: supabaseUrl,
  hasKey: !!supabaseAnonKey
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Debug: Log the Supabase configuration
console.log('Supabase Config:', {
  url: supabaseUrl,
  hasKey: !!supabaseAnonKey,
  keyLength: supabaseAnonKey?.length
});

// Types for our database tables
export interface User {
  id: string
  email: string
  role: 'student' | 'admin'
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

// Helper functions for common operations
export const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const signIn = async (identifier: string, password: string, role: 'student' | 'admin' = 'student') => {
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
    return { data: null, error: { message: error.message || 'Authentication failed' } }
  }
}

export const signUp = async (email: string, password: string, fullName: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'student'
      }
    }
  })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}
