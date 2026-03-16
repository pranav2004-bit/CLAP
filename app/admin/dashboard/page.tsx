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
} from 'lucide-react'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardStats {
  students:    { total: number; active: number }
  assignments: { total: number; started: number; completed: number }
  submissions: { total: number; pending: number; processing: number; complete: number; failed: number }
  avg_score:   number | null
  dlq_unresolved: number
  recent_activity: Array<{
    event_type: string
    created_at: string | null
    old_status:  string | null
    new_status:  string | null
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
  if (event.includes('error') || event.includes('fail') || event.includes('dlq')) return 'bg-red-100 text-red-700'
  if (event.includes('complete') || event.includes('sent') || event.includes('success')) return 'bg-green-100 text-green-700'
  if (event.includes('retry') || event.includes('resend') || event.includes('retrigger')) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

function dlqSeverity(count: number): { cls: string; label: string } {
  if (count === 0) return { cls: 'text-green-700 bg-green-50 border-green-200', label: 'Healthy' }
  if (count <= 5)  return { cls: 'text-amber-700 bg-amber-50 border-amber-200', label: `${count} unresolved` }
  return              { cls: 'text-red-700 bg-red-50 border-red-200',   label: `${count} unresolved — Action needed` }
}

// Skeleton card used during initial load
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

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [stats, setStats]       = useState<DashboardStats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  // Tracks seconds since last successful fetch for the freshness label
  const [staleSec, setStaleSec] = useState(0)
  const lastFetchRef = useRef<number>(0)

  const fetchStats = useCallback(async () => {
    // Skip fetch if tab is hidden — saves server load with many concurrent admins
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(getApiUrl('admin/stats/dashboard'), { headers: getAuthHeaders() })
      if (!res.ok) {
        setError(`Server returned ${res.status}`)
        return
      }
      setStats(await res.json())
      lastFetchRef.current = Date.now()
      setStaleSec(0)
    } catch {
      setError('Network error — retrying in 30 s')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + 30-second auto-refresh
  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30_000)
    // Resume fetch immediately when tab becomes visible again
    const onVisible = () => { if (document.visibilityState === 'visible') fetchStats() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchStats])

  // Freshness ticker — updates the "Last updated X s ago" label every second
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetchRef.current) {
        setStaleSec(Math.floor((Date.now() - lastFetchRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Derived values ───────────────────────────────────────────────────────
  const dlq = stats ? dlqSeverity(stats.dlq_unresolved) : null
  const completionPct = stats && stats.submissions.total > 0
    ? Math.round((stats.submissions.complete / stats.submissions.total) * 100)
    : 0

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 min-h-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">System Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stats
              ? `Last updated ${staleSec}s ago · auto-refreshes every 30 s`
              : 'Loading real-time data…'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStats}
          disabled={loading}
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI cards — skeleton on first load */}
      {!stats && loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : stats && (
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

          {/* Pipeline Alerts */}
          <Card className={`border shadow-sm hover:shadow-md transition-shadow ${dlq?.cls}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Pipeline Alerts</p>
                  <p className="text-3xl font-bold mt-1">{stats.dlq_unresolved}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
                  {stats.dlq_unresolved === 0
                    ? <Zap className="w-6 h-6 text-green-600" />
                    : <AlertTriangle className="w-6 h-6 text-red-500" />}
                </div>
              </div>
              <p className="text-xs mt-3">{dlq?.label}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Submission pipeline breakdown */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border border-gray-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Submission Pipeline
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Pending',    count: stats.submissions.pending,    cls: 'bg-gray-400' },
                  { label: 'Processing', count: stats.submissions.processing,  cls: 'bg-indigo-500' },
                  { label: 'Complete',   count: stats.submissions.complete,    cls: 'bg-green-500' },
                  { label: 'Failed',     count: stats.submissions.failed,      cls: 'bg-red-500' },
                ].map(row => {
                  const pct = stats.submissions.total > 0
                    ? Math.round((row.count / stats.submissions.total) * 100)
                    : 0
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{row.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className={`${row.cls} h-2 rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-700 w-8 text-right shrink-0">{row.count}</span>
                    </div>
                  )
                })}
                <p className="text-xs text-gray-400 mt-2 text-right">{stats.submissions.total} total</p>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity feed */}
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
