'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    X,
    Search,
    Edit,
    Trash2,
    User,
    Mail,
    Hash,
    Power,
    Key,
    Users,
    Calendar,
    CheckCircle2,
    XCircle,
    Save,
    ChevronLeft,
    ChevronRight
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api-config'
import { feedback } from '@/lib/user-feedback'
import { toast } from 'sonner'

interface Student {
    id: string
    email: string
    student_id: string
    full_name: string | null
    is_active: boolean
    profile_completed: boolean
    created_at: string
}

interface Batch {
    id: string
    batch_name: string
    start_year: number
    end_year: number
    student_count: number
    is_active: boolean
}

interface BatchStudentsModalProps {
    batch: Batch
    onClose: () => void
}

const ITEMS_PER_PAGE = 10

export function BatchStudentsModal({ batch, onClose }: BatchStudentsModalProps) {
    const [students, setStudents] = useState<Student[]>([])
    const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [editingStudent, setEditingStudent] = useState<Student | null>(null)
    const [editFormData, setEditFormData] = useState({
        full_name: '',
        email: ''
    })
    const [currentPage, setCurrentPage] = useState(1)

    useEffect(() => {
        fetchBatchStudents()
    }, [batch.id])

    useEffect(() => {
        // Filter students based on search query
        if (searchQuery.trim() === '') {
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
        // Reset to first page when search changes
        setCurrentPage(1)
    }, [searchQuery, students])

    // Pagination calculations
    const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE)
    const paginatedStudents = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        const endIndex = startIndex + ITEMS_PER_PAGE
        return filteredStudents.slice(startIndex, endIndex)
    }, [filteredStudents, currentPage])

    const fetchBatchStudents = async () => {
        try {
            setLoading(true)
            const loadingToast = feedback.loadingData(`students in ${batch.batch_name}`)

            const response = await fetch(`${API_BASE_URL}/admin/students?batch_id=${batch.id}`)
            const data = await response.json()

            toast.dismiss(loadingToast)

            if (data.students) {
                setStudents(data.students)
                setFilteredStudents(data.students)
            }
        } catch (error) {
            console.error('Error fetching batch students:', error)
            feedback.error('Failed to load students', {
                description: 'Please try again'
            })
        } finally {
            setLoading(false)
        }
    }

    const handleEditStudent = (student: Student) => {
        setEditingStudent(student)
        setEditFormData({
            full_name: student.full_name || '',
            email: student.email
        })
    }

    const handleCancelEdit = () => {
        // INSTANT cancel - no API call needed
        setEditingStudent(null)
        setEditFormData({ full_name: '', email: '' })
    }

    const handleSaveChanges = async () => {
        if (!editingStudent) return

        // INSTANT UI update - close edit mode immediately
        const updatedStudent = {
            ...editingStudent,
            full_name: editFormData.full_name,
            email: editFormData.email
        }

        // Store previous state for rollback
        const previousStudents = [...students]

        // Update UI immediately
        const updatedStudents = students.map(s =>
            s.id === editingStudent.id ? updatedStudent : s
        )
        setStudents(updatedStudents)
        setEditingStudent(null)
        feedback.updated('Student', editFormData.full_name || editFormData.email)

        // API call in background
        try {
            const response = await fetch(`${API_BASE_URL}/admin/students/${editingStudent.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    full_name: editFormData.full_name,
                    email: editFormData.email
                })
            })

            const data = await response.json()

            if (!response.ok || !data.student) {
                // ROLLBACK on error
                setStudents(previousStudents)
                feedback.error(data.error || 'Failed to update student', {
                    description: 'Changes have been reverted'
                })
            }
        } catch (error) {
            // ROLLBACK on error
            setStudents(previousStudents)
            feedback.error('Failed to update student', {
                description: 'Network error - changes reverted'
            })
        }
    }

    const handleToggleActive = async (student: Student) => {
        const newStatus = !student.is_active
        const action = newStatus ? 'enable' : 'disable'
        const actionPast = newStatus ? 'enabled' : 'disabled'

        // CONFIRMATION DIALOG
        const confirmation = confirm(
            `${newStatus ? 'Enable' : 'Disable'} student account "${student.student_id}"?\n\n` +
            `📋 Student: ${student.full_name || student.student_id}\n` +
            `📧 Email: ${student.email}\n` +
            `📊 Current Status: ${student.is_active ? 'Active' : 'Inactive'}\n\n` +
            `${newStatus ? '✅ This will ENABLE the account - student can log in' : '⏸️ This will DISABLE the account - student cannot log in'}\n\n` +
            `Proceed with ${action}?`
        )

        if (!confirmation) return

        // Store previous state for rollback
        const previousStudents = [...students]

        // OPTIMISTIC UPDATE - instant UI change
        const updatedStudents = students.map(s =>
            s.id === student.id ? { ...s, is_active: newStatus } : s
        )
        setStudents(updatedStudents)

        if (newStatus) {
            feedback.enabled('Account')
        } else {
            feedback.disabled('Account')
        }

        try {
            const response = await fetch(`${API_BASE_URL}/admin/students/${student.id}/toggle-active`, {
                method: 'PATCH'
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

    const handleResetPassword = async (student: Student) => {
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
            const response = await fetch(`${API_BASE_URL}/admin/students/${student.id}/reset-password`, {
                method: 'POST'
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

    const handleDeleteStudent = async (student: Student) => {
        const confirmation = confirm(
            `Are you sure you want to delete student "${student.student_id}"?\n\n` +
            `⚠️ IMPORTANT:\n` +
            `• Student account will be soft-deleted\n` +
            `• All data (scores, reports) will be preserved\n` +
            `• Account can be restored by recreating with same ID\n\n` +
            `Proceed with deletion?`
        )

        if (!confirmation) return

        // Store previous state for rollback
        const previousStudents = [...students]

        // OPTIMISTIC UPDATE - instant removal
        const updatedStudents = students.filter(s => s.id !== student.id)
        setStudents(updatedStudents)
        feedback.deleted('Student account', student.student_id)

        try {
            const response = await fetch(`${API_BASE_URL}/admin/students/${student.id}`, {
                method: 'DELETE'
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

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-6xl max-h-[90vh] flex flex-col">
                <CardHeader className="border-b flex-shrink-0 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl flex items-center gap-3">
                                <Users className="w-6 h-6 text-primary" />
                                {batch.batch_name} Students
                            </CardTitle>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    <span>{batch.start_year} - {batch.end_year}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Users className="w-4 h-4" />
                                    <span>{students.length} students</span>
                                </div>
                                <Badge variant={batch.is_active ? "default" : "destructive"}>
                                    {batch.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-auto p-6">
                    {/* Search Bar */}
                    <div className="mb-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input
                                placeholder="Search by student ID, name, or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
                            ))}
                        </div>
                    )}

                    {/* Empty State */}
                    {!loading && students.length === 0 && (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium mb-2">No students in this batch</h3>
                            <p className="text-muted-foreground">
                                Students will appear here when they are assigned to {batch.batch_name}
                            </p>
                        </div>
                    )}

                    {/* No Search Results */}
                    {!loading && students.length > 0 && filteredStudents.length === 0 && (
                        <div className="text-center py-12">
                            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium mb-2">No students found</h3>
                            <p className="text-muted-foreground">
                                Try adjusting your search query
                            </p>
                        </div>
                    )}

                    {/* Students List */}
                    {!loading && filteredStudents.length > 0 && (
                        <>
                            <div className="space-y-3 mb-6">
                                {paginatedStudents.map((student) => (
                                    <Card key={student.id} className="hover:shadow-md transition-shadow">
                                        <CardContent className="p-4">
                                            {editingStudent?.id === student.id ? (
                                                // EDIT MODE
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                                                            <Input
                                                                value={editFormData.full_name}
                                                                onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                                                                placeholder="Enter full name"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-sm font-medium text-muted-foreground">Email</label>
                                                            <Input
                                                                value={editFormData.email}
                                                                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                                                placeholder="Enter email"
                                                                type="email"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            onClick={handleCancelEdit}
                                                            size="sm"
                                                        >
                                                            <X className="w-4 h-4 mr-2" />
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            onClick={handleSaveChanges}
                                                            size="sm"
                                                        >
                                                            <Save className="w-4 h-4 mr-2" />
                                                            Save Changes
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                // VIEW MODE
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4 flex-1">
                                                        {/* Status Indicator */}
                                                        <div className="flex-shrink-0">
                                                            {student.is_active ? (
                                                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                            ) : (
                                                                <XCircle className="w-5 h-5 text-red-500" />
                                                            )}
                                                        </div>

                                                        {/* Student Info */}
                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <div>
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                                                    <Hash className="w-3 h-3" />
                                                                    <span>Student ID</span>
                                                                </div>
                                                                <p className="font-medium">{student.student_id}</p>
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                                                    <User className="w-3 h-3" />
                                                                    <span>Name</span>
                                                                </div>
                                                                <p className="font-medium">{student.full_name || 'Not set'}</p>
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                                                    <Mail className="w-3 h-3" />
                                                                    <span>Email</span>
                                                                </div>
                                                                <p className="font-medium text-sm truncate">{student.email}</p>
                                                            </div>
                                                        </div>

                                                        {/* Status Badge */}
                                                        <div className="flex-shrink-0">
                                                            <Badge variant={student.is_active ? "default" : "secondary"}>
                                                                {student.is_active ? 'Active' : 'Inactive'}
                                                            </Badge>
                                                        </div>
                                                    </div>

                                                    {/* Actions - FIXED HOVER COLORS */}
                                                    <div className="flex items-center gap-2 ml-4">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEditStudent(student)}
                                                            className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleToggleActive(student)}
                                                            className={`h-8 w-8 p-0 ${student.is_active
                                                                ? 'hover:bg-orange-50 text-orange-500 hover:text-orange-600'
                                                                : 'hover:bg-green-50 text-green-500 hover:text-green-600'
                                                                }`}
                                                        >
                                                            <Power className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleResetPassword(student)}
                                                            className="h-8 w-8 p-0 hover:bg-blue-50 text-blue-500 hover:text-blue-600"
                                                        >
                                                            <Key className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteStudent(student)}
                                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between border-t pt-4">
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
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
