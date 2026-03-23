'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { TestAttempt, Test } from '@/lib/mock-data'

interface AdminDashboardData {
  totalStudents: number
  completedAssessments: number
  inProgressAssessments: number
  averageScore: number
  testStats: TestStat[]
  recentActivity: ActivityItem[]
  students: Student[]
}

interface TestStat {
  name: string
  type: string
  avgScore: number
  completionRate: number
  totalAttempts: number
  icon: string
  color: string
}

interface ActivityItem {
  type: 'completed' | 'started' | 'created'
  studentName: string
  testName: string
  timestamp: string
  timeAgo: string
}

interface Student {
  id: string
  name: string
  email: string
  college: string
  status: 'completed' | 'in_progress' | 'not_started'
  score: number | null
  date: string | null
  testAttempts: TestAttempt[]
}

interface UseAdminDashboardProps {
  refreshInterval?: number
}

export function useAdminDashboard({ 
  refreshInterval = 60000 // Refresh every minute
}: UseAdminDashboardProps = {}) {
  const [dashboardData, setDashboardData] = useState<AdminDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchDashboardData = async () => {
    try {
      console.log('Fetching dashboard data...');
      setIsLoading(true)
      setError(null)

      // Fetch all attempts and tests
      console.log('Fetching attempts and tests...');
      const [attempts, tests] = await Promise.all([
        apiClient.getAttempts(),
        apiClient.getTests()
      ])

      console.log('Raw attempts data:', attempts);
      console.log('Raw tests data:', tests);

      // Data is already extracted by the API client methods

      // Process data for dashboard
      console.log('Processing dashboard data...');
      const processedData = processDashboardData(attempts, tests)
      
      console.log('Processed dashboard data:', processedData);
      setDashboardData(processedData)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err)
      // Provide fallback mock data when API fails
      const mockData: AdminDashboardData = {
        totalStudents: 25,
        completedAssessments: 18,
        inProgressAssessments: 7,
        averageScore: 7.2,
        testStats: [
          {
            name: 'Listening Test',
            type: 'listening',
            avgScore: 7.5,
            completionRate: 85,
            totalAttempts: 25,
            icon: 'Headphones',
            color: 'listening'
          },
          {
            name: 'Speaking Test',
            type: 'speaking',
            avgScore: 6.8,
            completionRate: 72,
            totalAttempts: 22,
            icon: 'Mic',
            color: 'speaking'
          },
          {
            name: 'Reading Test',
            type: 'reading',
            avgScore: 8.1,
            completionRate: 92,
            totalAttempts: 24,
            icon: 'BookOpen',
            color: 'reading'
          },
          {
            name: 'Writing Test',
            type: 'writing',
            avgScore: 7.9,
            completionRate: 88,
            totalAttempts: 20,
            icon: 'PenTool',
            color: 'writing'
          },
          {
            name: 'Verbal Ability Test',
            type: 'vocabulary',
            avgScore: 8.3,
            completionRate: 95,
            totalAttempts: 25,
            icon: 'Brain',
            color: 'vocabulary'
          }
        ],
        recentActivity: [
          {
            type: 'completed',
            studentName: 'John Smith',
            testName: 'Verbal Ability Test',
            timestamp: new Date().toISOString(),
            timeAgo: '2 minutes ago'
          },
          {
            type: 'started',
            studentName: 'Sarah Johnson',
            testName: 'Writing Test',
            timestamp: new Date(Date.now() - 300000).toISOString(),
            timeAgo: '5 minutes ago'
          },
          {
            type: 'completed',
            studentName: 'Mike Wilson',
            testName: 'Reading Test',
            timestamp: new Date(Date.now() - 600000).toISOString(),
            timeAgo: '10 minutes ago'
          }
        ],
        students: [
          {
            id: 'stud-001',
            name: 'John Smith',
            email: 'john.smith@example.com',
            college: 'Tech University',
            status: 'completed',
            score: 42,
            date: new Date().toISOString(),
            testAttempts: []
          },
          {
            id: 'stud-002',
            name: 'Sarah Johnson',
            email: 'sarah.johnson@example.com',
            college: 'State College',
            status: 'in_progress',
            score: null,
            date: new Date().toISOString(),
            testAttempts: []
          }
        ]
      };
      
      setDashboardData(mockData);
      setError('Using mock data - API connection unavailable');
    } finally {
      setIsLoading(false)
    }
  }

  const processDashboardData = (attempts: TestAttempt[], tests: Test[]): AdminDashboardData => {
    console.log('Processing dashboard data with:', { attempts, tests });
    
    // Get unique students from attempts
    const uniqueStudents = Array.from(new Set(attempts.map(a => a.user_id)))
    console.log('Unique students:', uniqueStudents);
    
    // Count different statuses
    const completedAttempts = attempts.filter(a => a.status === 'completed')
    const inProgressAttempts = attempts.filter(a => a.status === 'in_progress')
    console.log('Completed attempts:', completedAttempts.length, 'In progress attempts:', inProgressAttempts.length);
    
    // Calculate average score
    const totalScore = completedAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0)
    const averageScore = completedAttempts.length > 0 ? totalScore / completedAttempts.length : 0
    console.log('Average score:', averageScore);
    
    // Calculate test statistics
    const testStats = tests.map(test => {
      const testAttempts = attempts.filter(a => a.test_id === test.id)
      const completedTestAttempts = testAttempts.filter(a => a.status === 'completed')
      
      const avgScore = completedTestAttempts.length > 0 
        ? completedTestAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / completedTestAttempts.length
        : 0
      
      const completionRate = testAttempts.length > 0 
        ? (completedTestAttempts.length / testAttempts.length) * 100
        : 0

      const stat = {
        name: test.name,
        type: test.type,
        avgScore: parseFloat(avgScore.toFixed(1)),
        completionRate: Math.round(completionRate),
        totalAttempts: testAttempts.length,
        icon: getTestIcon(test.type),
        color: getTestColor(test.type)
      };
      
      console.log(`Test ${test.name} stats:`, stat);
      return stat;
    })

    // Generate recent activity
    const recentActivity = generateRecentActivity(attempts, tests)
    console.log('Recent activity:', recentActivity);

    // Generate student data
    const students = generateStudentData(attempts, tests)
    console.log('Students:', students);

    const result = {
      totalStudents: uniqueStudents.length,
      completedAssessments: completedAttempts.length,
      inProgressAssessments: inProgressAttempts.length,
      averageScore: parseFloat(averageScore.toFixed(1)),
      testStats,
      recentActivity,
      students
    };
    
    console.log('Final dashboard data:', result);
    return result;
  }

  const generateRecentActivity = (attempts: TestAttempt[], tests: Test[]): ActivityItem[] => {
    // Sort attempts by timestamp and take recent ones
    const sortedAttempts = [...attempts].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 10)

    return sortedAttempts.map(attempt => {
      const test = tests.find(t => t.id === attempt.test_id)
      const studentId = attempt.user_id
      
      return {
        type: attempt.status === 'completed' ? 'completed' : 
              attempt.status === 'in_progress' ? 'started' : 'created',
        studentName: `Student ${studentId.slice(-4)}`, // Simplified for demo
        testName: test?.name || 'Unknown Test',
        timestamp: attempt.created_at,
        timeAgo: getTimeAgo(attempt.created_at)
      }
    })
  }

  const generateStudentData = (attempts: TestAttempt[], tests: Test[]): Student[] => {
    const studentMap = new Map<string, Student>()
    
    attempts.forEach(attempt => {
      const studentId = attempt.user_id
      
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          id: studentId,
          name: `Student ${studentId.slice(-4)}`,
          email: `${studentId}@example.com`,
          college: 'Tech University',
          status: 'not_started',
          score: null,
          date: null,
          testAttempts: []
        })
      }
      
      const student = studentMap.get(studentId)!
      student.testAttempts.push(attempt)
      
      // Update student status based on attempts
      const completedAttempts = student.testAttempts.filter(a => a.status === 'completed')
      const inProgressAttempts = student.testAttempts.filter(a => a.status === 'in_progress')
      
      if (inProgressAttempts.length > 0) {
        student.status = 'in_progress'
        student.date = inProgressAttempts[0].started_at
      } else if (completedAttempts.length > 0) {
        student.status = 'completed'
        student.date = completedAttempts[0].completed_at || completedAttempts[0].started_at
        
        // Calculate average score across all completed tests
        const totalScore = completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0)
        student.score = Math.round(totalScore)
      }
    })

    return Array.from(studentMap.values())
  }

  const getTestIcon = (type: string): string => {
    const icons: Record<string, string> = {
      'listening': 'Headphones',
      'speaking': 'Mic',
      'reading': 'BookOpen',
      'writing': 'PenTool',
      'vocabulary': 'Brain'
    }
    return icons[type] || 'FileText'
  }

  const getTestColor = (type: string): string => {
    const colors: Record<string, string> = {
      'listening': 'listening',
      'speaking': 'speaking',
      'reading': 'reading',
      'writing': 'writing',
      'vocabulary': 'vocabulary'
    }
    return colors[type] || 'primary'
  }

  const getTimeAgo = (timestamp: string): string => {
    const now = new Date()
    const then = new Date(timestamp)
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
    return `${Math.floor(diffInSeconds / 86400)} days ago`
  }

  const refresh = () => {
    fetchDashboardData()
  }

  // Initial fetch with immediate mock data fallback
  useEffect(() => {
    fetchDashboardData()
    
    // Set mock data immediately as fallback
    const mockData: AdminDashboardData = {
      totalStudents: 25,
      completedAssessments: 18,
      inProgressAssessments: 7,
      averageScore: 7.2,
      testStats: [
        {
          name: 'Listening Test',
          type: 'listening',
          avgScore: 7.5,
          completionRate: 85,
          totalAttempts: 25,
          icon: 'Headphones',
          color: 'listening'
        },
        {
          name: 'Speaking Test',
          type: 'speaking',
          avgScore: 6.8,
          completionRate: 72,
          totalAttempts: 22,
          icon: 'Mic',
          color: 'speaking'
        },
        {
          name: 'Reading Test',
          type: 'reading',
          avgScore: 8.1,
          completionRate: 92,
          totalAttempts: 24,
          icon: 'BookOpen',
          color: 'reading'
        },
        {
          name: 'Writing Test',
          type: 'writing',
          avgScore: 7.9,
          completionRate: 88,
          totalAttempts: 20,
          icon: 'PenTool',
          color: 'writing'
        },
        {
          name: 'Verbal Ability Test',
          type: 'vocabulary',
          avgScore: 8.3,
          completionRate: 95,
          totalAttempts: 25,
          icon: 'Brain',
          color: 'vocabulary'
        }
      ],
      recentActivity: [
        {
          type: 'completed',
          studentName: 'John Smith',
          testName: 'Verbal Ability Test',
          timestamp: new Date().toISOString(),
          timeAgo: '2 minutes ago'
        },
        {
          type: 'started',
          studentName: 'Sarah Johnson',
          testName: 'Writing Test',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          timeAgo: '5 minutes ago'
        }
      ],
      students: [
        {
          id: 'stud-001',
          name: 'John Smith',
          email: 'john.smith@example.com',
          college: 'Tech University',
          status: 'completed',
          score: 42,
          date: new Date().toISOString(),
          testAttempts: []
        }
      ]
    };
    
    // Set mock data immediately
    setDashboardData(mockData);
  }, [])

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [refreshInterval])

  return {
    dashboardData,
    isLoading,
    error,
    lastUpdated,
    refresh
  }
}