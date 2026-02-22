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
import { useStudentDashboard } from '@/hooks/useStudentDashboard'
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
  Info
} from 'lucide-react'
import { getApiUrl } from '@/lib/api-config'

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
  const [sessionStarted, setSessionStarted] = useState(false)
  const [user, setUser] = useState({
    id: '',
    name: 'Loading...',
    studentId: '...',
    email: ''
  })

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      const storedUserId = localStorage.getItem('user_id')
      if (!storedUserId) {
        router.push('/login')
        return
      }

      try {
        const response = await fetch(getApiUrl('student/profile'), {
          headers: { 'x-user-id': storedUserId }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.profile) {
            setUser({
              id: data.profile.id,
              name: data.profile.username || data.profile.full_name || 'Student',
              studentId: data.profile.student_id || 'Not Assigned',
              email: data.profile.email
            })
          }
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error)
      }
    }
    fetchProfile()
  }, [])

  // Fetch real dashboard data
  const {
    dashboardData,
    isLoading,
    error,
    lastUpdated,
    refresh
  } = useStudentDashboard({
    userId: user.id, // Use real user ID
    refreshInterval: 30000
  })

  const handleStartSession = () => {
    setSessionStarted(true)
  }

  const handleStartTest = (_testId: string) => {
    // Task 12.1 integration:
    // Route students to the assignment-driven CLAP flow, whose submit action
    // dispatches the new /api/submissions pipeline endpoint.
    router.push('/student/clap-tests')
  }

  const handleLogout = () => {
    router.push('/login')
  }

  // Use real data when available, fallback to mock data
  const completedTests = dashboardData?.stats.completed_tests || 0
  const totalTests = dashboardData?.stats.total_tests || tests.length
  const overallProgress = totalTests > 0 ? (completedTests / totalTests) * 100 : 0

  const totalDuration = dashboardData?.tests.reduce((acc, t) => acc + t.duration_minutes, 0) || 0
  const totalMarks = dashboardData?.tests.reduce((acc, t) => acc + (t.score || 0), 0) || 0
  const maxMarks = dashboardData?.tests.reduce((acc, t) => acc + (t.max_score || 0), 0) || 50

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={113} height={46} className="w-auto h-10 object-contain" priority />
              <div className="flex flex-col justify-center h-8 border-l border-border pl-3 ml-2">
                <p className="text-xs font-semibold text-primary">Student Portal</p>
                <span className="text-[10px] text-muted-foreground">by SANJIVO</span>
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

            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{user.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/student/profile')}
                className="hover:bg-slate-100 hover:text-slate-900"
              >
                <User className="w-4 h-4 mr-2" />
                My Profile
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedTests}/{totalTests}</p>
                <p className="text-sm text-muted-foreground">Tests Completed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalMarks}/{maxMarks}</p>
                <p className="text-sm text-muted-foreground">Marks Scored</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDuration} min</p>
                <p className="text-sm text-muted-foreground">Total Duration</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Info className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{user.studentId}</p>
                <p className="text-sm text-muted-foreground">Student ID</p>
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
              <Button variant="hero" size="xl" onClick={handleStartSession}>
                Start Assessment Session
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Loading State */}
            {isLoading && !dashboardData && (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
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
                {(dashboardData?.tests || []).map((test) => (
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
