'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { toast } from 'sonner'
import { getApiUrl } from '@/lib/api-config'

interface StudentFormData {
  id?: string
  full_name?: string
  email?: string
  student_id: string
  password?: string
  college?: string
  batch_id?: string
}

interface StudentDetail {
  id: string
  full_name: string
  email: string
  student_id: string
  college: string
  batch_id?: string
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

export function EnhancedStudentManagementModal({
  isOpen,
  onClose,
  onSave,
  onViewDetails,
  initialData,
  mode
}: StudentModalProps) {
  const [formData, setFormData] = useState<StudentFormData>({
    student_id: '',
    batch_id: ''
  })

  const [batches, setBatches] = useState<Array<{ id: string, batch_name: string }>>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [studentDetails, setStudentDetails] = useState<StudentDetail | null>(null)

  // Initialize form based on mode and data
  useEffect(() => {
    if (isOpen) {
      fetchBatches()
      if (initialData && mode !== 'create') {
        // Handle both StudentFormData and StudentDetail types
        if ('full_name' in initialData) {
          setFormData({
            id: initialData.id,
            full_name: initialData.full_name,
            email: initialData.email,
            student_id: initialData.student_id,
            college: initialData.college || '',
            batch_id: ('batch_id' in initialData ? initialData.batch_id : '') || ''
          })
        } else {
          setStudentDetails(initialData as StudentDetail)
        }
      } else {
        // Reset form for create mode
        setFormData({
          student_id: '',
          batch_id: ''
        })
        setErrors({})
        setStudentDetails(null)
      }
    }
  }, [isOpen, initialData, mode])

  const fetchBatches = async () => {
    try {
      setLoadingBatches(true)
      const response = await fetch(getApiUrl('admin/batches'))
      const data = await response.json()

      if (data.batches) {
        setBatches(data.batches.map((batch: any) => ({
          id: batch.id,
          batch_name: batch.batch_name
        })))
      }
    } catch (error) {
      console.error('Error fetching batches:', error)
    } finally {
      setLoadingBatches(false)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.student_id.trim()) {
      newErrors.student_id = 'Student ID is required'
    }

    // Batch is now required
    if (!formData.batch_id || formData.batch_id === 'no-batch') {
      newErrors.batch = 'Batch selection is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    console.log('Form submit clicked');
    if (!validateForm()) {
      console.log('Form validation failed');
      return
    }

    console.log('Starting submission process');
    setIsSubmitting(true)
    try {
      console.log('Calling onSave with data:', formData);
      await onSave(formData)
      console.log('Save successful, closing modal');
      onClose()
    } catch (error) {
      console.error('Error saving student:', error)
      toast.error('Failed to save student')
      // Still close the modal on error to avoid stuck state
      onClose()
    } finally {
      console.log('Submission process finished');
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  if (mode === 'view' && studentDetails) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Student Details
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Full Name</Label>
                <p className="font-medium">{studentDetails.full_name}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Student ID</Label>
                <p className="font-mono bg-secondary px-2 py-1 rounded inline-block">
                  {studentDetails.student_id}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                <p>{studentDetails.email}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">College</Label>
                <p>{studentDetails.college || '-'}</p>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">Test Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <BarChart3 className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                  <div className="text-2xl font-bold">{studentDetails.totalTests}</div>
                  <div className="text-sm text-muted-foreground">Total Tests</div>
                </div>
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
                  <div className="text-2xl font-bold">{studentDetails.completedTests}</div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                  <div className="text-2xl font-bold">{studentDetails.inProgressTests}</div>
                  <div className="text-sm text-muted-foreground">In Progress</div>
                </div>
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <GraduationCap className="w-6 h-6 mx-auto mb-2 text-purple-500" />
                  <div className="text-2xl font-bold">{studentDetails.averageScore}</div>
                  <div className="text-sm text-muted-foreground">Average Score</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => onViewDetails?.(studentDetails.id)}>
                View Full History
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {mode === 'create' ? 'Add New Student' : 'Edit Student'}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div>
            <Label htmlFor="student_id" className="text-sm font-medium">
              Student ID *
            </Label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="student_id"
                value={formData.student_id}
                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                className={`pl-10 ${errors.student_id ? 'border-red-500' : ''}`}
                placeholder="e.g., STU001"
              />
            </div>
            {errors.student_id && (
              <p className="text-sm text-red-500 mt-1">{errors.student_id}</p>
            )}
          </div>

          <div>
            <Label htmlFor="batch" className="text-sm font-medium">
              Batch *
            </Label>
            <Select
              value={formData.batch_id || 'no-batch'}
              onValueChange={(value: string) => setFormData({ ...formData, batch_id: value === 'no-batch' ? '' : value })}
            >
              <SelectTrigger className={errors.batch ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select batch">
                  {formData.batch_id
                    ? batches.find(b => b.id === formData.batch_id)?.batch_name
                    : 'Select batch'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {loadingBatches ? (
                  <SelectItem value="loading" disabled>Loading batches...</SelectItem>
                ) : (
                  <>
                    <SelectItem value="no-batch">No batch assigned</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batch_name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {errors.batch && (
              <p className="text-sm text-red-500 mt-1">{errors.batch}</p>
            )}
          </div>

          <Alert>
            <GraduationCap className="h-4 w-4" />
            <AlertDescription>
              Student accounts are created with default password: <strong>CLAP@123</strong>. Students will need to change this on first login.
            </AlertDescription>
          </Alert>
        </CardContent>

        <div className="border-t p-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {mode === 'create' ? 'Create Student' : 'Save Changes'}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}