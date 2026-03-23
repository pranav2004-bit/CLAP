'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Loader2, Clock, AlertTriangle, LogOut, WifiOff, ArrowLeft, ChevronRight } from 'lucide-react'
import { CubeLoader } from '@/components/ui/CubeLoader'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch, silentFetch } from '@/lib/api-config'
import { useAntiCheat } from '@/hooks/useAntiCheat'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { AutoSubmitOverlay, type AutoSubmitReason, type AutoSubmitStatus } from '@/components/AutoSubmitOverlay'

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
  // true once the first non-429 timer poll returns — distinguishes "loading" (show --:--)
  // from "no deadline configured" (hide the pill entirely).
  const [timerLoaded, setTimerLoaded]           = useState(false)

  // Stable refs — safe inside callbacks without stale closures
  const deadlineRef         = useRef<Date | null>(null)   // server deadline (UTC)
  const clockOffsetRef      = useRef(0)                   // ms: server_time - client_time
  const extensionCountRef   = useRef(-1)                  // -1 = not yet polled
  const pollingTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  // epoch ms — hard gate that prevents ALL polls (including visibilitychange re-triggers)
  // until the 429 backoff expires. Checked at the TOP of pollGlobalTimer so no path bypasses it.
  const rateLimitUntilRef   = useRef(0)
  const isAutoSubmitRef     = useRef(false)               // prevents double auto-submit
  const assignmentReadyRef  = useRef(false)               // true once assignment is loaded
  const redirectTargetRef   = useRef('/student/clap-tests') // updated by IIFE when submission_id arrives

  // Completed Components State
  const [submittedComponents, setSubmittedComponents] = useState<string[]>([])

  // Button loading states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingComponent, setLoadingComponent] = useState<string | null>(null)
  const [isBackLoading, setIsBackLoading] = useState(false)

  // Anti-cheat / exit modal state
  const [exitStep, setExitStep] = useState<0 | 1 | 2>(0)
  const [exitConfirmText, setExitConfirmText] = useState('')
  const [tabWarnings, setTabWarnings] = useState(0)

  // ── Auto-submit overlay state ────────────────────────────────────────────
  const [autoSubmitActive, setAutoSubmitActive]   = useState(false)
  const [autoSubmitReason, setAutoSubmitReason]   = useState<AutoSubmitReason>('timer')
  const [autoSubmitStatus, setAutoSubmitStatus]   = useState<AutoSubmitStatus>('saving')
  const [redirectCountdown, setRedirectCountdown] = useState(10)

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

  const { requestFullscreen, exitFullscreen, allowNavigation } = useAntiCheat({
    enabled: testIsActive,
    onTabSwitch: (count) => {
      setTabWarnings(count)
      reportMalpractice('tab_switch', { strike: count })
      if (count >= 2 && !isAutoSubmitRef.current) {
        handleAutoSubmit('tab_switch')
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
        // 3rd strike — skip the modal, immediately show blocking overlay
        handleAutoSubmit('client_malpractice')
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
            // IMPORTANT: also clear React state here — the synchronous localStorage
            // read below this async fetch may have loaded stale data from the
            // previous attempt, causing the "Final Submit" button to appear before
            // the student has taken the retest.  Clearing state here (after the
            // fetch resolves) overwrites that stale value and prevents an accidental
            // grand-submission with no responses.
            if (found.retest_granted && found.status === 'assigned') {
              // Retest: wipe stale localStorage AND React state so "Final Submit" never
              // appears before the student re-takes all 5 components.
              localStorage.removeItem(`submitted_components_${params.assignment_id}`)
              setSubmittedComponents([])
              toast.info('🔄 A retest has been granted. Your previous progress has been cleared. You may begin again.')
            } else {
              // Not a retest — safe to restore persisted component progress.
              // Done here (inside the async callback) so it never races against the
              // retest-wipe above: by the time we reach this else-branch we already
              // know there is no retest, so loading localStorage is safe.
              const saved = localStorage.getItem(`submitted_components_${params.assignment_id}`)
              if (saved) {
                try { setSubmittedComponents(JSON.parse(saved)) } catch (_e) { /* corrupt data — ignore */ }
              }
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
      // localStorage restore is now done INSIDE fetchAssignment (after retest check)
      // so it never races with the retest-wipe path.
      fetchAssignment()
    }

    return () => controller.abort()  // H1: cleanup on unmount
  }, [params.assignment_id, router])

  // ── handleFinalSubmit (stable — used by auto-submit + manual submit) ───────
  const handleFinalSubmit = useCallback(async (autoSubmit = false) => {
    if (!autoSubmit && !confirm('Are you sure you want to submit the ENTIRE assessment? You will not be able to make changes.')) return;
    setIsSubmitting(true)
    try {
      let newSubmissionId: string

      if (autoSubmit) {
        // Timer expiry / malpractice: use the unified auto-submit endpoint.
        // Idempotent — handles all component finalization server-side.
        // Falls back to legacy /submissions path if endpoint is unreachable.
        const autoRes = await apiFetch(
          getApiUrl(`student/clap-assignments/${params.assignment_id}/auto-submit`),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ reason: 'client_timer' }),
          }
        )
        if (!autoRes.ok) {
          // Legacy fallback
          const idempotencyKey = crypto.randomUUID()
          const fallbackResp = await apiFetch(getApiUrl('submissions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              assignment_id: params.assignment_id,
              idempotency_key: idempotencyKey,
              correlation_id: idempotencyKey,
            }),
          })
          if (!fallbackResp.ok) throw new Error('Submission failed')
          const fallbackData = await fallbackResp.json()
          newSubmissionId = fallbackData.submission_id
        } else {
          const autoData = await autoRes.json()
          newSubmissionId = autoData.submission_id
        }
      } else {
        // Manual "Final Submit" button: standard /submissions flow
        const idempotencyKey = crypto.randomUUID()
        const submitResp = await apiFetch(getApiUrl('submissions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            assignment_id: params.assignment_id,
            idempotency_key: idempotencyKey,
            correlation_id: idempotencyKey,
          }),
        })
        if (!submitResp.ok) throw new Error('Submission failed')
        const submissionData = await submitResp.json()
        newSubmissionId = submissionData.submission_id
      }

      toast.success('Test Submitted Successfully!')
      router.push(`/student/clap-tests/${params.assignment_id}?submission_id=${newSubmissionId}`)
    } catch (e) {
      toast.error('Failed to submit test completely.')
      console.error(e)
      isAutoSubmitRef.current = false   // allow retry on error
      setIsSubmitting(false)            // re-enable button on error
    }
  }, [params.assignment_id, router])

  // ── handleAutoSubmit ─────────────────────────────────────────────────────
  // Immediately paints the blocking overlay (synchronous state flush), then
  // fires the backend call in a fire-and-forget IIFE — fully parallel to the
  // 10-second redirect countdown. Redirect fires at t=0 regardless of backend.
  const handleAutoSubmit = useCallback(async (reason: string) => {
    if (isAutoSubmitRef.current) return
    isAutoSubmitRef.current = true

    const overlayReason: AutoSubmitReason =
      reason === 'client_timer'       ? 'timer'       :
      reason === 'tab_switch'         ? 'tab_switch'  :
      reason === 'client_malpractice' ? 'malpractice' : 'fullscreen'

    // SYNCHRONOUS — all setState batched by React 18 → overlay paints in one flush
    setAutoSubmitActive(true)
    setAutoSubmitReason(overlayReason)
    setAutoSubmitStatus('saving')
    setRedirectCountdown(10)
    setShowFullscreenExitWarning(false)
    setIsTestLocked(true)

    // Backend IIFE — concurrent with countdown, does NOT block redirect
    ;(async () => {
      try {
        const res = await apiFetch(
          getApiUrl(`student/clap-assignments/${params.assignment_id}/auto-submit`),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ reason }),
          }
        )
        if (res.ok) {
          const data = await res.json()
          if (data.submission_id) {
            redirectTargetRef.current =
              `/student/clap-tests/${params.assignment_id}?submission_id=${data.submission_id}`
          }
          setAutoSubmitStatus('done')
        } else {
          // Legacy fallback: POST /submissions
          const key = crypto.randomUUID()
          const fb = await apiFetch(getApiUrl('submissions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              assignment_id: params.assignment_id,
              idempotency_key: key,
              correlation_id: key,
            }),
          })
          if (fb.ok) {
            const d = await fb.json()
            if (d.submission_id) {
              redirectTargetRef.current =
                `/student/clap-tests/${params.assignment_id}?submission_id=${d.submission_id}`
            }
          }
          setAutoSubmitStatus('done')
        }
      } catch (_e) {
        setAutoSubmitStatus('error')
      }
    })()
  }, [params.assignment_id])

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

    // ── 429 rate-limit gate ────────────────────────────────────────────────
    // MUST be checked at the very top so visibilitychange re-triggers that
    // cancel the backoff timer cannot bypass it.
    const msLeft = rateLimitUntilRef.current - Date.now()
    if (msLeft > 0) {
      pollingTimerRef.current = setTimeout(pollGlobalTimer, msLeft + 100)
      return
    }

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
        if (res.status === 429) {
          // Set the hard gate so even visibilitychange can't bypass the backoff
          const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10)
          const backoffMs  = retryAfter > 0 ? retryAfter * 1000 : 60000
          rateLimitUntilRef.current = Date.now() + backoffMs
          pollingTimerRef.current   = setTimeout(pollGlobalTimer, backoffMs)
          return  // timerLoaded stays false — keep showing --:-- skeleton
        }
        setTimerLoaded(true)
        setTimerSyncError(true)
        pollingTimerRef.current = setTimeout(pollGlobalTimer, 5000)
        return
      }

      // Successful response — clear any residual rate-limit gate
      rateLimitUntilRef.current = 0
      setTimerLoaded(true)
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
        setGlobalTimeLeft(0)
        handleAutoSubmit('client_timer')
        return
      }

      // When timer hasn't started yet (no deadline), poll every 5 s so the
      // student sees it go live within seconds of the admin starting it.
      const nextMs = data.deadline_utc
        ? getNextPollMs(data.remaining_seconds ?? 9999)
        : 5000
      pollingTimerRef.current = setTimeout(pollGlobalTimer, nextMs)
    } catch (_e) {
      setTimerLoaded(true)
      setTimerSyncError(true)
      pollingTimerRef.current = setTimeout(pollGlobalTimer, 5000)
    }
  }, [params.assignment_id, handleAutoSubmit])

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
    handleAutoSubmit('client_malpractice')
  }, [showFullscreenExitWarning, fsExitCountdown, handleAutoSubmit])

  // ── Overlay redirect countdown (1 s tick → navigate at 0) ──────────────
  // IMPORTANT: use window.location.replace (hard nav) instead of router.push.
  // router.push is a no-op when the target URL resolves to the same Next.js
  // route component (hub → hub with ?submission_id param), causing the overlay
  // to be stuck at "0 seconds" forever. Hard nav guarantees the page reloads.
  useEffect(() => {
    if (!autoSubmitActive) return
    if (redirectCountdown <= 0) {
      allowNavigation()   // disable beforeunload guard so hard-nav is silent
      window.location.replace(redirectTargetRef.current)
      return
    }
    const id = setTimeout(() => setRedirectCountdown(p => Math.max(0, p - 1)), 1000)
    return () => clearTimeout(id)
  }, [autoSubmitActive, redirectCountdown, allowNavigation])

  // ── Overlay scroll lock (blocks rubber-band scroll on iOS) ───────────────
  useEffect(() => {
    if (!autoSubmitActive) return
    const origBody = document.body.style.overflow
    const origHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = origBody
      document.documentElement.style.overflow = origHtml
    }
  }, [autoSubmitActive])

  // ── Page Visibility — re-poll immediately when tab re-focuses ────────────
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && assignmentReadyRef.current && !isAutoSubmitRef.current) {
        // Do NOT cancel the backoff timer when we're rate-limited — the 429 gate
        // inside pollGlobalTimer will reschedule at the correct time anyway.
        if (Date.now() < rateLimitUntilRef.current) return
        if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current)
        pollGlobalTimer()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [pollGlobalTimer])

  // ── Page-unload beacon (keepalive fetch, fire-and-forget) ─────────────────
  // Fires when the student closes the browser or navigates away mid-test.
  // Uses fetch keepalive (not sendBeacon) so auth headers can be included.
  // The server Beat task is the backstop if this request doesn't reach the server.
  useEffect(() => {
    if (!params.assignment_id) return
    const handleUnload = () => {
      if (isAutoSubmitRef.current || !assignmentReadyRef.current) return
      fetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/auto-submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason: 'client_unload' }),
        keepalive: true,
      }).catch(() => {})
    }
    window.addEventListener('pagehide', handleUnload)
    return () => window.removeEventListener('pagehide', handleUnload)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.assignment_id])

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
        handleAutoSubmit('client_timer')
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.started_at, assignment?.status, globalTotalDuration, isTestLocked, submissionId, handleAutoSubmit])

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

  // Abbreviate labels that are too long for mobile cards
  const getDisplayTitle = (type: string, title: string): string => {
    switch (type) {
      case 'vocabulary': return 'Verbal Ability'
      default: return title
    }
  }

  // M1: Loading state
  if (isLoading) return <CubeLoader />
  if (!assignment) return null

  return (
    <>
      {/* Blocking overlay — rendered OUTSIDE the inert wrapper so it remains interactive */}
      <AutoSubmitOverlay
        active={autoSubmitActive}
        reason={autoSubmitReason}
        status={autoSubmitStatus}
        countdown={redirectCountdown}
      />

      {/* Main content — made inert while overlay is active (blocks all keyboard + pointer events) */}
      <div
        className="min-h-dvh bg-background overflow-x-hidden"
        {...(autoSubmitActive ? { inert: '' as unknown as boolean } : {})}
        style={autoSubmitActive ? { pointerEvents: 'none', userSelect: 'none' } : undefined}
      >
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
                onClick={() => handleAutoSubmit('client_malpractice')}
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

    <div className={`px-4 py-4 pb-16 sm:px-6 sm:pb-8 max-w-4xl mx-auto ${!isOnline ? 'pt-10 sm:pt-12' : ''}`}>
      {/* Header row — context label on left, action on right */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Assessment</span>
        {testIsActive ? (
          <button
            onClick={() => setExitStep(1)}
            className="flex items-center gap-1.5 text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg px-2.5 py-1.5 transition-colors text-xs font-semibold touch-manipulation select-none"
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit Test
          </button>
        ) : (
          <button
            disabled={isBackLoading}
            onClick={() => {
              if (isBackLoading) return
              setIsBackLoading(true)
              router.push('/student/clap-tests')
            }}
            className="flex items-center gap-1.5 text-gray-500 hover:bg-gray-100 active:bg-gray-200 rounded-lg px-2.5 py-1.5 transition-colors text-xs font-semibold touch-manipulation select-none disabled:opacity-50"
          >
            {isBackLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <ArrowLeft className="w-3.5 h-3.5" />}
            Back
          </button>
        )}
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 sm:p-8 text-white mb-4 sm:mb-6 shadow-xl overflow-hidden">
        <h1 className="text-xl sm:text-3xl font-bold mb-1 sm:mb-2 break-words">{assignment.test_name}</h1>
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

          {/* Right: timer pill
              3 states:
              • !timerLoaded              → --:-- skeleton (first poll pending / 429 backoff)
              • timerLoaded & time > 0    → live countdown with colour coding
              • timerLoaded & time == null → hidden (no deadline configured for this test) */}
          {(!timerLoaded || globalTimeLeft !== null) && !submissionId && (
            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-mono text-lg font-bold border transition-all duration-500 shrink-0 ${
              !timerLoaded
                ? 'bg-white/10 border-white/20 opacity-60'
                : timerExtended
                  ? 'bg-green-500/30 border-green-300/60 scale-105'
                  : globalTimeLeft! < 120
                    ? 'bg-red-500/30 border-red-300/60 animate-pulse'
                    : globalTimeLeft! < 300
                      ? 'bg-orange-400/25 border-orange-300/50'
                      : 'bg-white/10 border-white/20'
            }`}>
              <Clock className={`w-4 h-4 ${
                !timerLoaded ? 'opacity-40' :
                timerExtended ? 'text-green-300' :
                globalTimeLeft! < 120 ? 'text-red-300' : ''
              }`} />
              <span className={
                !timerLoaded ? 'text-white/50' :
                timerExtended ? 'text-green-200' :
                globalTimeLeft! < 120 ? 'text-red-200' :
                globalTimeLeft! < 300 ? 'text-orange-200' : ''
              }>
                {timerLoaded ? `${formatTime(globalTimeLeft!)} left` : '--:--'}
              </span>
              {timerLoaded && timerSyncError && (
                <span className="text-xs text-yellow-300 font-normal ml-1" title="Timer sync failed — retrying">⚠</span>
              )}
            </div>
          )}
        </div>
      </div>


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

      {/* ── Component list — clean, compact, Apple-style rows ──────────────── */}
      <div className="space-y-2">
        {assignment.components?.map((comp: any) => {
          const Icon = getIcon(comp.type)
          const isSubmitted = submittedComponents.includes(comp.type)
          const isAssignmentDone = assignment.status === 'completed' || assignment.status === 'expired'
          const isDisabled  = isAssignmentDone || isTestLocked || !!submissionId || isSubmitted
          const isNavigating = loadingComponent === comp.type

          return (
            <div
              key={comp.id}
              onClick={() => {
                if (!isDisabled && !loadingComponent) {
                  setLoadingComponent(comp.type)
                  router.push(`/student/clap-tests/${params.assignment_id}/${comp.type}`)
                }
              }}
              className={`
                bg-white rounded-2xl border overflow-hidden touch-manipulation
                transition-all duration-150
                ${isSubmitted
                  ? 'border-green-100 bg-green-50/40'
                  : isDisabled
                    ? 'border-gray-100 opacity-50 cursor-not-allowed'
                    : 'border-gray-100 cursor-pointer active:scale-[0.985] active:shadow-inner hover:border-indigo-100 hover:shadow-md'}
              `}
            >
              <div className="flex items-center gap-3 px-4 py-3.5">

                {/* Icon badge */}
                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center
                  ${isSubmitted ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-600'}`}>
                  {isNavigating
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <Icon className="w-5 h-5" />}
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-snug truncate
                    ${isSubmitted ? 'text-green-800' : 'text-gray-900'}`}>{getDisplayTitle(comp.type, comp.title)}</p>
                </div>

                {/* Status / action chip */}
                {isSubmitted ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs font-bold">Done</span>
                  </div>
                ) : (
                  <div className={`flex items-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] font-bold flex-shrink-0 whitespace-nowrap
                    ${isDisabled ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white'}`}>
                    {isNavigating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        {assignment.started_at ? 'Resume' : 'Start'}
                        <ChevronRight className="w-3 h-3 ml-0.5" />
                      </>
                    )}
                  </div>
                )}

              </div>
            </div>
          )
        })}
      </div>

      {/* Exit to Dashboard — shown on the post-submission screen */}
      {submissionId && (
        <div className="mt-6 sm:mt-8 flex justify-center">
          <Button
            size="lg"
            disabled={isBackLoading}
            onClick={() => {
              if (isBackLoading) return
              setIsBackLoading(true)
              router.push('/student/clap-tests')
            }}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-10 py-4 rounded-xl disabled:opacity-70"
          >
            {isBackLoading
              ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading…</>
              : <><ArrowLeft className="w-5 h-5 mr-2" />Exit to Dashboard</>}
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
    </>
  )
}
