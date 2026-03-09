'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Clock,
  Play,
  AlertCircle,
  LogOut,
  User,
  Target,
  Info,
  WifiOff,
  ArrowRight,
  Loader2,
  Trophy,
} from 'lucide-react'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { authStorage } from '@/lib/auth-storage'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

export default function StudentDashboard() {
  const router = useRouter()
  const isOnline = useNetworkStatus()

  // ── Button loading guard (prevents double-click + shows spinner) ──────────
  const [isNavigating, setIsNavigating] = useState(false)

  const [user, setUser] = useState({ id: '', name: 'Loading...', studentId: '...', email: '' })

  // Fetch user profile
  useEffect(() => {
    const controller = new AbortController()
    const fetchProfile = async () => {
      const storedUserId = authStorage.get('user_id')
      if (!storedUserId) { router.push('/login'); return }
      try {
        const response = await apiFetch(getApiUrl('student/profile'), {
          headers: getAuthHeaders(),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (response.ok) {
          const data = await response.json()
          if (data.profile) {
            if (!data.profile.profile_completed) { router.push('/student/profile'); return }
            setUser({
              id: data.profile.id,
              name: data.profile.username || data.profile.full_name || 'Student',
              studentId: data.profile.student_id || 'Not Assigned',
              email: data.profile.email,
            })
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('Failed to fetch profile:', error)
      }
    }
    fetchProfile()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Real-time assignment stats ────────────────────────────────────────────
  const [assignmentStats, setAssignmentStats] = useState({ total: 0, completed: 0 })
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const fetchStats = async () => {
      try {
        const res = await apiFetch(getApiUrl('student/clap-assignments'), {
          headers: getAuthHeaders(),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          const list: any[] = data.assignments || []
          setAssignmentStats({
            total: list.length,
            completed: list.filter((a: any) => a.status === 'completed').length,
          })
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        console.error('Stats fetch error:', e)
      } finally {
        if (!controller.signal.aborted) setStatsLoading(false)
      }
    }
    fetchStats()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = () => {
    authStorage.clear()
    router.push('/login')
  }

  // Navigate directly — no intermediate state rendered
  const handleStartSession = () => {
    if (isNavigating) return
    setIsNavigating(true)
    router.push('/student/clap-tests')
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          No internet connection — please reconnect to continue your session safely.
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo — no "A SANJIVO Product" subtitle */}
            <div className="flex items-center gap-3 shrink-0">
              <Image
                src="/images/clap-logo.png?v=new"
                alt="CLAP Logo"
                width={113}
                height={46}
                className="w-auto h-10 object-contain"
                priority
                style={{ width: 'auto', height: 'auto' }}
              />
              <div className="hidden sm:flex flex-col justify-center h-8 border-l border-border pl-3 ml-1">
                <p className="text-base font-semibold text-primary">Student Portal</p>
              </div>
            </div>

            {/* Nav buttons — proper outlined buttons, always visible */}
            <div className="flex items-center gap-2">
              <span className="hidden md:block text-sm font-medium text-muted-foreground mr-1">{user.name}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/student/results')}
                className="flex items-center gap-1.5 h-9 text-green-700 border-green-200 hover:bg-green-50"
              >
                <Trophy className="w-4 h-4" />
                <span className="hidden sm:inline">My Results</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/student/profile')}
                className="flex items-center gap-1.5 h-9"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">My Profile</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-1.5 h-9 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        {/* Welcome */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Welcome, {user.name}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Complete all 5 tests to finish your CLAP assessment.</p>
        </div>

        {/* ── Stat strip: Tests Completed + Student ID ────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 sm:mb-8">
          {/* Tests Completed */}
          <Card>
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                {statsLoading ? (
                  <div className="animate-pulse space-y-1">
                    <div className="h-5 w-8 bg-gray-200 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                ) : (
                  <>
                    <p className="text-base font-bold leading-tight">{assignmentStats.completed}/{assignmentStats.total}</p>
                    <p className="text-xs text-muted-foreground">Exams Completed</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          {/* Student ID */}
          <Card>
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <Info className="w-4 h-4 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight">{user.studentId}</p>
                <p className="text-xs text-muted-foreground">Student ID</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Important Instructions */}
        <Card className="border-amber-200 bg-amber-50/50 mb-6 sm:mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Important Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-amber-900 space-y-2">
              {[
                'You can complete tests in any order you prefer.',
                'Each test has its own time limit. Tests will auto-submit when time expires.',
                'Tab switching is monitored. Switching tabs twice will result in automatic test submission.',
                'Once a test is submitted, you cannot retake it.',
                'Ensure your microphone is working for the Speaking test.',
              ].map((instruction, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  {instruction}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ── Start Assessment CTA ─────────────────────────────────────────── */}
        <Card className="border-2 border-primary/20 bg-primary/5 mb-6 sm:mb-8">
          <CardContent className="p-5 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <Play className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2">Ready to Begin?</h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto">
              Once you start the session, you must complete all 5 tests within the allotted time.
              The timer will begin immediately and cannot be paused.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 mb-4 sm:mb-6 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>All tests timed individually</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>Tab switching is monitored</span>
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleStartSession}
              disabled={isNavigating}
              className="w-full sm:w-auto h-12 sm:h-14 text-base sm:text-lg px-6 sm:px-10 disabled:opacity-70"
            >
              {isNavigating ? (
                <>
                  <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                  Opening…
                </>
              ) : (
                <>
                  Start Assessment Session
                  <ArrowRight className="ml-2 w-5 h-5" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
