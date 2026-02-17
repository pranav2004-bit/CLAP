// Admin API Client Utilities
import { API_BASE_URL } from './api-config'



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