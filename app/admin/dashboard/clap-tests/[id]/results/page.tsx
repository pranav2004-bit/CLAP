'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Download,
  Search,
  Loader2,
  Users,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  ChevronLeft,
  ChevronRight,
  Printer,
  Eye,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, apiFetch, getAuthHeaders } from '@/lib/api-config'
import { getGradeInfo, formatDuration } from '@/lib/grade-utils'
import { CubeLoader } from '@/components/ui/CubeLoader'

interface IntegrityFlags {
  tab_switches: number
  fullscreen_exits: number
  paste_attempts: number
  similarity_flags: number
}

interface ResultRow {
  student_id: string
  assigned_set_label: string
  status: string
  total_score: number | null
  max_possible_score: number
  listening_marks: number | null
  speaking_marks: number | null
  reading_marks: number | null
  writing_marks: number | null
  vocabulary_marks: number | null
  component_max: Record<string, number>
  grade: string | null
  duration_minutes: number | null
  started_at: string | null
  completed_at: string | null
  malpractice_count: number
  integrity_flags: IntegrityFlags
  submission_id: string | null
  submission_status: string | null
  assignment_id: string
}

interface Summary {
  total_assigned: number
  completed: number
  started: number
  not_started: number
  average_score: number | null
}

interface TestInfo {
  test_id: string
  test_name: string
  max_possible_score: number
  component_max: Record<string, number>
}

export default function ClapTestResultsPage() {
  const params = useParams()
  const router = useRouter()
  const testId = params.id as string

  // Data state
  const [results, setResults] = useState<ResultRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [testInfo, setTestInfo] = useState<TestInfo | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Answers Preview modal
  const [previewRow, setPreviewRow]       = useState<ResultRow | null>(null)
  const [previewData, setPreviewData]     = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Report download — tracks which student_ids are currently fetching the presigned URL
  const [reportLoadingIds, setReportLoadingIds] = useState<Set<string>>(new Set())

  // Filters & sort
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Fetch results
  const fetchResults = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '20',
      })
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (sortBy) {
        params.set('sort_by', sortBy)
        params.set('sort_order', sortOrder)
      }

      const response = await apiFetch(
        getApiUrl(`admin/clap-tests/${testId}/results?${params.toString()}`),
        { headers: getAuthHeaders() }
      )
      const data = await response.json()

      if (response.ok) {
        setResults(data.results)
        setSummary(data.summary)
        setTestInfo({
          test_id: data.test_id,
          test_name: data.test_name,
          max_possible_score: data.max_possible_score,
          component_max: data.component_max || {},
        })
        setTotalPages(data.pagination.total_pages)
        setTotalCount(data.pagination.total_count)
      } else if (response.status !== 401) {
        // 401 is already handled by apiFetch (auto-refresh + redirect if needed)
        setError(data.error || 'Failed to load results')
      }
    } catch (err) {
      console.error('Error fetching results:', err)
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [testId, page, searchQuery, statusFilter, sortBy, sortOrder, router])

  // Answers Preview
  const openPreview = useCallback(async (row: ResultRow) => {
    setPreviewRow(row)
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const res = await apiFetch(
        getApiUrl(`admin/clap-tests/${testId}/assignments/${row.assignment_id}/answers`),
        { headers: getAuthHeaders() }
      )
      if (res.ok) setPreviewData(await res.json())
      else setPreviewData({ error: 'Failed to load answers' })
    } catch (_e) {
      setPreviewData({ error: 'Network error' })
    } finally {
      setPreviewLoading(false)
    }
  }, [testId])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  // Sort toggle
  const handleSortToggle = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  // CSV Export
  const handleExportCSV = async () => {
    if (totalCount === 0) {
      toast.error('No data to export')
      return
    }

    setExporting(true)
    try {
      // Paginate through all results (backend caps page_size at 100)
      const PAGE_SIZE = 100
      const allResults: ResultRow[] = []
      let currentPage = 1
      let fetchedAll = false

      while (!fetchedAll) {
        const params = new URLSearchParams({
          page: String(currentPage),
          page_size: String(PAGE_SIZE),
        })
        if (searchQuery) params.set('search', searchQuery)
        if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
        if (sortBy) {
          params.set('sort_by', sortBy)
          params.set('sort_order', sortOrder)
        }

        const response = await apiFetch(
          getApiUrl(`admin/clap-tests/${testId}/results?${params.toString()}`),
          { headers: getAuthHeaders() }
        )
        const data = await response.json()

        if (!response.ok) {
          toast.error('Failed to fetch data for export')
          return
        }

        allResults.push(...data.results)
        fetchedAll = currentPage >= data.pagination.total_pages
        currentPage++
      }
      const headers = [
        'Student ID', 'Set', 'Status',
        'Start Time', 'End Time', 'Duration',
        'Listening', 'Speaking', 'Writing', 'Reading', 'Verbal Ability',
        'Total Marks', 'Grade',
      ]
      const rows = allResults.map(r => [
        r.student_id,
        r.assigned_set_label || '-',
        formatStatus(r.status),
        r.started_at ? new Date(r.started_at).toLocaleString() : '',
        r.completed_at ? new Date(r.completed_at).toLocaleString() : '',
        r.duration_minutes != null ? formatDuration(r.duration_minutes) : '',
        r.listening_marks != null ? r.listening_marks : '',
        r.speaking_marks != null ? r.speaking_marks : '',
        r.writing_marks != null ? r.writing_marks : '',
        r.reading_marks != null ? r.reading_marks : '',
        r.vocabulary_marks != null ? r.vocabulary_marks : '',
        r.total_score != null ? `${r.total_score}/${r.max_possible_score}` : '',
        r.grade || '',
      ])

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${testInfo?.test_name || 'CLAP_Test'}_results_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully')
    } catch (err) {
      console.error('Export error:', err)
      toast.error('Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

  // Per-student report — fetches presigned S3 URL and opens the actual PDF
  const handleDownloadReport = async (student: ResultRow) => {
    if (!student.submission_id) {
      toast.error('No submission found for this student')
      return
    }
    if (reportLoadingIds.has(student.student_id)) return  // prevent double-click

    setReportLoadingIds(prev => new Set(prev).add(student.student_id))
    try {
      const res = await apiFetch(
        getApiUrl(`admin/reports/submissions/${student.submission_id}`),
        { headers: getAuthHeaders() }
      )
      if (!res.ok) {
        toast.error('Failed to fetch report. Please try again.')
        return
      }
      const data = await res.json()
      const url: string | null = data.report_download_url || null
      if (!url) {
        toast.error('Report PDF is not available yet. Please wait for the pipeline to complete.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Failed to open report. Please try again.')
    } finally {
      setReportLoadingIds(prev => {
        const next = new Set(prev)
        next.delete(student.student_id)
        return next
      })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="border-l pl-3">
              <h1 className="text-lg font-semibold text-gray-900">
                {testInfo ? `Results: ${testInfo.test_name}` : 'Loading...'}
              </h1>
              {testInfo && summary && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                  <span>Test ID: {testInfo.test_id}</span>
                  <span>&middot;</span>
                  <span>{summary.total_assigned} assigned</span>
                  <span>&middot;</span>
                  <span className="text-green-600 font-medium">{summary.completed} completed</span>
                  <span>&middot;</span>
                  <span className="text-yellow-600 font-medium">{summary.started} in progress</span>
                  <span>&middot;</span>
                  <span className="text-gray-400">{summary.not_started} not started</span>
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || totalCount === 0}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error State */}
        {error && !loading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
              <p className="font-medium text-gray-700 mb-1">Failed to load results</p>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
              <Button variant="outline" onClick={fetchResults}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading State (initial) */}
        {loading && !testInfo && <CubeLoader fullScreen={false} />}

        {/* Main Content */}
        {testInfo && !error && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <SummaryCard
                label="Total Assigned"
                value={summary?.total_assigned ?? 0}
                bgColor="bg-blue-50"
                textColor="text-blue-700"
                subColor="text-blue-600"
              />
              <SummaryCard
                label="Completed"
                value={summary?.completed ?? 0}
                bgColor="bg-green-50"
                textColor="text-green-700"
                subColor="text-green-600"
              />
              <SummaryCard
                label="In Progress"
                value={summary?.started ?? 0}
                bgColor="bg-yellow-50"
                textColor="text-yellow-700"
                subColor="text-yellow-600"
              />
              <SummaryCard
                label="Not Started"
                value={summary?.not_started ?? 0}
                bgColor="bg-gray-100"
                textColor="text-gray-700"
                subColor="text-gray-500"
              />
              <SummaryCard
                label="Avg Score"
                value={
                  summary?.average_score != null
                    ? `${summary.average_score}/${testInfo.max_possible_score}`
                    : '-'
                }
                bgColor="bg-purple-50"
                textColor="text-purple-700"
                subColor="text-purple-600"
              />
            </div>

            {/* Controls Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by Student ID or Name..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="assigned">Not Started</SelectItem>
                  <SelectItem value="started">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data Table */}
            <Card>
              <CardContent className="p-0">
                {loading && results.length > 0 && (
                  <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                )}

                {results.length === 0 && !loading ? (
                  <div className="text-center py-16 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">
                      {searchQuery || statusFilter !== 'all'
                        ? 'No students match your filters'
                        : 'No students assigned to this test yet'}
                    </p>
                    <p className="text-sm mt-1">
                      {searchQuery || statusFilter !== 'all'
                        ? 'Try adjusting your search or filter criteria.'
                        : 'Assign a batch to see results here.'}
                    </p>
                  </div>
                ) : results.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50/80">
                            <th className="py-3 px-3 text-left font-medium text-gray-600 whitespace-nowrap">
                              <button
                                className="inline-flex items-center gap-1 hover:text-gray-900"
                                onClick={() => handleSortToggle('student_id')}
                              >
                                Student ID
                                <SortIcon field="student_id" sortBy={sortBy} sortOrder={sortOrder} />
                              </button>
                            </th>
                            <th className="py-3 px-3 text-center font-medium text-gray-600 whitespace-nowrap">Set</th>
                            <th className="py-3 px-3 text-left font-medium text-gray-600 whitespace-nowrap">Status</th>
                            <th className="py-3 px-3 text-left font-medium text-gray-600 whitespace-nowrap">Start Time</th>
                            <th className="py-3 px-3 text-left font-medium text-gray-600 whitespace-nowrap">End Time</th>
                            <th className="py-3 px-3 text-left font-medium text-gray-600 whitespace-nowrap">Duration</th>
                            <th className="py-3 px-2 text-center font-medium text-gray-600 whitespace-nowrap">
                              <span className="text-indigo-600">L</span>
                              <span className="text-[10px] text-gray-400 ml-0.5">/{testInfo.component_max?.listening || 10}</span>
                            </th>
                            <th className="py-3 px-2 text-center font-medium text-gray-600 whitespace-nowrap">
                              <span className="text-purple-600">S</span>
                              <span className="text-[10px] text-gray-400 ml-0.5">/{testInfo.component_max?.speaking || 10}</span>
                            </th>
                            <th className="py-3 px-2 text-center font-medium text-gray-600 whitespace-nowrap">
                              <span className="text-amber-600">W</span>
                              <span className="text-[10px] text-gray-400 ml-0.5">/{testInfo.component_max?.writing || 10}</span>
                            </th>
                            <th className="py-3 px-2 text-center font-medium text-gray-600 whitespace-nowrap">
                              <span className="text-teal-600">R</span>
                              <span className="text-[10px] text-gray-400 ml-0.5">/{testInfo.component_max?.reading || 10}</span>
                            </th>
                            <th className="py-3 px-2 text-center font-medium text-gray-600 whitespace-nowrap">
                              <span className="text-pink-600">V</span>
                              <span className="text-[10px] text-gray-400 ml-0.5">/{testInfo.component_max?.vocabulary || 10}</span>
                            </th>
                            <th className="py-3 px-3 text-center font-medium text-gray-600 whitespace-nowrap">
                              <button
                                className="inline-flex items-center gap-1 hover:text-gray-900"
                                onClick={() => handleSortToggle('total_score')}
                              >
                                Total
                                <SortIcon field="total_score" sortBy={sortBy} sortOrder={sortOrder} />
                              </button>
                            </th>
                            <th className="py-3 px-3 text-center font-medium text-gray-600 whitespace-nowrap">Grade</th>
                            <th className="py-3 px-3 text-center font-medium text-gray-600 whitespace-nowrap">Integrity</th>
                            <th className="py-3 px-3 text-center font-medium text-gray-600 whitespace-nowrap">Answers</th>
                            <th className="py-3 px-3 text-center font-medium text-gray-600 whitespace-nowrap">Report</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r, i) => {
                            const gradeInfo = getGradeInfo(r.grade)
                            return (
                              <tr key={i} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                                <td className="py-3 px-3 font-medium text-gray-900 whitespace-nowrap">{r.student_id}</td>
                                <td className="py-3 px-3 text-center">
                                  {r.assigned_set_label ? (
                                    <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                                      {r.assigned_set_label}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <StatusBadge status={r.status} />
                                </td>
                                <td className="py-3 px-3 text-gray-500 text-xs whitespace-nowrap">
                                  {r.started_at ? new Date(r.started_at).toLocaleString() : '-'}
                                </td>
                                <td className="py-3 px-3 text-gray-500 text-xs whitespace-nowrap">
                                  {r.completed_at ? new Date(r.completed_at).toLocaleString() : '-'}
                                </td>
                                <td className="py-3 px-3 text-gray-600 text-xs whitespace-nowrap">
                                  {formatDuration(r.duration_minutes)}
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <MarksCell marks={r.listening_marks} />
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <MarksCell marks={r.speaking_marks} />
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <MarksCell marks={r.writing_marks} />
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <MarksCell marks={r.reading_marks} />
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <MarksCell marks={r.vocabulary_marks} />
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-gray-900 whitespace-nowrap">
                                  {r.total_score != null ? (
                                    <span>{r.total_score}<span className="font-normal text-gray-400">/{r.max_possible_score}</span></span>
                                  ) : '-'}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {gradeInfo ? (
                                    <Badge className={`${gradeInfo.bgColor} ${gradeInfo.color} border-0`}>
                                      {gradeInfo.grade}
                                    </Badge>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <IntegrityBadge row={r} />
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {r.status === 'completed' ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => openPreview(r)}
                                      title="Preview submitted answers"
                                    >
                                      <Eye className="w-4 h-4 text-indigo-500 hover:text-indigo-700" />
                                    </Button>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {r.submission_status === 'COMPLETE' ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleDownloadReport(r)}
                                      disabled={reportLoadingIds.has(r.student_id)}
                                      title="Open PDF Report"
                                    >
                                      {reportLoadingIds.has(r.student_id)
                                        ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                        : <Printer className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                                      }
                                    </Button>
                                  ) : r.submission_status && r.submission_status !== 'COMPLETE' ? (
                                    <span className="text-[10px] text-amber-500 font-medium whitespace-nowrap" title={`Pipeline: ${r.submission_status}`}>
                                      ⏳
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <p className="text-sm text-gray-500">
                          Page {page} of {totalPages} &nbsp;·&nbsp;
                          {statusFilter && statusFilter !== 'all'
                            ? `${totalCount} matching`
                            : `${totalCount} students`}
                          {statusFilter === 'all' && summary && summary.completed > 0 && (
                            <span className="text-green-600 font-medium ml-1">
                              ({summary.completed} completed)
                            </span>
                          )}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(p => p - 1)}
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages || loading}
                            onClick={() => setPage(p => p + 1)}
                          >
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Answers Preview Modal ─────────────────────────────────────────── */}
      {previewRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-xl z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Answers Preview — {previewRow.student_id}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {previewRow.assigned_set_label
                    ? `Set: ${previewRow.assigned_set_label}`
                    : 'No set assigned'
                  } &middot; Status: {formatStatus(previewRow.status)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => { setPreviewRow(null); setPreviewData(null) }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-6">
              {previewLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  <span className="ml-3 text-gray-500">Loading answers…</span>
                </div>
              )}

              {!previewLoading && previewData?.error && (
                <div className="flex items-center gap-2 text-red-600 py-8 justify-center">
                  <AlertCircle className="w-5 h-5" />
                  <span>{previewData.error}</span>
                </div>
              )}

              {!previewLoading && previewData && !previewData.error && (
                <>
                  {/* Submission info bar */}
                  <div className="flex flex-wrap gap-3 text-xs">
                    {previewData.submission_status && (
                      <span className={`px-2 py-1 rounded font-medium ${
                        previewData.submission_status === 'COMPLETE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        Pipeline: {previewData.submission_status}
                      </span>
                    )}
                  </div>

                  {/* Per-component sections */}
                  {(previewData.components || []).map((comp: any, ci: number) => {
                    const typeLabel: Record<string, string> = {
                      listening: 'Listening', reading: 'Reading',
                      vocabulary: 'Verbal Ability',
                      writing: 'Writing', speaking: 'Speaking',
                    }
                    const typeColor: Record<string, string> = {
                      listening: 'bg-indigo-600', reading: 'bg-teal-600',
                      vocabulary: 'bg-pink-600', writing: 'bg-amber-600', speaking: 'bg-purple-600',
                    }
                    const isMCQ = ['listening', 'reading', 'vocabulary'].includes(comp.test_type)

                    return (
                      <div key={ci} className="border rounded-lg overflow-hidden">
                        {/* Component header */}
                        <div className={`${typeColor[comp.test_type] || 'bg-gray-600'} px-4 py-2.5 flex items-center justify-between`}>
                          <span className="text-white font-semibold text-sm">
                            {typeLabel[comp.test_type] || comp.test_type} — {comp.title}
                          </span>
                          <div className="flex items-center gap-3 text-white/90 text-xs">
                            {comp.llm_score != null && (comp.test_type === 'writing' || comp.test_type === 'speaking') && (
                              <span className="bg-white/20 px-2 py-0.5 rounded">
                                LLM: {comp.llm_score}/10
                              </span>
                            )}
                            <span>Max: {comp.max_marks}</span>
                          </div>
                        </div>

                        {/* LLM feedback (writing/speaking only) */}
                        {comp.llm_feedback && (comp.test_type === 'writing' || comp.test_type === 'speaking') && (
                          <div className="px-4 py-3 bg-amber-50 border-b text-xs text-amber-800">
                            <p className="font-medium mb-1">LLM Feedback</p>
                            <pre className="whitespace-pre-wrap font-sans">
                              {typeof comp.llm_feedback === 'string'
                                ? comp.llm_feedback
                                : JSON.stringify(comp.llm_feedback, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Items */}
                        <div className="divide-y">
                          {(comp.items || []).map((item: any, ii: number) => {
                            const options: string[] = item.content?.options || []
                            const correctIdx: number | null = item.correct_option_index
                            const selectedIdx: number | null = item.selected_option_index
                            const isCorrect: boolean | null = item.is_correct
                            // has_response === false means NO StudentClapResponse row exists
                            // (student genuinely skipped this question).
                            // Strict equality avoids false positives when the backend
                            // returns an older response without the has_response field.
                            const notAnswered = item.has_response === false

                            return (
                              <div key={ii} className="px-4 py-3">
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="text-xs font-bold text-gray-400 w-6 shrink-0 pt-0.5">
                                    Q{item.order_index + 1}
                                  </span>
                                  <p className="text-sm text-gray-800 flex-1">
                                    {item.content?.question || item.content?.prompt || '—'}
                                  </p>
                                  {/* "Not answered" badge — only for MCQ items that have options */}
                                  {item.item_type === 'mcq' && options.length > 0 && notAnswered && (
                                    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">
                                      Not answered
                                    </span>
                                  )}
                                  {/* Marks — suppress for unanswered MCQ to avoid a misleading red 0/N */}
                                  {item.marks_awarded != null && !notAnswered && (
                                    <span className={`text-xs font-bold shrink-0 ${
                                      isCorrect ? 'text-green-600' : 'text-red-500'
                                    }`}>
                                      {item.marks_awarded}/{item.points}
                                    </span>
                                  )}
                                </div>

                                {/* MCQ options — item-level check so text_block / audio_block items are excluded */}
                                {item.item_type === 'mcq' && options.length > 0 && (
                                  <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {options.map((opt: string, oi: number) => {
                                      const isCorrectOpt = oi === correctIdx
                                      const isSelectedOpt = oi === selectedIdx
                                      const isWrong = isSelectedOpt && !isCorrectOpt

                                      // Three visual states:
                                      //   green  — student selected this AND it is correct
                                      //   amber  — correct answer, student didn't answer at all
                                      //   green  — correct answer, student answered wrong (show correct)
                                      //   red    — student selected this but it is wrong
                                      //   gray   — neutral (not relevant to this question)
                                      let bg = 'bg-gray-50 border-gray-200 text-gray-700'
                                      if (isCorrectOpt && isSelectedOpt)
                                        bg = 'bg-green-50 border-green-400 text-green-800'
                                      else if (isCorrectOpt && notAnswered)
                                        bg = 'bg-amber-50 border-amber-300 text-amber-800'
                                      else if (isCorrectOpt)
                                        bg = 'bg-green-50 border-green-300 text-green-700'
                                      else if (isWrong)
                                        bg = 'bg-red-50 border-red-300 text-red-700'

                                      return (
                                        <div
                                          key={oi}
                                          className={`flex items-center gap-2 border rounded px-2.5 py-1.5 text-xs ${bg}`}
                                        >
                                          <span className="font-bold w-4 shrink-0">
                                            {String.fromCharCode(65 + oi)}.
                                          </span>
                                          <span className="flex-1">{opt}</span>
                                          {isCorrectOpt && (
                                            <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${notAnswered ? 'text-amber-500' : 'text-green-600'}`} />
                                          )}
                                          {isWrong && (
                                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}

                                {/* Writing / Speaking text response */}
                                {item.item_type !== 'mcq' && item.response_text && (
                                  <div className="ml-8 mt-1.5 text-xs bg-gray-50 rounded p-2.5 text-gray-700 border border-gray-200 whitespace-pre-wrap">
                                    {item.response_text}
                                  </div>
                                )}

                                {/* No response (writing / speaking only) */}
                                {item.item_type !== 'mcq' && !item.response_text && (
                                  <div className="ml-8 mt-1.5 text-xs text-gray-400 italic">
                                    No response submitted
                                  </div>
                                )}

                                {/* Answer source badge */}
                                {item.answer_source === 'set' && (
                                  <div className="ml-8 mt-1 text-[10px] text-indigo-500 font-medium">
                                    ✦ Answer key from assigned set
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPreviewRow(null); setPreviewData(null) }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Helper Components ---

function SummaryCard({
  label,
  value,
  bgColor,
  textColor,
  subColor,
}: {
  label: string
  value: string | number
  bgColor: string
  textColor: string
  subColor: string
}) {
  return (
    <div className={`${bgColor} rounded-lg p-4 text-center`}>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      <p className={`text-xs ${subColor}`}>{label}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
    started: { label: 'Writing', className: 'bg-yellow-100 text-yellow-800' },
    assigned: { label: 'Not Started', className: 'bg-gray-100 text-gray-600' },
    expired: { label: 'Blocked', className: 'bg-red-100 text-red-800' },
    test_deleted: { label: 'Blocked', className: 'bg-red-100 text-red-800' },
  }
  const c = config[status] || { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <Badge variant="outline" className={`${c.className} border-0 whitespace-nowrap`}>
      {c.label}
    </Badge>
  )
}

function MarksCell({ marks }: { marks: number | null }) {
  if (marks === null || marks === undefined) return <span className="text-gray-300">-</span>
  const rounded = Math.round(marks * 10) / 10
  let color = 'text-gray-700'
  if (rounded >= 8) color = 'text-green-700 font-medium'
  else if (rounded >= 5) color = 'text-yellow-700'
  else if (rounded > 0) color = 'text-red-600'
  return <span className={color}>{rounded}</span>
}

function SortIcon({ field, sortBy, sortOrder }: { field: string; sortBy: string; sortOrder: string }) {
  if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 text-gray-400" />
  return sortOrder === 'asc'
    ? <ArrowUp className="w-3 h-3 text-indigo-600" />
    : <ArrowDown className="w-3 h-3 text-indigo-600" />
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    completed: 'Completed',
    started: 'Writing',
    assigned: 'Not Started',
    expired: 'Blocked',
    test_deleted: 'Blocked',
  }
  return map[status] || status
}

function IntegrityBadge({ row }: { row: ResultRow }) {
  // No test activity means no integrity data to show
  if (row.status === 'assigned') {
    return <span className="text-gray-300">-</span>
  }

  const count = row.malpractice_count ?? 0
  const flags = row.integrity_flags ?? { tab_switches: 0, fullscreen_exits: 0, paste_attempts: 0, similarity_flags: 0 }

  if (count === 0) {
    return <span className="text-green-600 font-medium text-xs">✓ Clean</span>
  }

  const hasSimilarity = flags.similarity_flags > 0

  const parts: string[] = []
  if (flags.tab_switches)     parts.push(`${flags.tab_switches}× tab switch`)
  if (flags.fullscreen_exits) parts.push(`${flags.fullscreen_exits}× fullscreen exit`)
  if (flags.paste_attempts)   parts.push(`${flags.paste_attempts}× paste attempt`)
  if (flags.similarity_flags) parts.push(`${flags.similarity_flags}× high similarity`)

  return (
    <span
      title={parts.join(', ')}
      className={`text-xs font-medium cursor-help underline decoration-dotted ${
        hasSimilarity ? 'text-red-600' : 'text-amber-600'
      }`}
    >
      {hasSimilarity
        ? `⚠ Similarity (${flags.similarity_flags})`
        : `⚠ ${count} flag${count !== 1 ? 's' : ''}`}
    </span>
  )
}
