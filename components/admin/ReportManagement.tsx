'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getApiUrl, getAuthHeaders, isNetworkError, markBackendOffline } from '@/lib/api-config'
import {
  FileText,
  RefreshCw,
  Download,
  Loader2,
  Search,
  RotateCw,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Eye,
  ChevronDown,
  Globe,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_MS        = 60_000  // auto-refresh reports every 60 s
const FAST_REFRESH_MS   =  5_000  // fast-poll when any record is regenerating
const TESTS_REFRESH_MS  = 60_000  // refresh test-scope dropdown every 60 s

// ── Types ──────────────────────────────────────────────────────────────────

interface ClapTestOption {
  id:      string
  test_id: string | null
  name:    string
}

interface ReportRow {
  submission_id:       string
  student_id:          string
  student_name:        string
  student_email:       string
  assessment_id:       string | null
  assessment_name:     string | null
  report_url:          string | null
  report_download_url: string | null
  status:              string
  pipeline_status:     string | null   // e.g. 'REPORT_GENERATING' while Celery is running
  generated_at:        string | null
}

interface Pagination {
  page:        number
  page_size:   number
  total_count: number
  total_pages: number
}

// ── TestScopeSelector ─────────────────────────────────────────────────────

interface TestScopeSelectorProps {
  tests:          ClapTestOption[]
  selectedTestId: string
  onChange:       (id: string) => void
}

function TestScopeSelector({ tests, selectedTestId, onChange }: TestScopeSelectorProps) {
  const selected = tests.find((t) => t.id === selectedTestId)
  const label    = selected ? (selected.test_id ?? selected.name) : 'All Tests (Global)'

  return (
    <div className="relative inline-flex items-center">
      <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      <select
        value={selectedTestId}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-8 pr-7 text-xs border border-gray-200 rounded-md bg-white text-gray-700 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
        aria-label="Select CLAP test scope"
      >
        <option value="">All Tests (Global)</option>
        {tests.map((t) => (
          <option key={t.id} value={t.id}>
            {t.test_id ? `${t.test_id} — ${t.name}` : t.name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export function ReportManagement() {
  const [reports, setReports]         = useState<ReportRow[]>([])
  const [pagination, setPagination]   = useState<Pagination>({ page: 1, page_size: 30, total_count: 0, total_pages: 1 })
  const [loading, setLoading]         = useState(true)
  const [page, setPage]               = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  // Test scope
  const [tests, setTests]               = useState<ClapTestOption[]>([])
  const [selectedTestId, setSelectedTestId] = useState<string>('')

  // AbortController refs
  const abortRef      = useRef<AbortController | null>(null)
  const testsAbortRef = useRef<AbortController | null>(null)

  // Template modal
  const [showTemplateModal, setShowTemplateModal]   = useState(false)
  const [previewHtml, setPreviewHtml]               = useState<string | null>(null)
  const [previewLoading, setPreviewLoading]         = useState(false)

  // Debounce search: 300 ms
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setPage(1)
      setSearchQuery(searchInput)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  // ── Fetch CLAP test list (periodic) ──────────────────────────────────────

  const fetchTests = useCallback(async () => {
    testsAbortRef.current?.abort()
    const ctrl = new AbortController()
    testsAbortRef.current = ctrl

    try {
      const res = await fetch(getApiUrl('admin/clap-tests'), {
        headers: getAuthHeaders(),
        signal: ctrl.signal,
      })
      if (!res.ok || ctrl.signal.aborted) return
      const data = await res.json()
      const incoming: ClapTestOption[] = (data.clapTests ?? []).map((t: any) => ({
        id:      t.id,
        test_id: t.test_id ?? null,
        name:    t.name,
      }))
      setTests((prev) => {
        if (
          prev.length === incoming.length &&
          prev.every((p, i) => p.id === incoming[i].id && p.name === incoming[i].name)
        ) return prev
        return incoming
      })
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        if (isNetworkError(err)) { markBackendOffline(); return }
        console.error('[ReportManagement] test-list fetch failed:', err)
      }
    }
  }, [])

  useEffect(() => {
    fetchTests()
    const id = setInterval(fetchTests, TESTS_REFRESH_MS)
    return () => {
      clearInterval(id)
      testsAbortRef.current?.abort()
    }
  }, [fetchTests])

  // ── Fetch reports (server-side search + pagination + test scope) ─────────

  const fetchReports = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '30' })
      if (searchQuery.trim())  params.set('search',        searchQuery.trim())
      if (selectedTestId)      params.set('assessment_id', selectedTestId)

      const res = await fetch(getApiUrl(`admin/reports?${params}`), {
        headers: getAuthHeaders(),
        signal:  ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      if (!res.ok) {
        if (res.status !== 401) toast.error('Failed to load reports')
        return
      }
      const data = await res.json()
      setReports(data.reports ?? [])
      if (data.pagination) setPagination(data.pagination)
    } catch (err: any) {
      if (err?.name !== 'AbortError') markBackendOffline()
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [page, searchQuery, selectedTestId])

  // Trigger fetch when deps change
  useEffect(() => { fetchReports() }, [fetchReports])

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(fetchReports, REFRESH_MS)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [fetchReports])

  // Fast-poll every 5 s while any visible record is actively regenerating
  const hasRegeneratingRows = reports.some(
    (r) => r.pipeline_status === 'REPORT_GENERATING',
  )
  useEffect(() => {
    if (!hasRegeneratingRows) return
    const id = setInterval(fetchReports, FAST_REFRESH_MS)
    return () => clearInterval(id)
  }, [hasRegeneratingRows, fetchReports])

  // Reset to page 1 when scope or search changes
  const handleTestChange = (id: string) => {
    setPage(1)
    setSelectedTestId(id)
  }

  // ── Regenerate report ────────────────────────────────────────────────────

  const regenerateReport = async (submissionId: string) => {
    setRegeneratingId(submissionId)
    // Optimistically mark row as regenerating so the badge appears immediately
    setReports((prev) =>
      prev.map((r) =>
        r.submission_id === submissionId
          ? { ...r, pipeline_status: 'REPORT_GENERATING' }
          : r,
      ),
    )
    try {
      const res = await fetch(
        getApiUrl(`admin/reports/submissions/${submissionId}/regenerate`),
        { method: 'POST', headers: getAuthHeaders() }
      )
      if (res.ok) {
        toast.success('Report regeneration started — the page will auto-update when complete')
        // Kick an immediate re-fetch so we get fresh server state
        fetchReports()
      } else if (res.status === 409) {
        toast.info('This report is already being regenerated')
        fetchReports()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to regenerate report')
        // Revert optimistic update on error
        setReports((prev) =>
          prev.map((r) =>
            r.submission_id === submissionId
              ? { ...r, pipeline_status: null }
              : r,
          ),
        )
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      else toast.error('Network error regenerating report')
      // Revert optimistic update
      setReports((prev) =>
        prev.map((r) =>
          r.submission_id === submissionId
            ? { ...r, pipeline_status: null }
            : r,
        ),
      )
    } finally {
      setRegeneratingId(null)
    }
  }

  // ── Template config ──────────────────────────────────────────────────────

  const fetchTemplatePreview = async () => {
    setPreviewLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/reports/template-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ config: {} }),
      })
      if (res.ok) {
        const data = await res.json()
        setPreviewHtml(data.html_preview || data.html || data.preview || '<p>No preview available</p>')
      } else {
        toast.error('Failed to load preview')
      }
    } catch (err) {
      if (isNetworkError(err)) markBackendOffline()
      toast.error('Network error loading preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const openTemplateModal = () => {
    setShowTemplateModal(true)
    setPreviewHtml(null)
    fetchTemplatePreview()
  }

  // ── Scope label ──────────────────────────────────────────────────────────

  const scopeLabel = (() => {
    if (!selectedTestId) return 'all CLAP tests'
    const t = tests.find((x) => x.id === selectedTestId)
    return t ? (t.test_id ? `${t.test_id} — ${t.name}` : t.name) : 'selected test'
  })()

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Report Management</h2>
          <p className="text-sm text-gray-500 mt-1">
            View, regenerate, and download assessment reports · auto-refreshes every 60 s
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TestScopeSelector
            tests={tests}
            selectedTestId={selectedTestId}
            onChange={handleTestChange}
          />
          <Button variant="outline" size="sm" onClick={openTemplateModal}>
            <Eye className="w-4 h-4 mr-2" />
            Preview Report
          </Button>
          <Button variant="outline" size="sm" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search by student ID or email address…"
          value={searchInput}
          onChange={(e) => {
            setPage(1)
            setSearchInput(e.target.value)
          }}
          className="pl-9"
        />
      </div>

      {/* Scope info badge */}
      {selectedTestId && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Showing reports for</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-100">
            {scopeLabel}
            <button
              onClick={() => handleTestChange('')}
              className="ml-1 text-indigo-400 hover:text-indigo-600"
              aria-label="Clear test filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* Reports List */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Reports ({loading ? '…' : pagination.total_count.toLocaleString()})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && reports.length === 0 ? (
            <div className="flex items-center justify-center py-10 gap-3 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              <span className="text-sm">Loading reports…</span>
            </div>
          ) : reports.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              {searchQuery
                ? `No reports found for "${searchQuery}"`
                : selectedTestId
                  ? `No reports found for ${scopeLabel}`
                  : 'No reports found'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {reports.map((report) => {
                const isActivelyRegenerating =
                  report.pipeline_status === 'REPORT_GENERATING' ||
                  regeneratingId === report.submission_id

                return (
                <div
                  key={report.submission_id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    {/* Row 1: status badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isActivelyRegenerating ? (
                        <Badge className="bg-indigo-100 text-indigo-700 text-xs flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Regenerating…
                        </Badge>
                      ) : (
                        <Badge
                          className={
                            report.report_url
                              ? 'bg-green-100 text-green-800 text-xs'
                              : 'bg-amber-100 text-amber-800 text-xs'
                          }
                        >
                          {report.report_url ? 'Generated' : 'Pending'}
                        </Badge>
                      )}
                    </div>
                    {/* Row 2: student name (or email if no name set) */}
                    <p className="text-sm text-gray-800 mt-0.5 truncate font-medium">
                      {report.student_name || 'Unknown'}
                    </p>
                    {/* Row 3: email (only when distinct from name) · full student UUID */}
                    <p className="text-xs text-gray-500 truncate">
                      {report.student_name && report.student_name !== report.student_email
                        ? <>{report.student_email} &middot; </>
                        : null}
                      {report.student_id && (
                        <code className="font-mono text-gray-400">{report.student_id}</code>
                      )}
                    </p>
                    {/* Row 4: assessment + generated_at */}
                    <p className="text-xs text-gray-400 truncate">
                      {report.assessment_name || 'Assessment'}
                      {report.generated_at && (
                        <> &middot; {new Date(report.generated_at).toLocaleString()}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Download — hidden while regenerating (URL will change) */}
                    {report.report_download_url && !isActivelyRegenerating && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const a = document.createElement('a')
                          a.href   = report.report_download_url!
                          a.target = '_blank'
                          a.rel    = 'noopener noreferrer'
                          a.download = `report_${report.submission_id.slice(0, 8)}.pdf`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                        }}
                        className="h-8 w-8 p-0"
                        title="Download PDF Report"
                      >
                        <Download className="w-4 h-4 text-gray-500" />
                      </Button>
                    )}
                    {/* Regenerate — disabled while already regenerating */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => regenerateReport(report.submission_id)}
                      disabled={isActivelyRegenerating}
                      className="h-8 w-8 p-0"
                      title={isActivelyRegenerating ? 'Regeneration in progress…' : 'Regenerate Report'}
                    >
                      {isActivelyRegenerating
                        ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                        : <RotateCw className="w-4 h-4 text-gray-500" />
                      }
                    </Button>
                  </div>
                </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>
                {loading
                  ? 'Loading…'
                  : `Showing ${reports.length} of ${pagination.total_count.toLocaleString()} reports`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium text-gray-700">
                  {page} / {pagination.total_pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  disabled={page >= pagination.total_pages || loading}
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Config Modal */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowTemplateModal(false)}
        >
          <Card
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Report Template Configuration</CardTitle>
                  <CardDescription>Manage report template settings</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowTemplateModal(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {previewHtml ? (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 border-b px-3 py-2 text-xs font-medium text-gray-600">Report Preview</div>
                  <iframe
                    srcDoc={previewHtml}
                    sandbox=""
                    className="w-full bg-white"
                    style={{ height: '720px' }}
                    title="Report Template Preview"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                  <Eye className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Click <strong>Preview</strong> to render the report template.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
