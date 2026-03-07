'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Loader2, Download, Clock, AlertTriangle, LogOut, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch, silentFetch } from '@/lib/api-config'
import { useAntiCheat } from '@/hooks/useAntiCheat'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

const STATUS_STEPS = [
  'PENDING',
  'RULES_COMPLETE',
  'LLM_PROCESSING',
  'LLM_COMPLETE',
  'REPORT_GENERATING',
  'REPORT_READY',
  'EMAIL_SENDING',
  'COMPLETE',
]

export default function StudentClapTestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [assignment, setAssignment] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [submission, setSubmission] = useState<any>(null)
  const [polling, setPolling] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])

  // ── Server-authoritative timer state ──────────────────────────────────────
  const [globalTimeLeft, setGlobalTimeLeft]     = useState<number | null>(null)
  const [isTestLocked, setIsTestLocked]         = useState(false)
  const [timerSyncError, setTimerSyncError]     = useState(false)   // true = poll failed
  const [timerExtended, setTimerExtended]       = useState(false)   // brief flash on extension

  // Stable refs — safe inside callbacks without stale closures
  const deadlineRef         = useRef<Date | null>(null)   // server deadline (UTC)
  const clockOffsetRef      = useRef(0)                   // ms: server_time - client_time
  const extensionCountRef   = useRef(-1)                  // -1 = not yet polled
  const pollingTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAutoSubmitRef     = useRef(false)               // prevents double auto-submit
  const assignmentReadyRef  = useRef(false)               // true once assignment is loaded

  // Completed Components State
  const [submittedComponents, setSubmittedComponents] = useState<string[]>([])

  // Anti-cheat / exit modal state
  const [exitStep, setExitStep] = useState<0 | 1 | 2>(0)
  const [exitConfirmText, setExitConfirmText] = useState('')
  const [tabWarnings, setTabWarnings] = useState(0)

  const submissionId = searchParams.get('submission_id')

  const [globalTotalDuration, setGlobalTotalDuration] = useState<number | null>(null)

  const testIsActive = !!assignment && !isLoading && assignment.status !== 'completed' && !submissionId
  const isOnline = useNetworkStatus()  // H2: offline detection

  // iOS Safari detection (no native requestFullscreen)
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  // Fire-and-forget malpractice event — uses silentFetch so a 401 on this
  // background call NEVER kicks the student out of their active exam.
  const reportMalpractice = useCallback((eventType: string, meta: Record<string, unknown> = {}) => {
    silentFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/malpractice-event`), {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, meta }),
    }).catch(() => { /* network error — silent, integrity log only */ })
  }, [params.assignment_id])

  const { requestFullscreen, exitFullscreen } = useAntiCheat({
    enabled: testIsActive,
    onTabSwitch: (count) => {
      setTabWarnings(count)
      reportMalpractice('tab_switch', { strike: count })
      if (count >= 2 && !isAutoSubmitRef.current) {
        toast.error('Tab switch limit reached — auto-submitting your assessment.')
        handleFinalSubmit(true)
      } else if (count === 1) {
        toast.warning('⚠ Tab switch detected (1/2). One more will auto-submit your test.')
      }
    },
    onFullscreenExit: () => {
      toast.warning('Fullscreen exited — returning to fullscreen.')
      reportMalpractice('fullscreen_exit', { auto_reentry: true })
      requestFullscreen()
    },
  })

  useEffect(() => {
    // H1: AbortController — prevents setState on unmounted component
    const controller = new AbortController()

    const fetchAssignment = async () => {
      try {
        const response = await apiFetch(getApiUrl('student/clap-assignments'), {
          headers: getAuthHeaders(),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        const data = await response.json()

        if (response.ok) {
          const found = data.assignments.find((a: any) => a.assignment_id === params.assignment_id)
          if (found) {
            setAssignment(found)

            // --- Retest: if admin has granted a retest and test is back to 'assigned',
            // clear ALL localStorage progress so the student starts completely fresh.
            if (found.retest_granted && found.status === 'assigned') {
              localStorage.removeItem(`submitted_components_${params.assignment_id}`)
              toast.info('🔄 A retest has been granted. Your previous progress has been cleared. You may begin again.')
            }

            // If not yet submitted, call /start to get a server-anchored start time
            if (found.status !== 'completed') {
              const startResp = await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/start`), {
                method: 'POST',
                headers: getAuthHeaders(),
                signal: controller.signal,
              })
              if (controller.signal.aborted) return
              if (startResp.ok) {
                const startData = await startResp.json()
                // Update the assignment with the definitive started_at
                setAssignment((prev: any) => ({ ...prev, started_at: startData.started_at }))
                setGlobalTotalDuration(startData.total_duration_minutes)
              }
            }
          } else {
            toast.error('Assignment not found')
            router.push('/student/clap-tests')
          }
        } else {
          toast.error('Failed to load assignment')
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return  // H1: expected on unmount
        console.error(error)
        toast.error('Network error')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    if (params.assignment_id) {
      fetchAssignment()
      // Load saved states (only if not cleared above — fetchAssignment runs async, but this runs sync)
      const saved = localStorage.getItem(`submitted_components_${params.assignment_id}`)
      if (saved) {
        try {
          setSubmittedComponents(JSON.parse(saved))
        } catch (e) {
          console.error(e)
        }
      }
    }

    return () => controller.abort()  // H1: cleanup on unmount
  }, [params.assignment_id, router])

  // ── handleFinalSubmit (stable — used by auto-submit + manual submit) ───────
  const handleFinalSubmit = useCallback(async (autoSubmit = false) => {
    if (!autoSubmit && !confirm('Are you sure you want to submit the ENTIRE assessment? You will not be able to make changes.')) return;
    try {
      const idempotencyKey = crypto.randomUUID();
      const submitResp = await apiFetch(getApiUrl('submissions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          assignment_id: params.assignment_id,
          idempotency_key: idempotencyKey,
          correlation_id: idempotencyKey
        })
      });
      if (!submitResp.ok) throw new Error('Submission failed');
      const submissionData  = await submitResp.json();
      const newSubmissionId = submissionData.submission_id;
      toast.success('Test Submitted Successfully!');
      router.push(`/student/clap-tests/${params.assignment_id}?submission_id=${newSubmissionId}`);
    } catch (e) {
      toast.error('Failed to submit test completely.');
      console.error(e);
      isAutoSubmitRef.current = false;   // allow retry on error
    }
  }, [params.assignment_id, router])

  const formatTime = (seconds: number) => {
    const hrs  = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Adaptive polling interval based on remaining seconds ──────────────────
  const getNextPollMs = (remainingSecs: number): number => {
    if (remainingSecs <= 30)  return 1000    // < 30 s  → every second
    if (remainingSecs <= 120) return 3000    // < 2 min → every 3 s
    if (remainingSecs <= 600) return 10000   // < 10 min → every 10 s
    return 30000                             // > 10 min → every 30 s
  }

  // ── Server-authoritative timer: poll /global-timer ────────────────────────
  // Architecture:
  //   POLL → updates deadlineRef + clockOffsetRef + detects extensions
  //   COUNTDOWN → separate 1-s tick reading deadlineRef, triggers auto-submit
  // Separation ensures the countdown is always smooth (no flicker on poll).

  const pollGlobalTimer = useCallback(async () => {
    if (!params.assignment_id || !assignmentReadyRef.current) return
    if (isAutoSubmitRef.current) return  // already submitting — stop polling
    // H2: Pause polling when offline — resume automatically when online event fires
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      pollingTimerRef.current = setTimeout(pollGlobalTimer, 3000)
      return
    }

    try {
      const res = await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/global-timer`), {
        headers: getAuthHeaders()
      })

      // Calibrate client clock from every response
      const serverTimeStr = res.headers.get('X-Server-Time')
      if (serverTimeStr) {
        clockOffsetRef.current = new Date(serverTimeStr).getTime() - Date.now()
      }

      if (!res.ok) {
        setTimerSyncError(true)
        pollingTimerRef.current = setTimeout(pollGlobalTimer, 5000)
        return
      }

      setTimerSyncError(false)
      const data = await res.json()

      // If student has already completed, stop polling
      if (data.assignment_status === 'completed') return

      if (data.deadline_utc) {
        const newDeadline   = new Date(data.deadline_utc)
        const newExtCount   = data.extension_count ?? 0
        const prevExtCount  = extensionCountRef.current

        // Notify student if admin just extended the timer
        if (prevExtCount >= 0 && newExtCount > prevExtCount) {
          const minsLeft = Math.ceil((data.remaining_seconds ?? 0) / 60)
          toast.success(
            `⏱ Time Extended! You now have ${minsLeft} minute${minsLeft !== 1 ? 's' : ''} remaining.`,
            { duration: 8000, icon: '🕐' }
          )
          setTimerExtended(true)
          setTimeout(() => setTimerExtended(false), 3000)
        }

        extensionCountRef.current = newExtCount
        deadlineRef.current       = newDeadline
      }

      // Server says it's already expired — trigger auto-submit immediately
      if (data.is_expired && !isAutoSubmitRef.current) {
        isAutoSubmitRef.current = true
        setIsTestLocked(true)
        setGlobalTimeLeft(0)
        toast.error('⏱ Time has expired — auto-submitting your assessment…', { duration: 8000 })
        handleFinalSubmit(true)
        return
      }

      pollingTimerRef.current = setTimeout(pollGlobalTimer, getNextPollMs(data.remaining_seconds ?? 9999))
    } catch {
      setTimerSyncError(true)
      pollingTimerRef.current = setTimeout(pollGlobalTimer, 5000)
    }
  }, [params.assignment_id, handleFinalSubmit])

  // ── Start polling + enter fullscreen when assignment is loaded ────────────
  useEffect(() => {
    if (!assignment || assignment.status === 'completed' || submissionId) return
    assignmentReadyRef.current = true
    pollGlobalTimer()

    // Enter fullscreen (iOS: CSS class simulation)
    if (isIOS) {
      document.documentElement.classList.add('ios-test-fullscreen')
    } else {
      requestFullscreen()
    }

    return () => {
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current)
      assignmentReadyRef.current = false
      document.documentElement.classList.remove('ios-test-fullscreen')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.assignment_id, !!submissionId])

  // ── Seed deadline from /start response (zero-delay, avoids first-poll gap) ─
  useEffect(() => {
    if (globalTotalDuration !== null && assignment?.started_at && !deadlineRef.current) {
      // Use the deadline from /start if the poll hasn't fired yet
      // This is only a seed; poll will override with the authoritative value
    }
  }, [globalTotalDuration, assignment?.started_at])

  // ── Page Visibility — re-poll immediately when tab re-focuses ────────────
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && assignmentReadyRef.current && !isAutoSubmitRef.current) {
        if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current)
        pollGlobalTimer()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [pollGlobalTimer])

  // ── Local countdown (smooth 1-s tick; reads deadlineRef so no stale state) ─
  // This is purely cosmetic — the deadline is always fetched fresh on each poll.
  useEffect(() => {
    if (assignment?.status === 'completed' || isTestLocked || submissionId) return

    const tick = () => {
      if (!deadlineRef.current) {
        // Fallback: compute from started_at + globalTotalDuration until first poll returns
        if (assignment?.started_at && globalTotalDuration) {
          const startMs  = new Date(assignment.started_at).getTime()
          const adjusted = Date.now() + clockOffsetRef.current
          const remaining = Math.max(0, Math.floor(
            (startMs + globalTotalDuration * 60 * 1000 - adjusted) / 1000
          ))
          setGlobalTimeLeft(remaining)
        }
        return
      }

      const adjusted  = Date.now() + clockOffsetRef.current
      const remaining = Math.max(0, Math.floor((deadlineRef.current.getTime() - adjusted) / 1000))
      setGlobalTimeLeft(remaining)

      if (remaining === 0 && !isAutoSubmitRef.current) {
        isAutoSubmitRef.current = true
        setIsTestLocked(true)
        toast.error('⏱ Time has expired — auto-submitting your assessment…', { duration: 8000 })
        handleFinalSubmit(true)
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.started_at, assignment?.status, globalTotalDuration, isTestLocked, submissionId, handleFinalSubmit])

  useEffect(() => {
    if (!submissionId) return

    let interval: NodeJS.Timeout | null = null
    let stopped = false

    const poll = async () => {
      try {
        setPolling(true)
        const resp = await apiFetch(getApiUrl(`submissions/${submissionId}/status`), {
          headers: getAuthHeaders(),
        })

        if (!resp.ok) return
        const data = await resp.json()
        setSubmission(data)

        if (data.status === 'COMPLETE' || String(data.status || '').startsWith('FAILED')) {
          if (interval) clearInterval(interval)
          stopped = true
        }
      } catch (e) {
        console.error('Submission polling failed', e)
      } finally {
        setPolling(false)
      }
    }

    poll()
    interval = setInterval(poll, 5000)

    return () => {
      if (interval) clearInterval(interval)
      setPolling(false)
    }
  }, [submissionId])

  useEffect(() => {
    if (!submissionId || !submission?.status) return
    if (submission.status !== 'COMPLETE' && !submission.status.startsWith('REPORT_')) return

    const fetchResults = async () => {
      try {
        const resp = await apiFetch(getApiUrl(`submissions/${submissionId}/results`), {
          headers: getAuthHeaders(),
        })
        if (!resp.ok) return
        const data = await resp.json()
        setResults(data)
      } catch (e) {
        console.error('Failed loading results', e)
      }
    }

    fetchResults()
  }, [submissionId, submission])

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const assessmentId = assignment?.test_id || assignment?.clap_test_id || assignment?.id || ''
        const url = assessmentId ? getApiUrl(`submissions/history?assessment_id=${assessmentId}`) : getApiUrl('submissions/history')
        const resp = await apiFetch(url, { headers: getAuthHeaders() })
        if (!resp.ok) return
        const data = await resp.json()
        setHistory(Array.isArray(data.rows) ? data.rows : [])
      } catch (e) {
        console.error('Failed loading history', e)
      }
    }

    if (assignment) fetchHistory()
  }, [assignment])

  const statusProgress = useMemo(() => {
    if (!submission?.status) return 0
    const idx = STATUS_STEPS.indexOf(submission.status)
    if (idx < 0) return 0
    return Math.round(((idx + 1) / STATUS_STEPS.length) * 100)
  }, [submission])

  const overallScore = useMemo(() => {
    if (!results?.scores?.length) return null
    const vals = results.scores.map((s: any) => Number(s.score || 0))
    return Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 100) / 100
  }, [results])

  const reportDownloadUrl = useMemo(() => {
    if (results?.report_download_url) return results.report_download_url
    const ready = history.find((h: any) => Boolean(h.report_download_url))
    return ready?.report_download_url || ''
  }, [results, history])

  const reportIsReady = Boolean(reportDownloadUrl)

  const getIcon = (type: string) => {
    switch (type) {
      case 'listening': return Headphones
      case 'speaking': return Mic
      case 'reading': return BookOpen
      case 'writing': return PenTool
      case 'vocabulary': return Brain
      default: return CheckCircle
    }
  }

  // M1: Skeleton loading state
  if (isLoading) return (
    <div className="min-h-dvh bg-background px-4 py-4 sm:px-6 max-w-4xl mx-auto animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6 mt-2">
        <div className="h-8 w-28 bg-gray-200 rounded" />
        <div className="h-8 w-24 bg-gray-200 rounded" />
      </div>
      {/* Hero banner skeleton */}
      <div className="h-40 bg-indigo-100 rounded-2xl mb-8" />
      {/* Submission progress skeleton */}
      <div className="h-20 bg-gray-100 rounded-xl mb-4" />
      {/* Component tiles */}
      <div className="grid grid-cols-1 gap-4">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl border" />
        ))}
      </div>
    </div>
  )
  if (!assignment) return null

  return (
    <div className="min-h-dvh bg-background">
      {/* H2: Offline banner — fixed at top when no internet */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm font-medium
                        text-center py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          No internet connection — timer sync paused. Reconnect immediately.
        </div>
      )}

      {/* ── Two-step exit confirmation modal ──────────────────────────────── */}
      {exitStep >= 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500 w-7 h-7 flex-shrink-0" />
              <h2 className="text-lg font-bold text-red-700">Exit Test?</h2>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Exiting will forfeit this attempt. Submitted components are saved, but unsubmitted ones will be marked incomplete.
            </p>
            {exitStep === 1 && (
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setExitStep(0)}>
                  Stay in Test
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => setExitStep(2)}>
                  Exit Anyway
                </Button>
              </div>
            )}
            {exitStep === 2 && (
              <>
                <p className="text-sm font-medium mb-3">
                  Type <strong>EXIT</strong> to confirm:
                </p>
                <input
                  type="text"
                  value={exitConfirmText}
                  onChange={e => setExitConfirmText(e.target.value.toUpperCase())}
                  placeholder="Type EXIT"
                  autoFocus
                  className="w-full border-2 border-red-300 rounded-lg px-4 py-3 text-base mb-4
                             outline-none focus:border-red-500"
                />
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1"
                          onClick={() => { setExitStep(0); setExitConfirmText('') }}>
                    Cancel
                  </Button>
                  <Button variant="destructive" className="flex-1"
                          disabled={exitConfirmText !== 'EXIT'}
                          onClick={async () => {
                            await exitFullscreen()
                            document.documentElement.classList.remove('ios-test-fullscreen')
                            router.push('/student/clap-tests')
                          }}>
                    Confirm Exit
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    <div className={`px-4 py-4 sm:px-6 max-w-4xl mx-auto ${!isOnline ? 'pt-12' : ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" className="pl-0 hover:pl-2 transition-all"
                onClick={() => testIsActive ? setExitStep(1) : router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Back to Dashboard</span>
          <span className="sm:hidden">Back</span>
        </Button>
        {testIsActive && (
          <Button variant="ghost" size="sm" onClick={() => setExitStep(1)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[40px]">
            <LogOut className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Exit Test</span>
          </Button>
        )}
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white mb-8 shadow-xl">
        <h1 className="text-3xl font-bold mb-2">{assignment.test_name}</h1>
        <p className="text-indigo-100">Complete all 5 modules to finish the assessment.</p>
        <div className="mt-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-4 items-center">
            <Badge className="bg-white/20 hover:bg-white/30 text-white border-0">
              {assignment.status || 'Pending'}
            </Badge>
            <span className="text-sm text-indigo-200">Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}</span>
          </div>
          {globalTimeLeft !== null && !submissionId && (
            <div className={`px-4 py-2 rounded-xl flex items-center gap-2 font-mono text-xl font-bold border transition-all duration-500 ${
              timerExtended
                ? 'bg-green-500/30 border-green-300/60 scale-105'
                : globalTimeLeft < 120
                  ? 'bg-red-500/30 border-red-300/60 animate-pulse'
                  : globalTimeLeft < 300
                    ? 'bg-orange-400/25 border-orange-300/50'
                    : 'bg-white/10 border-white/20'
            }`}>
              <Clock className={`w-5 h-5 ${timerExtended ? 'text-green-300' : globalTimeLeft < 120 ? 'text-red-300' : ''}`} />
              <span className={
                timerExtended ? 'text-green-200' :
                globalTimeLeft < 120 ? 'text-red-200' :
                globalTimeLeft < 300 ? 'text-orange-200' : ''
              }>
                {formatTime(globalTimeLeft)} left
              </span>
              {timerSyncError && (
                <span className="text-xs text-yellow-300 font-normal ml-1" title="Timer sync failed — retrying">⚠</span>
              )}
            </div>
          )}
        </div>
      </div>

      {submissionId && (
        <Card className="mb-6 border-indigo-200">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Submission Processing</p>
                <p className="font-semibold">Status: {submission?.status || 'Loading...'}</p>
              </div>
              {polling && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full">
              <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${statusProgress}%` }} />
            </div>
            <p className="text-xs text-gray-500">
              {submission?.status === 'COMPLETE'
                ? 'Processing complete. Your report/results are ready.'
                : 'We are processing your submission (rule scoring → LLM evaluation → report generation).'}
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 border-sky-200">
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Assessment Report</p>
            <p className="font-semibold">
              {reportIsReady ? 'Your PDF report is ready to download.' : 'Report is still being generated.'}
            </p>
            {!reportIsReady && (
              <p className="text-xs text-gray-500 mt-1">Fallback: check your latest results in the CLAP dashboard while processing continues.</p>
            )}
          </div>

          {reportIsReady ? (
            <a href={reportDownloadUrl} target="_blank" rel="noreferrer">
              <Button><Download className="w-4 h-4 mr-2" />Download PDF</Button>
            </a>
          ) : (
            <Button variant="outline" onClick={() => router.push('/student/clap-tests')}>
              Go to Dashboard
            </Button>
          )}
        </CardContent>
      </Card>

      {results && (
        <Card className="mb-6 border-green-200">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Latest Result Summary</p>
                <p className="text-xl font-bold">Overall Score: {overallScore ?? '-'} / 10</p>
              </div>
              {results.report_download_url && (
                <a href={results.report_download_url} target="_blank" rel="noreferrer">
                  <Button><Download className="w-4 h-4 mr-2" />Download Report</Button>
                </a>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {results.scores?.map((s: any) => (
                <div key={s.domain} className="rounded-lg border p-3 bg-white">
                  <div className="flex items-center justify-between">
                    <p className="capitalize font-medium">{s.domain}</p>
                    <Badge>{s.score}</Badge>
                  </div>
                  {s.feedback?.overall && <p className="text-sm text-gray-600 mt-2">{s.feedback.overall}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <p className="font-semibold mb-3">Score History</p>
            <div className="space-y-2">
              {history.slice(0, 8).map((row: any) => (
                <div key={row.submission_id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <p className="text-sm">{new Date(row.created_at).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Status: {row.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{row.overall_score ?? '-'} / 10</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab-switch warning banner */}
      {tabWarnings === 1 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-900 font-semibold text-sm">Tab switch detected (1/2)</p>
            <p className="text-yellow-700 text-sm">One more tab switch will automatically submit your entire assessment.</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:gap-4">
        {assignment.components?.map((comp: any) => {
          const Icon = getIcon(comp.type)
          const isSubmitted = submittedComponents.includes(comp.type);
          const isDisabled = isTestLocked || !!submissionId || isSubmitted;

          return (
            <Card
              key={comp.id}
              className={`transition-all border-l-4 touch-manipulation
                ${isSubmitted ? 'border-l-green-500 bg-green-50/10' : 'border-l-indigo-500 cursor-pointer hover:shadow-md'}
                ${isDisabled && !isSubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (!isDisabled) router.push(`/student/clap-tests/${params.assignment_id}/${comp.type}`)
              }}
            >
              <CardContent className="p-4 sm:p-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0
                    ${isSubmitted ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`font-semibold text-base sm:text-lg capitalize truncate
                      ${isSubmitted ? 'text-green-800' : ''}`}>{comp.title}</h3>
                    <p className="text-xs sm:text-sm text-gray-500">
                      {comp.timer_enabled !== false ? `${comp.duration || 10} min` : 'No component timer'} • 10 Marks
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isSubmitted ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 whitespace-nowrap">
                      <CheckCircle className="w-3 h-3 mr-1" /> Submitted
                    </Badge>
                  ) : (
                    <Button size="sm" className="rounded-full px-4 sm:px-6 min-h-[40px] whitespace-nowrap"
                            disabled={isDisabled}>
                      {assignment.started_at ? 'Resume' : 'Start'}
                      <PlayCircle className="w-4 h-4 ml-1.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {!submissionId && assignment.components && submittedComponents.length === assignment.components.length && (
        <div className="mt-8 flex justify-center">
          <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white font-bold text-lg px-12 py-6 rounded-xl shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-[4px]" onClick={() => handleFinalSubmit(false)}>
            Final Submit Entire Assessment
          </Button>
        </div>
      )}
      {!submissionId && !isTestLocked && submittedComponents.length < (assignment.components?.length || 5) && assignment.started_at && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" size="lg" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 font-bold" onClick={() => handleFinalSubmit(false)}>
            Force Submit Assessment Early
          </Button>
        </div>
      )}
    </div>
    </div>
  )
}
