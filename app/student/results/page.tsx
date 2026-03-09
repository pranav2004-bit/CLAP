'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  LogOut,
  User,
  Trophy,
  Download,
  Share2,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api-config'
import { authStorage } from '@/lib/auth-storage'

// ── Types ────────────────────────────────────────────────────────────────────

interface HistoryRow {
  submission_id: string
  assessment_id: string
  assessment_name: string | null
  status: string
  overall_score: number | null
  created_at: string | null
  report_download_url: string | null
}

interface DomainScore {
  domain: string
  score: number
  feedback: unknown
  evaluated_by: string | null
  evaluated_at: string | null
}

interface ResultsDetail {
  submission_id: string
  status: string
  report_download_url: string | null
  scores: DomainScore[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COMPLETE = 'COMPLETE'

/** Human-readable status label + tailwind colour class */
function statusDisplay(status: string): { label: string; cls: string } {
  switch (status) {
    case 'PENDING':            return { label: 'Queued',              cls: 'bg-gray-100 text-gray-600' }
    case 'RULES_COMPLETE':     return { label: 'Checking Rules',      cls: 'bg-blue-100 text-blue-700' }
    case 'LLM_PROCESSING':     return { label: 'AI Evaluating',       cls: 'bg-indigo-100 text-indigo-700' }
    case 'LLM_COMPLETE':       return { label: 'AI Done',             cls: 'bg-violet-100 text-violet-700' }
    case 'REPORT_GENERATING':  return { label: 'Generating Report',   cls: 'bg-amber-100 text-amber-700' }
    case 'REPORT_READY':       return { label: 'Report Ready',        cls: 'bg-orange-100 text-orange-700' }
    case 'EMAIL_SENDING':      return { label: 'Sending Email',       cls: 'bg-sky-100 text-sky-700' }
    case 'COMPLETE':           return { label: 'Complete',            cls: 'bg-green-100 text-green-700' }
    default:                   return { label: status,                cls: 'bg-gray-100 text-gray-500' }
  }
}

/** Friendly domain label */
function domainLabel(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase()
}

/** Score → colour class for the progress bar fill */
function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-blue-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

/** Format ISO timestamp to a readable local string */
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function StudentResultsPage() {
  const router = useRouter()

  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [rows, setRows]               = useState<HistoryRow[]>([])

  // Which submission is expanded to show domain scores
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  // Cache of fetched detail objects keyed by submission_id
  const [detailCache, setDetailCache] = useState<Record<string, ResultsDetail>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  // ── Fetch history ────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(getApiUrl('submissions/history'))
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setRows(data.rows ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load results')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // ── Expand / load detail ─────────────────────────────────────────────────

  const handleExpand = useCallback(async (sub: HistoryRow) => {
    if (sub.status !== STATUS_COMPLETE) return
    const id = sub.submission_id

    // Toggle collapse
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)

    // Already cached
    if (detailCache[id]) return

    // Fetch detail
    setDetailLoading(id)
    try {
      const res = await apiFetch(getApiUrl(`submissions/${id}/results`))
      if (!res.ok) throw new Error(`${res.status}`)
      const data: ResultsDetail = await res.json()
      setDetailCache(prev => ({ ...prev, [id]: data }))
    } catch {
      // On error, leave expandedId set but no cached detail — card will show a retry message
    } finally {
      setDetailLoading(null)
    }
  }, [expandedId, detailCache])

  // ── Download ─────────────────────────────────────────────────────────────

  const handleDownload = (url: string | null) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // ── Share ────────────────────────────────────────────────────────────────

  const handleShare = async (sub: HistoryRow) => {
    const title = `CLAP Assessment Results — ${sub.assessment_name ?? 'Test'}`
    const url   = sub.report_download_url ?? window.location.href
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        alert('Report link copied to clipboard!')
      } catch {
        alert('Could not copy link. Please copy it manually from your browser.')
      }
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    authStorage.clear()
    router.push('/login')
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderDomainBars = (detail: ResultsDetail) => (
    <div className="mt-4 space-y-3">
      {detail.scores.length === 0 && (
        <p className="text-sm text-gray-500 italic">Domain scores are not yet available.</p>
      )}
      {detail.scores.map(s => (
        <div key={s.domain}>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-gray-700">{domainLabel(s.domain)}</span>
            <span className="font-bold text-gray-900">{Math.round(s.score)}<span className="text-gray-400 font-normal">/100</span></span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-700 ${scoreColor(s.score)}`}
              style={{ width: `${Math.min(100, s.score)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )

  const renderCard = (sub: HistoryRow) => {
    const { label, cls } = statusDisplay(sub.status)
    const isComplete      = sub.status === STATUS_COMPLETE
    const isExpanded      = expandedId === sub.submission_id
    const detail          = detailCache[sub.submission_id] ?? null
    const loadingDetail   = detailLoading === sub.submission_id

    return (
      <Card key={sub.submission_id} className={`border transition-shadow ${isExpanded ? 'shadow-md' : 'hover:shadow-sm'}`}>
        <CardContent className="p-5">
          {/* ── Top row ── */}
          <div className="flex flex-wrap items-start gap-3">
            {/* Icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isComplete ? 'bg-green-100' : 'bg-gray-100'}`}>
              {isComplete
                ? <Trophy className="w-5 h-5 text-green-600" />
                : <Clock  className="w-5 h-5 text-gray-400" />}
            </div>

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 leading-tight">
                {sub.assessment_name ?? 'CLAP Assessment'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Submitted {fmtDate(sub.created_at)}</p>
            </div>

            {/* Status badge + overall score */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
              {isComplete && sub.overall_score !== null && (
                <span className="text-lg font-bold text-gray-800">
                  {Math.round(sub.overall_score)}<span className="text-xs font-normal text-gray-400">/100</span>
                </span>
              )}
            </div>
          </div>

          {/* ── In-progress message ── */}
          {!isComplete && (
            <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-800">
              <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
              <span>Your report is being prepared — this usually takes a few minutes after the exam ends. Check back soon.</span>
            </div>
          )}

          {/* ── Action buttons for complete submissions ── */}
          {isComplete && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Expand/collapse domain scores */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExpand(sub)}
                className="flex items-center gap-1.5 h-8 text-xs"
              >
                {loadingDetail
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {isExpanded ? 'Hide Scores' : 'View Scores'}
              </Button>

              {/* Download report */}
              {sub.report_download_url && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(sub.report_download_url)}
                  className="flex items-center gap-1.5 h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Report
                </Button>
              )}

              {/* Share */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleShare(sub)}
                className="flex items-center gap-1.5 h-8 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </Button>
            </div>
          )}

          {/* ── Expanded domain score bars ── */}
          {isExpanded && isComplete && (
            <>
              {loadingDetail && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading domain scores…
                </div>
              )}
              {!loadingDetail && detail && renderDomainBars(detail)}
              {!loadingDetail && !detail && (
                <p className="mt-4 text-sm text-red-500">
                  Could not load domain scores.{' '}
                  <button
                    className="underline text-red-600 hover:text-red-700"
                    onClick={() => {
                      setDetailCache(prev => { const c = { ...prev }; delete c[sub.submission_id]; return c })
                      handleExpand(sub)
                    }}
                  >
                    Retry
                  </button>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  // ── Page ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background">
      {/* Header — matches dashboard / profile header */}
      <header className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <Image
                src="/images/clap-logo.png?v=new"
                alt="CLAP Logo"
                width={113}
                height={46}
                className="w-auto h-10 object-contain"
                priority
                style={{ width: 'auto', height: 'auto' }}
              />
              <div className="hidden sm:flex flex-col justify-center h-8 border-l border-border pl-3 ml-1">
                <p className="text-base font-semibold text-primary">Student Portal</p>
              </div>
            </div>

            {/* Nav */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/student/dashboard')}
                className="flex items-center gap-1.5 h-9"
              >
                {/* 2×2 grid icon — explicit 3 px gap so squares read clearly at nav size */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
                  <rect x="1"   y="1"   width="5.5" height="5.5" rx="1.25" />
                  <rect x="9.5" y="1"   width="5.5" height="5.5" rx="1.25" />
                  <rect x="1"   y="9.5" width="5.5" height="5.5" rx="1.25" />
                  <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.25" />
                </svg>
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/student/profile')}
                className="flex items-center gap-1.5 h-9"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">My Profile</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-1.5 h-9 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 max-w-3xl">
        {/* Page title */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">My Results</h1>
              <p className="text-sm text-muted-foreground">Your CLAP assessment report cards</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchHistory}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="bg-white border rounded-xl p-5 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-48" />
                    <div className="h-3 bg-gray-100 rounded w-32" />
                  </div>
                  <div className="w-20 h-6 bg-gray-200 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-red-600 font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchHistory}>Try Again</Button>
          </div>
        )}

        {/* ── Case 1: No submissions yet ── */}
        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center gap-5 py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <Trophy className="w-10 h-10 text-gray-300" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-700">No tests written yet</p>
              <p className="text-sm text-gray-400 mt-1">Complete your CLAP assessment to see your report card here.</p>
            </div>
            <Button onClick={() => router.push('/student/clap-tests')} className="mt-2">
              Go to Assessment
            </Button>
          </div>
        )}

        {/* ── Case 2 & 3: Show submission cards ── */}
        {!loading && !error && rows.length > 0 && (
          <div className="space-y-4">
            {/* Summary bar if all complete */}
            {rows.every(r => r.status === STATUS_COMPLETE) && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span>All your assessments are complete — your report cards are ready below.</span>
              </div>
            )}

            {/* Submission cards */}
            {rows.map(sub => renderCard(sub))}
          </div>
        )}
      </main>
    </div>
  )
}
