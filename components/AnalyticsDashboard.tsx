'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import {
  TrendingUp,
  Users,
  FileText,
  BarChart3,
  Download,
  Calendar,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter'

interface AnalyticsData {
  period: string
  period_days: number
  submissions_trend: Array<{ date: string; count: number }>
  domain_averages: Array<{ domain: string; avg: number }>
  score_distribution: Array<{ range: string; count: number }>
  status_breakdown: Array<{ status: string; count: number }>
  completion_rate: number
  total_submissions: number
  complete_submissions: number
  generated_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  listening: '#6366f1',
  reading:   '#22c55e',
  vocab:     '#f59e0b',
  writing:   '#3b82f6',
  speaking:  '#ec4899',
}

const DOMAIN_LABELS: Record<string, string> = {
  listening: 'Listening',
  reading:   'Reading',
  vocab:     'Vocabulary',
  writing:   'Writing',
  speaking:  'Speaking',
}

const PIE_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#6366f1']

const STATUS_COLOR_MAP: Record<string, string> = {
  COMPLETE:          '#22c55e',
  LLM_PROCESSING:    '#6366f1',
  RULES_COMPLETE:    '#3b82f6',
  LLM_COMPLETE:      '#8b5cf6',
  REPORT_GENERATING: '#f59e0b',
  REPORT_READY:      '#f97316',
  EMAIL_SENDING:     '#06b6d4',
  PENDING:           '#9ca3af',
  LLM_FAILED:        '#ef4444',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDomain(domain: string): string {
  return DOMAIN_LABELS[domain] ?? (domain.charAt(0).toUpperCase() + domain.slice(1))
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function ChartSkeleton({ h = 220 }: { h?: number }) {
  return (
    <div className="animate-pulse rounded-lg bg-gray-100" style={{ height: h }} />
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [period, setPeriod]         = useState<Period>('month')
  const [data, setData]             = useState<AnalyticsData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [exporting, setExporting]   = useState(false)
  const [staleSec, setStaleSec]     = useState(0)
  const lastFetchRef                = useRef<number>(0)

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchAnalytics = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        getApiUrl(`admin/stats/analytics?period=${period}`),
        { headers: getAuthHeaders() }
      )
      if (!res.ok) { setError(`Server returned ${res.status}`); return }
      setData(await res.json())
      lastFetchRef.current = Date.now()
      setStaleSec(0)
    } catch {
      setError('Network error — retrying in 60 s')
    } finally {
      setLoading(false)
    }
  }, [period])

  // Initial + 60-second auto-refresh
  useEffect(() => {
    fetchAnalytics()
    const interval = setInterval(fetchAnalytics, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchAnalytics() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchAnalytics])

  // Freshness ticker
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetchRef.current) setStaleSec(Math.floor((Date.now() - lastFetchRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Export CSV ───────────────────────────────────────────────────────────

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const res = await fetch(getApiUrl('admin/scores/export'), { headers: getAuthHeaders() })
      if (!res.ok) { toast.error('Export failed — please try again'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `clap-scores-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Network error during export')
    } finally {
      setExporting(false)
    }
  }

  // ── Derived chart data ───────────────────────────────────────────────────

  const trendData = (data?.submissions_trend ?? []).map(d => ({
    date:  fmtDate(d.date),
    count: d.count,
  }))

  const domainData = (data?.domain_averages ?? []).map(d => ({
    domain: fmtDomain(d.domain),
    avg:    d.avg,
    fill:   DOMAIN_COLORS[d.domain] ?? '#6366f1',
  }))

  const distData = (data?.score_distribution ?? []).map(d => ({
    name:  d.range + '%',
    count: d.count,
  }))

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 min-h-full">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data
              ? `Last updated ${staleSec}s ago · auto-refreshes every 60 s`
              : 'Loading analytics…'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
            {(['week', 'month', 'quarter'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={exporting}>
            {exporting
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Exporting…</>
              : <><Download className="w-4 h-4 mr-2" />Export CSV</>}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Submissions',
            value: data?.total_submissions?.toLocaleString() ?? '—',
            icon: <FileText className="w-5 h-5 text-indigo-500" />,
            bg:   'bg-indigo-50',
          },
          {
            label: 'Complete',
            value: data?.complete_submissions?.toLocaleString() ?? '—',
            icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
            bg:   'bg-green-50',
          },
          {
            label: 'Completion Rate',
            value: data ? `${data.completion_rate}%` : '—',
            icon: <TrendingUp className="w-5 h-5 text-blue-500" />,
            bg:   'bg-blue-50',
          },
          {
            label: `Period (${period})`,
            value: data ? `${data.period_days} days` : '—',
            icon: <Calendar className="w-5 h-5 text-amber-500" />,
            bg:   'bg-amber-50',
          },
        ].map(card => (
          <Card key={card.label} className="border border-gray-200 bg-white shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                {card.icon}
              </div>
              <div>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1: Submission trend + Domain averages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Submission trend */}
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Submissions Trend ({period})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <ChartSkeleton h={200} /> : trendData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Submissions"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#trendGrad)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Domain averages */}
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              Average Score by Domain (out of 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <ChartSkeleton h={200} /> : domainData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">No scored submissions yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={domainData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="domain" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} tickLine={false} />
                  <Tooltip formatter={(v: number) => v.toFixed(2)} />
                  <Bar dataKey="avg" name="Avg Score" radius={[4, 4, 0, 0]}>
                    {domainData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2: Score distribution + Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score distribution */}
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Score Distribution (%)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {loading ? <ChartSkeleton h={200} /> : distData.every(d => d.count === 0) ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">No scored submissions yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={distData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="count"
                    nameKey="name"
                    paddingAngle={2}
                    label={({ name, percent }) => percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                    labelLine={false}
                  >
                    {distData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v} submissions`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Pipeline Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <ChartSkeleton h={200} /> : !data?.status_breakdown?.length ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">No submissions yet</div>
            ) : (
              <div className="space-y-2 py-2">
                {data.status_breakdown
                  .filter(s => s.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map(s => {
                    const total = data.total_submissions || 1
                    const pct = Math.round((s.count / total) * 100)
                    const color = STATUS_COLOR_MAP[s.status] ?? '#9ca3af'
                    return (
                      <div key={s.status} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-36 shrink-0 truncate">{s.status}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-6 text-right shrink-0">{s.count}</span>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      {data && (
        <p className="text-xs text-gray-400 text-right">
          Data generated at {new Date(data.generated_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
