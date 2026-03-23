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
  Headphones,
  BookOpen,
  PenLine,
  Mic,
  BookMarked,
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

  // ── Nav loading guard — tracks which header button was clicked ────────────
  const [navLoadingId, setNavLoadingId] = useState<string | null>(null)
  const handleNav = (id: string, path: string) => {
    if (navLoadingId || isNavigating) return
    setNavLoadingId(id)
    router.push(path)
  }

  // Navigate directly — no intermediate state rendered
  const handleStartSession = () => {
    if (isNavigating || navLoadingId) return
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
              <span className="hidden md:block text-sm font-medium text-muted-foreground mr-1 max-w-[160px] truncate">{user.name}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!!navLoadingId || isNavigating}
                onClick={() => handleNav('results', '/student/results')}
                className="flex items-center gap-1.5 h-9 text-green-700 border-green-200 hover:bg-green-50"
              >
                {navLoadingId === 'results'
                  ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  : <Trophy className="w-4 h-4 shrink-0" />}
                <span className="hidden sm:inline">My Results</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!navLoadingId || isNavigating}
                onClick={() => handleNav('profile', '/student/profile')}
                className="flex items-center gap-1.5 h-9"
              >
                {navLoadingId === 'profile'
                  ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  : <User className="w-4 h-4 shrink-0" />}
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

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-6">

        {/* ── Welcome ─────────────────────────────────────────────────────── */}
        <div className="mb-4 sm:mb-5">
          <h1 className="text-xl sm:text-2xl font-bold mb-0.5 break-words">
            Welcome, <span className="break-all">{user.name}</span>
          </h1>
          <p className="text-sm text-muted-foreground">Complete all 5 tests to finish your CLAP assessment.</p>
        </div>

        {/* ── Stat strip ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 sm:mb-5">
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
                    <p className="text-sm sm:text-base font-bold leading-tight truncate">{assignmentStats.completed}/{assignmentStats.total}</p>
                    <p className="text-xs text-muted-foreground">Exams Completed</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <Info className="w-4 h-4 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-base font-bold leading-tight truncate">{user.studentId}</p>
                <p className="text-xs text-muted-foreground">Student ID</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Test overview strip ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4 sm:mb-5">

          {/* Listening */}
          <Card className="border-blue-200 bg-blue-50/40">
            <CardContent className="p-3 sm:p-4">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
                <Headphones className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800 leading-tight mb-1.5">Listening</p>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">MCQ</span>
                <span className="text-[10px] text-muted-foreground font-medium">10 M</span>
              </div>
              <p className="text-[11px] text-muted-foreground">5 Questions</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Audio-based comprehension questions</p>
            </CardContent>
          </Card>

          {/* Reading */}
          <Card className="border-green-200 bg-green-50/40">
            <CardContent className="p-3 sm:p-4">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center mb-2">
                <BookOpen className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800 leading-tight mb-1.5">Reading</p>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">MCQ</span>
                <span className="text-[10px] text-muted-foreground font-medium">10 M</span>
              </div>
              <p className="text-[11px] text-muted-foreground">5 Questions</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Passage comprehension questions</p>
            </CardContent>
          </Card>

          {/* Writing */}
          <Card className="border-orange-200 bg-orange-50/40">
            <CardContent className="p-3 sm:p-4">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center mb-2">
                <PenLine className="w-4 h-4 text-orange-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800 leading-tight mb-1.5">Writing</p>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">AI Scored</span>
                <span className="text-[10px] text-muted-foreground font-medium">10 M</span>
              </div>
              <p className="text-[11px] text-muted-foreground">5 Questions</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Written essay evaluated by AI</p>
            </CardContent>
          </Card>

          {/* Speaking */}
          <Card className="border-rose-200 bg-rose-50/40">
            <CardContent className="p-3 sm:p-4">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center mb-2">
                <Mic className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800 leading-tight mb-1.5">Speaking</p>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] font-medium bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">AI Scored</span>
                <span className="text-[10px] text-muted-foreground font-medium">10 M</span>
              </div>
              <p className="text-[11px] text-muted-foreground">1 Question</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Audio recording evaluated by AI</p>
            </CardContent>
          </Card>

          {/* Verbal Ability */}
          <Card className="col-span-2 sm:col-span-1 border-violet-200 bg-violet-50/40">
            <CardContent className="p-3 sm:p-4">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center mb-2">
                <BookMarked className="w-4 h-4 text-violet-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800 leading-tight mb-1.5">Verbal Ability</p>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[10px] font-medium bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">MCQ</span>
                <span className="text-[10px] text-muted-foreground font-medium">10 M</span>
              </div>
              <p className="text-[11px] text-muted-foreground">10 Questions</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Language accuracy questions</p>
            </CardContent>
          </Card>

        </div>

        {/* ── Instructions + CTA: stacked mobile / side-by-side desktop ─── */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:gap-5 lg:items-stretch">

          {/* Instructions — 3 columns (60%) */}
          <div className="lg:col-span-3">
            <Card className="border-amber-200 bg-amber-50/50 lg:h-full">
              <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  Important Instructions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-5 pb-4 pt-0">
                <ul className="text-sm text-amber-900 space-y-2">
                  {[
                    'You can complete tests in any order you prefer.',
                    'A single global timer runs for the entire assessment. All tests will auto-submit when the timer expires.',
                    'Tab switching is monitored. Switching tabs twice will result in automatic test submission.',
                    'Once a test is submitted, you cannot retake it.',
                    'Ensure your microphone is working for the Speaking test.',
                  ].map((instruction, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                      {instruction}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* CTA action panel — 2 columns (40%) */}
          <div className="lg:col-span-2">
            <Card className="border-2 border-primary/20 bg-primary/5 lg:h-full">
              <CardContent className="flex flex-col items-center justify-center text-center lg:h-full p-5 sm:p-6 gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Play className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold mb-1">Ready to Begin?</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Complete all 5 tests within the allotted time. The timer begins immediately and cannot be paused.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground w-full">
                  <div className="flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>All tests timed individually</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Tab switching is monitored</span>
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={handleStartSession}
                  disabled={isNavigating}
                  className="w-full h-11 text-base disabled:opacity-70"
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
          </div>

        </div>
      </main>
    </div>
  )
}
