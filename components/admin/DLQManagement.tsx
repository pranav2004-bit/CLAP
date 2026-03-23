'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl, getAuthHeaders, isNetworkError, markBackendOffline } from '@/lib/api-config'
import {
  AlertTriangle, RefreshCw, Play, Loader2,
  CheckCircle2, XCircle, RotateCw, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DLQEntry {
  id: number
  submission_id: string
  task_name: string
  error_message: string
  retry_count: number
  resolved: boolean
  created_at: string
  payload?: Record<string, unknown>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 30
const POLL_MS        = 60_000   // auto-refresh every 60 s

const TASK_COLORS: Record<string, string> = {
  evaluate_writing:  'bg-orange-100 text-orange-800',
  evaluate_speaking: 'bg-purple-100 text-purple-800',
  generate_report:   'bg-blue-100 text-blue-800',
  send_email_report: 'bg-teal-100 text-teal-800',
  score_rule_based:  'bg-green-100 text-green-800',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DLQManagement() {
  const [entries, setEntries]             = useState<DLQEntry[]>([])
  const [unresolvedCount, setUnresolved]  = useState(0)
  const [resolvedCount, setResolved]      = useState(0)
  const [totalCount, setTotalCount]       = useState(0)
  const [totalPages, setTotalPages]       = useState(1)
  const [currentPage, setCurrentPage]     = useState(1)
  const [showResolved, setShowResolved]   = useState(false)
  const [loading, setLoading]             = useState(true)
  const [refreshing, setRefreshing]       = useState(false)
  const [retryingId, setRetryingId]       = useState<number | null>(null)
  const [resolvingId, setResolvingId]     = useState<number | null>(null)
  const [bulkRetrying, setBulkRetrying]   = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<DLQEntry | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null)

  // Stable refs for polling
  const showResolvedRef = useRef(showResolved)
  const currentPageRef  = useRef(currentPage)
  useEffect(() => { showResolvedRef.current = showResolved }, [showResolved])
  useEffect(() => { currentPageRef.current  = currentPage  }, [currentPage])

  // ── Core fetch ─────────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async (
    page: number,
    resolved: boolean,
    opts: { initial?: boolean; manual?: boolean } = {}
  ) => {
    if (opts.initial) setLoading(true)
    if (opts.manual)  setRefreshing(true)

    try {
      const params = new URLSearchParams({
        page:     String(page),
        resolved: resolved ? 'true' : 'false',
      })
      const res = await fetch(
        getApiUrl(`admin/dlq?${params}`),
        { headers: getAuthHeaders(), cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
        setUnresolved(data.unresolved_count  ?? 0)
        setResolved(data.resolved_count      ?? 0)
        setTotalCount(data.total_count       ?? 0)
        setTotalPages(data.total_pages       ?? 1)
        setCurrentPage(data.page             ?? page)
        setLastUpdated(new Date())
      } else {
        toast.error('Failed to load DLQ entries')
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      else toast.error('Network error loading DLQ')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load
  useEffect(() => { fetchEntries(1, false, { initial: true }) }, [fetchEntries])

  // Auto-poll every 60 s
  useEffect(() => {
    const id = setInterval(
      () => fetchEntries(currentPageRef.current, showResolvedRef.current),
      POLL_MS
    )
    return () => clearInterval(id)
  }, [fetchEntries])

  // Re-fetch when filter changes
  const handleFilterChange = (resolved: boolean) => {
    setShowResolved(resolved)
    setCurrentPage(1)
    fetchEntries(1, resolved)
  }

  const handleRefresh = () => fetchEntries(currentPage, showResolved, { manual: true })

  const goToPage = (page: number) => {
    setCurrentPage(page)
    fetchEntries(page, showResolved)
  }

  // ── Retry single entry ─────────────────────────────────────────────────────
  const retryEntry = async (id: number) => {
    setRetryingId(id)
    try {
      const res = await fetch(getApiUrl(`admin/dlq/${id}/retry`), {
        method: 'POST', headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'already_resolved') {
          toast.info('Entry already resolved — no retry needed')
        } else {
          toast.success('Task re-queued successfully')
        }
        fetchEntries(currentPage, showResolved)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Retry failed (${res.status})`)
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      else toast.error('Network error — retry not sent')
    } finally {
      setRetryingId(null)
    }
  }

  // ── Resolve single entry ───────────────────────────────────────────────────
  const resolveEntry = async (id: number) => {
    setResolvingId(id)
    try {
      const res = await fetch(getApiUrl(`admin/dlq/${id}/resolve`), {
        method: 'POST', headers: getAuthHeaders(),
      })
      if (res.ok) {
        toast.success('Entry marked as resolved')
        if (selectedEntry?.id === id) setSelectedEntry(null)
        fetchEntries(currentPage, showResolved)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Resolve failed (${res.status})`)
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      else toast.error('Network error — resolve not sent')
    } finally {
      setResolvingId(null)
    }
  }

  // ── Bulk retry all unresolved ──────────────────────────────────────────────
  const handleBulkRetry = async () => {
    if (unresolvedCount === 0) return
    setBulkRetrying(true)
    try {
      const res = await fetch(getApiUrl('admin/dlq/bulk-retry'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ ids: [] }),  // empty → backend retries all unresolved
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.count} task${data.count !== 1 ? 's' : ''} re-queued`)
        fetchEntries(currentPage, showResolved)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || `Bulk retry failed (${res.status})`)
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      else toast.error('Network error — bulk retry not sent')
    } finally {
      setBulkRetrying(false)
    }
  }

  // ── View detail ────────────────────────────────────────────────────────────
  const fetchDetail = async (entry: DLQEntry) => {
    // Show immediately with list data, then enrich with full payload
    setSelectedEntry(entry)
    if (entry.payload !== undefined) return   // already have payload from prior fetch
    setDetailLoading(true)
    try {
      const res = await fetch(getApiUrl(`admin/dlq/${entry.id}`), { headers: getAuthHeaders() })
      if (res.ok) {
        setSelectedEntry(await res.json())
      } else {
        toast.error('Failed to load DLQ detail')
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      else toast.error('Network error loading detail')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading DLQ entries…</span>
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
            Failed task entries · auto-refreshes every 60 s
            {lastUpdated && (
              <span className="ml-2 text-gray-400">
                · last updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkRetry}
            disabled={bulkRetrying || unresolvedCount === 0}
          >
            {bulkRetrying
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <RotateCw className="w-4 h-4 mr-2" />}
            Retry All ({unresolvedCount})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border border-gray-200">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{unresolvedCount + resolvedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Total Entries</p>
          </CardContent>
        </Card>
        <Card className={`border ${unresolvedCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${unresolvedCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>
              {unresolvedCount}
            </p>
            <p className={`text-xs mt-1 ${unresolvedCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              Unresolved
            </p>
          </CardContent>
        </Card>
        <Card className="border border-green-200 bg-green-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{resolvedCount}</p>
            <p className="text-xs text-green-600 mt-1">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => handleFilterChange(e.target.checked)}
          className="rounded border-gray-300"
        />
        Show resolved entries
      </label>

      {/* Entries list */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            DLQ Entries ({totalCount})
          </CardTitle>
          {totalPages > 1 && (
            <span className="text-xs text-gray-400">Page {currentPage} of {totalPages}</span>
          )}
        </CardHeader>
        <CardContent className={entries.length > 0 ? 'p-0' : undefined}>
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {showResolved ? 'No DLQ entries found' : 'No unresolved entries. All clear!'}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50
                      cursor-pointer transition-colors
                      ${entry.resolved ? 'opacity-60' : ''}`}
                    onClick={() => fetchDetail(entry)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.resolved
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          : <XCircle      className="w-4 h-4 text-red-500 flex-shrink-0" />}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_COLORS[entry.task_name] ?? 'bg-gray-100 text-gray-700'}`}>
                          {entry.task_name.replace(/_/g, ' ')}
                        </span>
                        <code className="text-xs text-gray-400 font-mono">
                          {entry.submission_id.slice(0, 8)}…
                        </code>
                        <span className="text-xs text-gray-400">
                          Retries: {entry.retry_count}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1 truncate">{entry.error_message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
                      </p>
                    </div>

                    {!entry.resolved && (
                      <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          title="Retry"
                          disabled={retryingId === entry.id || resolvingId === entry.id}
                          onClick={(e) => { e.stopPropagation(); retryEntry(entry.id) }}
                        >
                          {retryingId === entry.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Play className="w-3 h-3" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          title="Mark Resolved"
                          disabled={resolvingId === entry.id || retryingId === entry.id}
                          onClick={(e) => { e.stopPropagation(); resolveEntry(entry.id) }}
                        >
                          {resolvingId === entry.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <CheckCircle2 className="w-3 h-3" />}
                        </Button>
                      </div>
                    )}
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
                    <Button size="sm" variant="outline" className="h-7 px-2"
                      disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
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
                          <Button key={item} size="sm"
                            variant={currentPage === item ? 'default' : 'outline'}
                            className="h-7 w-7 p-0 text-xs"
                            onClick={() => goToPage(item as number)}>
                            {item}
                          </Button>
                        )
                      )}
                    <Button size="sm" variant="outline" className="h-7 px-2"
                      disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>
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
      {selectedEntry && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !detailLoading && setSelectedEntry(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                DLQ Entry #{selectedEntry.id}
              </h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="ml-2 text-gray-500">Loading…</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Task</p>
                      <p className="mt-1 font-medium capitalize">
                        {selectedEntry.task_name.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <p className="mt-1">
                        <Badge className={selectedEntry.resolved
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'}>
                          {selectedEntry.resolved ? 'Resolved' : 'Unresolved'}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Submission ID</p>
                      <p className="mt-1 font-mono text-xs text-gray-600 break-all">
                        {selectedEntry.submission_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Retry Count</p>
                      <p className="mt-1">{selectedEntry.retry_count}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Created At</p>
                      <p className="mt-1 text-sm">
                        {selectedEntry.created_at
                          ? new Date(selectedEntry.created_at).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-1">Error Message</p>
                    <pre className="bg-red-50 border border-red-100 p-3 rounded-lg text-xs
                                    text-red-800 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                      {selectedEntry.error_message || '—'}
                    </pre>
                  </div>

                  {selectedEntry.payload && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Payload</p>
                      <pre className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-xs
                                      overflow-auto max-h-40 whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedEntry.payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {!selectedEntry.resolved && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <Button
                        size="sm"
                        onClick={() => retryEntry(selectedEntry.id)}
                        disabled={retryingId === selectedEntry.id}
                      >
                        {retryingId === selectedEntry.id
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <Play className="w-4 h-4 mr-2" />}
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveEntry(selectedEntry.id)}
                        disabled={resolvingId === selectedEntry.id}
                      >
                        {resolvingId === selectedEntry.id
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Mark Resolved
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
