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
  LayoutDashboard,
} from 'lucide-react'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { authStorage } from '@/lib/auth-storage'

// ── Types ────────────────────────────────────────────────────────────────────

interface HistoryRow {
  submission_id: string
  assessment_id: string
  assessment_name: string | null
  status: string
  overall_score: number | null
  max_score: number | null
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

/** Human-readable status label + tailwind colour class.
 *  Non-complete states are intentionally collapsed to a single neutral badge —
 *  students do not need to see pipeline-internal stages. */
function statusDisplay(status: string): { label: string; cls: string } {
  if (status === 'COMPLETE') {
    return { label: 'Complete', cls: 'bg-green-100 text-green-700' }
  }
  return { label: 'In Progress', cls: 'bg-blue-50 text-blue-600' }
}

/** Friendly domain label */
function domainLabel(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase()
}

/** Score → colour class for the progress bar fill (score is out of 10) */
function scoreColor(score: number): string {
  if (score >= 8) return 'bg-green-500'
  if (score >= 6) return 'bg-blue-500'
  if (score >= 4) return 'bg-amber-500'
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
  // Navigation loading guard — tracks which header button was clicked
  const [navLoadingId, setNavLoadingId] = useState<string | null>(null)
  // Student display name — read from session so header matches dashboard exactly
  const [userName, setUserName]       = useState<string>('')

  useEffect(() => {
    setUserName(authStorage.get('user_name') || '')
  }, [])

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
      const res = await apiFetch(getApiUrl('submissions/history'), { headers: getAuthHeaders() })
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
      const res = await apiFetch(getApiUrl(`submissions/${id}/results`), { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`${res.status}`)
      const data: ResultsDetail = await res.json()
      setDetailCache(prev => ({ ...prev, [id]: data }))
    } catch (_e) {
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
      try { await navigator.share({ title, url }) } catch (_e) { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        alert('Report link copied to clipboard!')
      } catch (_e) {
        alert('Could not copy link. Please copy it manually from your browser.')
      }
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    authStorage.clear()
    router.push('/login')
  }

  // ── Nav with loading guard ────────────────────────────────────────────────
  const handleNav = (id: string, path: string) => {
    if (navLoadingId) return
    setNavLoadingId(id)
    router.push(path)
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
            <span className="font-bold text-gray-900">{Math.round(s.score)}<span className="text-gray-400 font-normal">/10</span></span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-700 ${scoreColor(s.score)}`}
              style={{ width: `${Math.min(100, s.score * 10)}%` }}
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
      <Card key={sub.submission_id} className={`relative border transition-shadow ${isExpanded ? 'shadow-md' : 'hover:shadow-sm'}`}>
        <CardContent className="p-5">

          {/* ── Share button — absolute top-right corner ── */}
          {isComplete && (
            <button
              onClick={(e) => { e.stopPropagation(); handleShare(sub) }}
              className="absolute top-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Share score card"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}

          {/* ── Top row ── */}
          {/* pr-8 reserves 32px on the right so the absolute share button never overlaps text */}
          <div className="flex items-start gap-3 pr-8">

            {/* Icon — fixed 40×40, never shrinks */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isComplete ? 'bg-green-100' : 'bg-gray-100'}`}>
              {isComplete
                ? <Trophy className="w-5 h-5 text-green-600" />
                : <Clock  className="w-5 h-5 text-gray-400" />}
            </div>

            {/* Content column — gets all remaining width */}
            <div className="flex-1 min-w-0">

              {/* Row A: title (truncates) + status badge (fixed, right side) */}
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 leading-tight truncate flex-1 min-w-0">
                  {sub.assessment_name ?? 'CLAP Assessment'}
                </p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${cls}`}>
                  {label}
                </span>
              </div>

              {/* Row B: date — full column width, wraps naturally, never truncates */}
              <p className="text-xs text-gray-400 mt-0.5">
                Submitted {fmtDate(sub.created_at)}
              </p>

              {/* Row C: total score — only when complete */}
              {isComplete && sub.overall_score !== null && (
                <p className="text-xl font-bold text-gray-800 mt-1 leading-tight">
                  {Math.round(sub.overall_score)}
                  <span className="text-xs font-normal text-gray-400">/{sub.max_score ?? 50}</span>
                </p>
              )}
            </div>

          </div>

          {/* ── In-progress message ── */}
          {!isComplete && (
            <div className="mt-4 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-sm text-blue-800">
              <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin text-blue-500" />
              <span>Very soon you are going to receive your score card. Please check back in a few minutes.</span>
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
      {/* Header — identical to dashboard header */}
      <header className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Co-brand: ANITS (dominant) + CLAP */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <Image
                src="/images/anits-logo.png"
                alt="ANITS"
                width={48}
                height={48}
                className="h-12 w-auto object-contain flex-shrink-0 my-0.5"
                priority
              />
              <div className="w-px h-7 bg-border" />
              <Image
                src="/images/clap-logo.png?v=new"
                alt="CLAP Logo"
                width={90}
                height={36}
                className="h-8 w-auto object-contain"
                priority
              />
              <div className="hidden sm:flex flex-col justify-center h-8 border-l border-border pl-3 ml-1">
                <p className="text-sm font-semibold text-primary">Student Portal</p>
              </div>
            </div>

            {/* Nav buttons */}
            <div className="flex items-center gap-2">
              {userName && (
                <span className="hidden md:block text-sm font-medium text-muted-foreground mr-1 max-w-[160px] truncate">{userName}</span>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!!navLoadingId}
                onClick={() => handleNav('dashboard', '/student/dashboard')}
                className="flex items-center gap-1.5 h-9"
              >
                {navLoadingId === 'dashboard'
                  ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  : <LayoutDashboard className="w-4 h-4 shrink-0" />}
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!navLoadingId}
                onClick={() => handleNav('profile', '/student/profile')}
                className="flex items-center gap-1.5 h-9"
              >
                {navLoadingId === 'profile'
                  ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  : <User className="w-4 h-4 shrink-0" />}
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
              <p className="text-sm text-muted-foreground">Your CLAP assessment score cards</p>
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
              <p className="text-sm text-gray-400 mt-1">Complete your assigned exams and your score card will display here.</p>
            </div>
            <Button
              onClick={() => handleNav('assessment', '/student/clap-tests')}
              disabled={!!navLoadingId}
              className="mt-2"
            >
              {navLoadingId === 'assessment'
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…</>
                : 'Go to Assessment'}
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
                <span>All your assessments are complete — your score cards are ready below.</span>
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
