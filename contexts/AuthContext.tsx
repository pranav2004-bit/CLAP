'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authStorage } from '@/lib/auth-storage'
import { signIn as djangoSignIn, signOut as djangoSignOut, User } from '@/lib/auth'

interface AuthContextType {
  user: User | null
  session: any
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore user from JWT stored in authStorage on page load
    const token = authStorage.get('access_token')
    if (!token) {
      setLoading(false)
      return
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
    fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user) setUser(data.user as User)
      })
      .catch(() => {/* network error — stay logged-out state */})
      .finally(() => setLoading(false))
  }, [])

  const handleSignIn = async (email: string, password: string) => {
    const result = await djangoSignIn(email, password)
    if (!result.error && result.data?.user) {
      setUser(result.data.user as unknown as User)
    }
    return result
  }

  const handleSignOut = async () => {
    await djangoSignOut()
    setUser(null)
  }

  const value: AuthContextType = {
    user,
    session: null,   // JWT sessions have no server-side session object
    signIn: handleSignIn,
    signOut: handleSignOut,
    loading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
