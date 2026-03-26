'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ChevronRight, ChevronLeft, ChevronDown, CheckCircle, WifiOff, Clock, Flag, RotateCcw, LayoutGrid, X, AlertCircle, AlertTriangle, Maximize2, ShieldAlert, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch, silentFetch } from '@/lib/api-config'
import { AutoSubmitOverlay, type AutoSubmitReason, type AutoSubmitStatus } from '@/components/AutoSubmitOverlay'
import AudioRecorderItem from '@/components/audio-recorder'
import AudioBlockPlayer from '@/components/AudioBlockPlayer'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useAntiCheat } from '@/hooks/useAntiCheat'
import { CubeLoader } from '@/components/ui/CubeLoader'

// Question classification helper
const isQuestion = (itemType: string): boolean => {
    return itemType === 'mcq' || itemType === 'subjective' || itemType === 'audio_recording'
}

/**
 * Enterprise-grade word counter.
 *
 * Rules (aligned with industry-standard word processors):
 *  - Trims leading/trailing whitespace before counting.
 *  - Splits on any Unicode whitespace sequence (\s+) — handles spaces, tabs,
 *    newlines, and mixed whitespace uniformly.
 *  - Filters out empty tokens produced by consecutive delimiters.
 *  - Empty / whitespace-only string → 0.
 *  - Hyphenated compounds ("well-being") count as 1 word (correct per AP/Chicago style).
 *  - Numbers, punctuation-attached tokens ("hello," "world.") count as 1 word each.
 *
 * This is the same algorithm used by Google Docs, Microsoft Word, and Grammarly.
 * Zero third-party dependencies — pure regex, O(n) time, O(n) space.
 */
function countWords(text: string): number {
    if (!text) return 0
    const trimmed = text.trim()
    if (!trimmed) return 0
    return trimmed.split(/\s+/).filter(Boolean).length
}

// M4: Retry helper with exponential backoff (0.5s, 1s, 2s)
// Retry strategy:
//   5xx / network errors  → retry (transient server/network failures)
//   429 Too Many Requests → wait for Retry-After header then retry (rate-limit is transient)
//   other 4xx            → return immediately (permanent client error — no retry)
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error = new Error('Unknown error')
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await apiFetch(url, options)
            if (res.ok) return res
            if (res.status === 429) {
                // Rate limited — honour Retry-After header with a 3 s minimum so we
                // don't hammer the server with near-instant retries (500 ms was too short).
                const retryAfterSec = parseInt(res.headers.get('Retry-After') || '0', 10)
                const backoffMs = retryAfterSec > 0 ? retryAfterSec * 1000 : Math.pow(2, attempt) * 3000
                await new Promise(resolve => setTimeout(resolve, backoffMs))
                throw new Error(`HTTP 429 (attempt ${attempt + 1})`)
            }
            if (res.status >= 400 && res.status < 500) return res  // permanent 4xx — return as-is
            throw new Error(`HTTP ${res.status}`)
        } catch (err) {
            lastError = err as Error
            if (attempt < maxRetries - 1 && !(err instanceof Error && err.message.startsWith('HTTP 429'))) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500))
            }
        }
    }
    throw lastError
}

// ── Embedded-mode props (used by the unified assessment shell) ─────────────
// When all props are undefined (standalone route access), the component reads
// assignment_id and type from the URL via useParams() — identical to the
// previous behaviour. When props are provided, they override useParams().
interface TestModuleRunnerProps {
    assignmentId?: string
    type?: string
    /** When true: hub shell manages fullscreen + anti-cheat. Module skips both. */
    externalFullscreen?: boolean
    /** Called after a successful manual module submit (replaces router.push in unified mode). */
    onModuleSubmitted?: (type: string) => void
}

// Named export so [assignment_id]/page.tsx can import without dynamic route paths.
export { ClapTestTakingPage as TestModuleRunner }

export default function ClapTestTakingPage({
    assignmentId: propsAssignmentId,
    type: propsType,
    externalFullscreen = false,
    onModuleSubmitted,
}: TestModuleRunnerProps = {}) {
    const routeParams = useParams()
    // Stable params object — uses props when in unified mode, URL params when standalone
    const params = {
        assignment_id: propsAssignmentId ?? (routeParams?.assignment_id as string),
        type: propsType ?? (routeParams?.type as string),
    } as const
    const router  = useRouter()
    const isOnline = useNetworkStatus()

    const [items, setItems]                 = useState<any[]>([])
    const [currentItemIndex, setCurrentItemIndex] = useState(0)
    const [answers, setAnswers]             = useState<Record<string, any>>({})
    const [isLoading, setIsLoading]         = useState(true)
    const [loadError, setLoadError]         = useState(false)
    // Incrementing this causes the fetch useEffect to re-run (retry on error)
    const [retryKey, setRetryKey]           = useState(0)
    const [componentId, setComponentId]     = useState<string | null>(null)

    // Palette / sidebar state
    const [visited, setVisited]             = useState<Set<number>>(new Set([0]))
    const [marked, setMarked]               = useState<Set<number>>(new Set())
    const [isPaletteOpen, setIsPaletteOpen] = useState(false)

    // Submit confirmation modal
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [isSubmitting, setIsSubmitting]       = useState(false)

    // H3: Auto-save status indicator
    const [saveStatus, setSaveStatus]       = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const saveStatusTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Stores the exact payload that failed so the background retry can resend it
    const failedSavePayloadRef  = useRef<{ item_id: string; response_data: any } | null>(null)
    const saveRetryIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
    // Debounce timer for text-input saves (prevents a request per keystroke)
    const saveDebounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Guard: once the assignment is completed/expired stop all further save attempts
    const isAssignmentDoneRef   = useRef(false)

    // ── Anti-cheat / fullscreen state ─────────────────────────────────────────
    const [showFullscreenModal, setShowFullscreenModal] = useState(false)
    const [tabWarnings, setTabWarnings]                 = useState(0)
    const isAutoSubmitRef        = useRef(false)
    const forceSubmitRef         = useRef<() => void>(() => {})  // forward-ref: breaks circular dep
    const hasAutoSubmittedRef    = useRef(false)                 // gate: only one auto-submit per page load
    // ── Auto-submit blocking overlay state ───────────────────────────────────
    // The overlay is shown immediately (synchronous state set) when auto-submit is
    // triggered — NO toast fires before it. The countdown ticks independently of
    // the backend call; redirect happens when countdown reaches 0.
    const [autoSubmitActive, setAutoSubmitActive]   = useState(false)
    const [autoSubmitReason, setAutoSubmitReason]   = useState<AutoSubmitReason>('timer')
    const [autoSubmitStatus, setAutoSubmitStatus]   = useState<AutoSubmitStatus>('saving')
    const [redirectCountdown, setRedirectCountdown] = useState(10)
    // Ref for redirect target: updated by backend IIFE (avoids stale closure in redirect effect)
    const redirectTargetRef = useRef(`/student/clap-tests/${params.assignment_id}`)
    // Fullscreen exit strike tracking: 1st/2nd → modal + 20 s countdown; 3rd → instant auto-submit
    const fullscreenExitCountRef = useRef(0)
    const [fullscreenExitCount, setFullscreenExitCount] = useState(0)
    const [fsExitCountdown, setFsExitCountdown]         = useState(20)
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

    // ── Global timer ──────────────────────────────────────────────────────────
    const [globalTimeLeft, setGlobalTimeLeft] = useState<number | null>(null)
    // true once the first timer poll returns (success or no-deadline); used to
    // distinguish "loading" (--:--) from "no timer configured" (hide widget)
    const [timerLoaded, setTimerLoaded] = useState(false)
    const deadlineRef     = useRef<Date | null>(null)
    const clockOffsetRef  = useRef(0)
    const timerPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // epoch ms — hard gate preventing 429-hammering; checked at top of poll
    const rateLimitUntilRef = useRef(0)

    const formatTime = (seconds: number) => {
        const hrs  = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // ── Fetch items ───────────────────────────────────────────────────────────
    // fetchWithRetry (defined above) transparently handles:
    //   • 5xx / network errors  → exponential backoff, up to 3 attempts (0.5s, 1s, 2s)
    //   • 429 Too Many Requests → honours Retry-After header, then retries
    //   • other 4xx             → returns immediately (permanent client error)
    //
    // On unrecoverable failure, loadError is set to true and a full-page error
    // UI is shown with a manual "Retry" button (see render below).
    // retryKey increment from that button causes this useEffect to re-run cleanly.
    useEffect(() => {
        const controller = new AbortController()

        const fetchTestContent = async () => {
            try {
                // ── Step 1: Resolve component ID from assignment list ────────────
                // fetchWithRetry auto-retries 5xx/429; permanent 4xx passes through.
                const assignmentResponse = await fetchWithRetry(
                    getApiUrl('student/clap-assignments'),
                    { headers: getAuthHeaders(), signal: controller.signal },
                )
                if (controller.signal.aborted) return
                const assignmentData = await assignmentResponse.json()

                if (!assignmentResponse.ok) {
                    console.error('Assignments fetch failed:', assignmentResponse.status)
                    setLoadError(true)
                    return
                }

                const myAssignment = assignmentData.assignments.find((a: any) => a.assignment_id === params.assignment_id)
                if (!myAssignment) { setLoadError(true); return }

                const component = myAssignment.components.find((c: any) => c.type === params.type)
                if (!component) { setLoadError(true); return }

                setComponentId(component.id)

                // ── Step 2: Fetch questions + saved responses ────────────────────
                const itemsResponse = await fetchWithRetry(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${component.id}/items`),
                    { headers: getAuthHeaders(), signal: controller.signal },
                )
                if (controller.signal.aborted) return
                const itemsData = await itemsResponse.json()

                if (itemsResponse.ok) {
                    setItems(itemsData.items)
                    const savedAnswers: Record<string, any> = {}
                    itemsData.items.forEach((item: any) => {
                        // Use != null (not falsy) so that option A (index 0) is
                        // pre-loaded correctly — `if (0)` is falsy and would silently
                        // drop the student's saved answer for the first MCQ option.
                        if (item.saved_response != null) savedAnswers[item.id] = item.saved_response
                    })
                    setAnswers(savedAnswers)
                } else {
                    // Non-retryable 4xx (e.g. 403, 404) — show error UI
                    console.error('Items fetch failed:', itemsResponse.status)
                    setLoadError(true)
                }
            } catch (error) {
                if ((error as Error).name === 'AbortError') return
                // All retries exhausted (network down, persistent 5xx, etc.)
                console.error('fetchTestContent failed after retries:', error)
                setLoadError(true)
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        if (params.assignment_id && params.type) fetchTestContent()
        return () => controller.abort()
    // retryKey increments when the student clicks "Retry" in the error UI
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.assignment_id, params.type, retryKey])

    // ── Mark item as visited when navigating ─────────────────────────────────
    useEffect(() => {
        setVisited(prev => new Set(prev).add(currentItemIndex))
    }, [currentItemIndex])

    // ── Poll global timer ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!params.assignment_id) return
        const poll = async () => {
            // Rate-limit gate — prevents hammering after a 429 response
            const msLeft = rateLimitUntilRef.current - Date.now()
            if (msLeft > 0) {
                timerPollingRef.current = setTimeout(poll, msLeft + 100)
                return
            }
            try {
                const res = await apiFetch(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/global-timer`),
                    { headers: getAuthHeaders() }
                )
                const serverTime = res.headers.get('X-Server-Time')
                if (serverTime) clockOffsetRef.current = new Date(serverTime).getTime() - Date.now()

                if (res.ok) {
                    const data = await res.json()
                    if (data.deadline_utc) deadlineRef.current = new Date(data.deadline_utc)
                    setTimerLoaded(true)  // first successful poll — show real time or hide widget
                    rateLimitUntilRef.current = 0
                } else if (res.status === 429) {
                    // Back off — DO NOT mark timerLoaded so --:-- stays visible
                    const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10)
                    const backoffMs  = retryAfter > 0 ? retryAfter * 1000 : 60000
                    rateLimitUntilRef.current = Date.now() + backoffMs
                    timerPollingRef.current   = setTimeout(poll, backoffMs)
                    return
                } else {
                    setTimerLoaded(true)  // non-429 error → no timer configured
                }
            } catch (_e) { /* silent — network error; next tick in 30 s */ }
            timerPollingRef.current = setTimeout(poll, 30000)
        }
        poll()
        return () => { if (timerPollingRef.current) clearTimeout(timerPollingRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.assignment_id])

    // ── Smooth 1-second countdown ─────────────────────────────────────────────
    useEffect(() => {
        const tick = () => {
            if (!deadlineRef.current) return
            const adjusted  = Date.now() + clockOffsetRef.current
            const remaining = Math.max(0, Math.floor((deadlineRef.current.getTime() - adjusted) / 1000))
            setGlobalTimeLeft(remaining)
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    // ── Malpractice reporter (fire-and-forget, never blocks the student) ──────
    const reportMalpractice = useCallback((eventType: string, meta: Record<string, unknown> = {}) => {
        silentFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/malpractice-event`), {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_type: eventType, meta }),
        }).catch(() => {})
    }, [params.assignment_id])

    // ── Anti-cheat callbacks — stable refs so the fullscreenchange listener is
    // not torn down and re-added on every render (timer tick, auto-save, etc.)
    const handleTabSwitch = useCallback((count: number) => {
        setTabWarnings(count)
        reportMalpractice('tab_switch', { strike: count, component_type: params.type })
        if (count === 1) {
            // Informational warning — NOT an auto-submit; toast is appropriate here
            toast.warning('⚠ Tab switch detected (1/2). One more will auto-submit your assessment.')
        } else if (count >= 2 && !isAutoSubmitRef.current) {
            // 2nd strike: auto-submit. Overlay appears immediately — no toast.
            forceSubmitRef.current()
        }
    }, [reportMalpractice, params.type])

    const handleFullscreenExit = useCallback(() => {
        const newCount = fullscreenExitCountRef.current + 1
        fullscreenExitCountRef.current = newCount
        setFullscreenExitCount(newCount)
        reportMalpractice('fullscreen_exit', { strike: newCount, component_type: params.type })

        if (newCount >= 3) {
            // 3rd strike — immediate auto-submit. Overlay appears — no toast.
            if (!isAutoSubmitRef.current) {
                isAutoSubmitRef.current = true
                forceSubmitRef.current()
            }
        } else {
            // 1st or 2nd exit — show blocking modal with 20-second countdown.
            // These toasts are informational (NOT auto-submitting yet), kept intentionally.
            if (newCount === 1) {
                toast.warning('1/2 fullscreen exits used. One more will auto-submit immediately.', { duration: 6000 })
            } else {
                toast.warning('2/2 fullscreen exits used. Next exit will auto-submit immediately.', { duration: 6000 })
            }
            setFsExitCountdown(20)
            setShowFullscreenModal(true)
        }
    }, [reportMalpractice, params.type])

    // ── Anti-cheat hook ───────────────────────────────────────────────────────
    // onTabSwitch calls forceSubmitRef.current() — a stable forward-ref that will
    // point to the real handleForceSubmitAll once it is defined below.
    const { requestFullscreen, exitFullscreen } = useAntiCheat({
        // Disable when embedded — the parent shell (hub page) owns anti-cheat
        enabled: !externalFullscreen && !isLoading,
        onTabSwitch: handleTabSwitch,
        onFullscreenExit: handleFullscreenExit,
    })

    // ── Enter fullscreen when content loads ───────────────────────────────────
    // Skipped when externalFullscreen=true — the parent shell already holds fullscreen.
    useEffect(() => {
        if (isLoading || items.length === 0) return
        if (externalFullscreen) return  // hub shell manages fullscreen
        if (isIOS) {
            document.documentElement.classList.add('ios-test-fullscreen')
        } else {
            requestFullscreen()
        }
        return () => {
            document.documentElement.classList.remove('ios-test-fullscreen')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, items.length, externalFullscreen])

    // ── Fullscreen-exit 20 s countdown tick ───────────────────────────────────
    useEffect(() => {
        if (!showFullscreenModal || fsExitCountdown <= 0) return
        const id = setTimeout(() => setFsExitCountdown(prev => Math.max(0, prev - 1)), 1000)
        return () => clearTimeout(id)
    }, [showFullscreenModal, fsExitCountdown])

    // ── Auto-submit when the 20 s countdown expires ────────────────────────────
    useEffect(() => {
        if (!showFullscreenModal || fsExitCountdown !== 0) return
        setShowFullscreenModal(false)
        if (!isAutoSubmitRef.current) {
            isAutoSubmitRef.current = true
            forceSubmitRef.current()
        }
    }, [showFullscreenModal, fsExitCountdown])

    // ── Auto-submit overlay: countdown tick ───────────────────────────────────
    // Ticks once per second while overlay is active.
    // When countdown reaches 0, redirects to hub page (backend may still be in-flight;
    // the Beat task will finalize if needed). Cleanup clears the timeout on unmount.
    useEffect(() => {
        if (!autoSubmitActive) return
        if (redirectCountdown <= 0) {
            router.push(redirectTargetRef.current)
            return
        }
        const id = setTimeout(() => setRedirectCountdown(p => Math.max(0, p - 1)), 1000)
        return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoSubmitActive, redirectCountdown])

    // ── Auto-submit overlay: body scroll lock ─────────────────────────────────
    // Prevents the page body from scrolling behind the overlay (critical on iOS).
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

    // ── Global timer expiry → auto-submit ─────────────────────────────────────
    // Fires when the smooth 1-second countdown reaches zero on this component page.
    // Uses hasAutoSubmittedRef to prevent double-trigger (timer expiry + server
    // is_expired response arriving concurrently).
    // Skipped when externalFullscreen=true — the parent hub shell owns the timer
    // auto-submit to prevent a double-overlay race condition.
    useEffect(() => {
        if (externalFullscreen) return  // hub shell handles timer expiry
        if (globalTimeLeft !== 0 || hasAutoSubmittedRef.current) return
        // No toast — overlay appears immediately via handleAutoSubmit
        handleAutoSubmit('client_timer')
    // globalTimeLeft changes every second; only act when it hits exactly 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalTimeLeft, externalFullscreen])

    // ── P1-5: Centralised timer cleanup on component unmount ─────────────────
    // Individual save/retry timers are cleaned up inline within their own logic
    // (see saveRetryIntervalRef, saveStatusTimerRef, saveDebounceRef usage above).
    // This catch-all useEffect guarantees ALL timers are cleared when the component
    // unmounts — covering navigations, hot-reloads, and React Strict Mode double-mounts.
    // Without this, timers that fire after unmount attempt setState on an unmounted
    // component, causing "Can't perform a React state update on an unmounted component"
    // warnings (React 17) or silent no-ops (React 18) that mask real memory retention.
    useEffect(() => {
        return () => {
            // Clear all timer refs on unmount — order does not matter
            if (saveStatusTimerRef.current)   { clearTimeout(saveStatusTimerRef.current);   saveStatusTimerRef.current = null }
            if (saveRetryIntervalRef.current) { clearInterval(saveRetryIntervalRef.current); saveRetryIntervalRef.current = null }
            if (saveDebounceRef.current)      { clearTimeout(saveDebounceRef.current);       saveDebounceRef.current = null }
            if (timerPollingRef.current)      { clearTimeout(timerPollingRef.current);       timerPollingRef.current = null }
            // Mark assignment as done so any in-flight save callbacks are no-ops
            isAssignmentDoneRef.current = true
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Page-unload beacon REMOVED — reload = restore ────────────────────────
    //
    // WHY REMOVED:
    //   pagehide fires on BOTH tab close AND page reload (F5, mobile pull-to-refresh,
    //   browser crash recovery). The old beacon auto-submitted on every pagehide,
    //   so any accidental reload permanently ended the test. On mobile browsers
    //   beforeunload is silently ignored, making this unrecoverable.
    //
    // RELOAD = RESTORE:
    //   On reload this page re-mounts and re-fetches items. The server returns
    //   saved_response for every item — all answers are restored automatically.
    //   server_deadline is the authoritative timer; it continues from the correct
    //   remaining time regardless of how long the reload took.
    //
    //   Edge cases all handled:
    //     • Timer expired during reload  → pollGlobalTimer detects is_expired=true
    //                                      → handleAutoSubmit fires on remount ✅
    //     • Assignment already completed → page shows completed state, no re-submit ✅
    //     • Audio mid-recording          → recording is lost (browser state cleared)
    //                                      but all OTHER saved answers are intact ✅
    //     • Debounced text unsaved       → last saved version restored; at most
    //                                      600 ms of typing since last save is lost ✅
    //     • Mobile pull-to-refresh       → restores, no submit ✅
    //     • bfcache restore (pageshow    → React remounts, fresh fetch, all safe ✅
    //       persisted=true)
    //
    // GENUINE ABANDONMENT (tab close, battery death):
    //   Three independent backstops ensure submission without the beacon:
    //     1. Frontend timer:  handleAutoSubmit('client_timer') fires at t=0
    //     2. Beat task:       auto_submit_expired_assignments runs periodically
    //     3. Finish button:   _finalize_and_dispatch when all components complete
    //
    // The beforeunload "Leave site?" warning (useAntiCheat) is kept as the first
    // line of defence against accidental navigation on desktop browsers.

    // ── Unified auto-submit ───────────────────────────────────────────────────
    // DESIGN CONTRACT:
    //   1. hasAutoSubmittedRef is set FIRST (sync) — prevents any concurrent trigger
    //   2. Overlay state setters are called SECOND (sync, React 18 batch) — overlay
    //      paints this render frame, BEFORE any await. Zero time gap.
    //   3. Backend call runs in an IIFE — completely parallel to the countdown.
    //   4. Redirect fires when redirectCountdown hits 0 (via useEffect above), regardless
    //      of whether the backend call has completed.
    //   5. exitFullscreen() is NOT called here — the browser exits fullscreen automatically
    //      on navigation, avoiding a spurious fullscreenchange event that would re-trigger
    //      the malpractice handler after auto-submit has already been gated.
    const handleAutoSubmit = useCallback(async (reason: string) => {
        if (hasAutoSubmittedRef.current) return
        hasAutoSubmittedRef.current = true
        isAutoSubmitRef.current = true

        const overlayReason: AutoSubmitReason =
            reason === 'client_timer'       ? 'timer'       :
            reason === 'tab_switch'         ? 'tab_switch'  :
            reason === 'client_malpractice' ? 'malpractice' : 'fullscreen'

        // SYNCHRONOUS: all these setters are batched into a single render flush
        // (React 18 automatic batching). The overlay paints before any await.
        setAutoSubmitActive(true)
        setAutoSubmitReason(overlayReason)
        setAutoSubmitStatus('saving')
        setRedirectCountdown(10)
        setShowFullscreenModal(false)

        // ── Backend: fire-and-forget relative to the countdown ─────────────────
        // The IIFE runs concurrently with the 10-second countdown useEffect.
        // It does NOT block the redirect — whatever state the submission is in
        // at t=0, the redirect fires and the Beat task handles any remaining work.
        ;(async () => {
            try {
                // Step 1: Best-effort flush component attempt (non-fatal if fails)
                if (componentId) {
                    try {
                        await fetchWithRetry(
                            getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${componentId}/finish`),
                            { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } }
                        )
                    } catch (_e) { /* non-fatal — Beat task handles missing attempts */ }
                }

                // Step 2: Optimistic localStorage update for hub page component status
                try {
                    const storageKey = `submitted_components_${params.assignment_id}`
                    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]
                    if (!existing.includes(params.type as string)) {
                        localStorage.setItem(storageKey, JSON.stringify([...existing, params.type as string]))
                    }
                } catch (_e) { /* non-fatal */ }

                // Step 3: Grand auto-submit (idempotent, starts evaluation pipeline)
                const res = await fetchWithRetry(
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
                    // 4xx from server: data is saved, pipeline will run
                    setAutoSubmitStatus('done')
                }
            } catch (_e) {
                // Network failure: Beat task backstop will finalize within 60s
                setAutoSubmitStatus('error')
            }
        })()
        // Note: intentionally NOT awaiting the IIFE.
        // The countdown useEffect handles redirect independently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [componentId, params.assignment_id, params.type])

    // ── Force-submit (malpractice / fullscreen-exit) — delegates to handleAutoSubmit ──
    const handleForceSubmitAll = useCallback(() => {
        handleAutoSubmit('client_malpractice')
    }, [handleAutoSubmit])

    // Keep forward-ref current whenever handleForceSubmitAll is recreated
    useEffect(() => { forceSubmitRef.current = handleForceSubmitAll }, [handleForceSubmitAll])

    // ── Background retry when save fails ─────────────────────────────────────
    // Retries every 5 s until the server accepts the payload, then auto-clears.
    useEffect(() => {
        if (saveStatus !== 'error') {
            if (saveRetryIntervalRef.current) {
                clearInterval(saveRetryIntervalRef.current)
                saveRetryIntervalRef.current = null
            }
            return
        }
        if (saveRetryIntervalRef.current) return  // already running
        saveRetryIntervalRef.current = setInterval(async () => {
            const payload = failedSavePayloadRef.current
            if (!payload || !params.assignment_id) return
            if (isAssignmentDoneRef.current) {
                // Assignment already completed — abandon retry
                clearInterval(saveRetryIntervalRef.current!)
                saveRetryIntervalRef.current = null
                failedSavePayloadRef.current = null
                return
            }
            try {
                const res = await fetchWithRetry(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/submit`),
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify(payload),
                    }
                )
                if (res.status === 403) {
                    // Assignment already completed — stop retrying
                    isAssignmentDoneRef.current = true
                    clearInterval(saveRetryIntervalRef.current!)
                    saveRetryIntervalRef.current = null
                    failedSavePayloadRef.current = null
                    return
                }
                if (!res.ok) return  // keep retrying (transient error)
                failedSavePayloadRef.current = null
                clearInterval(saveRetryIntervalRef.current!)
                saveRetryIntervalRef.current = null
                setSaveStatus('saved')
                saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
            } catch (_e) {
                // network still down — keep retrying
            }
        }, 5000)
        return () => {
            if (saveRetryIntervalRef.current) {
                clearInterval(saveRetryIntervalRef.current)
                saveRetryIntervalRef.current = null
            }
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current)
                saveDebounceRef.current = null
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saveStatus])

    // ── Handlers ──────────────────────────────────────────────────────────────
    // Core save — sends one POST to /submit.  Caller is responsible for debouncing.
    const saveAnswerToServer = useCallback(async (itemId: string, val: any) => {
        if (!componentId || isAssignmentDoneRef.current) return
        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
        try {
            setSaveStatus('saving')
            const saveResp = await fetchWithRetry(
                getApiUrl(`student/clap-assignments/${params.assignment_id}/submit`),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({ item_id: itemId, response_data: val })
                }
            )
            if (!saveResp.ok) {
                const errData = await saveResp.json().catch(() => ({}))
                // 403 = assignment already completed — stop all further saves
                if (saveResp.status === 403) {
                    isAssignmentDoneRef.current = true
                    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
                    if (saveRetryIntervalRef.current) {
                        clearInterval(saveRetryIntervalRef.current)
                        saveRetryIntervalRef.current = null
                    }
                    return
                }
                throw new Error(errData.error || `HTTP ${saveResp.status}`)
            }
            failedSavePayloadRef.current = null
            setSaveStatus('saved')
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
        } catch (e) {
            console.error('Auto-save failed', e)
            failedSavePayloadRef.current = { item_id: itemId, response_data: val }
            setSaveStatus('error')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [componentId, params.assignment_id])

    // For MCQ option clicks and audio recordings — save immediately (one event per action)
    const handleSaveAnswer = useCallback(async (val: any) => {
        const currentItem = items[currentItemIndex]
        setAnswers(prev => ({ ...prev, [currentItem.id]: val }))
        // Cancel any in-flight debounced text save for this item
        if (saveDebounceRef.current) { clearTimeout(saveDebounceRef.current); saveDebounceRef.current = null }
        await saveAnswerToServer(currentItem.id, val)
    }, [items, currentItemIndex, saveAnswerToServer])

    // For text-area onChange — update state immediately but debounce the network call
    // so we send at most one request per 600 ms of idle time, not one per keystroke.
    const handleAnswerChange = useCallback((val: string) => {
        const currentItem = items[currentItemIndex]
        setAnswers(prev => ({ ...prev, [currentItem.id]: val }))
        if (!componentId || isAssignmentDoneRef.current) return
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
        saveDebounceRef.current = setTimeout(() => {
            saveDebounceRef.current = null
            saveAnswerToServer(currentItem.id, val)
        }, 600)
    }, [items, currentItemIndex, componentId, saveAnswerToServer])

    const handleClearResponse = () => {
        const currentItem = items[currentItemIndex]
        if (!currentItem) return
        setAnswers(prev => {
            const next = { ...prev }
            delete next[currentItem.id]
            return next
        })
    }

    const handleMarkReview = () => {
        setMarked(prev => {
            const next = new Set(prev)
            if (next.has(currentItemIndex)) next.delete(currentItemIndex)
            else next.add(currentItemIndex)
            return next
        })
    }

    const handleNext = () => {
        if (currentItemIndex < items.length - 1) setCurrentItemIndex(prev => prev + 1)
    }

    const handlePrev = () => {
        if (currentItemIndex > 0) setCurrentItemIndex(prev => prev - 1)
    }

    const handleSubmitClick = () => setShowSubmitModal(true)

    const confirmSubmit = async () => {
        setIsSubmitting(true)
        try {
            // 1. Mark this component as finished on the server
            if (componentId) {
                await fetchWithRetry(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${componentId}/finish`),
                    { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } }
                )
            }

            // 2. Persist submitted component to localStorage so the assignment detail
            //    page knows this module is done (it reads submitted_components_<id>).
            //    Full evaluation only triggers on the grand "Final Submit" button there.
            const storageKey = `submitted_components_${params.assignment_id}`
            const existing = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]
            if (!existing.includes(params.type as string)) {
                localStorage.setItem(storageKey, JSON.stringify([...existing, params.type as string]))
            }

            toast.success('Module submitted!')

            // 3. Notify parent shell (unified mode) or navigate back to hub (standalone)
            if (onModuleSubmitted) {
                onModuleSubmitted(params.type)
            } else {
                router.push(`/student/clap-tests/${params.assignment_id}`)
            }
        } catch (error) {
            toast.error('Failed to submit module. Please try again or contact support.')
            console.error(error)
            setIsSubmitting(false)
            setShowSubmitModal(false)
        }
    }

    // ── Computed values ───────────────────────────────────────────────────────
    const currentItem          = items[currentItemIndex]
    const totalQuestions       = items.filter(item => isQuestion(item.item_type)).length
    const questionNumber       = items.slice(0, currentItemIndex).filter(item => isQuestion(item.item_type)).length +
                                 (currentItem && isQuestion(currentItem.item_type) ? 1 : 0)
    const isCurrentItemQuestion = currentItem && isQuestion(currentItem.item_type)

    const answeredCount   = items.filter(item => isQuestion(item.item_type) && answers[item.id] !== undefined).length
    const notAnsweredCount = totalQuestions - answeredCount

    // M3: Copy-paste prevention for writing
    const isWritingType   = params.type === 'writing' || params.type === 'subjective'
    const preventCopyOrCut = isWritingType ? (e: React.ClipboardEvent) => e.preventDefault() : undefined
    const preventPaste    = isWritingType
        ? (e: React.ClipboardEvent) => {
            e.preventDefault()
            silentFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/malpractice-event`), {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_type: 'paste_attempt', meta: { component_type: params.type } }),
            }).catch(() => {})
          }
        : undefined

    // ── Loading ───────────────────────────────────────────────────────────────
    if (isLoading) {
        return <CubeLoader />
    }

    // ── Load error — questions could not be fetched after all retries ─────────
    // Shows a recoverable full-page error instead of a blank "0 of 0 answered"
    // interface. The student can click Retry to re-run the full fetch chain with
    // exponential backoff. If the backend is recovering (e.g. just restarted),
    // a single retry click will succeed within a few seconds.
    // Timer continues to run in the background — server_deadline is authoritative.
    if (loadError && items.length === 0) {
        return (
            <div className="h-[calc(100dvh-1.875rem)] flex flex-col items-center justify-center bg-slate-50 px-6 text-center gap-6">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Questions Could Not Load</h2>
                    <p className="text-sm text-gray-600 max-w-sm leading-relaxed">
                        There was a problem fetching your questions. Your timer is still running.
                        <br /><br />
                        Click <strong>Retry</strong> to try again. If the problem persists, contact your exam administrator.
                    </p>
                </div>
                <button
                    onClick={() => {
                        setLoadError(false)
                        setIsLoading(true)
                        setRetryKey(k => k + 1)
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
                >
                    <RotateCcw className="w-4 h-4" />
                    Retry
                </button>
                {globalTimeLeft !== null && timerLoaded && (
                    <p className="text-sm font-semibold text-amber-600 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        Time remaining: {formatTime(globalTimeLeft)}
                    </p>
                )}
            </div>
        )
    }

    return (
        <>
        {/* ── Auto-submit blocking overlay — z-[200], non-dismissible ──────────
            Rendered OUTSIDE the inert content wrapper so its aria attributes and
            pointer events are unaffected by the inert attribute below. */}
        <AutoSubmitOverlay
            active={autoSubmitActive}
            reason={autoSubmitReason}
            status={autoSubmitStatus}
            countdown={redirectCountdown}
        />

        {/* ── Main content wrapper — inert when overlay is active ──────────────
            inert: blocks ALL keyboard, pointer, and focus interaction (HTML spec).
            style fallback: covers iOS Safari 15.4 and below (no inert support).  */}
        <div
            className={`${externalFullscreen ? 'h-full' : 'h-[calc(100dvh-1.875rem)]'} flex flex-col bg-slate-50 overflow-x-hidden`}
            {...(autoSubmitActive ? { inert: '' as unknown as boolean } : {})}
            style={autoSubmitActive ? { pointerEvents: 'none', userSelect: 'none' } : undefined}
        >

            {/* ── Offline banner ─────────────────────────────────────────────── */}
            {!isOnline && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm font-medium
                                text-center py-2 px-4 flex items-center justify-center gap-2">
                    <WifiOff className="w-4 h-4" />
                    No internet connection — your answers are at risk. Reconnect immediately.
                </div>
            )}

            {/* ── Save-failure blocking modal ──────────────────────────────────── */}
            {saveStatus === 'error' && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
                        {/* Icon */}
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>

                        <h2 className="text-xl font-bold text-gray-900 mb-2">Answer Not Saved</h2>
                        <p className="text-sm text-gray-600 leading-relaxed mb-5">
                            Your last answer could not be saved to the server. Your exam is paused to protect your marks.
                            <br /><br />
                            Please <strong className="text-gray-900">contact your exam administrator immediately</strong> and do not close this window.
                        </p>

                        {/* Retrying indicator */}
                        <div className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                            <span className="inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            <span className="text-xs text-blue-700 font-medium">Retrying automatically…</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Fullscreen-exit warning modal — blocks exam until student re-enters ── */}
            {showFullscreenModal && !isAutoSubmitRef.current && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 px-4">
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
                            <ShieldAlert className="w-7 h-7 text-red-500" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 mb-2">Fullscreen Exited!</h2>
                        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                            This has been recorded as a malpractice event. Return to fullscreen to resume your test.
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
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                                disabled={autoSubmitActive}
                                onClick={async () => {
                                    await requestFullscreen()
                                    setShowFullscreenModal(false)
                                    setFsExitCountdown(20)
                                }}
                            >
                                <Maximize2 className="w-4 h-4 inline mr-2" />
                                Re-enter Fullscreen
                            </button>
                            {/* Destructive: grand submit immediately */}
                            <button
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                disabled={autoSubmitActive}
                                onClick={handleForceSubmitAll}
                            >
                                {autoSubmitActive ? (
                                    <>
                                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Submitting…
                                    </>
                                ) : (
                                    <>
                                        <LogOut className="w-4 h-4" />
                                        Submit Full Exam &amp; Exit
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-4">This incident has been recorded.</p>
                    </div>
                </div>
            )}

            {/* ── Tab-switch warning banner ────────────────────────────────── */}
            {tabWarnings === 1 && (
                <div className="bg-yellow-50 border-b border-yellow-300 px-4 py-2.5 flex items-center gap-3 shrink-0">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    <p className="text-yellow-900 text-sm font-semibold">
                        ⚠ Tab switch detected (1/2) — one more will auto-submit your <strong>entire</strong> assessment.
                    </p>
                </div>
            )}

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className={`bg-white border-b px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm gap-3 shrink-0 ${!isOnline ? 'mt-9' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                    {/* Hide in unified mode — parent shell owns the exit flow */}
                    {!externalFullscreen && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                                await exitFullscreen()
                                document.documentElement.classList.remove('ios-test-fullscreen')
                                router.back()
                            }}
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Quit</span>
                        </Button>
                    )}
                    <h1 className="font-bold text-base sm:text-lg capitalize truncate min-w-0">
                        {/* Mobile: show only the component name (no "Assessment") to avoid
                            truncation — "Listening", "Reading", "Writing", "V & G" etc.   */}
                        <span className="sm:hidden">
                            {String(params.type || '').startsWith('vocabulary')
                                ? 'V & G'
                                : String(params.type || '').replace(/_/g, ' ')}
                        </span>
                        {/* Desktop: full name + "Assessment" */}
                        <span className="hidden sm:inline">
                            {String(params.type || '').replace(/_/g, ' ')} Assessment
                        </span>
                    </h1>
                </div>

                {/* Global countdown timer — MOBILE only (hidden on sm+).
                    On desktop the timer is rendered at the far-right of the right group below.
                    3 states:
                    • !timerLoaded              → --:-- skeleton (first poll pending / 429 backoff)
                    • timerLoaded & time > 0    → live countdown with colour coding
                    • timerLoaded & time == null → hidden (no timer configured for this test)  */}
                {(!timerLoaded || globalTimeLeft !== null) && (
                    <div className={`sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm border flex-shrink-0 transition-colors duration-500 ${
                        !timerLoaded
                            ? 'bg-gray-50 border-dashed border-gray-200 text-gray-300'
                            : globalTimeLeft! < 120
                                ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                                : globalTimeLeft! < 300
                                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                                    : 'bg-gray-50 border-gray-200 text-gray-700'
                    }`}>
                        <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${!timerLoaded ? 'opacity-30' : ''}`} />
                        <span>{timerLoaded ? formatTime(globalTimeLeft!) : '--:--'}</span>
                    </div>
                )}

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Save status — error state is handled by the blocking modal */}
                    {(saveStatus === 'saving' || saveStatus === 'saved') && (
                        <span className={`text-xs font-medium transition-all duration-200 min-w-[60px] text-right hidden sm:block ${
                            saveStatus === 'saving' ? 'text-blue-500' : 'text-green-600'
                        }`}>
                            {saveStatus === 'saving' ? 'Saving…' : '✓ Saved'}
                        </span>
                    )}

                    {/* Mobile palette toggle — pill with indigo tint + chevron so
                        students clearly understand it opens the question palette */}
                    <button
                        type="button"
                        aria-label="Open question palette"
                        className="lg:hidden flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 text-indigo-700 rounded-full px-3 h-9 min-w-[72px] transition-colors touch-manipulation select-none"
                        onClick={() => setIsPaletteOpen(true)}
                    >
                        <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs font-bold tabular-nums">{answeredCount}/{totalQuestions}</span>
                        <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
                    </button>

                    {/* Global countdown timer — DESKTOP only (hidden on mobile, visible sm+).
                        Last child of this group → sits at the rightmost edge of the header. */}
                    {(!timerLoaded || globalTimeLeft !== null) && (
                        <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm border flex-shrink-0 transition-colors duration-500 ${
                            !timerLoaded
                                ? 'bg-gray-50 border-dashed border-gray-200 text-gray-300'
                                : globalTimeLeft! < 120
                                    ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                                    : globalTimeLeft! < 300
                                        ? 'bg-orange-50 border-orange-300 text-orange-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-700'
                        }`}>
                            <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${!timerLoaded ? 'opacity-30' : ''}`} />
                            <span>{timerLoaded ? formatTime(globalTimeLeft!) : '--:--'}</span>
                        </div>
                    )}

                </div>
            </header>

            {/* ── Main layout: Left content + Right palette ───────────────────── */}
            <div className="flex flex-row flex-1 overflow-hidden">

                {/* ── LEFT PANE: Question area ─────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

                    {/* Question sub-header bar */}
                    <div className="bg-white border-b px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0">
                        <h3 className="text-base font-bold text-slate-800">
                            {isCurrentItemQuestion
                                ? `Question ${questionNumber} of ${totalQuestions}`
                                : currentItem
                                    ? currentItem.item_type.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                                    : ''}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Item type badge */}
                            <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100 uppercase text-[10px] font-black tracking-wider">
                                {currentItem?.item_type?.replace(/_/g, ' ')}
                            </span>
                            {/* Marks badge for MCQ */}
                            {currentItem?.item_type === 'mcq' && (
                                <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-md border border-amber-100 font-bold text-xs">
                                    +{currentItem.points || 1} Mark{(currentItem.points || 1) !== 1 ? 's' : ''}
                                </span>
                            )}
                            {/* Mark for Review — icon-only on mobile, full label on sm+ */}
                            {isCurrentItemQuestion && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleMarkReview}
                                    className={`${
                                        marked.has(currentItemIndex)
                                            ? 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                                            : 'text-slate-500 hover:bg-purple-50 hover:text-purple-600'
                                    } transition-all font-semibold rounded-full text-xs px-2 sm:px-3 min-w-[32px] touch-manipulation`}
                                    aria-label={marked.has(currentItemIndex) ? 'Marked for Review' : 'Mark for Review'}
                                >
                                    <Flag className={`w-3.5 h-3.5 sm:mr-1.5 ${marked.has(currentItemIndex) ? 'fill-purple-600' : ''}`} />
                                    <span className="hidden sm:inline">{marked.has(currentItemIndex) ? 'Marked' : 'Mark for Review'}</span>
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 h-1.5 shrink-0">
                        <div
                            className="bg-indigo-600 h-1.5 transition-all duration-300"
                            style={{ width: `${((currentItemIndex + 1) / items.length) * 100}%` }}
                        />
                    </div>

                    {/* Scrollable content area */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        <div className="max-w-3xl mx-auto pb-6">
                            {currentItem && (
                                <Card className="shadow-md border-slate-200">
                                    <CardContent className="p-5 sm:p-8">
                                        <div className="space-y-6">

                                            {currentItem.item_type === 'text_block' && (
                                                <div className="prose max-w-none bg-gray-50 p-4 sm:p-6 rounded-lg border">
                                                    <p className="text-sm sm:text-base text-gray-800 leading-relaxed whitespace-pre-wrap">{currentItem.content.text}</p>
                                                </div>
                                            )}

                                            {currentItem.item_type === 'mcq' && (
                                                <div className="space-y-4 sm:space-y-6">
                                                    <h3 className="text-base sm:text-xl font-medium whitespace-pre-wrap">{currentItem.content.question}</h3>
                                                    <div className="space-y-3">
                                                        {currentItem.content.options?.map((opt: string, index: number) => (
                                                            <div
                                                                key={index}
                                                                onClick={() => handleSaveAnswer(index)}
                                                                className={`p-3.5 sm:p-4 rounded-lg border-2 transition-all cursor-pointer active:scale-[0.99] touch-manipulation select-none ${
                                                                    answers[currentItem.id] === index
                                                                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                                                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                                                        answers[currentItem.id] === index
                                                                            ? 'border-indigo-600 bg-indigo-600'
                                                                            : 'border-gray-400'
                                                                    }`}>
                                                                        {answers[currentItem.id] === index && <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                                                    </div>
                                                                    <span className="text-sm sm:text-base">{opt}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {currentItem.item_type === 'subjective' && (() => {
                                                const maxWords   = Math.max(1, currentItem.content.min_words || 50)
                                                const currentText = answers[currentItem.id] || ''
                                                const wordCount  = countWords(currentText)
                                                const isAtLimit  = wordCount >= maxWords
                                                const pct        = wordCount / maxWords

                                                // Counter colour: gray → amber (≥80%) → green (100%)
                                                const counterCls = isAtLimit
                                                    ? 'text-green-600 font-semibold'
                                                    : pct >= 0.8
                                                    ? 'text-amber-600 font-medium'
                                                    : 'text-gray-400'

                                                return (
                                                    <div className="space-y-3 sm:space-y-4">
                                                        <h3 className="text-base sm:text-xl font-medium whitespace-pre-wrap">{currentItem.content.question}</h3>
                                                        <Textarea
                                                            value={currentText}
                                                            onChange={(e) => {
                                                                const newText  = e.target.value
                                                                const newCount = countWords(newText)
                                                                // Block input the moment a new word would exceed the limit
                                                                if (newCount > maxWords) {
                                                                    toast.warning(
                                                                        `Word limit of ${maxWords} reached. Please edit within the limit.`,
                                                                        { id: 'word-limit-toast', duration: 2500 }
                                                                    )
                                                                    return  // discard the change — textarea stays unchanged
                                                                }
                                                                handleAnswerChange(newText)
                                                            }}
                                                            onCopy={preventCopyOrCut}
                                                            onPaste={preventPaste}
                                                            onCut={preventCopyOrCut}
                                                            placeholder="Type your answer here..."
                                                            className={`text-sm sm:text-base leading-relaxed p-3 sm:p-4 min-h-[140px] sm:min-h-[240px] resize-y transition-colors ${
                                                                isAtLimit ? 'border-green-400 focus-visible:ring-green-300' : ''
                                                            }`}
                                                        />

                                                        {/* ── Word counter row ── */}
                                                        <div className="flex items-center justify-between gap-2">
                                                            {/* Left: limit-reached message */}
                                                            {isAtLimit ? (
                                                                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                                                                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                                                    Word limit reached — no further input allowed
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-400">
                                                                    {pct >= 0.8
                                                                        ? `${maxWords - wordCount} word${maxWords - wordCount !== 1 ? 's' : ''} remaining`
                                                                        : ''}
                                                                </span>
                                                            )}

                                                            {/* Right: live counter */}
                                                            <span className={`text-sm tabular-nums shrink-0 ${counterCls}`}>
                                                                {wordCount}<span className="text-gray-300">/{maxWords}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                )
                                            })()}

                                            {currentItem.item_type === 'audio_block' && (
                                                <AudioBlockPlayer
                                                    itemId={currentItem.id}
                                                    assignmentId={params.assignment_id as string}
                                                    title={currentItem.content.title}
                                                    instructions={currentItem.content.instructions}
                                                    playLimit={currentItem.content.play_limit || 3}
                                                    hasAudioFile={currentItem.content.has_audio_file}
                                                    legacyUrl={currentItem.content.url}
                                                />
                                            )}

                                            {currentItem.item_type === 'audio_recording' && (
                                                <AudioRecorderItem
                                                    itemId={currentItem.id}
                                                    assignmentId={params.assignment_id as string}
                                                    question={currentItem.content.question || 'Record your response'}
                                                    instructions={currentItem.content.instructions}
                                                    maxDuration={currentItem.content.max_duration || 300}
                                                    savedAudioUrl={answers[currentItem.id]?.file_url}
                                                    onSave={(data) => handleSaveAnswer({
                                                        type: 'audio',
                                                        file_url: data.audio_response.file_url,
                                                        duration: data.audio_response.duration
                                                    })}
                                                />
                                            )}

                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>

                    {/* ── Footer: Clear Response (top on mobile) + Prev/Next ──── */}
                    <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
                        {/* Clear Response — mobile: row 1 (above nav); desktop: left side */}
                        <div className="flex gap-2 w-full sm:w-auto order-1">
                            {currentItem?.item_type === 'mcq' && (
                                <Button
                                    variant="outline"
                                    onClick={handleClearResponse}
                                    disabled={answers[currentItem.id] === undefined}
                                    className="w-full sm:w-auto text-slate-500 border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-semibold group px-5 touch-manipulation"
                                >
                                    <RotateCcw className="w-4 h-4 mr-2 transition-transform group-hover:-rotate-45" />
                                    Clear Response
                                </Button>
                            )}
                        </div>

                        {/* Prev / Save & Next — mobile: row 2 (below Clear Response); desktop: right side */}
                        <div className="flex gap-2 w-full sm:w-auto order-2">
                            <Button
                                variant="outline"
                                onClick={handlePrev}
                                disabled={currentItemIndex === 0}
                                className="flex-1 sm:w-36 bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 font-bold touch-manipulation"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                Previous
                            </Button>
                            {currentItemIndex === items.length - 1 ? (
                                <Button
                                    onClick={handleSubmitClick}
                                    className="flex-1 sm:w-36 bg-green-600 hover:bg-green-700 text-white font-bold border-b-4 border-green-800 active:border-b-0 active:translate-y-[2px] transition-all touch-manipulation focus-visible:ring-green-600 focus-visible:ring-offset-0"
                                >
                                    <CheckCircle className="w-4 h-4 mr-1.5" />
                                    Submit
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleNext}
                                    className="flex-1 sm:w-36 bg-indigo-600 hover:bg-indigo-700 text-white font-bold border-b-4 border-indigo-800 active:border-b-0 active:translate-y-[2px] transition-all touch-manipulation"
                                >
                                    <span className="hidden sm:inline">Save & Next</span>
                                    <span className="sm:hidden">Next</span>
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Mobile overlay ───────────────────────────────────────── */}
                {isPaletteOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setIsPaletteOpen(false)}
                    />
                )}

                {/* ── RIGHT PANE: Question Palette ────────────────────────── */}
                <div className={`
                    fixed inset-y-0 right-0 w-[85vw] sm:w-80 bg-white flex flex-col shadow-2xl z-50
                    transform transition-transform duration-300 ease-in-out
                    lg:static lg:translate-x-0 lg:w-72 xl:w-80 lg:shadow-none lg:border-l lg:border-gray-200 lg:shrink-0
                    ${isPaletteOpen ? 'translate-x-0' : 'translate-x-full'}
                `}>
                    {/* Palette header */}
                    <div className="p-4 border-b bg-slate-50 flex items-center justify-between shrink-0">
                        <div>
                            <p className="text-sm font-bold text-gray-800 capitalize">{params.type} Assessment</p>
                            <p className="text-xs text-gray-500">{answeredCount} of {totalQuestions} answered</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden text-gray-400 hover:bg-gray-200 h-8 w-8"
                            onClick={() => setIsPaletteOpen(false)}
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Legend */}
                    <div className="p-3 bg-gray-50/50 border-b grid grid-cols-2 gap-2 text-xs text-gray-600 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded flex items-center justify-center bg-green-500 text-white font-bold text-[10px]">A</div>
                            <span>Answered</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded flex items-center justify-center bg-red-400 text-white font-bold text-[10px]">NA</div>
                            <span>Not Answered</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded flex items-center justify-center bg-gray-200 text-gray-600 font-bold text-[10px]">NV</div>
                            <span>Not Visited</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded flex items-center justify-center bg-purple-500 text-white font-bold text-[10px]">M</div>
                            <span>Marked</span>
                        </div>
                    </div>

                    {/* Questions grid */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Questions Palette</p>
                        <div className="grid grid-cols-5 gap-2">
                            {items.map((item, index) => {
                                if (!isQuestion(item.item_type)) return null

                                const isAnswered  = answers[item.id] !== undefined
                                const isMarkedQ   = marked.has(index)
                                const isVisited   = visited.has(index)
                                const isCurrent   = currentItemIndex === index
                                const qNum        = items.slice(0, index + 1).filter(i => isQuestion(i.item_type)).length

                                let colorClass = 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                if (isVisited && !isAnswered) colorClass = 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                if (isAnswered) colorClass = 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                                if (isMarkedQ) {
                                    colorClass = isAnswered
                                        ? 'bg-purple-100 text-purple-700 border-purple-300 ring-1 ring-green-400'
                                        : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                                }
                                if (isCurrent) colorClass += ' ring-2 ring-indigo-500 ring-offset-1'

                                return (
                                    <button
                                        key={index}
                                        onClick={() => { setCurrentItemIndex(index); setIsPaletteOpen(false) }}
                                        className={`relative h-9 w-full rounded-lg flex items-center justify-center font-bold text-sm transition-all border ${colorClass}`}
                                    >
                                        {qNum}
                                        {isMarkedQ && (
                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full border border-white" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Submit section — pb-14 on mobile/sm lifts the button above the
                        fixed SANJIVO footer (z-50, ~40px tall). lg:pb-4 resets on desktop
                        where the sidebar is static (not a fixed overlay). */}
                    <div className="p-4 pb-10 lg:pb-4 border-t bg-gray-50 space-y-2 shrink-0">
                        <div className="flex justify-between text-xs text-gray-600 mb-2">
                            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> {answeredCount} Answered</span>
                            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-400" /> {notAnsweredCount} Remaining</span>
                            <span className="flex items-center gap-1"><Flag className="w-3 h-3 text-purple-500" /> {marked.size} Marked</span>
                        </div>
                        <Button
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold touch-manipulation"
                            onClick={handleSubmitClick}
                        >
                            Submit Module
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Submit Confirmation Modal ─────────────────────────────────────
                Mobile:  bottom sheet — slides up from bottom, rounded top corners
                Desktop: centred modal (sm:items-center sm:p-4)
            ─────────────────────────────────────────────────────────────────── */}
            {showSubmitModal && (
                <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md overflow-hidden">

                        {/* Drag handle — visual cue that this is a sheet (mobile only) */}
                        <div className="flex justify-center pt-3 pb-0.5 sm:hidden" aria-hidden="true">
                            <div className="w-10 h-1 bg-gray-200 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="flex items-start justify-between px-5 pt-4 pb-4 border-b">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 capitalize">
                                    Submit {params.type} Module
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">Review your progress before submitting</p>
                            </div>
                            <button
                                onClick={() => { if (!isSubmitting) setShowSubmitModal(false) }}
                                className="ml-3 mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 active:bg-gray-200 transition-colors flex-shrink-0 touch-manipulation"
                                aria-label="Close"
                                disabled={isSubmitting}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Stats — clean list style, no coloured cards */}
                        <div className="divide-y divide-gray-100 px-5">
                            <div className="flex items-center justify-between py-3.5">
                                <span className="text-sm text-gray-600">Total Questions</span>
                                <span className="text-sm font-bold text-gray-900">{totalQuestions}</span>
                            </div>
                            <div className="flex items-center justify-between py-3.5">
                                <span className="flex items-center gap-2 text-sm text-green-700">
                                    <CheckCircle className="w-4 h-4" /> Answered
                                </span>
                                <span className="text-sm font-bold text-green-700">{answeredCount}</span>
                            </div>
                            <div className="flex items-center justify-between py-3.5">
                                <span className="flex items-center gap-2 text-sm text-red-600">
                                    <AlertCircle className="w-4 h-4" /> Not Answered
                                </span>
                                <span className="text-sm font-bold text-red-600">{notAnsweredCount}</span>
                            </div>
                            <div className="flex items-center justify-between py-3.5">
                                <span className="flex items-center gap-2 text-sm text-purple-700">
                                    <Flag className="w-4 h-4" /> Marked for Review
                                </span>
                                <span className="text-sm font-bold text-purple-700">{marked.size}</span>
                            </div>
                        </div>

                        {/* Warning banner — only when unanswered questions exist */}
                        {notAnsweredCount > 0 && (
                            <div className="mx-5 mt-3 flex items-start gap-3 p-3.5 bg-amber-50 rounded-xl text-amber-800 text-sm border border-amber-200">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <p>You have <strong>{notAnsweredCount}</strong> unanswered question{notAnsweredCount !== 1 ? 's' : ''}. Submitting will finalise the test as-is.</p>
                            </div>
                        )}

                        {/* Actions — stacked full-width on mobile, inline on desktop
                            pb-8 on mobile gives clearance above the SANJIVO footer */}
                        <div className="px-5 pt-4 pb-8 sm:pb-5 mt-3 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setShowSubmitModal(false)}
                                disabled={isSubmitting}
                                className="w-full sm:w-auto touch-manipulation"
                            >
                                Back to Module
                            </Button>
                            <Button
                                onClick={confirmSubmit}
                                disabled={isSubmitting}
                                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold touch-manipulation"
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                        Submitting…
                                    </span>
                                ) : 'Yes, Submit Module'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </> // closes the outer fragment wrapper
    )
}
