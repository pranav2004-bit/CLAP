'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Loader2, Clock, AlertTriangle, LogOut, WifiOff, ArrowLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import { CubeLoader } from '@/components/ui/CubeLoader'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch, silentFetch } from '@/lib/api-config'
import { useAntiCheat } from '@/hooks/useAntiCheat'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { AutoSubmitOverlay, type AutoSubmitReason, type AutoSubmitStatus } from '@/components/AutoSubmitOverlay'
import { TestModuleRunner } from '@/app/student/clap-tests/[assignment_id]/[type]/page'

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
  // Ref to the active module's palette-open function (registered via onRegisterPaletteOpener).
  // Cleared when the module remounts (new key) and re-registered on each module mount.
  const paletteOpenerRef    = useRef<(() => void) | null>(null)

  // Completed Components State
  const [submittedComponents, setSubmittedComponents] = useState<string[]>([])

  // ── Unified shell: which test module is currently active in the center pane ──
  const [activeTest, setActiveTest] = useState<string | null>(null)
  // Mobile module picker dropdown open/close state
  const [isModuleDropdownOpen, setIsModuleDropdownOpen] = useState(false)

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

  // True when the assignment includes a Speaking module — used to pre-request mic
  // permission before entering fullscreen so the browser dialog doesn't exit fullscreen.
  const hasSpeakingModule = useMemo(
    () => assignment?.components?.some((c: any) => c.type === 'speaking') ?? false,
    [assignment]
  )

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
      if (count >= 3 && !isAutoSubmitRef.current) {
        handleAutoSubmit('tab_switch')
      } else if (count === 1) {
        toast.warning('⚠ Tab switch detected (1/3). Two more will auto-submit your test.')
      } else if (count === 2) {
        toast.warning('⚠ Tab switch detected (2/3). One more will auto-submit your test.')
      }
    },
    onFullscreenExit: () => {
      const newCount = fullscreenExitCountRef.current + 1
      fullscreenExitCountRef.current = newCount
      setFullscreenExitCount(newCount)
      reportMalpractice('fullscreen_exit', { count: newCount, auto_reentry: false })

      if (newCount >= 4) {
        // 4th strike — skip the modal, immediately show blocking overlay
        handleAutoSubmit('client_malpractice')
      } else {
        // 1st, 2nd, or 3rd exit — show blocking modal with 20-second countdown
        if (newCount === 1) {
          toast.warning('1/3 reached limit of the full screen exiting', { duration: 6000 })
        } else if (newCount === 2) {
          toast.warning('2/3 reached limit of the full screen exiting', { duration: 6000 })
        } else {
          toast.warning('3/3 reached limit of the full screen exiting', { duration: 6000 })
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

            // ── Auto-select first incomplete test for the unified shell ──────────
            // Runs after localStorage is loaded so submittedComponents is accurate.
            if (found.status !== 'completed') {
              const savedComponents: string[] = (() => {
                if (found.retest_granted && found.status === 'assigned') return []
                try {
                  const s = localStorage.getItem(`submitted_components_${params.assignment_id}`)
                  return s ? JSON.parse(s) : []
                } catch { return [] }
              })()
              const firstIncomplete = found.components?.find((c: any) => !savedComponents.includes(c.type))
              setActiveTest(firstIncomplete?.type ?? found.components?.[0]?.type ?? null)
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

  // ── handleModuleSubmitted — called by TestModuleRunner after manual submit ──
  // NOTE: confirmSubmit() in [type]/page.tsx writes `type` to localStorage BEFORE
  // calling this callback, so `existing` will already include it. The localStorage
  // write here is a safety net; the state update MUST happen unconditionally.
  const handleModuleSubmitted = useCallback((type: string) => {
    const storageKey = `submitted_components_${params.assignment_id}`
    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]

    // Ensure localStorage is up-to-date (confirmSubmit may have already written it)
    const updated = existing.includes(type) ? existing : [...existing, type]
    if (!existing.includes(type)) {
      localStorage.setItem(storageKey, JSON.stringify(updated))
    }

    // Always sync React state — confirmSubmit only touches localStorage, not this state
    setSubmittedComponents(updated)

    // Auto-advance to next incomplete test
    if (assignment) {
      const next = assignment.components?.find((c: any) => !updated.includes(c.type))
      if (next) {
        setActiveTest(next.type)
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} submitted — moving to next module`)
      } else {
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} submitted — all modules complete!`)
      }
    }
  }, [params.assignment_id, assignment])

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

  // ── Page-unload beacon REMOVED — reload = restore ────────────────────────
  //
  // WHY REMOVED:
  //   pagehide fires on BOTH tab close AND page reload (F5, mobile pull-to-refresh,
  //   browser crash recovery). The old beacon auto-submitted on every pagehide,
  //   meaning any accidental reload permanently ended the student's test — no
  //   warning, no recovery. On mobile browsers beforeunload is silently ignored,
  //   making this especially dangerous.
  //
  // RELOAD = RESTORE:
  //   On reload the page re-mounts, re-fetches items from the server, and
  //   saved_response repopulates every answer automatically. The timer is
  //   server-authoritative (server_deadline) so it continues correctly.
  //   The student resumes exactly where they left off.
  //
  // TAB CLOSE / GENUINE ABANDONMENT:
  //   Three independent backstops handle submission without the beacon:
  //     1. Frontend timer:  handleAutoSubmit('client_timer') fires when time hits 0
  //     2. Beat task:       auto_submit_expired_assignments submits any started
  //                         assignment whose global_deadline has passed
  //     3. Finish button:   _finalize_and_dispatch when all components complete
  //
  // The beforeunload "Leave site?" warning (useAntiCheat) is kept as the first
  // line of defence against accidental navigation on desktop browsers.

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

  // Canonical module display order
  const MODULE_ORDER: Record<string, number> = {
    listening: 0,
    speaking: 1,
    reading: 2,
    writing: 3,
    vocabulary: 4,
  }

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
        className="h-[calc(100dvh-1.875rem)] flex flex-col bg-background overflow-hidden"
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950 px-4">
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950 px-4">
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950 px-4">
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
                // Pre-request microphone permission if a Speaking module exists.
                // This fires the browser permission dialog BEFORE fullscreen so it
                // doesn't interrupt (and exit) the fullscreen session mid-test.
                if (hasSpeakingModule && typeof navigator !== 'undefined' && navigator.mediaDevices) {
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    stream.getTracks().forEach(t => t.stop()) // permission cached; release stream
                  } catch (_e) {
                    // User denied — continue anyway; speaking module handles missing permission
                  }
                }
                await requestFullscreen()
                setShowFullscreenPrompt(false)
              }}
            >
              Enter Fullscreen & Begin
            </button>
          </div>
        </div>
      )}

    {/* ── Slim top bar: back/exit · test name · timer ─────────────────────── */}
    <div className={`flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0 ${!isOnline ? 'mt-8' : ''}`}>
      {/* Left: action button + test name */}
      <div className="flex items-center gap-2 min-w-0">
        {testIsActive ? (
          <button
            onClick={() => setExitStep(1)}
            className="flex items-center gap-1 text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg px-2.5 py-1.5 transition-colors text-xs font-semibold touch-manipulation select-none shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit
          </button>
        ) : (
          <button
            disabled={isBackLoading}
            onClick={() => {
              if (isBackLoading) return
              setIsBackLoading(true)
              router.push('/student/clap-tests')
            }}
            className="flex items-center gap-1 text-gray-500 hover:bg-gray-100 active:bg-gray-200 rounded-lg px-2.5 py-1.5 transition-colors text-xs font-semibold touch-manipulation select-none disabled:opacity-50 shrink-0"
          >
            {isBackLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            Back
          </button>
        )}
        <span className="text-sm font-semibold text-gray-800 truncate">{assignment.test_name}</span>
      </div>

      {/* Right: timer */}
      {(!timerLoaded || globalTimeLeft !== null) && !submissionId && (
        <div className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 font-mono text-sm font-bold border transition-all duration-500 shrink-0 ${
          !timerLoaded
            ? 'bg-gray-100 border-gray-200 text-gray-400'
            : timerExtended
              ? 'bg-green-50 border-green-300 text-green-700 scale-105'
              : globalTimeLeft! < 120
                ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                : globalTimeLeft! < 300
                  ? 'bg-orange-50 border-orange-300 text-orange-700'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
        }`}>
          <Clock className="w-3.5 h-3.5" />
          <span>{timerLoaded ? `${formatTime(globalTimeLeft!)} left` : '--:--'}</span>
          {timerLoaded && timerSyncError && (
            <span className="text-xs text-yellow-500 ml-0.5" title="Timer sync failed — retrying">⚠</span>
          )}
        </div>
      )}
    </div>

    {/* Tab-switch warning banner */}
    {tabWarnings === 1 && (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2.5 flex items-center gap-2.5 shrink-0">
        <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
        <p className="text-yellow-900 text-xs font-medium">Tab switch detected (1/2) — one more will auto-submit the entire assessment.</p>
      </div>
    )}

      {/* ── Post-submission screen (submission_id present) ─────────────────── */}
      {submissionId && (
        <div className="flex-1 flex items-center justify-center px-4 pb-8">
          <div className="flex flex-col items-center gap-6 max-w-sm w-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Assessment Submitted</h2>
              <p className="text-sm text-gray-500">Your assessment has been submitted for evaluation.</p>
            </div>
            <Button
              size="lg"
              disabled={isBackLoading}
              onClick={() => {
                if (isBackLoading) return
                setIsBackLoading(true)
                router.push('/student/clap-tests')
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-10 py-4 rounded-xl disabled:opacity-70"
            >
              {isBackLoading
                ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading…</>
                : <><ArrowLeft className="w-5 h-5 mr-2" />Exit to Dashboard</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Unified assessment interface ───────────────────────────────────── */}
      {!submissionId && (
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">

          {/* ── MOBILE MODULE PICKER: compact dropdown (hidden on lg+) ──────── */}
          <div className="lg:hidden shrink-0 relative bg-white border-b border-gray-100">
            {/* Row: [module switcher — flex-1] | [divider] | [palette button] */}
            <div className="flex items-stretch">

              {/* Left: module switcher trigger */}
              <button
                onClick={() => !isTestLocked && setIsModuleDropdownOpen(o => !o)}
                disabled={isTestLocked}
                className="flex-1 flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
              >
                {(() => {
                  const isAssignmentDone = assignment.status === 'completed' || assignment.status === 'expired'
                  if (activeTest) {
                    const ActiveIcon = getIcon(activeTest)
                    const isSubmitted = submittedComponents.includes(activeTest) || isAssignmentDone
                    return (
                      <>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSubmitted ? 'bg-green-500' : 'bg-indigo-500'}`} />
                        <ActiveIcon className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="text-sm font-semibold text-gray-800 flex-1 truncate">
                          {getDisplayTitle(activeTest, activeTest.charAt(0).toUpperCase() + activeTest.slice(1) + ' Test')}
                        </span>
                      </>
                    )
                  }
                  return <span className="text-sm text-gray-400 flex-1">Select a module…</span>
                })()}
                <span className="text-[11px] text-gray-400 shrink-0 font-medium">
                  {submittedComponents.length}/{assignment.components?.length ?? 0} done
                </span>
                <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isModuleDropdownOpen ? 'rotate-90' : ''}`} />
              </button>

              {/* Divider */}
              <div className="w-px bg-gray-200 shrink-0 my-1.5" />

              {/* Right: open questions palette */}
              <button
                onClick={() => paletteOpenerRef.current?.()}
                disabled={!activeTest || isTestLocked}
                title="Open questions palette"
                className="flex items-center gap-1.5 px-3.5 py-2.5 hover:bg-indigo-50 active:bg-indigo-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation shrink-0"
              >
                <LayoutGrid className="w-4 h-4 text-indigo-600" />
              </button>
            </div>

            {/* Dropdown list */}
            {isModuleDropdownOpen && (
              <>
                {/* Backdrop to close on outside click */}
                <div
                  className="fixed inset-0 z-[150]"
                  onClick={() => setIsModuleDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 shadow-xl z-[160] rounded-b-lg overflow-hidden">
                  {[...(assignment.components ?? [])].sort((a: any, b: any) =>
                    (MODULE_ORDER[a.type] ?? 99) - (MODULE_ORDER[b.type] ?? 99)
                  ).map((comp: any) => {
                    const Icon = getIcon(comp.type)
                    const isAssignmentDone = assignment.status === 'completed' || assignment.status === 'expired'
                    const isSubmitted = submittedComponents.includes(comp.type) || isAssignmentDone
                    const isActive = activeTest === comp.type
                    return (
                      <button
                        key={comp.id}
                        onClick={() => {
                          if (!isTestLocked) setActiveTest(comp.type)
                          setIsModuleDropdownOpen(false)
                        }}
                        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors touch-manipulation
                          ${isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSubmitted ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm flex-1">{getDisplayTitle(comp.type, comp.title)}</span>
                        {isSubmitted && <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── LEFT SIDEBAR (desktop only, lg+) ──────────────────────────── */}
          <div className="hidden lg:flex flex-col bg-white border-r border-gray-100 overflow-y-auto w-56 xl:w-64 shrink-0 justify-between">
            <div className="flex flex-col flex-1">
              {[...(assignment.components ?? [])].sort((a: any, b: any) =>
                (MODULE_ORDER[a.type] ?? 99) - (MODULE_ORDER[b.type] ?? 99)
              ).map((comp: any) => {
                const Icon = getIcon(comp.type)
                const isAssignmentDone = assignment.status === 'completed' || assignment.status === 'expired'
                const isSubmitted = submittedComponents.includes(comp.type) || isAssignmentDone
                const isActive = activeTest === comp.type

                return (
                  <button
                    key={comp.id}
                    onClick={() => { if (!isTestLocked) setActiveTest(comp.type) }}
                    disabled={isTestLocked}
                    className={`
                      flex items-center gap-2.5 px-3 py-3 transition-all touch-manipulation
                      w-full text-left border-l-[3px] border-transparent
                      disabled:cursor-not-allowed disabled:opacity-50
                      ${isActive
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-500 font-semibold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                    `}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSubmitted ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm flex-1">{getDisplayTitle(comp.type, comp.title)}</span>
                    {isSubmitted && <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Grand submit — sidebar bottom (desktop only) */}
            {!submissionId && assignment.status !== 'completed' && assignment.components &&
              submittedComponents.length === assignment.components.length && (
              <div className="p-4 border-t border-gray-100 shrink-0">
                <Button
                  size="sm"
                  disabled={isSubmitting}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold border-b-2 border-green-800 active:border-b-0 active:translate-y-[1px] disabled:opacity-70"
                  onClick={() => handleFinalSubmit(false)}
                >
                  {isSubmitting
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Submitting…</>
                    : <><CheckCircle className="w-4 h-4 mr-1.5" />Final Submit</>}
                </Button>
              </div>
            )}
          </div>

          {/* ── CENTER: Active test module ────────────────────────────────── */}
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            {/* Don't render module content while fullscreen prompt is blocking */}
            {showFullscreenPrompt ? (
              <div className="flex-1 bg-gray-950" />
            ) : activeTest ? (
              <TestModuleRunner
                key={activeTest}
                assignmentId={params.assignment_id as string}
                type={activeTest}
                componentId={assignment.components?.find((c: any) => c.type === activeTest)?.id}
                externalFullscreen
                readOnly={submittedComponents.includes(activeTest)}
                onModuleSubmitted={handleModuleSubmitted}
                onRegisterPaletteOpener={(opener) => { paletteOpenerRef.current = opener }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-6">
                  {(assignment.status === 'completed' || assignment.status === 'expired') ? (
                    <>
                      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-7 h-7 text-green-600" />
                      </div>
                      <p className="text-gray-700 font-semibold text-sm mb-1">Assessment Completed</p>
                      <p className="text-gray-400 text-xs">Select any module from the sidebar to review your answers.</p>
                    </>
                  ) : (
                    <>
                      <Brain className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-500 text-sm font-medium">Select a module to begin</p>
                      <p className="text-gray-400 text-xs mt-1">Choose from the sidebar on the left</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grand submit — bottom bar (mobile only, shown when all submitted) */}
      {!submissionId && assignment.status !== 'completed' && assignment.components &&
        submittedComponents.length === assignment.components.length && (
        <div className="lg:hidden shrink-0 p-4 border-t border-gray-100 bg-white">
          <Button
            size="lg"
            disabled={isSubmitting}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold border-b-4 border-green-800 active:border-b-0 active:translate-y-[4px] disabled:opacity-70"
            onClick={() => handleFinalSubmit(false)}
          >
            {isSubmitting
              ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Submitting…</>
              : 'Final Submit Entire Assessment'}
          </Button>
        </div>
      )}
      </div>
    </>
  )
}
