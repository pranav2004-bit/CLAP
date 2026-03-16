'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
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
} from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────

interface ReportRow {
  submission_id: string
  student_name: string
  student_email: string
  assessment_name: string | null
  report_url: string | null
  report_download_url: string | null
  status: string
  generated_at: string | null
}

interface Pagination {
  page: number
  page_size: number
  total_count: number
  total_pages: number
}

interface TemplateConfig {
  institution_name: string
  institution_tagline: string
  show_logo: boolean
  layout: 'default' | 'compact'
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

  // Template modal
  const [showTemplateModal, setShowTemplateModal]   = useState(false)
  const [templateConfig, setTemplateConfig]         = useState<TemplateConfig | null>(null)
  const [templateDraft, setTemplateDraft]           = useState<TemplateConfig | null>(null)
  const [templateLoading, setTemplateLoading]       = useState(false)
  const [templateSaving, setTemplateSaving]         = useState(false)
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

  // ── Fetch reports (server-side search + pagination) ──────────────────────

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '30' })
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await fetch(getApiUrl(`admin/reports?${params}`), { headers: getAuthHeaders() })
      if (!res.ok) {
        if (res.status !== 401) toast.error('Failed to load reports')
        return
      }
      const data = await res.json()
      setReports(data.reports ?? [])
      if (data.pagination) setPagination(data.pagination)
    } catch {
      toast.error('Network error loading reports')
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery])

  useEffect(() => { fetchReports() }, [fetchReports])

  // ── Regenerate report ────────────────────────────────────────────────────

  const regenerateReport = async (submissionId: string) => {
    setRegeneratingId(submissionId)
    try {
      const res = await fetch(
        getApiUrl(`admin/reports/submissions/${submissionId}/regenerate`),
        { method: 'POST', headers: getAuthHeaders() }
      )
      if (res.ok) {
        toast.success('Report regeneration triggered')
        fetchReports()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to regenerate report')
      }
    } catch {
      toast.error('Network error regenerating report')
    } finally {
      setRegeneratingId(null)
    }
  }

  // ── Template config ──────────────────────────────────────────────────────

  const fetchTemplateConfig = async () => {
    setTemplateLoading(true)
    setPreviewHtml(null)
    try {
      // Auth header is required — backend enforces admin auth on this endpoint
      const res = await fetch(getApiUrl('admin/reports/template-config'), { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const cfg: TemplateConfig = data.config ?? data
        setTemplateConfig(cfg)
        setTemplateDraft({ ...cfg })
      } else {
        toast.error('Failed to load template config')
      }
    } catch {
      toast.error('Network error loading template config')
    } finally {
      setTemplateLoading(false)
    }
  }

  const saveTemplateConfig = async () => {
    if (!templateDraft) return
    setTemplateSaving(true)
    try {
      const res = await fetch(getApiUrl('admin/reports/template-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(templateDraft),
      })
      if (res.ok) {
        const data = await res.json()
        const cfg: TemplateConfig = data.config ?? data
        setTemplateConfig(cfg)
        setTemplateDraft({ ...cfg })
        toast.success('Template configuration saved')
      } else {
        toast.error('Failed to save template config')
      }
    } catch {
      toast.error('Network error saving template config')
    } finally {
      setTemplateSaving(false)
    }
  }

  const fetchTemplatePreview = async () => {
    setPreviewLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/reports/template-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ config: templateDraft ?? {} }),
      })
      if (res.ok) {
        const data = await res.json()
        setPreviewHtml(data.html_preview || data.html || data.preview || '<p>No preview available</p>')
      } else {
        toast.error('Failed to load preview')
      }
    } catch {
      toast.error('Network error loading preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const openTemplateModal = () => {
    setShowTemplateModal(true)
    fetchTemplateConfig()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Report Management</h2>
          <p className="text-sm text-gray-500 mt-1">View, regenerate, and download assessment reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openTemplateModal}>
            <Settings className="w-4 h-4 mr-2" />
            Template
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
          placeholder="Search by student name, email, or ID…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Reports List */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Reports ({pagination.total_count})
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
              {searchQuery ? `No reports found for "${searchQuery}"` : 'No reports found'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {reports.map((report) => (
                <div
                  key={report.submission_id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs text-gray-400 font-mono">{report.submission_id.slice(0, 8)}…</code>
                      <Badge className={report.report_url ? 'bg-green-100 text-green-800 text-xs' : 'bg-amber-100 text-amber-800 text-xs'}>
                        {report.report_url ? 'Generated' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-800 mt-0.5 truncate font-medium">
                      {report.student_name || report.student_email || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {report.assessment_name || 'Assessment'}
                      {report.generated_at && (
                        <> &middot; {new Date(report.generated_at).toLocaleString()}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {report.report_download_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(report.report_download_url!, '_blank', 'noopener,noreferrer')}
                        className="h-8 w-8 p-0"
                        title="Download PDF Report"
                      >
                        <Download className="w-4 h-4 text-gray-500" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => regenerateReport(report.submission_id)}
                      disabled={regeneratingId === report.submission_id}
                      className="h-8 w-8 p-0"
                      title="Regenerate Report"
                    >
                      {regeneratingId === report.submission_id
                        ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                        : <RotateCw className="w-4 h-4 text-gray-500" />
                      }
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>
                {loading ? 'Loading…' : `Showing ${reports.length} of ${pagination.total_count} reports`}
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchTemplatePreview}
                    disabled={previewLoading || templateLoading}
                  >
                    {previewLoading
                      ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      : <Eye className="w-4 h-4 mr-1" />}
                    Preview
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowTemplateModal(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-5">
              {templateLoading ? (
                <div className="flex items-center justify-center py-10 gap-3 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  <span className="text-sm">Loading configuration…</span>
                </div>
              ) : templateDraft ? (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Institution Name</label>
                      <Input
                        value={templateDraft.institution_name}
                        onChange={(e) => setTemplateDraft(d => d ? { ...d, institution_name: e.target.value } : d)}
                        placeholder="e.g. CLAP Assessment Centre"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                      <Input
                        value={templateDraft.institution_tagline}
                        onChange={(e) => setTemplateDraft(d => d ? { ...d, institution_tagline: e.target.value } : d)}
                        placeholder="e.g. Comprehensive Language Assessment Platform"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-gray-700">Show Logo</label>
                      <button
                        type="button"
                        onClick={() => setTemplateDraft(d => d ? { ...d, show_logo: !d.show_logo } : d)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${templateDraft.show_logo ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${templateDraft.show_logo ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Layout</label>
                      <select
                        value={templateDraft.layout}
                        onChange={(e) => setTemplateDraft(d => d ? { ...d, layout: e.target.value as 'default' | 'compact' } : d)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="default">Default</option>
                        <option value="compact">Compact</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveTemplateConfig} disabled={templateSaving}>
                      {templateSaving
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</>
                        : <><Save className="w-4 h-4 mr-2" />Save Configuration</>
                      }
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-6">
                  Failed to load template configuration. <button className="text-indigo-600 underline" onClick={fetchTemplateConfig}>Retry</button>
                </p>
              )}

              {/* Preview pane */}
              {previewHtml && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 border-b px-3 py-2 text-xs font-medium text-gray-600">Template Preview</div>
                  <iframe
                    srcDoc={previewHtml}
                    sandbox=""
                    className="w-full h-96 bg-white"
                    title="Report Template Preview"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
