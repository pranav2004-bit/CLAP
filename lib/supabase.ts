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

export const signIn = async (email: string, password: string, role: 'student' | 'admin' = 'student') => {
  try {
    console.log('SignIn attempt:', { email, role }); // Debug log

    // Try actual database connection - no demo mode fallback
    console.log('Attempting database connection...');

    // Log Supabase configuration
    console.log('Supabase config - URL:', supabaseUrl);

    // First check our custom users table
    console.log('Making query with:', { email, role });

    let query = supabase
      .from('users')
      .select('id, email, full_name, role, password_hash, is_active, profile_completed')
      .eq('role', role);

    if (role === 'student') {
      // Allow login with email, username, or student_id
      query = query.or(`email.eq.${email},username.eq.${email},student_id.eq.${email}`);
    } else {
      query = query.eq('email', email);
    }

    const { data: user, error: userError } = await query.single();

    console.log('Database query result:', { user, userError }); // Debug log

    if (userError || !user) {
      console.log('User not found or error:', userError); // Debug log
      return { data: null, error: { message: 'Invalid credentials' } }
    }

    // Check if account is active
    if (!user.is_active) {
      console.log('Account disabled'); // Debug log
      return { data: null, error: { message: 'This account is disabled by admin' } }
    }

    console.log('Stored hash:', user.password_hash); // Debug log
    console.log('Input password:', password); // Debug log

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    console.log('Password valid:', isValidPassword); // Debug log

    if (!isValidPassword) {
      return { data: null, error: { message: 'Invalid credentials' } }
    }

    // Return user data (simulate Supabase auth response)
    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: {
            full_name: user.full_name,
            role: user.role,
            profile_completed: user.profile_completed
          }
        }
      },
      error: null
    }
  } catch (error: any) {
    console.log('SignIn error:', error); // Debug log
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