'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl } from '@/lib/api-config'
import {
  AlertTriangle,
  RefreshCw,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  RotateCw,
  Trash2,
  X,
  Clock
} from 'lucide-react'
import { toast } from 'sonner'

interface DLQEntry {
  id: number
  submission_id: string
  task_name: string
  error_message: string
  retry_count: number
  resolved: boolean
  created_at: string
  payload?: any
}

export function DLQManagement() {
  const [entries, setEntries] = useState<DLQEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<number | null>(null)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [bulkRetrying, setBulkRetrying] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<DLQEntry | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/dlq'))
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || data.rows || [])
      }
    } catch (error) {
      console.error('Failed to fetch DLQ entries:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchEntries() }, [])

  const retryEntry = async (id: number) => {
    setRetryingId(id)
    try {
      const res = await fetch(getApiUrl(`admin/dlq/${id}/retry`), {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('DLQ entry retry triggered')
        fetchEntries()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to retry entry')
      }
    } catch (error) {
      toast.error('Network error retrying entry')
    } finally {
      setRetryingId(null)
    }
  }

  const resolveEntry = async (id: number) => {
    setResolvingId(id)
    try {
      const res = await fetch(getApiUrl(`admin/dlq/${id}/resolve`), {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('DLQ entry marked as resolved')
        fetchEntries()
        if (selectedEntry?.id === id) setSelectedEntry(null)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to resolve entry')
      }
    } catch (error) {
      toast.error('Network error resolving entry')
    } finally {
      setResolvingId(null)
    }
  }

  const handleBulkRetry = async () => {
    setBulkRetrying(true)
    try {
      const res = await fetch(getApiUrl('admin/dlq/bulk-retry'), {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Bulk retry triggered for ${data.count || 'all'} entries`)
        fetchEntries()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to bulk retry')
      }
    } catch (error) {
      toast.error('Network error during bulk retry')
    } finally {
      setBulkRetrying(false)
    }
  }

  const fetchDetail = async (id: number) => {
    try {
      const res = await fetch(getApiUrl(`admin/dlq/${id}`))
      if (res.ok) {
        setSelectedEntry(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch DLQ detail:', error)
    }
  }

  const filteredEntries = showResolved ? entries : entries.filter(e => !e.resolved)
  const unresolvedCount = entries.filter(e => !e.resolved).length

  const getTaskColor = (taskName: string) => {
    const colors: Record<string, string> = {
      evaluate_writing: 'bg-orange-100 text-orange-800',
      evaluate_speaking: 'bg-purple-100 text-purple-800',
      generate_report: 'bg-blue-100 text-blue-800',
      send_email_report: 'bg-teal-100 text-teal-800',
      score_rule_based: 'bg-green-100 text-green-800',
    }
    return colors[taskName] || 'bg-gray-100 text-gray-800'
  }

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading DLQ entries...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dead Letter Queue</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage failed task entries &middot; {unresolvedCount} unresolved
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkRetry}
            disabled={bulkRetrying || unresolvedCount === 0}
          >
            {bulkRetrying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />}
            Retry All
          </Button>
          <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border border-gray-200">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total Entries</p>
          </CardContent>
        </Card>
        <Card className="border border-red-200 bg-red-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{unresolvedCount}</p>
            <p className="text-xs text-red-600 mt-1">Unresolved</p>
          </CardContent>
        </Card>
        <Card className="border border-green-200 bg-green-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{entries.length - unresolvedCount}</p>
            <p className="text-xs text-green-600 mt-1">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show resolved entries
        </label>
      </div>

      {/* Entries List */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            DLQ Entries ({filteredEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredEntries.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {showResolved ? 'No DLQ entries found' : 'No unresolved entries. All clear!'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-3 border rounded-lg hover:bg-gray-50 cursor-pointer ${entry.resolved ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}
                  onClick={() => fetchDetail(entry.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {entry.resolved ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getTaskColor(entry.task_name)}`}>
                        {entry.task_name.replace(/_/g, ' ')}
                      </span>
                      <code className="text-xs text-gray-500 font-mono truncate">
                        {entry.submission_id.slice(0, 8)}...
                      </code>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">Retries: {entry.retry_count}</span>
                      {!entry.resolved && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); retryEntry(entry.id) }}
                            disabled={retryingId === entry.id}
                            className="h-7 px-2"
                            title="Retry"
                          >
                            {retryingId === entry.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); resolveEntry(entry.id) }}
                            disabled={resolvingId === entry.id}
                            className="h-7 px-2"
                            title="Mark Resolved"
                          >
                            {resolvingId === entry.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 ml-6 truncate">{entry.error_message}</p>
                  <p className="text-xs text-gray-400 mt-0.5 ml-6">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b flex flex-row items-center justify-between">
              <CardTitle>DLQ Entry #{selectedEntry.id}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(null)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Task</span>
                  <p className="mt-1 font-medium">{selectedEntry.task_name.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <span className="text-gray-500">Status</span>
                  <p className="mt-1">
                    <Badge className={selectedEntry.resolved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {selectedEntry.resolved ? 'Resolved' : 'Unresolved'}
                    </Badge>
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Submission ID</span>
                  <p className="mt-1 font-mono text-xs">{selectedEntry.submission_id}</p>
                </div>
                <div>
                  <span className="text-gray-500">Retry Count</span>
                  <p className="mt-1">{selectedEntry.retry_count}</p>
                </div>
                <div>
                  <span className="text-gray-500">Created At</span>
                  <p className="mt-1">{new Date(selectedEntry.created_at).toLocaleString()}</p>
                </div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Error Message</span>
                <pre className="mt-1 bg-red-50 p-3 rounded-lg text-xs text-red-800 overflow-auto max-h-40">
                  {selectedEntry.error_message}
                </pre>
              </div>
              {selectedEntry.payload && (
                <div>
                  <span className="text-gray-500 text-sm">Payload</span>
                  <pre className="mt-1 bg-gray-50 p-3 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedEntry.payload, null, 2)}
                  </pre>
                </div>
              )}
              {!selectedEntry.resolved && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => retryEntry(selectedEntry.id)}
                    disabled={retryingId === selectedEntry.id}
                  >
                    {retryingId === selectedEntry.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolveEntry(selectedEntry.id)}
                    disabled={resolvingId === selectedEntry.id}
                  >
                    {resolvingId === selectedEntry.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Mark Resolved
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
