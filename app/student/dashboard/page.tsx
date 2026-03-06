'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { LoadingSpinner, ErrorMessage } from '@/components/LoadingSpinner'
import { TestProgressCard } from '@/components/TestProgressCard'
import { StatsOverview } from '@/components/StatsOverview'
import { RecentActivity } from '@/components/RecentActivity'
import {
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  Brain,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  LogOut,
  User,
  Timer,
  Target,
  Trophy,
  ArrowRight,
  Info,
  WifiOff
} from 'lucide-react'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

const tests = [
  {
    id: 'listening',
    name: 'Listening',
    icon: Headphones,
    color: 'listening',
    description: '2 audio clips followed by MCQ questions',
    marks: 10,
    duration: 20,
    questions: 10
  },
  {
    id: 'speaking',
    name: 'Speaking',
    icon: Mic,
    color: 'speaking',
    description: 'Record your voice response to a prompt',
    marks: 10,
    duration: 5,
    questions: 1
  },
  {
    id: 'reading',
    name: 'Reading',
    icon: BookOpen,
    color: 'reading',
    description: '2 passages with comprehension questions',
    marks: 10,
    duration: 25,
    questions: 10
  },
  {
    id: 'writing',
    name: 'Writing',
    icon: PenTool,
    color: 'writing',
    description: 'Write an essay on the given topic',
    marks: 10,
    duration: 30,
    questions: 1
  },
  {
    id: 'vocabulary',
    name: 'Vocabulary & Grammar',
    icon: Brain,
    color: 'vocabulary',
    description: 'MCQs on vocabulary and grammar',
    marks: 10,
    duration: 15,
    questions: 10
  }
]





export default function StudentDashboard() {
  const router = useRouter()
  const isOnline = useNetworkStatus()  // H2: offline detection
  const [sessionStarted, setSessionStarted] = useState(false)
  const [sessionStarting, setSessionStarting] = useState(false)  // H4: double-submit guard
  const [user, setUser] = useState({
    id: '',
    name: 'Loading...',
    studentId: '...',
    email: ''
  })

  // Fetch user profile — H1: AbortController cleanup
  useEffect(() => {
    const controller = new AbortController()
    const fetchProfile = async () => {
      const storedUserId = localStorage.getItem('user_id')
      if (!storedUserId) {
        router.push('/login')
        return
      }

      try {
        const response = await apiFetch(getApiUrl('student/profile'), {
          headers: getAuthHeaders(),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return

        if (response.ok) {
          const data = await response.json()
          if (data.profile) {
            if (!data.profile.profile_completed) {
              router.push('/student/profile')
              return
            }
            setUser({
              id: data.profile.id,
              name: data.profile.username || data.profile.full_name || 'Student',
              studentId: data.profile.student_id || 'Not Assigned',
              email: data.profile.email
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

  // Real-time assignment stats — fetched from /student/clap-assignments.
  // Drives the dashboard stat cards and overall progress bar.
  const [assignmentStats, setAssignmentStats] = useState({
    total: 0,
    completed: 0,
    started: 0,
    assigned: 0,
  })
  const [statsLoading, setStatsLoading] = useState(true)

  // Real-time assignment stats — H1: AbortController cleanup
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
            started: list.filter((a: any) => a.status === 'started').length,
            assigned: list.filter((a: any) => a.status === 'assigned').length,
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

  // Stubs kept for JSX compatibility (guarded sections use `dashboardData &&`)
  const dashboardData = null as any
  const error = null as string | null
  const lastUpdated = null as Date | null
  const refresh = () => {}

  // H4: double-submit guard — prevents rapid double-click on Start Assessment
  const handleStartSession = () => {
    if (sessionStarting) return
    setSessionStarting(true)
    setSessionStarted(true)
    router.push('/student/clap-tests')
  }

  const handleStartTest = (_testId: string) => {
    // Task 12.1 integration:
    // Route students to the assignment-driven CLAP flow, whose submit action
    // dispatches the new /api/submissions pipeline endpoint.
    router.push('/student/clap-tests')
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_role')
    localStorage.removeItem('user_name')
    router.push('/login')
  }

  // Real stats from clap-assignments — fallback to mock counts when no assignments yet
  const completedTests = assignmentStats.completed
  const totalTests = assignmentStats.total || tests.length
  const overallProgress = totalTests > 0 ? (completedTests / totalTests) * 100 : 0
  const isLoading = statsLoading

  // Duration / marks shown on stat cards (real values come from the test detail page)
  const totalDuration = 0
  const totalMarks = 0
  const maxMarks = 50

  return (
    <div className="min-h-dvh bg-background">
      {/* H2: Offline banner */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          No internet connection — please reconnect to continue your session safely.
        </div>
      )}
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={113} height={46} className="w-auto h-10 object-contain" priority style={{ width: 'auto', height: 'auto' }} />
              <div className="flex flex-col justify-center h-8 border-l border-border pl-3 ml-2">
                <p className="text-xs font-semibold text-primary">Student Portal</p>
                <span className="text-[10px] text-muted-foreground">A SANJIVO Product</span>
              </div>
            </div>

            {sessionStarted && (
              <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-lg bg-secondary">
                <Timer className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Session Time</p>
                  <p className="text-sm font-mono font-semibold">01:35:00</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm max-w-[150px] truncate">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{user.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/student/profile')}
                className="hover:bg-slate-100 hover:text-slate-900 px-2 sm:px-3"
                title="My Profile"
              >
                <User className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">My Profile</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hover:bg-red-50 hover:text-red-600 px-2 sm:px-3"
                title="Logout"
              >
                <LogOut className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Welcome, {user.name}</h1>
          <p className="text-muted-foreground">
            Complete all 5 tests to finish your CLAP assessment
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <Card>
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{completedTests}/{totalTests}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Tests Completed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{totalMarks}/{maxMarks}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Marks Scored</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-warning" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{totalDuration} min</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Duration</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
              </div>
              <div className="max-w-[120px] sm:max-w-none">
                <p className="text-lg sm:text-2xl font-bold truncate" title={user.studentId}>{user.studentId}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Student ID</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Overall Progress */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Assessment Progress</h3>
                <p className="text-sm text-muted-foreground">
                  {completedTests} of {totalTests} tests completed
                </p>
              </div>
              <span className="text-2xl font-bold text-primary">{overallProgress.toFixed(0)}%</span>
            </div>
            <Progress value={overallProgress} className="h-3" />
          </CardContent>
        </Card>

        {/* Test Cards */}
        {!sessionStarted ? (
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Play className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Ready to Begin?</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Once you start the session, you must complete all 5 tests within the allotted time.
                The timer will begin immediately and cannot be paused.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Total time: {totalDuration} minutes</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span>Tab switching will be monitored</span>
                </div>
              </div>
              {/* H4: Disabled during navigation to prevent double-click */}
              <Button
                variant="hero"
                size="xl"
                onClick={handleStartSession}
                disabled={sessionStarting}
                className="w-full sm:w-auto h-14 text-base sm:text-lg disabled:opacity-70"
              >
                {sessionStarting ? 'Opening…' : 'Start Assessment Session'}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* M1: Skeleton loading state for stat cards */}
            {isLoading && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-pulse">
                {[1,2,3,4].map(i => (
                  <div key={i} className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0" />
                      <div className="flex-1">
                        <div className="h-6 bg-gray-200 rounded w-8 mb-1" />
                        <div className="h-3 bg-gray-100 rounded w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && (
              <ErrorMessage message={error} />
            )}

            {/* Stats Overview */}
            {dashboardData && (
              <StatsOverview stats={dashboardData.stats} />
            )}

            {/* Test Progress Cards */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Your Tests</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(dashboardData?.tests || []).map((test: any) => (
                  <TestProgressCard
                    key={test.id}
                    test={test}
                    onClick={(testId) => handleStartTest(testId)}
                  />
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            {dashboardData && dashboardData.recent_activity.length > 0 && (
              <RecentActivity activities={dashboardData.recent_activity} />
            )}

            {/* Last Updated */}
            {lastUpdated && (
              <div className="text-center text-xs text-muted-foreground pt-4">
                Last updated: {lastUpdated.toLocaleTimeString()}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refresh}
                  className="ml-2 text-xs"
                >
                  Refresh
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Important Notes */}
        <Card className="mt-8 border-warning/30 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-warning" />
              Important Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-warning">•</span>
                You can complete tests in any order you prefer.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-warning">•</span>
                Each test has its own time limit. Tests will auto-submit when time expires.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-warning">•</span>
                Tab switching is monitored. Switching tabs twice will result in automatic test submission.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-warning">•</span>
                Once a test is submitted, you cannot retake it.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-warning">•</span>
                Ensure your microphone is working for the Speaking test.
              </li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
