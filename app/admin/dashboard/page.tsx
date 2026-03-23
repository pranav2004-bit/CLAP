'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Activity,
  ClipboardList,
  Zap,
  ChevronDown,
} from 'lucide-react'
import { getApiUrl, getAuthHeaders, isNetworkError, markBackendOffline } from '@/lib/api-config'
import { CubeLoader } from '@/components/ui/CubeLoader'

// ── Constants ──────────────────────────────────────────────────────────────

/** Auto-refresh interval for dashboard stats (ms). */
const REFRESH_MS = 60_000

/** How often to re-fetch the test list so new tests appear in the dropdown (ms). */
const TESTS_REFRESH_MS = 60_000

// ── Types ──────────────────────────────────────────────────────────────────

interface ClapTestOption {
  id: string
  test_id: string | null
  name: string
}

interface DashboardStats {
  selected_test: { id: string; test_id: string | null; name: string } | null
  students:    { total: number; active: number }
  assignments: { total: number; started: number; completed: number }
  submissions: { total: number; pending: number; processing: number; complete: number; failed: number }
  /** All pipeline statuses with counts — drives the Pipeline widget accurately. */
  status_breakdown: Array<{ status: string; count: number }>
  avg_score:   number | null
  dlq_unresolved: number
  recent_activity: Array<{
    event_type:    string
    created_at:    string | null
    old_status:    string | null
    new_status:    string | null
    submission_id: string | null
  }>
  generated_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function eventLabel(event: string): string {
  return event.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function eventColor(event: string): string {
  if (event.includes('error') || event.includes('fail') || event.includes('dlq'))
    return 'bg-red-100 text-red-700'
  if (event.includes('complete') || event.includes('sent') || event.includes('success'))
    return 'bg-green-100 text-green-700'
  if (event.includes('retry') || event.includes('resend') || event.includes('retrigger'))
    return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

/** Maps every known pipeline status to a Tailwind bar colour. */
const STATUS_BAR: Record<string, string> = {
  COMPLETE:                   'bg-green-500',
  PENDING:                    'bg-gray-400',
  LLM_PROCESSING:             'bg-indigo-500',
  LLM_COMPLETE:               'bg-violet-500',
  RULES_COMPLETE:             'bg-blue-400',
  REPORT_GENERATING:          'bg-amber-500',
  REPORT_READY:               'bg-orange-400',
  EMAIL_SENDING:              'bg-cyan-500',
  LLM_FAILED:                 'bg-red-500',
  SUPERSEDED_LLM_PROCESSING:  'bg-gray-300',
}

function statusBarClass(s: string): string {
  return STATUS_BAR[s] ?? 'bg-gray-300'
}

function statusLabel(s: string): string {
  // e.g. "SUPERSEDED_LLM_PROCESSING" → "Superseded Llm Processing"
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function dlqSeverity(count: number): { cls: string; label: string } {
  if (count === 0) return { cls: 'text-green-700 bg-green-50 border-green-200', label: 'Healthy' }
  if (count <= 5)  return { cls: 'text-amber-700 bg-amber-50 border-amber-200', label: `${count} unresolved` }
  return               { cls: 'text-red-700 bg-red-50 border-red-200',   label: `${count} unresolved — Action needed` }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-3 bg-gray-200 rounded w-24" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
          <div className="w-12 h-12 bg-gray-200 rounded-xl" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-32 mt-4" />
      </CardContent>
    </Card>
  )
}

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

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [stats, setStats]     = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [staleSec, setStaleSec] = useState(0)
  const lastFetchRef = useRef<number>(0)

  // Per-test scope selector
  const [tests, setTests]             = useState<ClapTestOption[]>([])
  const [testsLoading, setTestsLoading] = useState(true)
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)

  /**
   * Abort ref — always holds the AbortController for the most-recent in-flight
   * stats request. Cancels automatically when:
   *   • selectedTestId changes  (doFetch is recreated → useEffect re-runs)
   *   • component unmounts      (useEffect cleanup)
   *   • manual refresh fires    (handleRefresh aborts previous then fetches)
   * Prevents stale responses from overwriting newer data.
   */
  const abortRef = useRef<AbortController | null>(null)

  /**
   * Timer ref — owns the setInterval handle so we can reset the 60-second
   * countdown after a manual refresh (avoids near-immediate double-fetch).
   */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /**
   * Separate abort ref for the tests-list polling — independent lifecycle
   * from the stats polling so they never cancel each other.
   */
  const testsAbortRef = useRef<AbortController | null>(null)

  // ── Fetch + periodically refresh test list ────────────────────────────
  /**
   * Fetches the list of CLAP tests for the scope dropdown.
   * Called on mount and every TESTS_REFRESH_MS so new tests appear
   * automatically without a page reload.
   * Uses its own AbortController so it never races with stats fetches.
   */
  const fetchTests = useCallback(async () => {
    testsAbortRef.current?.abort()
    const ctrl = new AbortController()
    testsAbortRef.current = ctrl

    try {
      const res = await fetch(getApiUrl('admin/clap-tests'), {
        headers: getAuthHeaders(),
        signal:  ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      if (!res.ok) {
        console.error('[Dashboard] Tests list fetch failed:', res.status, res.statusText)
        return
      }
      const json = await res.json()
      const raw: ClapTestOption[] = Array.isArray(json)
        ? json
        : (json.clapTests ?? json.tests ?? json.results ?? [])
      const list = raw.filter((t: ClapTestOption) => Boolean(t.id))
      if (ctrl.signal.aborted) return
      // Stable update — skip re-render if list is identical
      setTests(prev => {
        if (
          prev.length === list.length &&
          prev.every((t, i) => t.id === list[i].id && t.name === list[i].name)
        ) return prev
        return list
      })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (isNetworkError(err)) { markBackendOffline(); return }
      console.error('[Dashboard] Tests list fetch error:', err)
    } finally {
      if (!ctrl.signal.aborted) setTestsLoading(false)
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

  // ── Core fetch function ───────────────────────────────────────────────
  /**
   * Cancels any in-flight request, starts a new one with its own AbortSignal.
   * Guards against updating state on an aborted/unmounted instance.
   */
  const doFetch = useCallback(async () => {
    // Skip while tab is hidden — saves server load across many admin sessions
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    // Cancel previous in-flight request
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    try {
      const qs = new URLSearchParams()
      if (selectedTestId) qs.set('test_id', selectedTestId)
      const qsStr = qs.toString()
      const url = getApiUrl(`admin/stats/dashboard${qsStr ? `?${qsStr}` : ''}`)

      const res = await fetch(url, {
        headers: getAuthHeaders(),
        signal:  ctrl.signal,
      })

      // Check abort before processing — another request may have superseded this one
      if (ctrl.signal.aborted) return

      if (!res.ok) throw new Error(`Server returned ${res.status}`)

      const json: DashboardStats = await res.json()

      if (ctrl.signal.aborted) return   // aborted during JSON parse

      setStats(json)
      lastFetchRef.current = Date.now()
      setStaleSec(0)
    } catch (err: unknown) {
      if (ctrl.signal.aborted) return   // intentional cancel — suppress error UI
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`${msg} — retrying automatically`)
    } finally {
      // Only clear loading if this request wasn't superseded
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [selectedTestId])

  // ── Interval management ───────────────────────────────────────────────
  /**
   * (Re)starts the 30-second auto-refresh countdown from now.
   * Calling this after a manual refresh prevents a near-immediate auto-refresh.
   */
  const resetTimer = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current)
    timerRef.current = setInterval(doFetch, REFRESH_MS)
  }, [doFetch])

  /** Manual refresh: fetch immediately + reset the countdown. */
  const handleRefresh = useCallback(() => {
    doFetch()
    resetTimer()
  }, [doFetch, resetTimer])

  // ── Lifecycle: mount → fetch + start timer; re-run when scope changes ─
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
      // Cancel in-flight request and stop auto-refresh on unmount / scope change
      abortRef.current?.abort()
      if (timerRef.current !== null) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [doFetch, resetTimer])

  // ── Freshness ticker — updates "X s ago" label every second ──────────
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetchRef.current) {
        setStaleSec(Math.floor((Date.now() - lastFetchRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Derived values ───────────────────────────────────────────────────────
  //
  // Pipeline Alerts accuracy:
  //   • Global scope  → DLQ unresolved count (system-wide dead-letter queue)
  //   • Per-test scope → LLM_FAILED submissions for that test
  //     (already in the scoped status_breakdown — zero extra queries)
  //
  const alertCount = stats
    ? (selectedTestId ? stats.submissions.failed : stats.dlq_unresolved)
    : 0
  const dlq = stats ? dlqSeverity(alertCount) : null
  const completionPct = stats && stats.submissions.total > 0
    ? Math.round((stats.submissions.complete / stats.submissions.total) * 100)
    : 0

  const scopeLabel = stats?.selected_test
    ? (stats.selected_test.test_id
        ? `${stats.selected_test.test_id} — ${stats.selected_test.name}`
        : stats.selected_test.name)
    : 'All Tests (Global)'

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 min-h-full">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">System Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stats
              ? `${scopeLabel} · Last updated ${staleSec}s ago · auto-refreshes every 60 s`
              : 'Loading real-time data…'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TestScopeSelector
            tests={tests}
            testsLoading={testsLoading}
            selectedTestId={selectedTestId}
            onChange={id => {
              setSelectedTestId(id)
              setStats(null)   // clear stale data immediately; new data loads via useEffect
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh dashboard"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI cards — cube loader on first load */}
      {!stats && loading ? (
        <CubeLoader fullScreen={false} />
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">

          {/* Active Students */}
          <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Active Students</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.students.active.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {stats.students.total.toLocaleString()} total registered
              </p>
            </CardContent>
          </Card>

          {/* Tests In Progress */}
          <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Tests In Progress</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.assignments.started.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {stats.assignments.completed.toLocaleString()} completed of {stats.assignments.total.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          {/* Completed Submissions */}
          <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Submissions Complete</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.submissions.complete.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{completionPct}% complete</span>
                  <span className="text-xs text-gray-400">{stats.submissions.processing} processing</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Average Score */}
          <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Avg. Score</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stats.avg_score !== null ? stats.avg_score.toFixed(1) : '—'}
                    <span className="text-sm font-normal text-gray-400">/10</span>
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Across all scored submissions
              </p>
            </CardContent>
          </Card>

          {/* Pipeline Alerts — DLQ when global; LLM_FAILED count when per-test */}
          <Card className={`border shadow-sm hover:shadow-md transition-shadow ${dlq?.cls}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {selectedTestId ? 'Failed Submissions' : 'Pipeline Alerts'}
                  </p>
                  <p className="text-3xl font-bold mt-1">{alertCount}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
                  {alertCount === 0
                    ? <Zap className="w-6 h-6 text-green-600" />
                    : <AlertTriangle className="w-6 h-6 text-red-500" />}
                </div>
              </div>
              <p className="text-xs mt-3">{dlq?.label}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Submission pipeline breakdown + Recent Activity */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <Card className="border border-gray-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Submission Pipeline
              </h3>
              {/* Rendered from status_breakdown — every status in the DB is shown,
                  total always equals sum of all bars, zero discrepancy.
                  Empty state shown when no submissions exist for the selected scope. */}
              {(stats.status_breakdown ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity className="w-8 h-8 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">
                    {selectedTestId
                      ? 'No submissions for this test yet'
                      : 'No submissions in the system yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(stats.status_breakdown ?? [])
                    .sort((a, b) => b.count - a.count)
                    .map(row => {
                      const pct = stats.submissions.total > 0
                        ? Math.round((row.count / stats.submissions.total) * 100)
                        : 0
                      return (
                        <div key={row.status} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-36 shrink-0 truncate" title={statusLabel(row.status)}>
                            {statusLabel(row.status)}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className={`${statusBarClass(row.status)} h-2 rounded-full transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-700 w-8 text-right shrink-0">{row.count}</span>
                        </div>
                      )
                  })}
                  <p className="text-xs text-gray-400 mt-2 text-right">{stats.submissions.total} total</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-gray-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-500" />
                Recent Activity
              </h3>
              {stats.recent_activity.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
              ) : (
                <div className="space-y-2">
                  {stats.recent_activity.map((event, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${eventColor(event.event_type)}`}>
                        {eventLabel(event.event_type).slice(0, 22)}
                      </span>
                      <div className="flex-1 min-w-0">
                        {(event.old_status || event.new_status) && (
                          <p className="text-xs text-gray-500 truncate">
                            {event.old_status && <span>{event.old_status}</span>}
                            {event.old_status && event.new_status && <span className="mx-1">→</span>}
                            {event.new_status && <span className="font-medium text-gray-700">{event.new_status}</span>}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">{relativeTime(event.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
