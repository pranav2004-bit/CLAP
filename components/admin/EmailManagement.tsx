'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import {
  Mail,
  RefreshCw,
  Send,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────

/** Raw shape returned by GET /admin/emails/status */
interface ApiEmailRow {
  submission_id: string
  student: { id: string; email: string; name: string }
  assessment: { id: string; name: string | null }
  pipeline_status: string
  delivery_status: 'sent' | 'bounced' | 'complaint' | 'pending'
  email_sent_at: string | null
  latest_email_event: { event_type: string; detail: string; created_at: string } | null
  updated_at: string | null
}

/** Raw shape returned by GET /admin/emails/logs */
interface ApiBounceRow {
  audit_id: number
  submission_id: string
  event_type: string
  detail: string | null
  student_id: string
  student_email: string
  assessment_id: string
  assessment_name: string | null
  created_at: string | null
}

interface EmailStats {
  total_sent: number
  delivered: number
  bounced: number
  complained: number
  pending: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusIcon(status: string) {
  switch (status) {
    case 'sent':      return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
    case 'bounced':   return <XCircle      className="w-4 h-4 text-red-600 shrink-0" />
    case 'complaint': return <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
    default:          return <Clock        className="w-4 h-4 text-blue-500 shrink-0" />
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'sent':      return 'bg-green-100 text-green-800'
    case 'bounced':   return 'bg-red-100 text-red-800'
    case 'complaint': return 'bg-yellow-100 text-yellow-800'
    default:          return 'bg-blue-100 text-blue-700'
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'sent':      return 'Sent'
    case 'bounced':   return 'Bounced'
    case 'complaint': return 'Complaint'
    default:          return 'Pending'
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

// ── Component ──────────────────────────────────────────────────────────────

export function EmailManagement() {
  const [stats, setStats]             = useState<EmailStats | null>(null)
  const [rows, setRows]               = useState<ApiEmailRow[]>([])
  const [bounceLogs, setBounceLogs]   = useState<ApiBounceRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [bulkResending, setBulkResending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab]     = useState<'status' | 'logs'>('status')

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, logsRes] = await Promise.allSettled([
        fetch(getApiUrl('admin/emails/status'), { headers: getAuthHeaders() }),
        fetch(getApiUrl('admin/emails/logs'),   { headers: getAuthHeaders() }),
      ])

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const data = await statusRes.value.json()
        const apiRows: ApiEmailRow[] = data.rows ?? []

        // Compute summary counts from the rows
        const delivered  = apiRows.filter(r => r.delivery_status === 'sent').length
        const bounced    = apiRows.filter(r => r.delivery_status === 'bounced').length
        const complained = apiRows.filter(r => r.delivery_status === 'complaint').length
        const pending    = apiRows.filter(r => r.delivery_status === 'pending').length

        setStats({
          total_sent: apiRows.filter(r => r.email_sent_at).length,
          delivered,
          bounced,
          complained,
          pending,
        })
        setRows(apiRows)
      }

      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const data = await logsRes.value.json()
        setBounceLogs(data.rows ?? data.logs ?? [])
      }
    } catch {
      toast.error('Failed to load email data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Actions ────────────────────────────────────────────────────────────

  const resendEmail = async (submissionId: string) => {
    setResendingId(submissionId)
    try {
      const res = await fetch(
        getApiUrl(`admin/emails/submissions/${submissionId}/resend`),
        { method: 'POST', headers: getAuthHeaders() }
      )
      if (res.ok) {
        toast.success('Email resend triggered successfully')
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to resend email')
      }
    } catch {
      toast.error('Network error resending email')
    } finally {
      setResendingId(null)
    }
  }

  // Bulk resend requires batch_id or assessment_id scope — without it the
  // backend rejects with 400. We scope it to "failed/bounced only" for safety.
  const handleBulkResend = async () => {
    const failedRows = rows.filter(r => r.delivery_status === 'bounced' || r.delivery_status === 'complaint')
    if (failedRows.length === 0) {
      toast.info('No bounced or complained emails to resend')
      return
    }
    const confirmed = window.confirm(
      `This will re-queue emails for ${failedRows.length} bounced/complained recipient(s). Continue?`
    )
    if (!confirmed) return

    setBulkResending(true)
    try {
      // Resend each failed one individually (most reliable — avoids bulk-resend
      // scope requirement of batch_id / assessment_id)
      const results = await Promise.allSettled(
        failedRows.map(r =>
          fetch(getApiUrl(`admin/emails/submissions/${r.submission_id}/resend`), {
            method: 'POST',
            headers: getAuthHeaders(),
          })
        )
      )
      const succeeded = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<Response>).value.ok).length
      toast.success(`Resend triggered for ${succeeded} of ${failedRows.length} emails`)
      fetchData()
    } catch {
      toast.error('Error during bulk resend')
    } finally {
      setBulkResending(false)
    }
  }

  // ── Filtered list ──────────────────────────────────────────────────────

  const filteredRows = rows.filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      r.student.email.toLowerCase().includes(q) ||
      r.student.name.toLowerCase().includes(q) ||
      (r.assessment.name || '').toLowerCase().includes(q) ||
      r.delivery_status.includes(q)
    )
  })

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span>Loading email data…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Email Management</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor email delivery and manage bounces</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkResend}
            disabled={bulkResending || !rows.some(r => r.delivery_status === 'bounced' || r.delivery_status === 'complaint')}
            title={rows.some(r => r.delivery_status === 'bounced' || r.delivery_status === 'complaint')
              ? 'Resend all bounced/complained emails'
              : 'No bounced or complained emails'}
          >
            {bulkResending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Send className="w-4 h-4 mr-2" />}
            Resend Failed
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Sent',  value: stats?.total_sent  ?? 0, cls: 'border-gray-200',              text: 'text-gray-900' },
          { label: 'Delivered',   value: stats?.delivered   ?? 0, cls: 'border-green-200 bg-green-50',  text: 'text-green-700' },
          { label: 'Bounced',     value: stats?.bounced     ?? 0, cls: 'border-red-200 bg-red-50',      text: 'text-red-700' },
          { label: 'Complaints',  value: stats?.complained  ?? 0, cls: 'border-yellow-200 bg-yellow-50',text: 'text-yellow-700' },
          { label: 'Pending',     value: stats?.pending     ?? 0, cls: 'border-blue-200 bg-blue-50',    text: 'text-blue-700' },
        ].map(s => (
          <Card key={s.label} className={`border ${s.cls}`}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {(['status', 'logs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'status' ? `Recent Emails (${rows.length})` : `Bounce/Complaint Logs (${bounceLogs.length})`}
          </button>
        ))}
      </div>

      {/* Recent Emails tab */}
      {activeTab === 'status' && (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Filter by email or assessment…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card className="border border-gray-200">
            <CardContent className="p-0">
              {filteredRows.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">
                  {searchQuery ? 'No emails match your search' : 'No emails found'}
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredRows.map((row) => (
                    <div key={row.submission_id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      {statusIcon(row.delivery_status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {row.student.name || row.student.email}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {row.student.email}
                          {row.assessment.name && <> &middot; {row.assessment.name}</>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {row.email_sent_at ? `Sent ${fmtDate(row.email_sent_at)}` : `Updated ${fmtDate(row.updated_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(row.delivery_status)}`}>
                          {statusLabel(row.delivery_status)}
                        </span>
                        {(row.delivery_status === 'bounced' || row.delivery_status === 'complaint') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => resendEmail(row.submission_id)}
                            disabled={resendingId === row.submission_id}
                            title="Resend email"
                          >
                            {resendingId === row.submission_id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <RotateCw className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Bounce/Complaint Logs tab */}
      {activeTab === 'logs' && (
        <Card className="border border-gray-200">
          <CardContent className="p-0">
            {bounceLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">No bounce or complaint logs</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {bounceLogs.map((log) => (
                  <div key={log.audit_id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {log.event_type.toLowerCase().includes('bounce')
                          ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          : <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />}
                        <span className="text-sm font-medium text-gray-800 truncate">{log.student_email}</span>
                        <Badge className={log.event_type.toLowerCase().includes('bounce') ? 'bg-red-100 text-red-800 text-xs' : 'bg-yellow-100 text-yellow-800 text-xs'}>
                          {log.event_type}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{fmtDate(log.created_at)}</span>
                    </div>
                    {log.detail && (
                      <p className="text-xs text-gray-500 mt-1 ml-6 truncate">{log.detail}</p>
                    )}
                    {log.assessment_name && (
                      <p className="text-xs text-gray-400 ml-6">{log.assessment_name}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
