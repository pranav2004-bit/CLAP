'use client'

import { BatchManagement } from '@/components/BatchManagement'

export default function AdminBatchesPage() {
  return (
    <div className="bg-white p-0 border-b border-gray-200">
      <div className="py-2 px-4 bg-gray-50 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Academic Batches</h1>
      </div>
      <div className="p-4">
        <BatchManagement />
      </div>
    </div>
  )
}
