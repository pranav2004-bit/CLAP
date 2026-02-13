'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  X, 
  Save, 
  User,
  Mail,
  GraduationCap,
  Calendar,
  BarChart3,
  CheckCircle,
  Clock,
  XCircle,
  Users,
  Hash
} from 'lucide-react'

interface StudentFormData {
  id?: string
  full_name: string
  email: string
  student_id: string
  password?: string
  college?: string
  batch_id?: string
}

interface StudentDetail {
  id: string
  name: string
  email: string
  college: string
  createdAt: string
  lastActive: string
  totalTests: number
  completedTests: number
  inProgressTests: number
  averageScore: string
  attempts: any[]
}

interface StudentModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (studentData: StudentFormData) => void
  onViewDetails?: (studentId: string) => void
  initialData?: StudentFormData | StudentDetail | null
  mode: 'create' | 'edit' | 'view'
}

export function StudentManagementModal({ 
  isOpen, 
  onClose, 
  onSave, 
  onViewDetails,
  initialData, 
  mode 
}: StudentModalProps) {
  const [formData, setFormData] = useState<StudentFormData>({
    full_name: '',
    email: '',
    student_id: '',
    password: '',
    college: '',
    batch_id: ''
  })
  
  const [batches, setBatches] = useState<Array<{id: string, batch_name: string}>>([])
  const [loadingBatches, setLoadingBatches] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [studentDetails, setStudentDetails] = useState<StudentDetail | null>(null)

  // Initialize form based on mode and data
  useEffect(() => {
    if (mode === 'create') {
      setFormData({
        full_name: '',
        email: '',
        student_id: '',
        password: '',
        college: ''
      })
      setStudentDetails(null)
    } else if (initialData) {
      if ('createdAt' in initialData) {
        // Viewing existing student details
        setStudentDetails(initialData as StudentDetail)
        setFormData({
          id: initialData.id,
          full_name: initialData.name,
          email: initialData.email,
          student_id: '', // Will be fetched from API
          college: initialData.college
        })
      } else {
        // Editing student
        setFormData({
          id: initialData.id,
          full_name: initialData.full_name,
          email: initialData.email,
          student_id: initialData.student_id || '',
          college: initialData.college || ''
        })
        setStudentDetails(null)
      }
    }
    setErrors({})
  }, [initialData, mode, isOpen])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    }

    if (!formData.student_id.trim()) {
      newErrors.student_id = 'Student ID is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (mode === 'create' && !formData.password) {
      newErrors.password = 'Password is required for new students'
    } else if (mode === 'create' && formData.password && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        password: mode === 'create' ? formData.password : undefined
      })
      onClose()
    } catch (error) {
      console.error('Error saving student:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {mode === 'create' && 'Create New Student'}
              {mode === 'edit' && 'Edit Student'}
              {mode === 'view' && 'Student Details'}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {mode === 'view' && studentDetails ? (
            // View Student Details Mode
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Full Name</Label>
                  <p className="font-medium">{studentDetails.name}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Email</Label>
                  <p className="font-medium">{studentDetails.email}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">College</Label>
                  <p className="font-medium">{studentDetails.college}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Member Since</Label>
                  <p className="font-medium">{new Date(studentDetails.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Activity Stats */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Activity Overview</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-secondary/30 rounded-lg">
                    <Calendar className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{studentDetails.totalTests}</p>
                    <p className="text-sm text-muted-foreground">Total Tests</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-600" />
                    <p className="text-2xl font-bold text-green-600">{studentDetails.completedTests}</p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <Clock className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
                    <p className="text-2xl font-bold text-yellow-600">{studentDetails.inProgressTests}</p>
                    <p className="text-sm text-muted-foreground">In Progress</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <BarChart3 className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                    <p className="text-2xl font-bold text-blue-600">{studentDetails.averageScore}</p>
                    <p className="text-sm text-muted-foreground">Avg Score</p>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Recent Attempts</h3>
                {studentDetails.attempts.length > 0 ? (
                  <div className="space-y-3">
                    {studentDetails.attempts.slice(0, 5).map((attempt: any) => (
                      <div key={attempt.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{attempt.testName}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(attempt.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={
                            attempt.status === 'completed' ? 'success' :
                            attempt.status === 'in_progress' ? 'warning' : 'secondary'
                          }>
                            {attempt.status.replace('_', ' ')}
                          </Badge>
                          {attempt.score !== null && (
                            <span className="font-semibold">
                              {attempt.score}/{attempt.duration} pts
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No test attempts yet
                  </p>
                )}
              </div>
            </div>
          ) : (
            // Create/Edit Mode
            <div className="space-y-4">
              <div>
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  className={errors.full_name ? 'border-red-500' : ''}
                  disabled={mode === 'view'}
                />
                {errors.full_name && <p className="text-sm text-red-500 mt-1">{errors.full_name}</p>}
              </div>

              <div>
                <Label htmlFor="student_id">Student ID *</Label>
                <Input
                  id="student_id"
                  value={formData.student_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, student_id: e.target.value }))}
                  className={errors.student_id ? 'border-red-500' : ''}
                  placeholder="Enter unique student ID"
                  disabled={mode === 'view'}
                />
                {errors.student_id && <p className="text-sm text-red-500 mt-1">{errors.student_id}</p>}
                {mode === 'create' && (
                  <p className="text-sm text-muted-foreground mt-1">
                    This ID will be used for login credentials
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className={errors.email ? 'border-red-500' : ''}
                  disabled={mode === 'view'}
                />
                {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
              </div>

              {mode === 'create' && (
                <div>
                  <Label htmlFor="password">Temporary Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Minimum 6 characters"
                    className={errors.password ? 'border-red-500' : ''}
                  />
                  {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password}</p>}
                  <p className="text-sm text-muted-foreground mt-1">
                    Student will be prompted to change this on first login
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="college">College/School</Label>
                <Input
                  id="college"
                  value={formData.college || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, college: e.target.value }))}
                  placeholder="Enter college name"
                  disabled={mode === 'view'}
                />
              </div>
            </div>
          )}
        </CardContent>

        <div className="border-t p-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            {mode === 'view' ? 'Close' : 'Cancel'}
          </Button>
          
          {mode === 'view' && onViewDetails && initialData && 'id' in initialData && (
            <Button onClick={() => onViewDetails(initialData.id!)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              View Full Report
            </Button>
          )}
          
          {mode !== 'view' && (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {mode === 'create' ? 'Create Student' : 'Update Student'}
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}