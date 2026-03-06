'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import { EnhancedStudentManagement } from '@/components/EnhancedStudentManagement'
import { EnhancedStudentManagementModal } from '@/components/EnhancedStudentManagementModal'
import { BulkImportModal } from '@/components/admin/BulkImportModal'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { toast } from 'sonner'

interface Batch {
  id: string
  batch_name: string
}

export default function AdminStudentsPage() {
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [batches, setBatches] = useState<Batch[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch batches once on mount (needed for the bulk import modal batch selector)
  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const res = await apiFetch(getApiUrl('admin/batches'), { headers: getAuthHeaders() })
        if (res.ok) {
          const data = await res.json()
          setBatches(data.batches || [])
        }
      } catch {
        // Non-fatal: bulk import modal will show empty batch list, single-add modal still works
        console.error('Failed to prefetch batches')
      }
    }
    fetchBatches()
  }, [])

  const handleCreateStudent = async (studentData: any) => {
    try {
      const response = await apiFetch(getApiUrl('admin/students'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          student_id: studentData.student_id,
          batch_id: studentData.batch_id || null
        }),
      });

      const data = await response.json();

      if (response.ok && data.student) {
        if (data.student.restored) {
          toast.success(`✨ Student "${studentData.student_id}" was previously deleted and has been restored!`, {
            description: 'Password reset to CLAP@123',
            duration: 5000
          });
        } else {
          toast.success(`✅ Student "${studentData.student_id}" created successfully!`, {
            description: 'Default password: CLAP@123',
            duration: 5000
          });
        }
        setTimeout(() => window.location.reload(), 1000);
        return data.student;
      } else {
        const errorMessage = data.error || 'Failed to create student';
        toast.error(`❌ ${errorMessage}`, { duration: 5000 });
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('Error creating student:', error);
      if (!error.message || error.message === 'Failed to fetch') {
        toast.error('❌ Network error - Please check your connection', {
          description: 'Make sure the backend server is running',
          duration: 5000
        });
      } else if (!error.message.includes('already exists')) {
        toast.error(`❌ ${error.message}`, { duration: 5000 });
      }
      throw error;
    }
  };

  const handleBulkImportSuccess = () => {
    // Increment refreshKey to trigger student list reload without full page reload
    setRefreshKey(k => k + 1)
  }

  return (
    <div className="bg-white p-0 border-b border-gray-200">
      {/* Header */}
      <div className="py-2 px-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Student Directory</h1>
        <div className="flex items-center gap-2">
          {/* Bulk Import Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>

          {/* Single Add Button */}
          <Button size="sm" onClick={() => setIsAddStudentModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Student
          </Button>
        </div>
      </div>

      {/* Student List — key={refreshKey} forces re-mount after bulk import success */}
      <div className="p-4">
        <EnhancedStudentManagement key={refreshKey} />
      </div>

      {/* Single Create Modal */}
      <EnhancedStudentManagementModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        onSave={handleCreateStudent}
        mode="create"
      />

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={handleBulkImportSuccess}
        batches={batches}
      />
    </div>
  )
}
