'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import {
  RefreshCw,
  Send,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Constants ────────────────────────────────────────────────────────────────

/** Auto-refresh interval in milliseconds. */
const REFRESH_MS = 30_000

// ── Types ────────────────────────────────────────────────────────────────────

interface ClapTestOption {
  id:      string
  test_id: string | null
  name:    string
}

interface ApiEmailRow {
  submission_id:      string
  student:            { id: string; email: string; name: string }
  assessment:         { id: string; name: string | null }
  pipeline_status:    string
  delivery_status:    'sent' | 'bounced' | 'complaint' | 'pending'
  email_sent_at:      string | null
  latest_email_event: { event_type: string; detail: string; created_at: string } | null
  updated_at:         string | null
}

interface ApiBounceRow {
  audit_id:        number
  submission_id:   string | null
  event_type:      string
  detail:          string | null
  student_id:      string | null
  student_email:   string | null
  assessment_id:   string | null
  assessment_name: string | null
  created_at:      string | null
}

interface Pagination {
  page:        number
  page_size:   number
  total:       number
  total_pages: number
}

interface EmailStats {
  total_sent: number
  delivered:  number
  bounced:    number
  complained: number
  pending:    number
}

interface StatusResponse {
  selected_test: { id: string; test_id: string | null; name: string } | null
  rows:          ApiEmailRow[]
  stats:         EmailStats
  pagination:    Pagination
  generated_at:  string
}

interface LogsResponse {
  selected_test: { id: string; test_id: string | null; name: string } | null
  rows:          ApiBounceRow[]
  pagination:    Pagination
  generated_at:  string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(status: string) {
  switch (status) {
    case 'sent':      return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
    case 'bounced':   return <XCircle      className="w-4 h-4 text-red-600 shrink-0" />
    case 'complaint': return <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
    default:          return <Clock        className="w-4 h-4 text-blue-500 shrink-0" />
  }
}

function statusBadgeCls(status: string): string {
  switch (status) {
    case 'sent':      return 'bg-green-100 text-green-800'
    case 'bounced':   return 'bg-red-100 text-red-800'
    case 'complaint': return 'bg-yellow-100 text-yellow-800'
    default:          return 'bg-blue-100 text-blue-700'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'sent':      return 'Sent'
    case 'bounced':   return 'Bounced'
    case 'complaint': return 'Complaint'
    default:          return 'Pending'
  }
}

/**
 * Safely format an ISO date string. Returns '—' for null/invalid values
 * instead of "Invalid Date" leaking into the UI.
 */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

// ── Test Scope Selector ──────────────────────────────────────────────────────

interface TestScopeSelectorProps {
  tests:          ClapTestOption[]
  testsLoading:   boolean
  selectedTestId: string | null
  onChange:       (id: string | null) => void
}

function TestScopeSelector({ tests, testsLoading, selectedTestId, onChange }: TestScopeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-medium whitespace-nowrap hidden sm:block">View:</span>
      <div className="relative">
        <select
          className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed min-w-[190px] cursor-pointer"
          value={selectedTestId ?? ''}
          onChange={e => onChange(e.target.value || null)}
          disabled={testsLoading}
          aria-label="Select test scope"
        >
          <option value="">All Tests (Global)</option>
          {tests.map(t => (
            <option key={t.id} value={t.id}>
              {t.test_id ? `${t.test_id} — ${t.name}` : t.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      </div>
    </div>
  )
}

// ── Pagination Bar ───────────────────────────────────────────────────────────

interface PaginationBarProps {
  pagination: Pagination
  onPage:     (p: number) => void
  loading:    boolean
}

function PaginationBar({ pagination, onPage, loading }: PaginationBarProps) {
  const { page, total_pages, total, page_size } = pagination
  if (total_pages <= 1) return null
  const start = (page - 1) * page_size + 1
  const end   = Math.min(page * page_size, total)
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-lg">
      <span className="text-xs text-gray-500">{start}–{end} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || loading}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs font-medium text-gray-700 px-1 tabular-nums">
          {page} / {total_pages}
        </span>
        <Button
          variant="ghost" size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPage(page + 1)}
          disabled={page >= total_pages || loading}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function EmailManagement() {
  // ── Data state ─────────────────────────────────────────────────────────
  const [statusData, setStatusData]       = useState<StatusResponse | null>(null)
  const [logsData, setLogsData]           = useState<LogsResponse | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [staleSec, setStaleSec]           = useState(0)
  const lastFetchRef                      = useRef<number>(0)

  // ── UI state ───────────────────────────────────────────────────────────
  const [resendingId, setResendingId]     = useState<string | null>(null)
  const [bulkResending, setBulkResending] = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [activeTab, setActiveTab]         = useState<'status' | 'logs'>('status')

  // ── Pagination ─────────────────────────────────────────────────────────
  const [statusPage, setStatusPage] = useState(1)
  const [logsPage, setLogsPage]     = useState(1)

  // ── Test scope ─────────────────────────────────────────────────────────
  const [tests, setTests]                       = useState<ClapTestOption[]>([])
  const [testsLoading, setTestsLoading]         = useState(true)
  const [selectedTestId, setSelectedTestId]     = useState<string | null>(null)

  // ── Refs ───────────────────────────────────────────────────────────────
  /**
   * AbortController ref — cancels the in-flight fetch when:
   *   • selectedTestId / statusPage / logsPage changes (doFetch recreated)
   *   • component unmounts
   *   • manual refresh fires
   * Prevents stale responses from overwriting newer data.
   */
  const abortRef = useRef<AbortController | null>(null)

  /**
   * Timer ref — owns the 30-second setInterval handle so we can reset the
   * countdown after a manual refresh (avoids near-immediate double-fetch).
   */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch test list ────────────────────────────────────────────────────
  /**
   * Fetches the list of available CLAP tests for the scope selector.
   * Accepts an optional AbortSignal so the initial mount fetch can be
   * cancelled cleanly on unmount.
   * Called on mount AND on every manual refresh so the list stays current.
   */
  const fetchTests = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(getApiUrl('admin/clap-tests'), {
        headers: getAuthHeaders(),
        signal,
      })
      if (!res.ok) return
      const json = await res.json()
      const list: ClapTestOption[] = Array.isArray(json)
        ? json
        : (json.clapTests ?? json.tests ?? json.results ?? [])
      setTests(list.filter((t: ClapTestOption) => Boolean(t.id)))
    } catch {
      // Non-fatal — selector gracefully degrades to "All Tests (Global)" only
    } finally {
      setTestsLoading(false)
    }
  }, [])

  // ── Core fetch (status + logs in parallel) ────────────────────────────
  /**
   * Cancels any in-flight request, starts a new one.
   * Re-created when selectedTestId / statusPage / logsPage changes,
   * which triggers the useEffect lifecycle to re-fetch automatically.
   */
  const doFetch = useCallback(async () => {
    // Skip when tab is backgrounded — saves server + network load
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    // Abort previous in-flight request
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    try {
      const statusQs = new URLSearchParams({ page: String(statusPage) })
      if (selectedTestId) statusQs.set('test_id', selectedTestId)

      const logsQs = new URLSearchParams({ page: String(logsPage) })
      if (selectedTestId) logsQs.set('test_id', selectedTestId)

      // Fetch both tabs in parallel — one round-trip pair for both datasets
      const [statusRes, logsRes] = await Promise.all([
        fetch(getApiUrl(`admin/emails/status?${statusQs.toString()}`), {
          headers: getAuthHeaders(),
          signal:  ctrl.signal,
        }),
        fetch(getApiUrl(`admin/emails/logs?${logsQs.toString()}`), {
          headers: getAuthHeaders(),
          signal:  ctrl.signal,
        }),
      ])

      // Guard: another request may have superseded this one
      if (ctrl.signal.aborted) return

      if (!statusRes.ok) throw new Error(`Emails API returned ${statusRes.status}`)
      if (!logsRes.ok)   throw new Error(`Logs API returned ${logsRes.status}`)

      const [statusJson, logsJson]: [StatusResponse, LogsResponse] = await Promise.all([
        statusRes.json(),
        logsRes.json(),
      ])

      if (ctrl.signal.aborted) return   // aborted during JSON parse

      setStatusData(statusJson)
      setLogsData(logsJson)
      lastFetchRef.current = Date.now()
      setStaleSec(0)
    } catch (err: unknown) {
      if (ctrl.signal.aborted) return   // intentional cancel — suppress error UI
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`${msg} — retrying automatically`)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [selectedTestId, statusPage, logsPage])

  // ── Interval management ───────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current)
    timerRef.current = setInterval(doFetch, REFRESH_MS)
  }, [doFetch])

  /** Manual refresh: immediate fetch + reset 30s countdown + refresh test list. */
  const handleRefresh = useCallback(() => {
    doFetch()
    resetTimer()
    fetchTests()
  }, [doFetch, resetTimer, fetchTests])

  // ── Lifecycle ──────────────────────────────────────────────────────────
  // Fetch test list once on mount (separate signal so it doesn't block data fetch)
  useEffect(() => {
    const ctrl = new AbortController()
    fetchTests(ctrl.signal)
    return () => ctrl.abort()
  }, [fetchTests])

  // Main data fetch + auto-refresh — re-runs when doFetch/resetTimer change
  // (which happens when selectedTestId / statusPage / logsPage change)
  useEffect(() => {
    doFetch()
    resetTimer()

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        doFetch()
        resetTimer()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      abortRef.current?.abort()
      if (timerRef.current !== null) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [doFetch, resetTimer])

  // ── Freshness ticker — "X s ago" label ───────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetchRef.current) {
        setStaleSec(Math.floor((Date.now() - lastFetchRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Test scope change — reset pages + clear stale data immediately ────
  const handleTestChange = useCallback((id: string | null) => {
    setSelectedTestId(id)
    setStatusPage(1)
    setLogsPage(1)
    setStatusData(null)
    setLogsData(null)
    setSearchQuery('')
  }, [])

  // ── Resend single email ───────────────────────────────────────────────
  const resendEmail = async (submissionId: string) => {
    setResendingId(submissionId)
    try {
      const res = await fetch(
        getApiUrl(`admin/emails/submissions/${submissionId}/resend`),
        { method: 'POST', headers: getAuthHeaders() },
      )
      if (res.ok) {
        toast.success('Email resend triggered successfully')
        doFetch()
        resetTimer()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to resend email')
      }
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setResendingId(null)
    }
  }

  // ── Bulk resend failed (bounced + complaint on current page) ──────────
  /**
   * Resends each failed email individually (most reliable — avoids the
   * batch_id/assessment_id requirement of the bulk-resend endpoint, and
   * gives per-item success/failure tracking).
   */
  const handleBulkResend = async () => {
    const failedRows = (statusData?.rows ?? []).filter(
      r => r.delivery_status === 'bounced' || r.delivery_status === 'complaint',
    )
    if (failedRows.length === 0) {
      toast.info('No bounced or complained emails on this page')
      return
    }

    const confirmed = window.confirm(
      `Re-queue ${failedRows.length} bounced/complained email(s) on this page?\n\nThis will reset their pipeline status and dispatch new send tasks.`,
    )
    if (!confirmed) return

    setBulkResending(true)
    try {
      const results = await Promise.allSettled(
        failedRows.map(r =>
          fetch(getApiUrl(`admin/emails/submissions/${r.submission_id}/resend`), {
            method:  'POST',
            headers: getAuthHeaders(),
          }),
        ),
      )
      const succeeded = results.filter(
        r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<Response>).value.ok,
      ).length
      const failed = failedRows.length - succeeded

      if (succeeded > 0) toast.success(`Resend triggered for ${succeeded} email(s)`)
      if (failed > 0)    toast.error(`${failed} resend(s) failed — check logs`)

      doFetch()
      resetTimer()
    } catch {
      toast.error('Network error during bulk resend')
    } finally {
      setBulkResending(false)
    }
  }

  // ── Client-side search (within current page) ──────────────────────────
  const filteredRows = (statusData?.rows ?? []).filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      r.student.email.toLowerCase().includes(q)         ||
      r.student.name.toLowerCase().includes(q)          ||
      r.student.id.toLowerCase().includes(q)            ||
      (r.assessment.name ?? '').toLowerCase().includes(q) ||
      r.delivery_status.includes(q)
    )
  })

  // ── Derived values ────────────────────────────────────────────────────
  const stats      = statusData?.stats
  const scopeLabel = statusData?.selected_test
    ? (statusData.selected_test.test_id
        ? `${statusData.selected_test.test_id} — ${statusData.selected_test.name}`
        : statusData.selected_test.name)
    : 'All Tests (Global)'

  const hasFailed = (statusData?.rows ?? []).some(
    r => r.delivery_status === 'bounced' || r.delivery_status === 'complaint',
  )

  // ── Initial loading screen ────────────────────────────────────────────
  if (loading && !statusData) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span>Loading email data…</span>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Email Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {statusData
              ? `${scopeLabel} · Last updated ${staleSec}s ago · auto-refreshes every 30s`
              : 'Loading email data…'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Test scope dropdown — real-time via auto-refresh + manual refresh */}
          <TestScopeSelector
            tests={tests}
            testsLoading={testsLoading}
            selectedTestId={selectedTestId}
            onChange={handleTestChange}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkResend}
            disabled={bulkResending || !hasFailed}
            title={hasFailed
              ? 'Resend all bounced/complained emails on this page'
              : 'No bounced or complained emails on this page'}
          >
            {bulkResending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Send    className="w-4 h-4 mr-2" />}
            Resend Failed
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh email data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Stats cards — always scoped to selected test, all pages ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Sent',  value: stats?.total_sent  ?? 0, cls: 'border-gray-200',               text: 'text-gray-900'   },
          { label: 'Delivered',   value: stats?.delivered   ?? 0, cls: 'border-green-200 bg-green-50',   text: 'text-green-700'  },
          { label: 'Bounced',     value: stats?.bounced     ?? 0, cls: 'border-red-200 bg-red-50',       text: 'text-red-700'    },
          { label: 'Complaints',  value: stats?.complained  ?? 0, cls: 'border-yellow-200 bg-yellow-50', text: 'text-yellow-700' },
          { label: 'Pending',     value: stats?.pending     ?? 0, cls: 'border-blue-200 bg-blue-50',     text: 'text-blue-700'   },
        ].map(s => (
          <Card key={s.label} className={`border ${s.cls}`}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.text}`}>{s.value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
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
            {tab === 'status'
              ? `Recent Emails (${statusData?.pagination.total.toLocaleString() ?? 0})`
              : `Bounce/Complaint Logs (${logsData?.pagination.total.toLocaleString() ?? 0})`}
          </button>
        ))}
      </div>

      {/* ── Recent Emails tab ── */}
      {activeTab === 'status' && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Filter by name, email, ID or test…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search emails"
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
                  {filteredRows.map(row => (
                    <div
                      key={row.submission_id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      {statusIcon(row.delivery_status)}

                      <div className="flex-1 min-w-0">
                        {/* Name */}
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {row.student.name || row.student.email}
                        </p>
                        {/* Email · Test name */}
                        <p className="text-xs text-gray-400 truncate">
                          {row.student.email}
                          {row.assessment.name && <> &middot; {row.assessment.name}</>}
                        </p>
                        {/* Student ID · Sent timestamp */}
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">
                          ID: {row.student.id}
                          {row.email_sent_at
                            ? ` · Sent ${fmtDate(row.email_sent_at)}`
                            : ` · Updated ${fmtDate(row.updated_at)}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeCls(row.delivery_status)}`}>
                          {statusLabel(row.delivery_status)}
                        </span>

                        {/* Resend button — only for actionable failure states */}
                        {(row.delivery_status === 'bounced' || row.delivery_status === 'complaint') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => resendEmail(row.submission_id)}
                            disabled={resendingId === row.submission_id}
                            title="Resend email"
                            aria-label={`Resend email to ${row.student.email}`}
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

              {/* Pagination — hidden while client-side search is active */}
              {statusData?.pagination && !searchQuery && (
                <PaginationBar
                  pagination={statusData.pagination}
                  onPage={p => setStatusPage(p)}
                  loading={loading}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Bounce/Complaint Logs tab ── */}
      {activeTab === 'logs' && (
        <Card className="border border-gray-200">
          <CardContent className="p-0">
            {(logsData?.rows ?? []).length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">
                No bounce or complaint logs
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {(logsData?.rows ?? []).map(log => (
                  <div key={log.audit_id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {log.event_type.toLowerCase().includes('bounce')
                          ? <XCircle      className="w-4 h-4 text-red-500 shrink-0" />
                          : <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />}
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {log.student_email ?? '—'}
                        </span>
                        <Badge
                          className={`text-xs ${
                            log.event_type.toLowerCase().includes('bounce')
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {log.event_type}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                        {fmtDate(log.created_at)}
                      </span>
                    </div>

                    {/* Student ID + detail + test name */}
                    <div className="ml-6 mt-1 space-y-0.5">
                      {log.student_id && (
                        <p className="text-xs text-gray-500 font-mono">
                          Student ID: {log.student_id}
                        </p>
                      )}
                      {log.detail && (
                        <p className="text-xs text-gray-500 truncate">{log.detail}</p>
                      )}
                      {log.assessment_name && (
                        <p className="text-xs text-gray-400">{log.assessment_name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {logsData?.pagination && (
              <PaginationBar
                pagination={logsData.pagination}
                onPage={p => setLogsPage(p)}
                loading={loading}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
