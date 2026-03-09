'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Loader2, Clock, AlertTriangle, LogOut, WifiOff, ArrowLeft } from 'lucide-react'
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

  // Fullscreen prompt — shown once when test loads so user gesture can grant fullscreen
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false)
  // Fullscreen exit warning — blocking modal when student exits fullscreen mid-test
  const [showFullscreenExitWarning, setShowFullscreenExitWarning] = useState(false)
  // Fullscreen exit strike tracking: 1st/2nd → modal + 20 s countdown; 3rd → instant auto-submit
  const fullscreenExitCountRef = useRef(0)
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0)
  const [fsExitCountdown, setFsExitCountdown] = useState(20)

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

  // Button loading states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingComponent, setLoadingComponent] = useState<string | null>(null)

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
      const newCount = fullscreenExitCountRef.current + 1
      fullscreenExitCountRef.current = newCount
      setFullscreenExitCount(newCount)
      reportMalpractice('fullscreen_exit', { count: newCount, auto_reentry: false })

      if (newCount >= 3) {
        // 3rd strike — skip the modal, immediately auto grand submit
        toast.error(
          'You have reached the limit of exiting fullscreen — all 5 tests are auto grand submitted.',
          { duration: 8000 }
        )
        if (!isAutoSubmitRef.current) {
          isAutoSubmitRef.current = true
          handleFinalSubmit(true)
        }
      } else {
        // 1st or 2nd exit — show blocking modal with 20-second countdown
        if (newCount === 1) {
          toast.warning('1/2 reached limit of the full screen existing', { duration: 6000 })
        } else {
          toast.warning('2/2 reached limit of the full screen existing', { duration: 6000 })
        }
        setFsExitCountdown(20)
        setShowFullscreenExitWarning(true)
      }
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
    setIsSubmitting(true)
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
      setIsSubmitting(false)             // re-enable button on error
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

      // When timer hasn't started yet (no deadline), poll every 5 s so the
      // student sees it go live within seconds of the admin starting it.
      const nextMs = data.deadline_utc
        ? getNextPollMs(data.remaining_seconds ?? 9999)
        : 5000
      pollingTimerRef.current = setTimeout(pollGlobalTimer, nextMs)
    } catch {
      setTimerSyncError(true)
      pollingTimerRef.current = setTimeout(pollGlobalTimer, 5000)
    }
  }, [params.assignment_id, handleFinalSubmit])

  // ── Start polling + show fullscreen prompt when assignment is loaded ────────
  useEffect(() => {
    if (!assignment || assignment.status === 'completed' || submissionId) return
    assignmentReadyRef.current = true
    pollGlobalTimer()

    // iOS: apply CSS fullscreen simulation immediately (no gesture needed)
    if (isIOS) {
      document.documentElement.classList.add('ios-test-fullscreen')
    } else {
      // Desktop/Android: must be triggered from a user click — show the prompt
      setShowFullscreenPrompt(true)
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

  // ── Fullscreen-exit 20 s countdown tick ────────────────────────────────────
  // Each second, decrement the counter while the warning modal is open.
  useEffect(() => {
    if (!showFullscreenExitWarning || fsExitCountdown <= 0) return
    const id = setTimeout(() => setFsExitCountdown(prev => Math.max(0, prev - 1)), 1000)
    return () => clearTimeout(id)
  }, [showFullscreenExitWarning, fsExitCountdown])

  // ── Auto-submit when the 20 s countdown expires ────────────────────────────
  useEffect(() => {
    if (!showFullscreenExitWarning || fsExitCountdown !== 0) return
    setShowFullscreenExitWarning(false)
    if (!isAutoSubmitRef.current) {
      isAutoSubmitRef.current = true
      handleFinalSubmit(true)
    }
  }, [showFullscreenExitWarning, fsExitCountdown, handleFinalSubmit])

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


  const statusProgress = useMemo(() => {
    if (!submission?.status) return 0
    const idx = STATUS_STEPS.indexOf(submission.status)
    if (idx < 0) return 0
    return Math.round(((idx + 1) / STATUS_STEPS.length) * 100)
  }, [submission])

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
      <div className="h-28 sm:h-40 bg-indigo-100 rounded-2xl mb-6 sm:mb-8" />
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

      {/* ── Fullscreen exit warning — blocks exam until student re-enters or submits ── */}
      {showFullscreenExitWarning && !isAutoSubmitRef.current && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">

            {/* Strike count badge */}
            <div className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full mb-5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {fullscreenExitCount}/2 reached limit of full screen existing
            </div>

            {/* Warning icon */}
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Fullscreen Exited</h2>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              You are not allowed to continue the exam outside fullscreen.
              Return to fullscreen to resume, or submit what you have completed so far.
            </p>

            {/* 2nd exit extra warning */}
            {fullscreenExitCount === 2 && (
              <div className="bg-orange-50 border border-orange-300 rounded-lg px-3 py-2.5 mb-4 text-left">
                <p className="text-xs text-orange-800 font-semibold leading-relaxed">
                  ⚠ Next time exiting fullscreen will auto grand submit all 5 component tests immediately.
                </p>
              </div>
            )}

            {/* 20-second countdown ring */}
            <div className="flex flex-col items-center gap-2 mb-5">
              <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-colors ${
                fsExitCountdown <= 5
                  ? 'border-red-500 bg-red-50'
                  : fsExitCountdown <= 10
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-yellow-400 bg-yellow-50'
              }`}>
                <span className={`text-2xl font-bold font-mono tabular-nums ${
                  fsExitCountdown <= 5 ? 'text-red-600' :
                  fsExitCountdown <= 10 ? 'text-orange-600' : 'text-yellow-700'
                }`}>{fsExitCountdown}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed max-w-[240px]">
                If you do not click any button, the test will be{' '}
                <strong className="text-red-600">auto grand submitted</strong>{' '}
                when the timer reaches 0.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {/* Primary: return to fullscreen */}
              <button
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
                onClick={async () => {
                  await requestFullscreen()
                  setShowFullscreenExitWarning(false)
                }}
              >
                Return to Fullscreen
              </button>
              {/* Destructive: grand submit immediately */}
              <button
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl transition-colors"
                onClick={() => {
                  setShowFullscreenExitWarning(false)
                  if (!isAutoSubmitRef.current) {
                    isAutoSubmitRef.current = true
                    handleFinalSubmit(true)
                  }
                }}
              >
                Submit Full Exam &amp; Exit
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              This incident has been recorded.
            </p>
          </div>
        </div>
      )}

      {/* ── Fullscreen prompt — must be a direct click to satisfy browser policy ── */}
      {showFullscreenPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Fullscreen Required</h2>
            <p className="text-sm text-gray-500 mb-6">
              This assessment must be taken in fullscreen mode. Tab switching is monitored.
            </p>
            <button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
              onClick={async () => {
                await requestFullscreen()
                setShowFullscreenPrompt(false)
              }}
            >
              Enter Fullscreen & Begin
            </button>
          </div>
        </div>
      )}

    <div className={`px-4 py-4 sm:px-6 max-w-4xl mx-auto ${!isOnline ? 'pt-10 sm:pt-12' : ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-end mb-6">
        {testIsActive ? (
          <Button variant="ghost" size="sm" onClick={() => setExitStep(1)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[40px]">
            <LogOut className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Exit Test</span>
          </Button>
        ) : (
          <Button variant="ghost" size="sm"
                  onClick={() => router.push('/student/clap-tests')}
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 min-h-[40px]">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Dashboard
          </Button>
        )}
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 sm:p-8 text-white mb-6 sm:mb-8 shadow-xl">
        <h1 className="text-xl sm:text-3xl font-bold mb-1 sm:mb-2">{assignment.test_name}</h1>
        <p className="text-sm sm:text-base text-indigo-100">
          Complete all {assignment.components?.length ?? 0} modules to finish the assessment.
        </p>

        {/* ── Meta row: status · date · timer ── */}
        <div className="mt-3 sm:mt-4 flex items-center justify-between gap-3 flex-wrap">
          {/* Left: badge + date */}
          <div className="flex items-center gap-2 min-w-0">
            <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 capitalize shrink-0">
              {assignment.status || 'pending'}
            </Badge>
            <span className="text-xs text-indigo-200 truncate">
              {new Date(assignment.assigned_at).toLocaleDateString()}
            </span>
          </div>

          {/* Right: timer pill */}
          {globalTimeLeft !== null && !submissionId && (
            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-mono text-lg font-bold border transition-all duration-500 shrink-0 ${
              timerExtended
                ? 'bg-green-500/30 border-green-300/60 scale-105'
                : globalTimeLeft < 120
                  ? 'bg-red-500/30 border-red-300/60 animate-pulse'
                  : globalTimeLeft < 300
                    ? 'bg-orange-400/25 border-orange-300/50'
                    : 'bg-white/10 border-white/20'
            }`}>
              <Clock className={`w-4 h-4 ${timerExtended ? 'text-green-300' : globalTimeLeft < 120 ? 'text-red-300' : ''}`} />
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
                <p className="text-sm text-gray-500">Assessment Submitted</p>
                <p className="font-semibold">
                  {submission?.status === 'COMPLETE'
                    ? 'Your assessment has been evaluated successfully.'
                    : 'Your assessment is being evaluated. You will be notified once results are ready.'}
                </p>
              </div>
              {polling && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full">
              <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${statusProgress}%` }} />
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

          const isNavigating = loadingComponent === comp.type

          return (
            <Card
              key={comp.id}
              className={`transition-all border-l-4 touch-manipulation
                ${isSubmitted ? 'border-l-green-500 bg-green-50/10' : 'border-l-indigo-500 cursor-pointer hover:shadow-md'}
                ${isDisabled && !isSubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (!isDisabled && !loadingComponent) {
                  setLoadingComponent(comp.type)
                  router.push(`/student/clap-tests/${params.assignment_id}/${comp.type}`)
                }
              }}
            >
              <CardContent className="p-3 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0
                    ${isSubmitted ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {isNavigating
                      ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    }
                  </div>
                  <div className="min-w-0">
                    <h3 className={`font-semibold text-sm sm:text-base capitalize truncate
                      ${isSubmitted ? 'text-green-800' : 'text-gray-900'}`}>{comp.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {comp.timer_enabled !== false ? `${comp.duration || 10} min` : 'No timer'}
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
                            disabled={isDisabled || isNavigating}>
                      {isNavigating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          {assignment.started_at ? 'Resume' : 'Start'}
                          <PlayCircle className="w-4 h-4 ml-1.5" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Exit to Dashboard — shown on the post-submission screen */}
      {submissionId && (
        <div className="mt-6 sm:mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={() => router.push('/student/clap-tests')}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-10 py-4 rounded-xl"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Exit to Dashboard
          </Button>
        </div>
      )}

      {!submissionId && assignment.status !== 'completed' && assignment.components && submittedComponents.length === assignment.components.length && (
        <div className="mt-6 sm:mt-8 flex justify-center px-0">
          <Button
            size="lg"
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold text-base sm:text-lg px-8 sm:px-12 py-5 sm:py-6 rounded-xl shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-[4px] disabled:opacity-70 disabled:cursor-not-allowed"
            onClick={() => handleFinalSubmit(false)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Final Submit Entire Assessment'
            )}
          </Button>
        </div>
      )}
    </div>
    </div>
  )
}
