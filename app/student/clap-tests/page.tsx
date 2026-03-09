'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, CheckCircle, WifiOff, ArrowLeft, Loader2, Timer, TimerOff, RadioTower, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

// ── Timer state helpers ───────────────────────────────────────────────────────
// Primary source of truth: deadline_utc (re-derived each render so the card
// updates as time passes even without a new poll).
// Fallback: timer_state from backend — used when deadline_utc is null but the
// backend already knows the timer is live (race window between start and poll).
type TimerState = 'upcoming' | 'live' | 'expired' | 'completed'

function getTimerState(assignment: any): TimerState {
    if (assignment.status === 'completed') return 'completed'
    const deadline = assignment.deadline_utc
    if (deadline) {
        return new Date(deadline) > new Date() ? 'live' : 'expired'
    }
    // No deadline yet — trust the backend's pre-computed timer_state
    const backendState = assignment.timer_state as TimerState | undefined
    if (backendState === 'live' || backendState === 'expired') return backendState
    return 'upcoming'
}

const TIMER_CONFIG: Record<TimerState, {
    badge: string
    badgeClass: string
    borderClass: string
    bgClass: string
    icon: React.ElementType
    buttonLabel: string
    buttonClass: string
    clickable: boolean
    blockedMessage: string
}> = {
    upcoming: {
        badge: 'Starting Soon',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
        borderClass: 'border-l-blue-400',
        bgClass: '',
        icon: Timer,
        buttonLabel: 'Starting Soon…',
        buttonClass: 'bg-blue-100 text-blue-500 cursor-not-allowed',
        clickable: false,
        blockedMessage: 'The test hasn\'t started yet. Please wait for your instructor to begin.',
    },
    live: {
        badge: 'Test is Live',
        badgeClass: 'bg-green-50 text-green-700 border-green-200',
        borderClass: 'border-l-green-500',
        bgClass: '',
        icon: RadioTower,
        buttonLabel: '',        // dynamic: 'Continue Test' or 'Start Assessment'
        buttonClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        clickable: true,
        blockedMessage: '',
    },
    expired: {
        badge: 'Timer Expired',
        badgeClass: 'bg-red-50 text-red-700 border-red-200',
        borderClass: 'border-l-red-400',
        bgClass: 'opacity-70',
        icon: TimerOff,
        buttonLabel: 'Timer Expired',
        buttonClass: 'bg-red-100 text-red-500 cursor-not-allowed',
        clickable: false,
        blockedMessage: 'The timer for this test has expired. Contact your instructor.',
    },
    completed: {
        badge: 'Completed',
        badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
        borderClass: 'border-l-gray-400',
        bgClass: '',
        icon: CheckCircle,
        buttonLabel: 'View',
        buttonClass: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        clickable: true,
        blockedMessage: '',
    },
}

export default function StudentClapTestsPage() {
    const router = useRouter()
    const isOnline = useNetworkStatus()
    const [assignments, setAssignments] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const fetchAssignments = useCallback(async (signal?: AbortSignal) => {
        try {
            const response = await apiFetch(getApiUrl('student/clap-assignments'), {
                headers: getAuthHeaders(),
                signal,
                cache: 'no-store',   // always fetch fresh — never serve stale timer state
            })
            if (signal?.aborted) return
            const data = await response.json()
            if (response.ok) {
                setAssignments(data.assignments)
            } else {
                toast.error('Failed to load tests')
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') return
            console.error(error)
            toast.error('Network error')
        } finally {
            if (!signal?.aborted) {
                setIsLoading(false)
                setIsRefreshing(false)
                setLastRefreshed(new Date())
            }
        }
    }, [])

    // Initial load
    useEffect(() => {
        const controller = new AbortController()
        fetchAssignments(controller.signal)
        return () => controller.abort()
    }, [fetchAssignments])

    // Poll every 5 s unconditionally — catches timer start/expire in near real-time.
    // Fixed interval with no dependency on assignments to avoid resetting on every fetch.
    useEffect(() => {
        const id = setInterval(() => fetchAssignments(), 5_000)
        return () => clearInterval(id)
    }, [fetchAssignments])

    // Refresh immediately when student switches back to this tab
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') fetchAssignments() }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [fetchAssignments])

    const handleManualRefresh = () => {
        setIsRefreshing(true)
        fetchAssignments()
    }

    const handleCardClick = (assignment: any) => {
        const state = getTimerState(assignment)
        const config = TIMER_CONFIG[state]
        if (!config.clickable) {
            toast.info(config.blockedMessage, { duration: 4000 })
            return
        }
        if (loadingId) return
        setLoadingId(assignment.assignment_id)
        router.push(`/student/clap-tests/${assignment.assignment_id}`)
    }

    return (
        <div className="min-h-dvh bg-background">
        {/* Offline banner */}
        {!isOnline && (
            <div className="bg-red-600 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
                <WifiOff className="w-4 h-4 flex-shrink-0" />
                No internet connection — tests may not load correctly. Please reconnect.
            </div>
        )}

        {/* Sticky header */}
        <header className="sticky top-0 z-40 bg-white border-b border-border shadow-sm">
            <div className="px-4 sm:px-6 h-14 flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/student/dashboard')}
                    className="flex items-center gap-1.5 -ml-2 shrink-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Back to Dashboard</span>
                    <span className="sm:hidden">Back</span>
                </Button>
                <div className="h-5 w-px bg-border shrink-0" />
                <h1 className="text-sm sm:text-base font-semibold truncate flex-1">My CLAP Assessments</h1>
                {/* Manual refresh + last-fetched indicator */}
                <div className="flex items-center gap-2 shrink-0">
                    {lastRefreshed && (
                        <span className="hidden sm:inline text-xs text-gray-400">
                            Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="text-gray-500 hover:text-gray-700 p-1.5"
                        title="Refresh test status"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>
        </header>

        <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-5xl mx-auto">
            <p className="text-sm sm:text-base text-gray-500 mb-5 sm:mb-8">Complete your assigned Continuous Learning Assessment Program tests.</p>

            {/* Skeleton loading */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="rounded-2xl border bg-white p-6 animate-pulse border-l-4 border-l-indigo-200">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex-1 mr-4">
                                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                </div>
                                <div className="h-6 w-20 bg-gray-100 rounded-full" />
                            </div>
                            <div className="flex gap-4 mb-4">
                                <div className="h-4 bg-gray-100 rounded w-20" />
                                <div className="h-4 bg-gray-100 rounded w-20" />
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full mb-4" />
                            <div className="h-9 bg-gray-200 rounded-lg w-full" />
                        </div>
                    ))}
                </div>
            ) : assignments.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Tests Assigned</h3>
                    <p className="text-gray-500">You don&apos;t have any pending CLAP tests at the moment.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {assignments.map((assignment) => {
                        const state   = getTimerState(assignment)
                        const config  = TIMER_CONFIG[state]
                        const StateIcon = config.icon
                        const isNavigating = loadingId === assignment.assignment_id

                        const buttonLabel = state === 'live'
                            ? (assignment.status === 'started' ? 'Continue Test' : 'Start Assessment')
                            : config.buttonLabel

                        return (
                            <Card
                                key={assignment.assignment_id}
                                className={`transition-all border-l-4 ${config.borderClass} ${config.bgClass} ${
                                    config.clickable
                                        ? 'cursor-pointer hover:shadow-md'
                                        : 'cursor-default'
                                }`}
                                onClick={() => handleCardClick(assignment)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0">
                                            <CardTitle className="text-base sm:text-xl mb-1 leading-snug">{assignment.test_name}</CardTitle>
                                            <p className="text-sm text-gray-500">
                                                Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
                                            </p>
                                        </div>

                                        {/* Timer state badge */}
                                        <Badge
                                            variant="outline"
                                            className={`flex items-center gap-1.5 shrink-0 font-semibold text-xs px-3 py-1 ${config.badgeClass}`}
                                        >
                                            {state === 'live' && (
                                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                                            )}
                                            {state !== 'live' && <StateIcon className="w-3 h-3 flex-shrink-0" />}
                                            {config.badge}
                                        </Badge>
                                    </div>
                                </CardHeader>

                                <CardContent className="pt-0">
                                    {/* ── Meta row: real values, dot-separated, no icon clutter ── */}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500 mb-3">
                                        <span>
                                            {assignment.components?.length ?? 0} module{(assignment.components?.length ?? 0) !== 1 ? 's' : ''}
                                        </span>
                                        <span className="text-gray-300">·</span>
                                        <span>
                                            {(() => {
                                                const mins = assignment.components?.reduce(
                                                    (s: number, c: any) => s + (c.duration || 0), 0
                                                ) || 0
                                                return mins ? `${mins} min` : '—'
                                            })()}
                                        </span>
                                        {state === 'live' && assignment.deadline_utc && (
                                            <>
                                                <span className="text-gray-300">·</span>
                                                <span className="text-green-700 font-semibold">
                                                    Ends {new Date(assignment.deadline_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* ── Status notice for blocked states ── */}
                                    {state === 'upcoming' && (
                                        <p className="text-xs text-blue-600 bg-blue-50 rounded-md px-3 py-2 mb-3">
                                            Waiting for instructor to start the timer.
                                        </p>
                                    )}
                                    {state === 'expired' && (
                                        <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2 mb-3">
                                            Time window closed. Contact your instructor.
                                        </p>
                                    )}

                                    <Button
                                        className={`w-full font-semibold ${config.buttonClass}`}
                                        disabled={!config.clickable || isNavigating}
                                        onClick={e => {
                                            e.stopPropagation()
                                            handleCardClick(assignment)
                                        }}
                                    >
                                        {isNavigating ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Loading…
                                            </>
                                        ) : (
                                            <>
                                                {state === 'live' && <StateIcon className="w-4 h-4 mr-2" />}
                                                {buttonLabel}
                                            </>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
        </div>
    )
}
