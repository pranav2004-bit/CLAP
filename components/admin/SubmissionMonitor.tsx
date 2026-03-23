'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getApiUrl, getAuthHeaders, getToken, isNetworkError, markBackendOffline } from '@/lib/api-config'
import {
  RefreshCw, Activity, AlertTriangle, Clock,
  Loader2, Search, Eye, ChevronLeft, ChevronRight, X, WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmissionOverview {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
}

interface SubmissionItem {
  id: string
  status: string
  user_email: string
  user_name: string
  student_id: string
  assessment_name: string
  created_at: string
  updated_at?: string
}

interface SubmissionDetail extends SubmissionItem {
  version?: number
  correlation_id?: string
  report_url?: string
  email_sent_at?: string
  audit_log?: AuditEntry[]
}

interface AuditEntry {
  id: number
  event_type: string
  old_status: string
  new_status: string
  worker_id: string
  error_detail?: string
  timestamp: string
}

interface PipelineHealth {
  celery_active: boolean
  redis_connected: boolean
  queue_depth?: number
  dlq_count?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE          = 30
const OVERVIEW_POLL_MS   = 60_000   // 60 s — list + overview together
// Health is now pushed via SSE — no polling constant needed

const STATUS_COLORS: Record<string, string> = {
  PENDING:           'bg-yellow-100 text-yellow-800',
  RULES_COMPLETE:    'bg-blue-100 text-blue-800',
  LLM_PROCESSING:    'bg-purple-100 text-purple-800',
  LLM_COMPLETE:      'bg-indigo-100 text-indigo-800',
  LLM_FAILED:        'bg-red-100 text-red-800',
  REPORT_GENERATING: 'bg-cyan-100 text-cyan-800',
  REPORT_READY:      'bg-teal-100 text-teal-800',
  EMAIL_SENDING:     'bg-orange-100 text-orange-800',
  COMPLETE:          'bg-green-100 text-green-800',
}

const STATUS_OPTIONS = [
  { value: '',                  label: 'All Statuses'       },
  { value: 'PENDING',           label: 'Pending'            },
  { value: 'RULES_COMPLETE',    label: 'Rules Complete'     },
  { value: 'LLM_PROCESSING',   label: 'LLM Processing'     },
  { value: 'LLM_COMPLETE',     label: 'LLM Complete'       },
  { value: 'LLM_FAILED',       label: 'Failed (LLM)'       },
  { value: 'REPORT_GENERATING', label: 'Report Generating'  },
  { value: 'REPORT_READY',     label: 'Report Ready'       },
  { value: 'EMAIL_SENDING',    label: 'Email Sending'      },
  { value: 'COMPLETE',         label: 'Completed'          },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SubmissionMonitor() {
  const [overview, setOverview]             = useState<SubmissionOverview | null>(null)
  const [submissions, setSubmissions]       = useState<SubmissionItem[]>([])
  const [health, setHealth]                 = useState<PipelineHealth | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [filterLoading, setFilterLoading]   = useState(false)
  const [statusFilter, setStatusFilter]     = useState('')
  const [searchQuery, setSearchQuery]       = useState('')
  const [currentPage, setCurrentPage]       = useState(1)
  const [totalPages, setTotalPages]         = useState(1)
  const [totalCount, setTotalCount]         = useState(0)
  const [detail, setDetail]                 = useState<SubmissionDetail | null>(null)
  const [detailLoading, setDetailLoading]   = useState(false)
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null)
  const [refreshing, setRefreshing]         = useState(false)

  // Refs — stable references for interval callbacks
  const statusFilterRef = useRef(statusFilter)
  const currentPageRef  = useRef(currentPage)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { currentPageRef.current  = currentPage  }, [currentPage])

  // ── Fetch health once (manual refresh / initial) ──────────────────────────
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(
        getApiUrl('admin/submissions/health'),
        { headers: getAuthHeaders(), cache: 'no-store' }
      )
      if (res.ok) setHealth(await res.json())
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
    }
  }, [])

  // ── Fetch overview + list (30 s) ───────────────────────────────────────────
  const fetchPage = useCallback(async (
    filter: string,
    page: number,
    opts: { isFilterChange?: boolean; isManual?: boolean } = {}
  ) => {
    if (opts.isFilterChange) setFilterLoading(true)
    if (opts.isManual)       setRefreshing(true)

    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
      if (filter) params.set('status', filter)

      const [overviewRes, listRes] = await Promise.allSettled([
        fetch(getApiUrl('admin/submissions/overview'), { headers: getAuthHeaders(), cache: 'no-store' }),
        fetch(getApiUrl(`admin/submissions?${params}`),  { headers: getAuthHeaders(), cache: 'no-store' }),
      ])

      if (overviewRes.status === 'fulfilled' && overviewRes.value.ok) {
        setOverview(await overviewRes.value.json())
      }
      if (listRes.status === 'fulfilled' && listRes.value.ok) {
        const data = await listRes.value.json()
        setSubmissions(data.submissions || [])
        setTotalCount(data.total_count ?? 0)
        setTotalPages(data.total_pages ?? 1)
        setCurrentPage(data.page ?? page)
      }
      setLastUpdated(new Date())
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
    } finally {
      setFilterLoading(false)
      setRefreshing(false)
      setInitialLoading(false)
    }
  }, [])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.allSettled([fetchPage('', 1), fetchHealth()])
      .finally(() => setInitialLoading(false))
  }, [fetchPage, fetchHealth])

  // ── SSE: pipeline health — server pushes every 10 s (replaces 15 s polling)
  useEffect(() => {
    const token = getToken()
    if (!token) return

    const url = getApiUrl(`admin/submissions/health-stream?token=${encodeURIComponent(token)}`)
    const source = new EventSource(url)

    source.onmessage = (e) => {
      try {
        setHealth(JSON.parse(e.data))
        setLastUpdated(new Date())
      } catch { /* malformed event — ignore */ }
    }
    source.onerror = () => {
      // EventSource auto-reconnects after a short delay — no action needed
      if (isNetworkError(new Error('SSE error'))) markBackendOffline()
    }

    return () => source.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-poll overview + list every 60 s ──────────────────────────────────
  useEffect(() => {
    const id = setInterval(
      () => fetchPage(statusFilterRef.current, currentPageRef.current),
      OVERVIEW_POLL_MS
    )
    return () => clearInterval(id)
  }, [fetchPage])

  // ── Filter change ─────────────────────────────────────────────────────────
  const handleFilterChange = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1)
    fetchPage(value, 1, { isFilterChange: true })
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const goToPage = (page: number) => {
    setCurrentPage(page)
    fetchPage(statusFilter, page)
  }

  // ── Manual refresh ────────────────────────────────────────────────────────
  const handleRefresh = () => {
    fetchPage(statusFilter, currentPage, { isManual: true })
    fetchHealth()
  }

  // ── Eye icon — fetch detail with proper error feedback ────────────────────
  const handleViewDetail = async (e: React.MouseEvent, submissionId: string) => {
    e.stopPropagation()
    // Open modal immediately with loading state
    setDetailLoading(true)
    setDetail({ id: submissionId } as SubmissionDetail)
    try {
      const res = await fetch(
        getApiUrl(`admin/submissions/${submissionId}`),
        { headers: getAuthHeaders() }
      )
      if (res.ok) {
        setDetail(await res.json())
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Failed to load submission (${res.status})`)
        setDetail(null)
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      else toast.error('Network error — could not load submission detail')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Client-side search (within current page) ───────────────────────────────
  const filtered = submissions.filter((s) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      s.id.toLowerCase().includes(q) ||
      (s.user_email     || '').toLowerCase().includes(q) ||
      (s.user_name      || '').toLowerCase().includes(q) ||
      (s.student_id     || '').toLowerCase().includes(q) ||
      (s.assessment_name || '').toLowerCase().includes(q)
    )
  })

  // ── Initial skeleton ───────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading submission pipeline…</span>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Submission Pipeline Monitor</h2>
          <p className="text-sm text-gray-500 mt-1">
            Real-time view · auto-refreshes every 60 s
            {lastUpdated && (
              <span className="ml-2 text-gray-400">
                · last updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || filterLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Pipeline Health */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Pipeline Health
            <span className="text-xs text-gray-400 font-normal ml-1">· updates every 15 s</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {health ? (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${health.celery_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm">Celery: {health.celery_active ? 'Active' : 'Down'}</span>
                {!health.celery_active && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${health.redis_connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm">Redis: {health.redis_connected ? 'Connected' : 'Down'}</span>
                {!health.redis_connected && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
              </div>
              {health.queue_depth !== undefined && (
                <span className={`text-sm ${health.queue_depth > 100 ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>
                  Queue Depth: {health.queue_depth}
                  {health.queue_depth > 100 && ' ⚠'}
                </span>
              )}
              {(health.dlq_count ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full border border-red-200">
                  <AlertTriangle className="w-3 h-3" />
                  {health.dlq_count} DLQ item{health.dlq_count !== 1 ? 's' : ''} — check DLQ tab
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <WifiOff className="w-4 h-4" />
              Health data unavailable
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total',      value: overview.total,      cls: 'text-gray-900',   border: 'border-gray-200'                   },
            { label: 'Pending',    value: overview.pending,    cls: 'text-yellow-700', border: 'border-yellow-200 bg-yellow-50'    },
            { label: 'Processing', value: overview.processing, cls: 'text-blue-700',   border: 'border-blue-200 bg-blue-50'        },
            { label: 'Completed',  value: overview.completed,  cls: 'text-green-700',  border: 'border-green-200 bg-green-50'      },
            { label: 'Failed',     value: overview.failed,     cls: overview.failed > 0 ? 'text-red-700' : 'text-gray-400',
              border: overview.failed > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200' },
          ].map(({ label, value, cls, border }) => (
            <Card key={label} className={`border ${border}`}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                <p className={`text-xs mt-1 ${cls} opacity-70`}>{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by email, name, student ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Dropdown + inline spinner */}
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            disabled={filterLoading}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 cursor-pointer"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {filterLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Submissions list */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Submissions ({filtered.length}{totalCount > filtered.length ? ` of ${totalCount}` : ''})
          </CardTitle>
          {totalPages > 1 && (
            <span className="text-xs text-gray-400">Page {currentPage} of {totalPages}</span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {filterLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="ml-2 text-sm text-gray-500">Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              {statusFilter ? `No submissions with status "${STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}"` : 'No submissions found'}
            </p>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {filtered.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs text-gray-400 font-mono">{sub.id.slice(0, 8)}…</code>
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[sub.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {sub.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5 truncate">
                        {sub.user_name || sub.user_email}
                        {sub.student_id && (
                          <span className="text-gray-400 ml-1">· {sub.student_id}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{sub.assessment_name}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                      <span className="text-xs text-gray-400 hidden sm:block">
                        {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : ''}
                      </span>
                      <button
                        onClick={(e) => handleViewDetail(e, sub.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-700
                                   transition-colors disabled:opacity-50"
                        title="View detail"
                        disabled={detailLoading}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={currentPage <= 1 || filterLoading}
                      onClick={() => goToPage(currentPage - 1)}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis')
                        acc.push(p)
                        return acc
                      }, [])
                      .map((item, idx) =>
                        item === 'ellipsis' ? (
                          <span key={`e${idx}`} className="px-1 text-xs text-gray-400">…</span>
                        ) : (
                          <Button
                            key={item}
                            size="sm"
                            variant={currentPage === item ? 'default' : 'outline'}
                            className="h-7 w-7 p-0 text-xs"
                            disabled={filterLoading}
                            onClick={() => goToPage(item as number)}
                          >
                            {item}
                          </Button>
                        )
                      )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={currentPage >= totalPages || filterLoading}
                      onClick={() => goToPage(currentPage + 1)}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      {detail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !detailLoading && setDetail(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Submission Detail</h3>
              <button
                onClick={() => setDetail(null)}
                disabled={detailLoading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="ml-2 text-gray-500">Loading…</span>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      { label: 'Submission ID',  value: detail.id,          mono: true  },
                      { label: 'Status',         value: detail.status?.replace(/_/g, ' '), badge: true },
                      { label: 'Student',        value: detail.user_name || detail.user_email },
                      { label: 'Student ID',     value: detail.student_id || '—', mono: true },
                      { label: 'Email',          value: detail.user_email },
                      { label: 'Assessment',     value: detail.assessment_name },
                      { label: 'Created',        value: detail.created_at    ? new Date(detail.created_at).toLocaleString()    : '—' },
                      { label: 'Updated',        value: detail.updated_at    ? new Date(detail.updated_at).toLocaleString()    : '—' },
                      { label: 'Email Sent',     value: detail.email_sent_at ? new Date(detail.email_sent_at).toLocaleString() : '—' },
                      { label: 'Correlation ID', value: detail.correlation_id || '—', mono: true },
                    ].map(({ label, value, mono, badge }) => (
                      <div key={label}>
                        <p className="text-xs text-gray-500">{label}</p>
                        {badge ? (
                          <span className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block
                            ${STATUS_COLORS[detail.status ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
                            {value}
                          </span>
                        ) : (
                          <p className={`mt-1 text-sm ${mono ? 'font-mono text-xs text-gray-600 break-all' : 'text-gray-800'}`}>
                            {value || '—'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Audit trail */}
                  {(detail.audit_log?.length ?? 0) > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Audit Trail</h4>
                      <div className="space-y-1">
                        {detail.audit_log!.map((entry, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                            <Clock className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-gray-400 whitespace-nowrap">
                              {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                            </span>
                            <span className="text-gray-700">
                              {entry.old_status || '—'} → {entry.new_status || '—'}
                            </span>
                            {entry.error_detail && (
                              <span className="text-red-500 truncate" title={entry.error_detail}>
                                {entry.error_detail}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(detail.audit_log?.length ?? 0) === 0 && !detailLoading && (
                    <p className="text-xs text-gray-400 text-center py-4">No audit events recorded</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
