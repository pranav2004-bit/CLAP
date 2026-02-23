'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl } from '@/lib/api-config'
import {
  FileText,
  RefreshCw,
  Download,
  Loader2,
  Search,
  RotateCw,
  Eye,
  Settings,
  X
} from 'lucide-react'
import { toast } from 'sonner'

interface ReportRow {
  submission_id: string
  student_name?: string
  student_email?: string
  assessment_name?: string
  report_url?: string
  report_download_url?: string
  status: string
  generated_at?: string
}

export function ReportManagement() {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTemplateConfig, setShowTemplateConfig] = useState(false)
  const [templateConfig, setTemplateConfig] = useState<any>(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/reports'))
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || data.rows || [])
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchReports() }, [])

  const regenerateReport = async (submissionId: string) => {
    setRegeneratingId(submissionId)
    try {
      const res = await fetch(getApiUrl(`admin/reports/submissions/${submissionId}/regenerate`), {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Report regeneration triggered')
        fetchReports()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to regenerate report')
      }
    } catch (error) {
      toast.error('Network error regenerating report')
    } finally {
      setRegeneratingId(null)
    }
  }

  const handleBulkDownload = async () => {
    setBulkDownloading(true)
    try {
      const res = await fetch(getApiUrl('admin/reports/bulk-download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_ids: filteredReports.map(r => r.submission_id),
        }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `reports-bulk-${new Date().toISOString().slice(0, 10)}.zip`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Bulk download started')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to initiate bulk download')
      }
    } catch (error) {
      toast.error('Network error during bulk download')
    } finally {
      setBulkDownloading(false)
    }
  }

  const fetchTemplateConfig = async () => {
    setTemplateLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/reports/template-config'))
      if (res.ok) {
        setTemplateConfig(await res.json())
      }
    } catch (error) {
      toast.error('Failed to load template config')
    } finally {
      setTemplateLoading(false)
    }
  }

  const fetchTemplatePreview = async () => {
    try {
      const res = await fetch(getApiUrl('admin/reports/template-preview'))
      if (res.ok) {
        const data = await res.json()
        setPreviewHtml(data.html || data.preview || '<p>No preview available</p>')
      }
    } catch (error) {
      toast.error('Failed to load template preview')
    }
  }

  const filteredReports = reports.filter(r => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      r.submission_id.toLowerCase().includes(q) ||
      (r.student_name || '').toLowerCase().includes(q) ||
      (r.student_email || '').toLowerCase().includes(q) ||
      (r.assessment_name || '').toLowerCase().includes(q)
    )
  })

  if (loading && reports.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading reports...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Report Management</h2>
          <p className="text-sm text-gray-500 mt-1">View, regenerate, and download assessment reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            setShowTemplateConfig(true)
            fetchTemplateConfig()
          }}>
            <Settings className="w-4 h-4 mr-2" />
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={handleBulkDownload} disabled={bulkDownloading || filteredReports.length === 0}>
            {bulkDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Bulk Download
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
        <input
          type="text"
          placeholder="Search reports by student, email, or assessment..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Reports List */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Reports ({filteredReports.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredReports.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No reports found</p>
          ) : (
            <div className="space-y-2">
              {filteredReports.map((report) => (
                <div
                  key={report.submission_id}
                  className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-gray-500 font-mono">{report.submission_id.slice(0, 8)}...</code>
                      <Badge className={report.report_url ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                        {report.report_url ? 'Generated' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 truncate">
                      {report.student_name || report.student_email || 'Unknown'} &middot; {report.assessment_name || 'Assessment'}
                    </p>
                    {report.generated_at && (
                      <p className="text-xs text-gray-400 mt-0.5">Generated: {new Date(report.generated_at).toLocaleString()}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {report.report_download_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(report.report_download_url, '_blank')}
                        className="h-8 px-2"
                        title="Download Report"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => regenerateReport(report.submission_id)}
                      disabled={regeneratingId === report.submission_id}
                      className="h-8 px-2"
                      title="Regenerate Report"
                    >
                      {regeneratingId === report.submission_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCw className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Config Modal */}
      {showTemplateConfig && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTemplateConfig(false)}>
          <Card className="w-full max-w-3xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle>Report Template Configuration</CardTitle>
                <CardDescription>Manage report template settings</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchTemplatePreview}>
                  <Eye className="w-4 h-4 mr-1" />
                  Preview
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowTemplateConfig(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {templateLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : templateConfig ? (
                <div className="space-y-4 text-sm">
                  <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-xs">
                    {JSON.stringify(templateConfig, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No template configuration available</p>
              )}
              {previewHtml && (
                <div className="mt-4 border rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-2">Template Preview</h4>
                  <iframe
                    srcDoc={previewHtml}
                    sandbox=""
                    className="bg-white border rounded w-full h-64"
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
