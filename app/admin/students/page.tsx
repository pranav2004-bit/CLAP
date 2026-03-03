'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { EnhancedStudentManagement } from '@/components/EnhancedStudentManagement'
import { EnhancedStudentManagementModal } from '@/components/EnhancedStudentManagementModal'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { toast } from 'sonner'

export default function AdminStudentsPage() {
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false)

  const handleCreateStudent = async (studentData: any) => {
    try {
      const response = await fetch(getApiUrl('admin/students'), {
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
        // Show appropriate message based on whether it was restored or newly created
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

        // Refresh the page to show the student
        setTimeout(() => {
          window.location.reload();
        }, 1000); // Small delay to let user see the message

        return data.student;
      } else {
        // Show specific error message from backend
        const errorMessage = data.error || 'Failed to create student';
        toast.error(`❌ ${errorMessage}`, {
          duration: 5000
        });
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('Error creating student:', error);

      // Show user-friendly error message
      if (!error.message || error.message === 'Failed to fetch') {
        toast.error('❌ Network error - Please check your connection', {
          description: 'Make sure the backend server is running',
          duration: 5000
        });
      } else if (!error.message.includes('already exists')) {
        // Only show generic error if we haven't already shown a specific one
        toast.error(`❌ ${error.message}`, {
          duration: 5000
        });
      }

      throw error;
    }
  };

  return (
    <div className="bg-white p-0 border-b border-gray-200">
      <div className="py-2 px-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Student Directory</h1>
        <Button size="sm" onClick={() => setIsAddStudentModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Student
        </Button>
      </div>
      <div className="p-4">
        <EnhancedStudentManagement />
      </div>

      {/* Add Student Modal */}
      <EnhancedStudentManagementModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        onSave={handleCreateStudent}
        mode="create"
      />
    </div>
  )
}
