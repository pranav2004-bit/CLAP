// Admin API Client Utilities
import { API_BASE_URL } from './api-config'

interface Test {
  id: string
  name: string
  type: string
  duration_minutes: number
  total_questions: number
  instructions: string
  status: 'draft' | 'published' | 'archived'
  created_at: string
  updated_at: string
  questions?: Question[]
}

export interface TestFormData {
  id?: string
  name: string
  type: string
  duration_minutes: number
  total_questions: number
  instructions: string
  status: 'draft' | 'published' | 'archived'
  questions: QuestionFormData[]
}

interface Question {
  id: string
  test_id: string
  question_text: string
  question_type: 'mcq' | 'short_answer' | 'essay'
  options?: string[]
  correct_answer?: string
  points: number
  order_index: number
  created_at: string
}

// Interface for creating/updating questions (allows optional fields)
export interface QuestionFormData {
  id?: string
  test_id?: string
  question_text: string
  question_type: 'mcq' | 'short_answer' | 'essay'
  options?: string[]
  correct_answer?: string
  points: number
  order_index: number
  created_at?: string
}

interface Student {
  id: string
  name: string
  email: string
  college: string
  status: 'not_started' | 'in_progress' | 'completed'
  score: number | null
  date: string | null
  attempts: any[]
}

interface ApiResponse<T> {
  data?: T
  error?: string
}

// Tests API
export const adminTestsApi = {
  // Get all tests
  getAll: async (filters?: { status?: string; type?: string }): Promise<Test[]> => {
    try {
      const params = new URLSearchParams()
      if (filters?.status) params.append('status', filters.status)
      if (filters?.type) params.append('type', filters.type)

      const response = await fetch(`${API_BASE_URL}/admin/tests?${params}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch tests')
      return data.tests || []
    } catch (error) {
      console.error('Error fetching tests:', error)
      throw error
    }
  },

  // Get test by ID
  getById: async (id: string): Promise<Test> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/tests/${id}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch test')
      return data.test
    } catch (error) {
      console.error('Error fetching test:', error)
      throw error
    }
  },

  // Create test
  create: async (testData: Omit<TestFormData, 'id' | 'created_at' | 'updated_at'>): Promise<Test> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to create test')
      return data.test
    } catch (error) {
      console.error('Error creating test:', error)
      throw error
    }
  },

  // Update test
  update: async (id: string, testData: Partial<TestFormData>): Promise<Test> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/tests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to update test')
      return data.test
    } catch (error) {
      console.error('Error updating test:', error)
      throw error
    }
  },

  // Delete test
  delete: async (id: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/tests/${id}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to delete test')
    } catch (error) {
      console.error('Error deleting test:', error)
      throw error
    }
  }
}

// Students API
export const adminStudentsApi = {
  // Get all students
  getAll: async (filters?: { search?: string; status?: string }): Promise<Student[]> => {
    try {
      const params = new URLSearchParams()
      if (filters?.search) params.append('search', filters.search)
      if (filters?.status) params.append('status', filters.status)

      const response = await fetch(`${API_BASE_URL}/admin/students?${params}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch students')
      return data.students || []
    } catch (error) {
      console.error('Error fetching students:', error)
      throw error
    }
  },

  // Get student by ID
  getById: async (id: string): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/students/${id}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch student')
      return data.student
    } catch (error) {
      console.error('Error fetching student:', error)
      throw error
    }
  },

  // Create student
  create: async (studentData: { email: string; full_name: string; password?: string }): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentData)
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to create student')
      return data.user
    } catch (error) {
      console.error('Error creating student:', error)
      throw error
    }
  },

  // Update student
  update: async (id: string, studentData: Partial<{ full_name: string; email: string }>): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/students/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentData)
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to update student')
      return data.student
    } catch (error) {
      console.error('Error updating student:', error)
      throw error
    }
  },

  // Delete student
  delete: async (id: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/students/${id}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to delete student')
    } catch (error) {
      console.error('Error deleting student:', error)
      throw error
    }
  }
}