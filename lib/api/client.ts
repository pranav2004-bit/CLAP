// API client utilities for fetching test data

import { API_BASE_URL } from '@/lib/api-config'

interface ApiError {
  message: string
  status?: number
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ApiResponse<T> = await response.json()

      if (!data.success) {
        throw new Error(data.message || data.error || 'API request failed')
      }

      return data.data as T
    } catch (error) {
      console.error(`API request failed for ${url}:`, error)
      throw error
    }
  }

  // Tests API
  async getTests(): Promise<any[]> {
    return this.request('/tests')
  }

  async getTestById(id: string): Promise<{ test: any; questions: any[] }> {
    return this.request(`/tests/${id}`)
  }

  async createTest(testData: any): Promise<any> {
    return this.request('/tests', {
      method: 'POST',
      body: JSON.stringify(testData),
    })
  }

  async updateTest(id: string, testData: any): Promise<any> {
    return this.request(`/tests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(testData),
    })
  }

  async deleteTest(id: string): Promise<void> {
    return this.request(`/tests/${id}`, {
      method: 'DELETE',
    })
  }

  // Attempts API
  async getAttempts(userId?: string): Promise<any[]> {
    const params = userId ? `?userId=${encodeURIComponent(userId)}` : ''
    return this.request(`/attempts${params}`)
  }

  async getAttemptById(id: string): Promise<any> {
    return this.request(`/attempts/${id}`)
  }

  async createAttempt(attemptData: any): Promise<any> {
    return this.request('/attempts', {
      method: 'POST',
      body: JSON.stringify(attemptData),
    })
  }

  async updateAttempt(id: string, attemptData: any): Promise<any> {
    return this.request(`/attempts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(attemptData),
    })
  }

  async deleteAttempt(id: string): Promise<void> {
    return this.request(`/attempts/${id}`, {
      method: 'DELETE',
    })
  }

  // Answers API
  async saveAnswer(attemptId: string, questionId: string, answer: string | number | string[]): Promise<any> {
    return this.request(`/attempts/${attemptId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ question_id: questionId, answer, timestamp: new Date().toISOString() }),
    })
  }

  async saveMultipleAnswers(attemptId: string, answers: Record<string, string | number | string[]>): Promise<any> {
    const answersPayload = Object.entries(answers).map(([questionId, answer]) => ({
      question_id: questionId,
      answer,
      timestamp: new Date().toISOString()
    }))

    return this.request(`/attempts/${attemptId}/answers/batch`, {
      method: 'POST',
      body: JSON.stringify({ answers: answersPayload }),
    })
  }

  async getAttemptAnswers(attemptId: string): Promise<Record<string, any>> {
    const result = await this.request<{ answers: Record<string, any> }>(`/attempts/${attemptId}/answers`, {
      method: 'GET',
    })
    return result.answers || {}
  }

  async clearAnswer(attemptId: string, questionId: string): Promise<any> {
    return this.request(`/attempts/${attemptId}/answers/${questionId}`, {
      method: 'DELETE',
    })
  }
}

// Create singleton instance
export const apiClient = new ApiClient()

// Hook-friendly data fetching functions
export async function fetchTests() {
  try {
    const tests = await apiClient.getTests()
    return { data: tests, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to fetch tests' }
  }
}

export async function fetchTestById(id: string) {
  try {
    const testData = await apiClient.getTestById(id)
    return { data: testData, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to fetch test' }
  }
}

export async function fetchAttempts(userId?: string) {
  try {
    const attempts = await apiClient.getAttempts(userId)
    return { data: attempts, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to fetch attempts' }
  }
}

export async function fetchAttemptById(id: string) {
  try {
    const attempt = await apiClient.getAttemptById(id)
    return { data: attempt, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to fetch attempt' }
  }
}

export async function createTestAttempt(attemptData: any) {
  try {
    const newAttempt = await apiClient.createAttempt(attemptData)
    return { data: newAttempt, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to create attempt' }
  }
}

export async function updateTestAttempt(id: string, attemptData: any) {
  try {
    const updatedAttempt = await apiClient.updateAttempt(id, attemptData)
    return { data: updatedAttempt, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to update attempt' }
  }
}