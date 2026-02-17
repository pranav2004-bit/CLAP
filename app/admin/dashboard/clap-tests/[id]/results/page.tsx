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
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl } from '@/lib/api-config'
import { getGradeInfo, formatDuration } from '@/lib/grade-utils'

interface ResultRow {
  student_name: string
  student_id: string
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

      const response = await fetch(
        getApiUrl(`admin/clap-tests/${testId}/results?${params.toString()}`),
        { headers: { 'x-user-id': localStorage.getItem('user_id') || '' } }
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
      } else if (response.status === 401) {
        toast.error('Unauthorized. Please log in again.')
        router.push('/login')
      } else {
        setError(data.error || 'Failed to load results')
      }
    } catch (err) {
      console.error('Error fetching results:', err)
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [testId, page, searchQuery, statusFilter, sortBy, sortOrder, router])

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

        const response = await fetch(
          getApiUrl(`admin/clap-tests/${testId}/results?${params.toString()}`),
          { headers: { 'x-user-id': localStorage.getItem('user_id') || '' } }
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
        'Student Name', 'Student ID', 'Status',
        'Start Time', 'End Time', 'Duration',
        'Listening', 'Speaking', 'Writing', 'Reading', 'Vocabulary & Grammar',
        'Total Marks', 'Grade',
      ]
      const rows = allResults.map(r => [
        r.student_name,
        r.student_id,
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

  // Per-student report card
  const handleDownloadReport = (student: ResultRow) => {
    const gradeInfo = getGradeInfo(student.grade)
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Please allow pop-ups to download report cards')
      return
    }

    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>CLAP Report - ${student.student_name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; }
  .header { text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #4f46e5; }
  .header h1 { font-size: 28px; color: #4f46e5; margin-bottom: 4px; }
  .header p { font-size: 13px; color: #6b7280; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 28px; padding: 20px; background: #f9fafb; border-radius: 8px; }
  .info-grid p { font-size: 14px; }
  .info-grid strong { color: #374151; }
  .scores-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  .scores-table th, .scores-table td { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; font-size: 14px; }
  .scores-table th { background: #f3f4f6; font-weight: 600; color: #374151; }
  .scores-table .total-row { background: #eef2ff; font-weight: 700; }
  .grade-box { text-align: center; padding: 24px; background: #f0fdf4; border-radius: 8px; border: 2px solid #86efac; }
  .grade-box .grade { font-size: 48px; font-weight: 800; color: #16a34a; }
  .grade-box .label { font-size: 14px; color: #6b7280; margin-top: 4px; }
  .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    <h1>CLAP TEST REPORT CARD</h1>
    <p>${testInfo?.test_name || 'CLAP Test'} &bull; ID: ${testInfo?.test_id || ''} &bull; Generated: ${new Date().toLocaleDateString()}</p>
  </div>
  <div class="info-grid">
    <p><strong>Student Name:</strong> ${student.student_name}</p>
    <p><strong>Student ID:</strong> ${student.student_id}</p>
    <p><strong>Status:</strong> ${formatStatus(student.status)}</p>
    <p><strong>Duration:</strong> ${formatDuration(student.duration_minutes)}</p>
    <p><strong>Start Time:</strong> ${student.started_at ? new Date(student.started_at).toLocaleString() : 'N/A'}</p>
    <p><strong>Completed:</strong> ${student.completed_at ? new Date(student.completed_at).toLocaleString() : 'N/A'}</p>
  </div>
  <table class="scores-table">
    <thead><tr><th>Component</th><th>Marks Obtained</th><th>Maximum Marks</th></tr></thead>
    <tbody>
      <tr><td>Listening</td><td>${student.listening_marks != null ? student.listening_marks : '-'}</td><td>${student.component_max?.listening || 10}</td></tr>
      <tr><td>Speaking</td><td>${student.speaking_marks != null ? student.speaking_marks : '-'}</td><td>${student.component_max?.speaking || 10}</td></tr>
      <tr><td>Reading</td><td>${student.reading_marks != null ? student.reading_marks : '-'}</td><td>${student.component_max?.reading || 10}</td></tr>
      <tr><td>Writing</td><td>${student.writing_marks != null ? student.writing_marks : '-'}</td><td>${student.component_max?.writing || 10}</td></tr>
      <tr><td>Vocabulary &amp; Grammar</td><td>${student.vocabulary_marks != null ? student.vocabulary_marks : '-'}</td><td>${student.component_max?.vocabulary || 10}</td></tr>
      <tr class="total-row"><td>Total</td><td>${student.total_score != null ? student.total_score : '-'}</td><td>${student.max_possible_score}</td></tr>
    </tbody>
  </table>
  <div class="grade-box">
    <div class="grade">${student.grade || 'N/A'}</div>
    <div class="label">${gradeInfo ? gradeInfo.label : 'Not Graded'}</div>
  </div>
  <div class="footer">CLAP Assessment System &bull; This is a computer-generated report</div>
</body></html>`)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 250)
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
              {testInfo && (
                <p className="text-xs text-gray-500">
                  Test ID: {testInfo.test_id} &middot; {totalCount} student{totalCount !== 1 ? 's' : ''} attempted
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
        {loading && !testInfo && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        )}

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
                            <th className="py-3 px-4 text-left font-medium text-gray-600 whitespace-nowrap">Student Name</th>
                            <th className="py-3 px-3 text-left font-medium text-gray-600 whitespace-nowrap">
                              <button
                                className="inline-flex items-center gap-1 hover:text-gray-900"
                                onClick={() => handleSortToggle('student_id')}
                              >
                                Student ID
                                <SortIcon field="student_id" sortBy={sortBy} sortOrder={sortOrder} />
                              </button>
                            </th>
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
                            <th className="py-3 px-3 text-center font-medium text-gray-600 whitespace-nowrap">Report</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r, i) => {
                            const gradeInfo = getGradeInfo(r.grade)
                            return (
                              <tr key={i} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                                <td className="py-3 px-4 font-medium text-gray-900 whitespace-nowrap">{r.student_name}</td>
                                <td className="py-3 px-3 text-gray-600 whitespace-nowrap">{r.student_id}</td>
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
                                  {r.status === 'completed' && r.total_score != null ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleDownloadReport(r)}
                                      title="Download Report Card"
                                    >
                                      <Printer className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                                    </Button>
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
                          Page {page} of {totalPages} ({totalCount} total)
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
