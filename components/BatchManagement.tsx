'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Users,
  Calendar,
  X,
  Save,
  Edit,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE_URL, getAuthHeaders } from '@/lib/api-config'
import { feedback } from '@/lib/user-feedback'
import { BatchStudentsModal } from './BatchStudentsModal'

interface Batch {
  id: string
  batch_name: string
  start_year: number
  end_year: number
  is_active: boolean
  student_count: number
  created_at: string
}

export function BatchManagement() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [formData, setFormData] = useState({
    start_year: '',
    end_year: ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)

  // Fetch batches data
  useEffect(() => {
    fetchBatches()
  }, [])

  const fetchBatches = async () => {
    try {
      setLoading(true)
      const loadingToast = feedback.loadingData('batches')
      const response = await fetch(`${API_BASE_URL}/admin/batches`, {
        headers: getAuthHeaders()
      })
      const data = await response.json()

      toast.dismiss(loadingToast)

      if (data.batches) {
        setBatches(data.batches)
      }
    } catch (error) {
      console.error('Error fetching batches:', error)
      feedback.error('Failed to load batches', {
        description: 'Please refresh the page'
      })
    } finally {
      setLoading(false)
    }
  }

  // Check if batch already exists (real-time validation)
  const checkBatchExists = useCallback((startYear: string, endYear: string) => {
    if (!startYear || !endYear) {
      setDuplicateWarning(null)
      return
    }

    const batchName = `${startYear}-${endYear.toString().slice(-2)}`
    const existing = batches.find(b => b.batch_name === batchName)

    if (existing) {
      if (existing.is_active) {
        setDuplicateWarning(`⚠️ Batch "${batchName}" already exists and is active!`)
      } else {
        setDuplicateWarning(`ℹ️ Batch "${batchName}" exists but is deleted. Creating it will restore the batch.`)
      }
    } else {
      setDuplicateWarning(null)
    }
  }, [batches])

  const handleCreateBatch = async () => {
    if (!formData.start_year || !formData.end_year) {
      feedback.requiredFields()
      return
    }

    // Check if active batch already exists
    const batchName = `${formData.start_year}-${formData.end_year.toString().slice(-2)}`
    const existing = batches.find(b => b.batch_name === batchName && b.is_active)

    if (existing) {
      feedback.alreadyExists('Batch', batchName)
      return
    }

    const startYear = parseInt(formData.start_year)
    const endYear = parseInt(formData.end_year)

    if (startYear >= endYear) {
      feedback.validationError('End year must be greater than start year')
      return
    }

    try {
      setIsSaving(true)

      // OPTIMISTIC UPDATE: Add batch to UI immediately
      const tempId = `temp-${Date.now()}`
      const optimisticBatch: Batch = {
        id: tempId,
        batch_name: batchName,
        start_year: startYear,
        end_year: endYear,
        is_active: true,
        student_count: 0,
        created_at: new Date().toISOString()
      }

      // Update UI immediately
      setBatches(prev => [optimisticBatch, ...prev])
      setFormData({ start_year: '', end_year: '' })
      setShowCreateForm(false)
      setDuplicateWarning(null)
      feedback.created('Batch', batchName)

      // Make API call in background
      const response = await fetch(`${API_BASE_URL}/admin/batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          batch_name: batchName,
          start_year: startYear,
          end_year: endYear
        })
      })

      const data = await response.json()

      // Check if response is successful (200-299 range)
      if (response.ok) {
        // Replace temp batch with real one from server
        setBatches(prev => prev.map(b =>
          b.id === tempId ? { ...data.batch, student_count: 0 } : b
        ))
      } else {
        // Rollback on error
        setBatches(prev => prev.filter(b => b.id !== tempId))
        feedback.error(data.error || 'Failed to create batch')
      }
    } catch (error: any) {
      console.error('Fetch error:', error)
      // Rollback on error
      setBatches(prev => prev.filter(b => !b.id.startsWith('temp-')))
      feedback.networkError()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteBatch = async (batchId: string) => {
    const batchToDelete = batches.find(b => b.id === batchId);
    if (!batchToDelete) return;

    const confirmation = confirm(`Are you sure you want to delete batch "${batchToDelete.batch_name}"?\n\n⚠️ IMPORTANT:\n• All student accounts in this batch will be preserved\n• Test scores, reports, and history will remain intact\n• Students will become "Unassigned" but keep all data\n• This action can be undone\n\nProceed with deletion?`);

    if (!confirmation) return;

    try {
      // OPTIMISTIC UPDATE: Mark as deleted immediately
      setBatches(prev => prev.map(b =>
        b.id === batchId ? { ...b, is_active: false } : b
      ))
      feedback.deleted('Batch', batchToDelete.batch_name)

      // Make API call in background
      const response = await fetch(`${API_BASE_URL}/admin/batches/${batchId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          is_active: false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Rollback on error
        setBatches(prev => prev.map(b =>
          b.id === batchId ? { ...b, is_active: true } : b
        ))
        feedback.error(data.error || 'Failed to delete batch')
      }
    } catch (error) {
      // Rollback on error
      setBatches(prev => prev.map(b =>
        b.id === batchId ? { ...b, is_active: true } : b
      ))
      feedback.error('Failed to delete batch', {
        description: 'Please try again'
      })
    }
  };

  const handleRestoreBatch = async (batchId: string) => {
    const batchToRestore = batches.find(b => b.id === batchId);
    if (!batchToRestore) return;

    try {
      // OPTIMISTIC UPDATE: Mark as active immediately
      setBatches(prev => prev.map(b =>
        b.id === batchId ? { ...b, is_active: true } : b
      ))
      feedback.restored('Batch', batchToRestore.batch_name)

      // Make API call in background
      const response = await fetch(`${API_BASE_URL}/admin/batches/${batchId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          is_active: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Rollback on error
        setBatches(prev => prev.map(b =>
          b.id === batchId ? { ...b, is_active: false } : b
        ))
        feedback.error(data.error || 'Failed to restore batch')
      }
    } catch (error) {
      // Rollback on error
      setBatches(prev => prev.map(b =>
        b.id === batchId ? { ...b, is_active: false } : b
      ))
      feedback.error('Failed to restore batch', {
        description: 'Please try again'
      })
    }
  };

  // Skeleton loader for better perceived performance
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mt-2"></div>
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Batch Management</h2>
          <p className="text-muted-foreground">Manage student batches and cohorts</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Batch
        </Button>
      </div>

      {/* Create Batch Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create New Batch
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Start Year</label>
                <Input
                  type="number"
                  placeholder="2023"
                  value={formData.start_year}
                  onChange={(e) => {
                    const newData = { ...formData, start_year: e.target.value }
                    setFormData(newData)
                    checkBatchExists(e.target.value, formData.end_year)
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">End Year</label>
                <Input
                  type="number"
                  placeholder="2027"
                  value={formData.end_year}
                  onChange={(e) => {
                    const newData = { ...formData, end_year: e.target.value }
                    setFormData(newData)
                    checkBatchExists(formData.start_year, e.target.value)
                  }}
                />
              </div>
            </div>

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className={`p-3 rounded-lg text-sm ${duplicateWarning.includes('⚠️')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                {duplicateWarning}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setShowCreateForm(false)
                setDuplicateWarning(null)
                setFormData({ start_year: '', end_year: '' })
              }}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleCreateBatch} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Create Batch
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batches Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {batches.map((batch) => (
          <Card
            key={batch.id}
            className="hover:shadow-md transition-all cursor-pointer hover:border-primary/50"
            onClick={() => setSelectedBatch(batch)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{batch.batch_name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={batch.is_active ? "default" : "destructive"}>
                    {batch.is_active ? 'Active' : 'Deleted'}
                  </Badge>
                  {!batch.is_active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRestoreBatch(batch.id)
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{batch.start_year} - {batch.end_year}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{batch.student_count}</span>
                <span className="text-sm text-muted-foreground">students</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(batch.created_at).toLocaleDateString()}
                  </p>
                  {batch.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteBatch(batch.id)
                      }}
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {batches.length === 0 && !showCreateForm && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No batches found</h3>
          <p className="text-muted-foreground mb-4">Create your first batch to organize students</p>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create First Batch
          </Button>
        </div>
      )}

      {/* Batch Students Modal */}
      {selectedBatch && (
        <BatchStudentsModal
          batch={selectedBatch}
          onClose={() => setSelectedBatch(null)}
        />
      )}
    </div>
  )
}
