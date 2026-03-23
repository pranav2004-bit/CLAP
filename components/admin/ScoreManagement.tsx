'use client'

import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getApiUrl, getAuthHeaders, isNetworkError, markBackendOffline } from '@/lib/api-config'
import {
  Search, Download, Edit, Loader2, BarChart3,
  Save, X, User, Users, BookOpen, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchMode = 'assessment' | 'batch' | 'student'

interface StudentRow {
  submission_id: string
  student_id: string
  student_name: string
  student_email: string
  assessment_name: string
  status: string
  scores: Record<string, number>
  created_at: string | null
}

interface PaginationMeta {
  total_count: number
  page: number
  page_size: number
  total_pages: number
}

interface SearchResult extends PaginationMeta {
  mode: SearchMode
  query: string
  rows: StudentRow[]
  batch_name?: string
  domain_averages?: { domain: string; avg_score: number }[]
  student_name?: string
  student_email?: string
}

interface OverrideState {
  submission_id: string
  domain: string
  score: string
  reason: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAINS = ['listening', 'reading', 'vocab', 'writing', 'speaking'] as const

const DOMAIN_COLORS: Record<string, string> = {
  listening: 'bg-blue-100 text-blue-800',
  speaking:  'bg-purple-100 text-purple-800',
  reading:   'bg-green-100 text-green-800',
  writing:   'bg-orange-100 text-orange-800',
  vocab:     'bg-teal-100 text-teal-800',
}

const MODE_CONFIG: Record<SearchMode, { label: string; placeholder: string; example: string; icon: React.ReactNode }> = {
  assessment: { label: 'By Assessment', placeholder: 'Enter assessment name', example: 'e.g. DEMO',           icon: <BookOpen className="w-4 h-4" /> },
  batch:      { label: 'By Batch',      placeholder: 'Enter batch name',      example: 'e.g. 2022-26',        icon: <Users    className="w-4 h-4" /> },
  student:    { label: 'By Student ID', placeholder: 'Enter student ID',      example: 'e.g. A26126551001',   icon: <User     className="w-4 h-4" /> },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScoreManagement() {
  const [searchMode, setSearchMode]   = useState<SearchMode>('assessment')
  const [query, setQuery]             = useState('')
  const [result, setResult]           = useState<SearchResult | null>(null)
  const [loading, setLoading]         = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [override, setOverride]       = useState<OverrideState | null>(null)
  const [overriding, setOverriding]   = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // Track the last committed search params so pagination can re-use them
  const lastSearch = useRef<{ mode: SearchMode; query: string } | null>(null)

  // ── Core fetch ─────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (mode: SearchMode, q: string, page: number) => {
    if (!q.trim()) return
    setLoading(true)
    try {
      const url = getApiUrl(
        `admin/scores/search?mode=${mode}&q=${encodeURIComponent(q.trim())}&page=${page}&page_size=30`
      )
      const res = await fetch(url, { headers: getAuthHeaders() })

      if (res.ok) {
        const data: SearchResult = await res.json()
        setResult(data)
        setCurrentPage(data.page)
        if (data.rows.length === 0 && data.total_count === 0) {
          toast.info('No scores found for that search.')
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to fetch scores')
        setResult(null)
      }
    } catch (error) {
      if (isNetworkError(error)) markBackendOffline()
      else toast.error('Unexpected error — please try again')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Search (new query) ─────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const q = query.trim()
    if (!q) { toast.error('Please enter a search term'); return }
    lastSearch.current = { mode: searchMode, query: q }
    setCurrentPage(1)
    fetchPage(searchMode, q, 1)
  }, [query, searchMode, fetchPage])

  // ── Pagination ─────────────────────────────────────────────────────────────
  const goToPage = useCallback((page: number) => {
    if (!lastSearch.current) return
    setCurrentPage(page)
    fetchPage(lastSearch.current.mode, lastSearch.current.query, page)
  }, [fetchPage])

  // ── Mode switch — clear stale results ─────────────────────────────────────
  const handleModeChange = (mode: SearchMode) => {
    setSearchMode(mode)
    setQuery('')
    setResult(null)
    setCurrentPage(1)
    lastSearch.current = null
  }

  // ── Override save ──────────────────────────────────────────────────────────
  const handleOverrideSave = async () => {
    if (!override) return

    const scoreVal = parseFloat(override.score)
    if (override.score.trim() === '' || isNaN(scoreVal)) {
      toast.error('Enter a valid score'); return
    }
    if (scoreVal < 0 || scoreVal > 10) {
      toast.error('Score must be between 0 and 10'); return
    }
    if (!override.reason.trim()) {
      toast.error('Reason is required'); return
    }

    setOverriding(true)
    try {
      const res = await fetch(
        getApiUrl(`admin/scores/submissions/${override.submission_id}/override`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            domain:    override.domain,
            new_score: scoreVal,
            score:     scoreVal,
            reason:    override.reason.trim(),
          }),
        },
      )

      if (res.ok) {
        const data = await res.json()
        toast.success(
          `${override.domain.charAt(0).toUpperCase() + override.domain.slice(1)} score updated: ${data.old_score ?? '—'} → ${data.new_score}`
        )
        setOverride(null)
        // Refresh current page to show updated score
        if (lastSearch.current) {
          fetchPage(lastSearch.current.mode, lastSearch.current.query, currentPage)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Override failed')
      }
    } catch (error) {
      if (isNetworkError(error)) markBackendOffline()
      else toast.error('Network error — override not saved')
    } finally {
      setOverriding(false)
    }
  }

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(getApiUrl('admin/scores/export'), { headers: getAuthHeaders() })
      if (res.ok) {
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `scores-export-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Scores exported successfully')
      } else {
        toast.error('Export failed')
      }
    } catch (error) {
      if (isNetworkError(error)) markBackendOffline()
      else toast.error('Network error during export')
    } finally {
      setExporting(false)
    }
  }

  const domainTotal = (scores: Record<string, number>) => {
    const vals = Object.values(scores)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }

  const cfg = MODE_CONFIG[searchMode]
  const totalPages = result?.total_pages ?? 1

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Score Management</h2>
          <p className="text-sm text-gray-500 mt-1">View, override, and export submission scores</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Export CSV
        </Button>
      </div>

      {/* Search */}
      <Card className="border border-gray-200">
        <CardContent className="p-4 space-y-3">
          {/* Mode tabs */}
          <div className="flex gap-2 flex-wrap">
            {(Object.entries(MODE_CONFIG) as [SearchMode, typeof MODE_CONFIG[SearchMode]][]).map(([mode, c]) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  searchMode === mode
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {c.icon}{c.label}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={`${cfg.placeholder} — ${cfg.example}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                           focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-4"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Batch averages banner */}
      {result?.mode === 'batch' && (result.domain_averages?.length ?? 0) > 0 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Batch Average — {result.batch_name}
              <span className="ml-2 font-normal text-gray-400">
                · {result.total_count} total submission{result.total_count !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-3">
              {result.domain_averages!.map((d) => (
                <div key={d.domain} className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full capitalize ${DOMAIN_COLORS[d.domain] ?? 'bg-gray-100 text-gray-700'}`}>
                    {d.domain}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{d.avg_score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student header (student mode) */}
      {result?.mode === 'student' && (
        <div className="text-sm text-gray-600 px-1">
          <span className="font-semibold text-gray-900">{result.student_name}</span>
          {result.student_email && <span className="ml-2 text-gray-400">{result.student_email}</span>}
          <span className="ml-2 text-gray-400">
            · {result.total_count} submission{result.total_count !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Results table */}
      {result && result.rows.length > 0 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {result.total_count} record{result.total_count !== 1 ? 's' : ''}
              {totalPages > 1 && (
                <span className="text-gray-400 font-normal">
                  — page {result.page} of {totalPages}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {result.mode !== 'student' && (
                      <>
                        <th className="text-left py-2 px-4 text-gray-600 font-medium whitespace-nowrap">Student</th>
                        <th className="text-left py-2 px-4 text-gray-600 font-medium whitespace-nowrap">Student ID</th>
                      </>
                    )}
                    {result.mode !== 'assessment' && (
                      <th className="text-left py-2 px-4 text-gray-600 font-medium whitespace-nowrap">Assessment</th>
                    )}
                    {DOMAINS.map((d) => (
                      <th key={d} className="text-center py-2 px-2 text-gray-600 font-medium capitalize whitespace-nowrap">
                        {d}
                      </th>
                    ))}
                    <th className="text-center py-2 px-3 text-gray-600 font-medium whitespace-nowrap">Total</th>
                    <th className="text-left py-2 px-4 text-gray-600 font-medium whitespace-nowrap">Date</th>
                    <th className="text-center py-2 px-3 text-gray-600 font-medium">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => {
                    const tot = domainTotal(row.scores)
                    return (
                      <tr key={row.submission_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        {result.mode !== 'student' && (
                          <>
                            <td className="py-3 px-4">
                              <div className="font-medium text-gray-900 text-xs">{row.student_name}</div>
                              <div className="text-gray-400 text-xs">{row.student_email}</div>
                            </td>
                            <td className="py-3 px-4">
                              <code className="text-xs text-gray-600 font-mono">{row.student_id}</code>
                            </td>
                          </>
                        )}
                        {result.mode !== 'assessment' && (
                          <td className="py-3 px-4 text-xs text-gray-700 whitespace-nowrap">{row.assessment_name}</td>
                        )}
                        {DOMAINS.map((d) => (
                          <td key={d} className="py-3 px-2 text-center">
                            {row.scores[d] != null
                              ? <span className="font-semibold text-gray-800">{row.scores[d].toFixed(2)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                        <td className="py-3 px-3 text-center">
                          {tot != null
                            ? <span className="font-bold text-indigo-700">{tot.toFixed(2)}</span>
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => setOverride({
                              submission_id: row.submission_id,
                              domain: 'listening',
                              score: '',
                              reason: '',
                            })}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {((currentPage - 1) * 30) + 1}–{Math.min(currentPage * 30, result.total_count)} of {result.total_count}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={currentPage <= 1 || loading}
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </Button>
                  {/* Page number pills — show up to 5 around current */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span key={`e-${idx}`} className="px-1 text-xs text-gray-400">…</span>
                      ) : (
                        <Button
                          key={item}
                          size="sm"
                          variant={currentPage === item ? 'default' : 'outline'}
                          className="h-7 w-7 p-0 text-xs"
                          disabled={loading}
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
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No results */}
      {result && result.rows.length === 0 && !loading && (
        <div className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No scores found for that search.</p>
        </div>
      )}

      {/* Initial prompt */}
      {!result && !loading && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {searchMode === 'assessment' && 'Enter an assessment name to view scores'}
            {searchMode === 'batch'      && 'Enter a batch name to view scores'}
            {searchMode === 'student'    && 'Enter a student ID to view their scores'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{cfg.example}</p>
        </div>
      )}

      {/* Override modal */}
      {override && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !overriding) setOverride(null) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Override Score</h3>
              <button
                onClick={() => !overriding && setOverride(null)}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                disabled={overriding}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 font-mono break-all">{override.submission_id}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Domain</label>
                <select
                  value={override.domain}
                  onChange={(e) => setOverride({ ...override, domain: e.target.value })}
                  disabled={overriding}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                             focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Score (0 – 10)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  placeholder="e.g. 7.50"
                  value={override.score}
                  onChange={(e) => setOverride({ ...override, score: e.target.value })}
                  disabled={overriding}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                             focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Reason <span className="text-gray-400">(required — saved in audit log)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. LLM scoring error — re-evaluated manually"
                  value={override.reason}
                  maxLength={500}
                  onChange={(e) => setOverride({ ...override, reason: e.target.value })}
                  disabled={overriding}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                             focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-0.5 text-right">{override.reason.length}/500</p>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={handleOverrideSave}
                disabled={overriding || !override.score.trim() || !override.reason.trim()}
              >
                {overriding
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Save className="w-4 h-4 mr-2" />}
                Save Override
              </Button>
              <Button
                variant="outline"
                onClick={() => setOverride(null)}
                disabled={overriding}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
