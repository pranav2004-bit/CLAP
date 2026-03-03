'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Eye
} from 'lucide-react'

interface SubmissionOverview {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  avg_processing_time_seconds?: number
}

interface SubmissionItem {
  id: string
  user_email?: string
  assessment_name?: string
  status: string
  created_at: string
  updated_at?: string
  correlation_id?: string
}

interface PipelineHealth {
  celery_active: boolean
  redis_connected: boolean
  queue_depth?: number
  dlq_count?: number
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  rules_complete: 'bg-blue-100 text-blue-800',
  llm_processing: 'bg-purple-100 text-purple-800',
  llm_complete: 'bg-indigo-100 text-indigo-800',
  report_generating: 'bg-cyan-100 text-cyan-800',
  report_ready: 'bg-teal-100 text-teal-800',
  email_sending: 'bg-orange-100 text-orange-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

export function SubmissionMonitor() {
  const [overview, setOverview] = useState<SubmissionOverview | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [health, setHealth] = useState<PipelineHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [overviewRes, listRes, healthRes] = await Promise.allSettled([
        fetch(getApiUrl('admin/submissions/overview'), { headers: getAuthHeaders() }),
        fetch(getApiUrl(`admin/submissions${statusFilter ? `?status=${statusFilter}` : ''}`), { headers: getAuthHeaders() }),
        fetch(getApiUrl('admin/submissions/health'), { headers: getAuthHeaders() }),
      ])

      if (overviewRes.status === 'fulfilled' && overviewRes.value.ok) {
        setOverview(await overviewRes.value.json())
      }
      if (listRes.status === 'fulfilled' && listRes.value.ok) {
        const data = await listRes.value.json()
        setSubmissions(data.submissions || data.rows || [])
      }
      if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
        setHealth(await healthRes.value.json())
      }
    } catch (error) {
      console.error('Failed to fetch submission data:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [statusFilter])

  const fetchDetail = async (submissionId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(getApiUrl(`admin/submissions/${submissionId}`), { headers: getAuthHeaders() })
      if (res.ok) {
        setSelectedSubmission(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch submission detail:', error)
    } finally {
      setDetailLoading(false)
    }
  }

  const filteredSubmissions = submissions.filter(s => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      s.id.toLowerCase().includes(q) ||
      (s.user_email || '').toLowerCase().includes(q) ||
      (s.assessment_name || '').toLowerCase().includes(q) ||
      (s.correlation_id || '').toLowerCase().includes(q)
    )
  })

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading submission pipeline data...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Submission Pipeline Monitor</h2>
          <p className="text-sm text-gray-500 mt-1">Real-time view of assessment submission processing</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Pipeline Health */}
      {health && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Pipeline Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${health.celery_active ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">Celery: {health.celery_active ? 'Active' : 'Down'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${health.redis_connected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">Redis: {health.redis_connected ? 'Connected' : 'Down'}</span>
              </div>
              {health.queue_depth !== undefined && (
                <span className="text-sm text-gray-600">Queue Depth: {health.queue_depth}</span>
              )}
              {health.dlq_count !== undefined && health.dlq_count > 0 && (
                <Badge className="bg-red-100 text-red-800">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {health.dlq_count} DLQ items
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border border-gray-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{overview.total}</p>
              <p className="text-xs text-gray-500 mt-1">Total</p>
            </CardContent>
          </Card>
          <Card className="border border-yellow-200 bg-yellow-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{overview.pending}</p>
              <p className="text-xs text-yellow-600 mt-1">Pending</p>
            </CardContent>
          </Card>
          <Card className="border border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{overview.processing}</p>
              <p className="text-xs text-blue-600 mt-1">Processing</p>
            </CardContent>
          </Card>
          <Card className="border border-green-200 bg-green-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{overview.completed}</p>
              <p className="text-xs text-green-600 mt-1">Completed</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 bg-red-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{overview.failed}</p>
              <p className="text-xs text-red-600 mt-1">Failed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by ID, email, or assessment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="rules_complete">Rules Complete</option>
          <option value="llm_processing">LLM Processing</option>
          <option value="llm_complete">LLM Complete</option>
          <option value="report_generating">Report Generating</option>
          <option value="report_ready">Report Ready</option>
          <option value="email_sending">Email Sending</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Submissions List */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Submissions ({filteredSubmissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSubmissions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No submissions found</p>
          ) : (
            <div className="space-y-2">
              {filteredSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => fetchDetail(sub.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-gray-500 font-mono">{sub.id.slice(0, 8)}...</code>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[sub.status] || 'bg-gray-100 text-gray-800'}`}>
                        {sub.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 truncate">
                      {sub.user_email || 'Unknown user'} &middot; {sub.assessment_name || 'Assessment'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : ''}
                    </span>
                    <Eye className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSubmission(null)}>
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Submission Detail</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedSubmission(null)}>
                  &times;
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">ID</span>
                      <p className="font-mono text-xs mt-1">{selectedSubmission.id}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Status</span>
                      <p className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${STATUS_COLORS[selectedSubmission.status] || 'bg-gray-100'}`}>
                        {selectedSubmission.status?.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Student</span>
                      <p className="mt-1">{selectedSubmission.user_email || selectedSubmission.student_email || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Assessment</span>
                      <p className="mt-1">{selectedSubmission.assessment_name || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Created</span>
                      <p className="mt-1">{selectedSubmission.created_at ? new Date(selectedSubmission.created_at).toLocaleString() : 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Correlation ID</span>
                      <p className="font-mono text-xs mt-1">{selectedSubmission.correlation_id || 'N/A'}</p>
                    </div>
                  </div>
                  {selectedSubmission.audit_log && (
                    <div className="mt-4">
                      <h4 className="font-medium text-sm mb-2">Audit Trail</h4>
                      <div className="space-y-1">
                        {selectedSubmission.audit_log.map((entry: any, i: number) => (
                          <div key={i} className="text-xs flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-500">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</span>
                            <span>{entry.old_status} &rarr; {entry.new_status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
