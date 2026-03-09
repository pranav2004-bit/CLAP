'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ChevronRight, ChevronLeft, CheckCircle, WifiOff, Clock, Flag, RotateCcw, LayoutGrid, X, AlertCircle, AlertTriangle, Maximize2, ShieldAlert, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch, silentFetch } from '@/lib/api-config'
import AudioRecorderItem from '@/components/audio-recorder'
import AudioBlockPlayer from '@/components/AudioBlockPlayer'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useAntiCheat } from '@/hooks/useAntiCheat'

// Question classification helper
const isQuestion = (itemType: string): boolean => {
    return itemType === 'mcq' || itemType === 'subjective' || itemType === 'audio_recording'
}

// M4: Retry helper with exponential backoff (0.5s, 1s, 2s)
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error = new Error('Unknown error')
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await apiFetch(url, options)
            if (res.ok || (res.status >= 400 && res.status < 500)) return res
            throw new Error(`HTTP ${res.status}`)
        } catch (err) {
            lastError = err as Error
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500))
            }
        }
    }
    throw lastError
}

export default function ClapTestTakingPage() {
    const params  = useParams()
    const router  = useRouter()
    const isOnline = useNetworkStatus()

    const [items, setItems]                 = useState<any[]>([])
    const [currentItemIndex, setCurrentItemIndex] = useState(0)
    const [answers, setAnswers]             = useState<Record<string, any>>({})
    const [isLoading, setIsLoading]         = useState(true)
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
    const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Anti-cheat / fullscreen state ─────────────────────────────────────────
    const [showFullscreenModal, setShowFullscreenModal] = useState(false)
    const [tabWarnings, setTabWarnings]                 = useState(0)
    const [isForcingSubmit, setIsForcingSubmit]         = useState(false)
    const isAutoSubmitRef        = useRef(false)
    const forceSubmitRef         = useRef<() => void>(() => {})  // forward-ref: breaks circular dep
    // Fullscreen exit strike tracking: 1st/2nd → modal + 20 s countdown; 3rd → instant auto-submit
    const fullscreenExitCountRef = useRef(0)
    const [fullscreenExitCount, setFullscreenExitCount] = useState(0)
    const [fsExitCountdown, setFsExitCountdown]         = useState(20)
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

    // ── Global timer ──────────────────────────────────────────────────────────
    const [globalTimeLeft, setGlobalTimeLeft] = useState<number | null>(null)
    const deadlineRef     = useRef<Date | null>(null)
    const clockOffsetRef  = useRef(0)
    const timerPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const formatTime = (seconds: number) => {
        const hrs  = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // ── Fetch items ───────────────────────────────────────────────────────────
    useEffect(() => {
        const controller = new AbortController()

        const fetchTestContent = async () => {
            try {
                const assignmentResponse = await apiFetch(getApiUrl('student/clap-assignments'), {
                    headers: getAuthHeaders(),
                    signal: controller.signal,
                })
                if (controller.signal.aborted) return
                const assignmentData = await assignmentResponse.json()

                const myAssignment = assignmentData.assignments.find((a: any) => a.assignment_id === params.assignment_id)
                if (!myAssignment) throw new Error('Assignment not found')

                const component = myAssignment.components.find((c: any) => c.type === params.type)
                if (!component) throw new Error('Component not found')

                setComponentId(component.id)

                const itemsResponse = await apiFetch(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${component.id}/items`),
                    { headers: getAuthHeaders(), signal: controller.signal }
                )
                if (controller.signal.aborted) return
                const itemsData = await itemsResponse.json()

                if (itemsResponse.ok) {
                    setItems(itemsData.items)
                    const savedAnswers: Record<string, any> = {}
                    itemsData.items.forEach((item: any) => {
                        if (item.saved_response) savedAnswers[item.id] = item.saved_response
                    })
                    setAnswers(savedAnswers)
                } else {
                    toast.error('Failed to load questions')
                }
            } catch (error) {
                if ((error as Error).name === 'AbortError') return
                console.error(error)
                toast.error('Failed to load assessment')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        if (params.assignment_id && params.type) fetchTestContent()
        return () => controller.abort()
    }, [params.assignment_id, params.type])

    // ── Mark item as visited when navigating ─────────────────────────────────
    useEffect(() => {
        setVisited(prev => new Set(prev).add(currentItemIndex))
    }, [currentItemIndex])

    // ── Poll global timer ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!params.assignment_id) return
        const poll = async () => {
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
                }
            } catch { /* silent */ }
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
            toast.warning('⚠ Tab switch detected (1/2). One more will auto-submit your assessment.')
        } else if (count >= 2 && !isAutoSubmitRef.current) {
            toast.error('Tab switch limit reached — auto-submitting your assessment.')
            forceSubmitRef.current()
        }
    }, [reportMalpractice, params.type])

    const handleFullscreenExit = useCallback(() => {
        const newCount = fullscreenExitCountRef.current + 1
        fullscreenExitCountRef.current = newCount
        setFullscreenExitCount(newCount)
        reportMalpractice('fullscreen_exit', { strike: newCount, component_type: params.type })

        if (newCount >= 3) {
            // 3rd strike — skip the modal, immediately auto grand submit
            toast.error(
                'You have reached the limit of exiting fullscreen — all 5 tests are auto grand submitted.',
                { duration: 8000 }
            )
            if (!isAutoSubmitRef.current) {
                isAutoSubmitRef.current = true
                forceSubmitRef.current()
            }
        } else {
            // 1st or 2nd exit — show blocking modal with 20-second countdown
            if (newCount === 1) {
                toast.warning('1/2 reached limit of the full screen existing', { duration: 6000 })
            } else {
                toast.warning('2/2 reached limit of the full screen existing', { duration: 6000 })
            }
            setFsExitCountdown(20)
            setShowFullscreenModal(true)
        }
    }, [reportMalpractice, params.type])

    // ── Anti-cheat hook ───────────────────────────────────────────────────────
    // onTabSwitch calls forceSubmitRef.current() — a stable forward-ref that will
    // point to the real handleForceSubmitAll once it is defined below.
    const { requestFullscreen, exitFullscreen } = useAntiCheat({
        enabled: !isLoading,
        onTabSwitch: handleTabSwitch,
        onFullscreenExit: handleFullscreenExit,
    })

    // ── Enter fullscreen when content loads ───────────────────────────────────
    useEffect(() => {
        if (isLoading || items.length === 0) return
        if (isIOS) {
            document.documentElement.classList.add('ios-test-fullscreen')
        } else {
            requestFullscreen()
        }
        return () => {
            document.documentElement.classList.remove('ios-test-fullscreen')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, items.length])

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

    // ── Force-submit all: finish this component + grand submit ────────────────
    // Used by: fullscreen-exit modal "Final Submit" button + tab-switch auto-submit
    const handleForceSubmitAll = useCallback(async () => {
        if (isAutoSubmitRef.current) return
        isAutoSubmitRef.current = true
        setIsForcingSubmit(true)
        setShowFullscreenModal(false)
        try {
            // 1. Finish current component on the server
            if (componentId) {
                await fetchWithRetry(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${componentId}/finish`),
                    { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } }
                )
            }
            // 2. Persist to localStorage (so detail page tracks it)
            const storageKey = `submitted_components_${params.assignment_id}`
            const existing = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]
            if (!existing.includes(params.type as string)) {
                localStorage.setItem(storageKey, JSON.stringify([...existing, params.type as string]))
            }
            // 3. Grand submit — triggers evaluation pipeline
            const idempotencyKey = crypto.randomUUID()
            const submitResp = await fetchWithRetry(getApiUrl('submissions'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    assignment_id: params.assignment_id,
                    idempotency_key: idempotencyKey,
                    correlation_id: idempotencyKey,
                }),
            })
            if (!submitResp.ok) throw new Error('Grand submission failed')
            const submissionData = await submitResp.json()
            await exitFullscreen()
            toast.success('Assessment submitted. All your work has been recorded.')
            router.push(`/student/clap-tests/${params.assignment_id}?submission_id=${submissionData.submission_id}`)
        } catch (error) {
            console.error(error)
            toast.error('Failed to submit. Please try again.')
            isAutoSubmitRef.current = false
            setIsForcingSubmit(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [componentId, params.assignment_id, params.type, exitFullscreen])

    // Keep forward-ref current whenever handleForceSubmitAll is recreated
    useEffect(() => { forceSubmitRef.current = handleForceSubmitAll }, [handleForceSubmitAll])

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleSaveAnswer = async (val: any) => {
        const currentItem = items[currentItemIndex]
        setAnswers(prev => ({ ...prev, [currentItem.id]: val }))
        if (!componentId) return
        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
        try {
            setSaveStatus('saving')
            await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/submit`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ item_id: currentItem.id, response_data: val })
            })
            setSaveStatus('saved')
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
        } catch (e) {
            console.error('Auto-save failed', e)
            setSaveStatus('error')
        }
    }

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

            toast.success('Module submitted! Return to the assessment to continue.')

            // 3. Navigate back to the assignment hub (NOT to /submissions)
            router.push(`/student/clap-tests/${params.assignment_id}`)
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

    // ── Skeleton ──────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="h-dvh flex flex-col bg-gray-50">
                <header className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm animate-pulse">
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-16 bg-gray-200 rounded" />
                        <div className="h-6 w-40 bg-gray-200 rounded" />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="h-9 w-24 bg-gray-200 rounded-full" />
                        <div className="h-9 w-28 bg-gray-200 rounded" />
                    </div>
                </header>
                <div className="flex flex-1 overflow-hidden">
                    <main className="flex-1 p-6 flex flex-col gap-4">
                        <div className="h-2 bg-gray-200 rounded-full animate-pulse" />
                        <div className="flex-1 rounded-xl border bg-white p-8 animate-pulse space-y-6">
                            <div className="h-4 bg-gray-100 rounded w-32" />
                            <div className="h-7 bg-gray-200 rounded w-3/4" />
                            {[1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg" />)}
                        </div>
                    </main>
                    <aside className="hidden lg:block w-72 border-l bg-white animate-pulse p-4 space-y-3">
                        <div className="h-4 bg-gray-100 rounded w-24" />
                        <div className="grid grid-cols-5 gap-2">
                            {[...Array(10)].map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-lg" />)}
                        </div>
                    </aside>
                </div>
            </div>
        )
    }

    return (
        <div className="h-dvh flex flex-col bg-slate-50">
            {/* ── Offline banner ─────────────────────────────────────────────── */}
            {!isOnline && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm font-medium
                                text-center py-2 px-4 flex items-center justify-center gap-2">
                    <WifiOff className="w-4 h-4" />
                    No internet connection — your answers are at risk. Reconnect immediately.
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
                                disabled={isForcingSubmit}
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
                                disabled={isForcingSubmit}
                                onClick={handleForceSubmitAll}
                            >
                                {isForcingSubmit ? (
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
                    <h1 className="font-bold text-base sm:text-lg capitalize truncate">{params.type} Assessment</h1>
                </div>

                {/* Global countdown timer */}
                {globalTimeLeft !== null && (
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm border flex-shrink-0 transition-colors duration-500 ${
                        globalTimeLeft < 120
                            ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                            : globalTimeLeft < 300
                                ? 'bg-orange-50 border-orange-300 text-orange-700'
                                : 'bg-gray-50 border-gray-200 text-gray-700'
                    }`}>
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{formatTime(globalTimeLeft)}</span>
                    </div>
                )}

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Save status */}
                    <span className={`text-xs font-medium transition-all duration-200 min-w-[60px] text-right hidden sm:block ${
                        saveStatus === 'saving' ? 'text-blue-500' :
                        saveStatus === 'saved'  ? 'text-green-600' :
                        saveStatus === 'error'  ? 'text-red-500'  :
                        'text-transparent select-none'
                    }`}>
                        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '⚠ Save failed' : '·'}
                    </span>

                    {/* Mobile palette toggle */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="lg:hidden flex items-center gap-1.5"
                        onClick={() => setIsPaletteOpen(true)}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        <span className="text-xs font-bold">{answeredCount}/{totalQuestions}</span>
                    </Button>

                    <Button onClick={handleSubmitClick} size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm whitespace-nowrap">
                        Submit
                    </Button>
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
                            {/* Mark for Review — only for question-type items */}
                            {isCurrentItemQuestion && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleMarkReview}
                                    className={`${
                                        marked.has(currentItemIndex)
                                            ? 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                                            : 'text-slate-500 hover:bg-purple-50 hover:text-purple-600'
                                    } transition-all font-semibold rounded-full text-xs px-3`}
                                >
                                    <Flag className={`w-3.5 h-3.5 mr-1.5 ${marked.has(currentItemIndex) ? 'fill-purple-600' : ''}`} />
                                    <span>{marked.has(currentItemIndex) ? 'Marked' : 'Mark for Review'}</span>
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
                    <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                        <div className="max-w-3xl mx-auto pb-6">
                            {currentItem && (
                                <Card className="shadow-md border-slate-200">
                                    <CardContent className="p-4 sm:p-8">
                                        <div className="space-y-6">

                                            {currentItem.item_type === 'text_block' && (
                                                <div className="prose max-w-none bg-gray-50 p-4 sm:p-6 rounded-lg border">
                                                    <p className="text-sm sm:text-base text-gray-800 leading-relaxed whitespace-pre-wrap">{currentItem.content.text}</p>
                                                </div>
                                            )}

                                            {currentItem.item_type === 'mcq' && (
                                                <div className="space-y-4 sm:space-y-6">
                                                    <h3 className="text-base sm:text-xl font-medium whitespace-pre-wrap">{currentItem.content.question}</h3>
                                                    <div className="space-y-2 sm:space-y-3">
                                                        {currentItem.content.options?.map((opt: string, index: number) => (
                                                            <div
                                                                key={index}
                                                                onClick={() => handleSaveAnswer(index)}
                                                                className={`p-3 sm:p-4 rounded-lg border-2 transition-all cursor-pointer active:scale-[0.99] ${
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

                                            {currentItem.item_type === 'subjective' && (
                                                <div className="space-y-3 sm:space-y-4">
                                                    <h3 className="text-base sm:text-xl font-medium whitespace-pre-wrap">{currentItem.content.question}</h3>
                                                    <Textarea
                                                        value={answers[currentItem.id] || ''}
                                                        onChange={(e) => handleSaveAnswer(e.target.value)}
                                                        onCopy={preventCopyOrCut}
                                                        onPaste={preventPaste}
                                                        onCut={preventCopyOrCut}
                                                        placeholder="Type your answer here..."
                                                        className="text-sm sm:text-base leading-relaxed p-3 sm:p-4 min-h-[140px] sm:min-h-[240px] resize-y"
                                                    />
                                                    <p className="text-sm text-gray-500 text-right">
                                                        Min words: {currentItem.content.min_words || 50}
                                                    </p>
                                                </div>
                                            )}

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

                    {/* ── Footer: Clear Response + Prev/Next ─────────────────── */}
                    <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
                        {/* Clear Response — only for MCQ */}
                        <div className="flex gap-2 w-full sm:w-auto order-2 sm:order-1">
                            {currentItem?.item_type === 'mcq' && (
                                <Button
                                    variant="outline"
                                    onClick={handleClearResponse}
                                    disabled={answers[currentItem.id] === undefined}
                                    className="w-full sm:w-auto text-slate-500 border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-semibold group px-5"
                                >
                                    <RotateCcw className="w-4 h-4 mr-2 transition-transform group-hover:-rotate-45" />
                                    Clear Response
                                </Button>
                            )}
                        </div>

                        {/* Prev / Save & Next */}
                        <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
                            <Button
                                variant="outline"
                                onClick={handlePrev}
                                disabled={currentItemIndex === 0}
                                className="flex-1 sm:w-36 bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 font-bold"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                Previous
                            </Button>
                            <Button
                                onClick={handleNext}
                                disabled={currentItemIndex === items.length - 1}
                                className="flex-1 sm:w-36 bg-indigo-600 hover:bg-indigo-700 text-white font-bold border-b-4 border-indigo-800 active:border-b-0 active:translate-y-[2px] transition-all"
                            >
                                <span className="hidden sm:inline">Save & Next</span>
                                <span className="sm:hidden">Next</span>
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
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

                    {/* Submit section */}
                    <div className="p-4 border-t bg-gray-50 space-y-2 shrink-0">
                        <div className="flex justify-between text-xs text-gray-600 mb-2">
                            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> {answeredCount} Answered</span>
                            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-400" /> {notAnsweredCount} Remaining</span>
                            <span className="flex items-center gap-1"><Flag className="w-3 h-3 text-purple-500" /> {marked.size} Marked</span>
                        </div>
                        <Button
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
                            onClick={handleSubmitClick}
                        >
                            Submit Module
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Submit Confirmation Modal ─────────────────────────────────── */}
            {showSubmitModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b">
                            <h3 className="text-xl font-bold text-gray-900 capitalize">Submit {params.type} Module</h3>
                            <p className="text-sm text-gray-500 mt-1">Review your progress before submitting this module:</p>
                        </div>
                        <div className="p-6 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center col-span-2">
                                    <span className="text-gray-600 text-sm">Total Questions</span>
                                    <span className="font-bold text-gray-900">{totalQuestions}</span>
                                </div>
                                <div className="bg-green-50 p-3 rounded-lg flex justify-between items-center text-green-700">
                                    <span className="flex items-center gap-2 text-sm"><CheckCircle className="w-3 h-3" /> Answered</span>
                                    <span className="font-bold">{answeredCount}</span>
                                </div>
                                <div className="bg-red-50 p-3 rounded-lg flex justify-between items-center text-red-700">
                                    <span className="flex items-center gap-2 text-sm"><AlertCircle className="w-3 h-3" /> Not Answered</span>
                                    <span className="font-bold">{notAnsweredCount}</span>
                                </div>
                                <div className="bg-purple-50 p-3 rounded-lg flex justify-between items-center text-purple-700 col-span-2">
                                    <span className="flex items-center gap-2 text-sm"><Flag className="w-3 h-3" /> Marked for Review</span>
                                    <span className="font-bold">{marked.size}</span>
                                </div>
                            </div>
                            {notAnsweredCount > 0 && (
                                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg text-amber-800 text-sm border border-amber-200">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <p>You have <strong>{notAnsweredCount}</strong> unanswered question{notAnsweredCount !== 1 ? 's' : ''}. Submitting will finalise the test as-is.</p>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowSubmitModal(false)} disabled={isSubmitting}>
                                Back to Module
                            </Button>
                            <Button
                                onClick={confirmSubmit}
                                disabled={isSubmitting}
                                className="bg-green-600 hover:bg-green-700 text-white px-6"
                            >
                                {isSubmitting ? 'Submitting…' : 'Yes, Submit Module'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
