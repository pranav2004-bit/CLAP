'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'

interface StudentDashboardData {
  tests: Array<{
    id: string
    name: string
    type: string
    duration_minutes: number
    total_questions: number
    status: 'not_started' | 'in_progress' | 'completed'
    score?: number
    max_score?: number
    last_attempt_date?: string
    attempts_count: number
  }>
  stats: {
    total_tests: number
    completed_tests: number
    in_progress_tests: number
    not_started_tests: number
    average_score?: number
    total_attempts: number
  }
  recent_activity: Array<{
    id: string
    test_name: string
    action: 'started' | 'completed' | 'continued'
    timestamp: string
    score?: number
  }>
}

interface UseStudentDashboardProps {
  userId: string
  refreshInterval?: number // in milliseconds
}

export function useStudentDashboard({ 
  userId, 
  refreshInterval = 30000 // 30 seconds
}: UseStudentDashboardProps) {
  const [dashboardData, setDashboardData] = useState<StudentDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Fetch tests data
      const testsResult = await apiClient.getTests()
      
      // Fetch user attempts
      const attemptsResult = await apiClient.getAttempts(userId)
      
      // Process data to create dashboard structure
      const processedData = processDashboardData(testsResult, attemptsResult, userId)
      
      setDashboardData(processedData)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data')
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // Initial load
  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return
    
    const interval = setInterval(() => {
      fetchDashboardData()
    }, refreshInterval)
    
    return () => clearInterval(interval)
  }, [fetchDashboardData, refreshInterval])

  // Manual refresh
  const refresh = useCallback(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  return {
    dashboardData,
    isLoading,
    error,
    lastUpdated,
    refresh,
    hasData: !!dashboardData
  }
}

// Helper function to process raw data into dashboard format
function processDashboardData(
  tests: any[], 
  attempts: any[], 
  userId: string
): StudentDashboardData {
  // Group attempts by test_id
  const attemptsByTest: Record<string, any[]> = {}
  attempts.forEach(attempt => {
    if (!attemptsByTest[attempt.test_id]) {
      attemptsByTest[attempt.test_id] = []
    }
    attemptsByTest[attempt.test_id].push(attempt)
  })

  // Process tests with their attempt data
  const processedTests = tests.map(test => {
    const testAttempts = attemptsByTest[test.id] || []
    const completedAttempts = testAttempts.filter(a => a.status === 'completed')
    const inProgressAttempts = testAttempts.filter(a => a.status === 'in_progress')
    
    let status: 'not_started' | 'in_progress' | 'completed' = 'not_started'
    let score: number | undefined
    let maxScore: number | undefined
    let lastAttemptDate: string | undefined
    let attemptsCount = testAttempts.length

    if (completedAttempts.length > 0) {
      status = 'completed'
      // Get most recent completed attempt
      const latestCompleted = completedAttempts.reduce((latest, current) => 
        new Date(current.completed_at) > new Date(latest.completed_at) ? current : latest
      )
      score = latestCompleted.score
      maxScore = latestCompleted.max_score
      lastAttemptDate = latestCompleted.completed_at
    } else if (inProgressAttempts.length > 0) {
      status = 'in_progress'
      // Get most recent in-progress attempt
      const latestInProgress = inProgressAttempts.reduce((latest, current) => 
        new Date(current.started_at) > new Date(latest.started_at) ? current : latest
      )
      lastAttemptDate = latestInProgress.started_at
    }

    return {
      id: test.id,
      name: test.name,
      type: test.type,
      duration_minutes: test.duration_minutes,
      total_questions: test.total_questions,
      status,
      score,
      max_score: maxScore,
      last_attempt_date: lastAttemptDate,
      attempts_count: attemptsCount
    }
  })

  // Calculate statistics
  const totalTests = processedTests.length
  const completedTests = processedTests.filter(t => t.status === 'completed').length
  const inProgressTests = processedTests.filter(t => t.status === 'in_progress').length
  const notStartedTests = processedTests.filter(t => t.status === 'not_started').length
  
  const completedTestsWithScores = processedTests.filter(t => t.status === 'completed' && t.score !== undefined)
  const averageScore = completedTestsWithScores.length > 0 
    ? completedTestsWithScores.reduce((sum, test) => sum + (test.score || 0), 0) / completedTestsWithScores.length
    : undefined

  const totalAttempts = attempts.length

  const stats = {
    total_tests: totalTests,
    completed_tests: completedTests,
    in_progress_tests: inProgressTests,
    not_started_tests: notStartedTests,
    average_score: averageScore,
    total_attempts: totalAttempts
  }

  // Generate recent activity
  const recentActivity = generateRecentActivity(attempts, tests)

  return {
    tests: processedTests,
    stats,
    recent_activity: recentActivity.slice(0, 5) // Last 5 activities
  }
}

function generateRecentActivity(attempts: any[], tests: any[]): StudentDashboardData['recent_activity'] {
  const activity: StudentDashboardData['recent_activity'] = []
  
  // Map test IDs to names for quick lookup
  const testNames: Record<string, string> = {}
  tests.forEach(test => {
    testNames[test.id] = test.name
  })

  attempts.forEach(attempt => {
    const testName = testNames[attempt.test_id] || 'Unknown Test'
    
    if (attempt.status === 'completed') {
      activity.push({
        id: `completed-${attempt.id}`,
        test_name: testName,
        action: 'completed',
        timestamp: attempt.completed_at,
        score: attempt.score
      })
    } else if (attempt.status === 'in_progress') {
      activity.push({
        id: `started-${attempt.id}`,
        test_name: testName,
        action: 'started',
        timestamp: attempt.started_at
      })
    }
  })

  // Sort by timestamp descending (most recent first)
  return activity.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

// Hook for individual test progress
export function useTestProgress(userId: string, testId: string) {
  const [progress, setProgress] = useState<{
    status: 'not_started' | 'in_progress' | 'completed'
    score?: number
    max_score?: number
    progress_percent: number
    attempts: any[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTestProgress = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const attempts = await apiClient.getAttempts(userId)
        const testAttempts = attempts.filter(a => a.test_id === testId)
        
        if (testAttempts.length === 0) {
          setProgress({
            status: 'not_started',
            progress_percent: 0,
            attempts: []
          })
          return
        }

        const completedAttempts = testAttempts.filter(a => a.status === 'completed')
        const inProgressAttempts = testAttempts.filter(a => a.status === 'in_progress')
        
        let status: 'not_started' | 'in_progress' | 'completed' = 'not_started'
        let score: number | undefined
        let maxScore: number | undefined
        let progressPercent = 0

        if (completedAttempts.length > 0) {
          status = 'completed'
          const latest = completedAttempts.reduce((latest, current) => 
            new Date(current.completed_at) > new Date(latest.completed_at) ? current : latest
          )
          score = latest.score
          maxScore = latest.max_score
          progressPercent = 100
        } else if (inProgressAttempts.length > 0) {
          status = 'in_progress'
          // Estimate progress based on time elapsed or questions answered
          progressPercent = 50 // Placeholder - would need more detailed tracking
        }

        setProgress({
          status,
          score,
          max_score: maxScore,
          progress_percent: progressPercent,
          attempts: testAttempts
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch test progress')
      } finally {
        setIsLoading(false)
      }
    }

    if (testId) {
      fetchTestProgress()
    }
  }, [userId, testId])

  return {
    progress,
    isLoading,
    error,
    hasProgress: !!progress
  }
}