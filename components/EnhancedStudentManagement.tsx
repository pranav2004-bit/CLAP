'use client'

import { useState, useEffect, useMemo } from 'react'
import { CubeLoader } from '@/components/ui/CubeLoader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Edit,
  Trash2,
  User,
  Mail,
  Hash,
  Power,
  X,
  Save,
  RotateCcw,
  Users,
  Key,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE_URL, getAuthHeaders } from '@/lib/api-config'
import { feedback } from '@/lib/user-feedback'

interface Student {
  id: string
  student_id: string
  username: string | null
  email: string
  full_name: string
  is_active: boolean
  profile_completed: boolean
  created_at: string
}

interface EditStudentData {
  id: string
  student_id: string
  username: string
  email: string
  full_name: string
  is_active: boolean
}

interface EnhancedStudentManagementProps {
  refreshKey?: number
}

const ITEMS_PER_PAGE = 10

export function EnhancedStudentManagement({ refreshKey = 0 }: EnhancedStudentManagementProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [editFormData, setEditFormData] = useState<EditStudentData>({
    id: '',
    student_id: '',
    username: '',
    email: '',
    full_name: '',
    is_active: true
  })
  const [isSaving, setIsSaving] = useState(false)

  // Fetch students data
  useEffect(() => {
    // Only do initial load
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filter students based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStudents(students)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = students.filter(student =>
        student.student_id.toLowerCase().includes(query) ||
        student.full_name?.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query)
      )
      setFilteredStudents(filtered)
    }
    setCurrentPage(1) // Reset to first page on search
  }, [searchQuery, students])

  // Pagination calculations
  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE)
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredStudents.slice(startIndex, endIndex)
  }, [filteredStudents, currentPage])

  const fetchStudents = async () => {
    try {
      setLoading(true)
      const loadingToast = feedback.loadingData('students')
      const response = await fetch(`${API_BASE_URL}/admin/students`, {
        headers: getAuthHeaders()
      })
      const data = await response.json()

      toast.dismiss(loadingToast)

      if (data.students) {
        setStudents(data.students)
        // Also update filtered students
        if (!searchQuery.trim()) {
          setFilteredStudents(data.students)
        } else {
          const filtered = data.students.filter((student: Student) =>
            student.student_id.toLowerCase().includes(searchQuery.toLowerCase())
          )
          setFilteredStudents(filtered)
        }
      }
    } catch (error) {
      console.error('Error fetching students:', error)
      feedback.error('Failed to load students', {
        description: 'Please refresh the page or contact support'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (student: Student) => {
    setEditingStudent(student)
    setEditFormData({
      id: student.id,
      student_id: student.student_id,
      username: student.username || '',
      email: student.email,
      full_name: student.full_name,
      is_active: student.is_active
    })
  }

  const handleSaveChanges = async () => {
    if (!editingStudent) return

    try {
      setIsSaving(true)
      const loadingToast = feedback.updating('student profile')

      // Update student data
      const response = await fetch(`${API_BASE_URL}/admin/students/${editingStudent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          full_name: editFormData.full_name,
          email: editFormData.email,
          student_id: editFormData.student_id,
          is_active: editFormData.is_active
        })
      })

      const data = await response.json()

      toast.dismiss(loadingToast)

      if (data.student) {
        feedback.updated('Student', editFormData.full_name || editFormData.student_id)
        setEditingStudent(null)
        fetchStudents() // Refresh the list
      } else {
        feedback.error(data.error || 'Failed to update student')
      }
    } catch (error) {
      feedback.error('Failed to update student', {
        description: 'Please try again or contact support'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleActive = async (studentId: string, currentStatus: boolean) => {
    // Find student for confirmation dialog
    const student = students.find(s => s.id === studentId)
    if (!student) return

    const newStatus = !currentStatus
    const action = newStatus ? 'enable' : 'disable'

    // CONFIRMATION DIALOG
    const confirmation = confirm(
      `${newStatus ? 'Enable' : 'Disable'} student account "${student.student_id}"?\n\n` +
      `📋 Student: ${student.full_name || student.student_id}\n` +
      `📧 Email: ${student.email}\n` +
      `📊 Current Status: ${currentStatus ? 'Active' : 'Inactive'}\n\n` +
      `${newStatus ? '✅ This will ENABLE the account - student can log in' : '⏸️ This will DISABLE the account - student cannot log in'}\n\n` +
      `Proceed with ${action}?`
    )

    if (!confirmation) return

    // Store previous state for rollback
    const previousStudents = [...students]

    // OPTIMISTIC UPDATE: Update UI immediately for instant feedback
    const updatedStudents = students.map(s =>
      s.id === studentId ? { ...s, is_active: newStatus } : s
    )
    setStudents(updatedStudents)

    if (newStatus) {
      feedback.enabled('Account')
    } else {
      feedback.disabled('Account')
    }

    try {
      // Use toggle-active endpoint
      const response = await fetch(`${API_BASE_URL}/admin/students/${studentId}/toggle-active`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      })

      const data = await response.json()

      if (!response.ok || !data.student) {
        // ROLLBACK on error
        setStudents(previousStudents)
        feedback.error(data.error || `Failed to ${action} account`, {
          description: 'Please try again'
        })
      }
    } catch (error) {
      // ROLLBACK on error
      setStudents(previousStudents)
      feedback.error(`Failed to ${action} account`, {
        description: 'Network error - please try again'
      })
    }
  }

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Are you sure you want to DELETE this student account? The account will be permanently removed from this interface and the student will no longer be able to login. All test data and records will be preserved in the database but will not be visible in the student management interface. THIS ACTION CANNOT BE UNDONE.')) {
      return
    }

    // Capture current state for rollback
    const previousStudents = [...students]

    // OPTIMISTIC UPDATE: Remove from UI immediately
    const updatedStudents = students.filter(s => s.id !== studentId)
    setStudents(updatedStudents)
    feedback.deleted('Student account', 'Account')

    try {
      // Make API call in background
      const response = await fetch(`${API_BASE_URL}/admin/students/${studentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      const data = await response.json()

      if (!response.ok || !data.message) {
        // ROLLBACK on error
        setStudents(previousStudents)
        feedback.error(data.error || 'Failed to delete student', {
          description: 'The student has been restored to the list'
        })
      }
    } catch (error) {
      // ROLLBACK on error
      setStudents(previousStudents)
      feedback.error('Failed to delete student', {
        description: 'Network error - please try again'
      })
    }
  }

  const handleResetPassword = async (studentId: string) => {
    // Find student for confirmation dialog
    const student = students.find(s => s.id === studentId)
    if (!student) return

    // CONFIRMATION DIALOG
    const confirmation = confirm(
      `Reset password for student "${student.student_id}"?\n\n` +
      `📋 Student: ${student.full_name || student.student_id}\n` +
      `📧 Email: ${student.email}\n\n` +
      `🔑 New Password: CLAP@123\n\n` +
      `The student will need to use this password to log in.\n\n` +
      `Proceed with password reset?`
    )

    if (!confirmation) return

    try {
      const loadingToast = feedback.processing('password reset')
      const response = await fetch(`${API_BASE_URL}/admin/students/${studentId}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders()
      })

      const data = await response.json()
      toast.dismiss(loadingToast)

      // IMMEDIATE FEEDBACK
      if (response.ok && data.message) {
        feedback.passwordReset()
      } else {
        feedback.error(data.error || 'Failed to reset password', {
          description: 'Please try again or contact support'
        })
      }
    } catch (error) {
      feedback.networkError()
    }
  }

  if (loading) {
    return <CubeLoader fullScreen={false} />
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by Student ID (e.g., A23126551029)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={fetchStudents} variant="outline">
          <RotateCcw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Student Management
            <Badge variant="secondary">{filteredStudents.length} students</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Student ID</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Username</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center p-8 text-muted-foreground">
                      {searchQuery ? 'No students found matching your search' : 'No students found'}
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((student) => (
                    <tr
                      key={student.id}
                      className="border-b border-border hover:bg-secondary/30 transition-colors"
                    >
                      <td className="p-4">
                        <Badge
                          variant={student.is_active ? "default" : "destructive"}
                          className={student.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                        >
                          {student.is_active ? (
                            <>
                              <Power className="w-3 h-3 mr-1" />
                              Enabled
                            </>
                          ) : (
                            <>
                              <Power className="w-3 h-3 mr-1" />
                              Disabled
                            </>
                          )}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4 text-muted-foreground" />
                          <code className="font-mono text-sm bg-secondary px-2 py-1 rounded">
                            {student.student_id}
                          </code>
                        </div>
                      </td>
                      <td className="p-4">
                        {student.profile_completed && student.username ? (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{student.username}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        {student.profile_completed ? (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{student.email}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(student)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>

                          <Button
                            variant={student.is_active ? "outline" : "default"}
                            size="sm"
                            onClick={() => handleToggleActive(student.id, student.is_active)}
                            title={student.is_active ? "Disable Account" : "Enable Account"}
                          >
                            <Power className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResetPassword(student.id)}
                            title="Reset Password"
                          >
                            <Key className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteStudent(student.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredStudents.length)} of {filteredStudents.length} students
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="w-8 h-8 p-0"
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Edit Student Profile
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingStudent(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Student ID</label>
                <Input
                  value={editFormData.student_id}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, student_id: e.target.value }))}
                  disabled
                  className="bg-secondary"
                />
                <p className="text-xs text-muted-foreground mt-1">Cannot be changed</p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <Input
                  value={editFormData.full_name}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, full_name: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Username</label>
                <Input
                  value={editFormData.username}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Will be filled by student"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editFormData.username ? 'Student has completed profile' : 'Student has not completed profile yet'}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editFormData.is_active}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm">
                  Account Enabled
                </label>
              </div>
            </CardContent>

            <div className="border-t p-4 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingStudent(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveChanges} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
