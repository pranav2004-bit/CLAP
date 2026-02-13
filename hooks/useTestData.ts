'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  fetchTests, 
  fetchTestById, 
  fetchAttempts, 
  fetchAttemptById,
  createTestAttempt,
  updateTestAttempt
} from '@/lib/api/client'

interface UseTestsReturn {
  tests: any[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useTests(): UseTestsReturn {
  const [tests, setTests] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchTests()
      if (result.error) {
        setError(result.error)
      } else {
        setTests(result.data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    tests,
    loading,
    error,
    refetch: fetchData
  }
}

interface UseTestReturn {
  test: any | null
  questions: any[] | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useTest(testId: string): UseTestReturn {
  const [test, setTest] = useState<any | null>(null)
  const [questions, setQuestions] = useState<any[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!testId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchTestById(testId)
      if (result.error) {
        setError(result.error)
      } else {
        setTest(result.data?.test || null)
        setQuestions(result.data?.questions || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch test')
    } finally {
      setLoading(false)
    }
  }, [testId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    test,
    questions,
    loading,
    error,
    refetch: fetchData
  }
}

interface UseAttemptsReturn {
  attempts: any[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useAttempts(userId?: string): UseAttemptsReturn {
  const [attempts, setAttempts] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchAttempts(userId)
      if (result.error) {
        setError(result.error)
      } else {
        setAttempts(result.data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch attempts')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    attempts,
    loading,
    error,
    refetch: fetchData
  }
}

interface UseAttemptReturn {
  attempt: any | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useAttempt(attemptId: string): UseAttemptReturn {
  const [attempt, setAttempt] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!attemptId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchAttemptById(attemptId)
      if (result.error) {
        setError(result.error)
      } else {
        setAttempt(result.data || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch attempt')
    } finally {
      setLoading(false)
    }
  }, [attemptId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    attempt,
    loading,
    error,
    refetch: fetchData
  }
}

interface UseTestAttemptActionsReturn {
  createAttempt: (attemptData: any) => Promise<{ data: any | null; error: string | null }>
  updateAttempt: (id: string, attemptData: any) => Promise<{ data: any | null; error: string | null }>
  loading: boolean
}

export function useTestAttemptActions(): UseTestAttemptActionsReturn {
  const [loading, setLoading] = useState<boolean>(false)

  const createAttempt = useCallback(async (attemptData: any) => {
    setLoading(true)
    try {
      const result = await createTestAttempt(attemptData)
      return result
    } finally {
      setLoading(false)
    }
  }, [])

  const updateAttempt = useCallback(async (id: string, attemptData: any) => {
    setLoading(true)
    try {
      const result = await updateTestAttempt(id, attemptData)
      return result
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    createAttempt,
    updateAttempt,
    loading
  }
}