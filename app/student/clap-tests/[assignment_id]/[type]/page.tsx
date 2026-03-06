'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Clock, ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, Loader2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import AudioRecorderItem from '@/components/audio-recorder'
import AudioBlockPlayer from '@/components/AudioBlockPlayer'
import { useAntiCheat } from '@/hooks/useAntiCheat'
import { useNetworkAwareSave } from '@/hooks/useNetworkAwareSave'

const isQuestion = (itemType: string): boolean =>
    itemType === 'mcq' || itemType === 'subjective'

export default function ClapTestTakingPage() {
    const params = useParams()
    const router = useRouter()

    const [items, setItems] = useState<any[]>([])
    const [currentItemIndex, setCurrentItemIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<string, any>>({})
    const [isLoading, setIsLoading] = useState(true)

    // Timer state
    const [timeLeft, setTimeLeft] = useState<number | null>(null)
    const [timerEnabled, setTimerEnabled] = useState(false)
    const [componentDurationMins, setComponentDurationMins] = useState(10)
    const [componentId, setComponentId] = useState<string | null>(null)

    // Lock / auto-submit state
    const [isLocked, setIsLocked] = useState(false)
    const [isAutoSubmitting, setIsAutoSubmitting] = useState(false)
    const isLockedRef = useRef(false)   // stable ref used inside callbacks

    // Online/offline state
    const [isOnline, setIsOnline] = useState(true)
    useEffect(() => {
        setIsOnline(navigator.onLine)
        const onOnline  = () => { setIsOnline(true);  toast.success('Back online — syncing answers…') }
        const onOffline = () => { setIsOnline(false); toast.warning('Offline — answers queued locally') }
        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
    }, [])

    // Anti-cheat (component-level: tab warning only, no auto-submit)
    useAntiCheat({
        enabled: !isLoading && !isLocked,
        onTabSwitch: (count) => {
            toast.warning(`Tab switch detected (${count}). Please stay on the test page.`)
        },
        onFullscreenExit: () => {}, // fullscreen managed at assignment level
    })

    // ── Load assignment + items ─────────────────────────────────────────────

    useEffect(() => {
        if (!params.assignment_id || !params.type) return

        const load = async () => {
            try {
                const assignRes = await fetch(getApiUrl('student/clap-assignments'), {
                    headers: getAuthHeaders()
                })
                const assignData = await assignRes.json()

                const myAssignment = assignData.assignments?.find(
                    (a: any) => a.assignment_id === params.assignment_id
                )
                if (!myAssignment) throw new Error('Assignment not found')

                const comp = myAssignment.components?.find((c: any) => c.type === params.type)
                if (!comp) throw new Error('Component not found')

                setComponentId(comp.id)

                const enabled = comp.timer_enabled !== false
                const durMins  = comp.duration || 10
                setTimerEnabled(enabled)
                setComponentDurationMins(durMins)

                // Server-anchor: record the first time this component is opened
                if (enabled) {
                    const startKey = `clapcomp_start_${params.assignment_id}_${params.type}`
                    if (!localStorage.getItem(startKey)) {
                        localStorage.setItem(startKey, String(Date.now()))
                    }
                }

                const itemsRes  = await fetch(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${comp.id}/items`),
                    { headers: getAuthHeaders() }
                )
                const itemsData = await itemsRes.json()

                if (itemsRes.ok) {
                    setItems(itemsData.items || [])
                    const saved: Record<string, any> = {}
                    ;(itemsData.items || []).forEach((item: any) => {
                        if (item.saved_response) saved[item.id] = item.saved_response
                    })
                    setAnswers(saved)
                } else {
                    toast.error('Failed to load questions')
                }
            } catch (err: any) {
                console.error(err)
                toast.error(err.message || 'Failed to load assessment')
            } finally {
                setIsLoading(false)
            }
        }

        load()
    }, [params.assignment_id, params.type])

    // ── Server-anchored countdown ───────────────────────────────────────────
    // Uses localStorage start time so the clock keeps ticking even if the
    // student navigates away and comes back.

    useEffect(() => {
        if (isLoading || !timerEnabled) return

        const startKey  = `clapcomp_start_${params.assignment_id}_${params.type}`
        const startTime = parseInt(localStorage.getItem(startKey) || '0') || Date.now()
        const totalSecs = componentDurationMins * 60

        const tick = () => {
            const elapsed   = Math.floor((Date.now() - startTime) / 1000)
            const remaining = Math.max(0, totalSecs - elapsed)
            setTimeLeft(remaining)
        }

        tick()  // immediate — no 1-second delay on first render
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [isLoading, timerEnabled, componentDurationMins, params.assignment_id, params.type])

    // ── Auto-submit when timer hits 0 ──────────────────────────────────────

    const autoSubmit = useCallback(async () => {
        if (isLockedRef.current) return
        isLockedRef.current = true
        setIsLocked(true)
        setIsAutoSubmitting(true)

        toast.error('⏱ Time is up — auto-submitting your module…', { duration: 6000 })

        try {
            if (componentId) {
                await fetch(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${componentId}/finish`),
                    { method: 'POST', headers: getAuthHeaders() }
                )
            }

            const key      = `submitted_components_${params.assignment_id}`
            const submitted = JSON.parse(localStorage.getItem(key) || '[]')
            if (!submitted.includes(params.type)) {
                submitted.push(params.type)
                localStorage.setItem(key, JSON.stringify(submitted))
            }
            // Clear component start anchor so a retest starts fresh
            localStorage.removeItem(`clapcomp_start_${params.assignment_id}_${params.type}`)

            toast.success('Module auto-submitted. Redirecting…')
            setTimeout(() => router.push(`/student/clap-tests/${params.assignment_id}`), 1800)
        } catch (err) {
            console.error('Auto-submit failed', err)
            toast.error('Auto-submit failed — please submit manually.')
            isLockedRef.current = false
            setIsLocked(false)
            setIsAutoSubmitting(false)
        }
    }, [componentId, params.assignment_id, params.type, router])

    useEffect(() => {
        if (timerEnabled && timeLeft === 0 && !isLockedRef.current) {
            autoSubmit()
        }
    }, [timeLeft, timerEnabled, autoSubmit])

    // ── Network-aware save ─────────────────────────────────────────────────

    const { save: debouncedSave, saveImmediate } = useNetworkAwareSave(
        async ({ item_id, response_data }) => {
            try {
                const res = await fetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/submit`), {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body:    JSON.stringify({ item_id, response_data }),
                })
                return res.ok
            } catch { return false }
        }
    )

    // ── Helpers ────────────────────────────────────────────────────────────

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60)
        const s = secs % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const handleSaveAnswer = (val: any) => {
        if (isLocked) return
        const item = items[currentItemIndex]
        setAnswers(prev => ({ ...prev, [item.id]: val }))
        if (!componentId) return
        debouncedSave({ item_id: item.id, response_data: val })
    }

    const handleSubmit = async () => {
        if (isLocked) return
        if (!confirm('Submit this module? You will not be able to change your answers.')) return
        setIsLocked(true)
        try {
            // Flush any pending debounced save for the current item
            const currentItem = items[currentItemIndex]
            if (currentItem && componentId && answers[currentItem.id] !== undefined) {
                await saveImmediate({ item_id: currentItem.id, response_data: answers[currentItem.id] })
            }
            if (componentId) {
                await fetch(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${componentId}/finish`),
                    { method: 'POST', headers: getAuthHeaders() }
                )
            }
            const key      = `submitted_components_${params.assignment_id}`
            const submitted = JSON.parse(localStorage.getItem(key) || '[]')
            if (!submitted.includes(params.type)) {
                submitted.push(params.type)
                localStorage.setItem(key, JSON.stringify(submitted))
            }
            localStorage.removeItem(`clapcomp_start_${params.assignment_id}_${params.type}`)
            toast.success(`${params.type} module submitted!`)
            router.push(`/student/clap-tests/${params.assignment_id}`)
        } catch (err) {
            toast.error('Failed to submit component')
            console.error(err)
            setIsLocked(false)
        }
    }

    // ── Derived values ─────────────────────────────────────────────────────

    const currentItem      = items[currentItemIndex]
    const totalQuestions   = items.filter(i => isQuestion(i.item_type)).length
    const questionNumber   = items.slice(0, currentItemIndex).filter(i => isQuestion(i.item_type)).length +
                             (currentItem && isQuestion(currentItem.item_type) ? 1 : 0)
    const isCurrentQ       = currentItem && isQuestion(currentItem.item_type)

    // Urgency thresholds
    const isUrgent    = timerEnabled && timeLeft !== null && timeLeft <= 300   // < 5 min
    const isCritical  = timerEnabled && timeLeft !== null && timeLeft <= 120   // < 2 min

    if (isLoading) return (
        <div className="h-dvh flex items-center justify-center gap-3 text-gray-500 bg-gray-50">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading assessment…
        </div>
    )

    return (
        <div className="h-dvh flex flex-col bg-gray-50"
             style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

            {/* ── Auto-submit overlay ───────────────────────────────────────── */}
            {isAutoSubmitting && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-6 text-white text-center px-6">
                    <div className="w-20 h-20 rounded-full bg-red-600/20 border-2 border-red-400 flex items-center justify-center">
                        <Clock className="w-10 h-10 text-red-400 animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold mb-2">Time Is Up</h2>
                        <p className="text-gray-300 text-lg">Auto-submitting your responses…</p>
                    </div>
                    <Loader2 className="w-6 h-6 animate-spin text-red-300" />
                </div>
            )}

            {/* ── Header ────────────────────────────────────────────────────── */}
            <header className={`flex-shrink-0 bg-white border-b px-4 py-3 flex items-center justify-between gap-2 shadow-sm transition-colors ${isCritical ? 'border-red-400' : ''}`}>
                <div className="flex items-center gap-2 min-w-0">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} disabled={isLocked}
                            className="flex-shrink-0 min-h-[40px] px-2 sm:px-3">
                        Quit
                    </Button>
                    <h1 className="font-bold text-sm sm:text-base capitalize truncate">{params.type} Assessment</h1>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Offline badge */}
                    {!isOnline && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full flex items-center gap-1">
                            <WifiOff className="w-3 h-3" /> Offline
                        </span>
                    )}
                    {/* Timer display */}
                    {timerEnabled && timeLeft !== null && (
                        <div className={`px-3 py-1.5 rounded-full font-mono font-bold text-sm flex items-center gap-1.5 transition-all ${
                            isCritical
                                ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-200'
                                : isUrgent
                                ? 'bg-orange-500 text-white'
                                : 'bg-indigo-50 text-indigo-700'
                        }`}>
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(timeLeft)}
                        </div>
                    )}
                    {!timerEnabled && (
                        <span className="text-xs text-gray-400 font-medium px-2 py-1 bg-gray-100 rounded-full hidden sm:inline">
                            No Time Limit
                        </span>
                    )}

                    <Button
                        onClick={handleSubmit}
                        disabled={isLocked}
                        className="bg-green-600 hover:bg-green-700 min-h-[40px] text-sm px-3 sm:px-4"
                    >
                        <span className="hidden sm:inline">Submit Module</span>
                        <span className="sm:hidden">Submit</span>
                    </Button>
                </div>
            </header>

            {/* ── Critical time warning banner ──────────────────────────────── */}
            {isCritical && !isLocked && (
                <div className="bg-red-600 text-white text-center py-2 px-4 text-sm font-bold flex items-center justify-center gap-2 animate-pulse">
                    <AlertTriangle className="w-4 h-4" />
                    Less than {Math.ceil((timeLeft ?? 0) / 60)} minute{Math.ceil((timeLeft ?? 0) / 60) !== 1 ? 's' : ''} remaining — complete and submit now!
                </div>
            )}
            {isUrgent && !isCritical && !isLocked && (
                <div className="bg-orange-500 text-white text-center py-1.5 px-4 text-xs font-semibold flex items-center justify-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {Math.ceil((timeLeft ?? 0) / 60)} minutes remaining
                </div>
            )}

            {/* ── Question number pills ─────────────────────────────────────── */}
            {items.length > 1 && (
                <div className="flex-shrink-0 bg-white border-b px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {items.map((item, i) => (
                        <button
                            key={item.id}
                            onClick={() => { if (!isLocked) setCurrentItemIndex(i) }}
                            className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-semibold touch-manipulation transition-colors
                                ${i === currentItemIndex ? 'bg-indigo-600 text-white' :
                                  answers[item.id] !== undefined ? 'bg-green-100 text-green-700 border border-green-300' :
                                  'bg-gray-100 text-gray-600'}`}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Main content ──────────────────────────────────────────────── */}
            <main className="flex-1 px-4 py-4 sm:px-6 max-w-4xl w-full mx-auto flex flex-col overflow-hidden">
                {/* Progress bar */}
                <div className="w-full bg-gray-200 h-1.5 rounded-full mb-4">
                    <div
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${((currentItemIndex + 1) / Math.max(items.length, 1)) * 100}%` }}
                    />
                </div>

                <Card className={`flex-1 shadow-md flex flex-col overflow-hidden ${isLocked ? 'pointer-events-none opacity-70' : ''}`}>
                    <CardContent className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto">
                        {currentItem && (
                            <div className="space-y-6">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    {isCurrentQ
                                        ? `Question ${questionNumber} of ${totalQuestions}`
                                        : `Item ${currentItemIndex + 1} of ${items.length}`
                                    }
                                </span>

                                {/* text_block */}
                                {currentItem.item_type === 'text_block' && (
                                    <div className="prose max-w-none bg-gray-50 p-6 rounded-lg border">
                                        <p className="text-lg text-gray-800 leading-relaxed">
                                            {currentItem.content.text}
                                        </p>
                                    </div>
                                )}

                                {/* mcq */}
                                {currentItem.item_type === 'mcq' && (
                                    <div className="space-y-4 sm:space-y-6">
                                        <h3 className="text-base sm:text-xl font-medium leading-relaxed">{currentItem.content.question}</h3>
                                        <div className="flex flex-col gap-3">
                                            {currentItem.content.options?.map((opt: string, idx: number) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    className={`w-full text-left min-h-[52px] px-4 py-3 rounded-xl border-2
                                                        cursor-pointer transition-all touch-manipulation text-base
                                                        ${answers[currentItem.id] === idx
                                                            ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                                        }`}
                                                    onClick={() => handleSaveAnswer(idx)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                                            answers[currentItem.id] === idx
                                                                ? 'border-indigo-600 bg-indigo-600'
                                                                : 'border-gray-400'
                                                        }`}>
                                                            {answers[currentItem.id] === idx &&
                                                                <CheckCircle className="w-4 h-4 text-white" />
                                                            }
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-400 w-4 flex-shrink-0">
                                                            {String.fromCharCode(65 + idx)}
                                                        </span>
                                                        <span className="text-base leading-snug">{opt}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* subjective */}
                                {currentItem.item_type === 'subjective' && (
                                    <div className="space-y-4">
                                        <h3 className="text-base sm:text-xl font-medium leading-relaxed">{currentItem.content.question}</h3>
                                        <Textarea
                                            value={answers[currentItem.id] || ''}
                                            onChange={e => handleSaveAnswer(e.target.value)}
                                            rows={8}
                                            placeholder="Type your answer here…"
                                            className="text-base leading-relaxed p-4 min-h-[200px] resize-none"
                                            disabled={isLocked}
                                        />
                                        <p className="text-sm text-gray-400 text-right">
                                            Min words: {currentItem.content.min_words || 50}
                                            {currentItem.content.max_words ? ` · Max: ${currentItem.content.max_words}` : ''}
                                        </p>
                                    </div>
                                )}

                                {/* audio_block */}
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

                                {/* audio_recording */}
                                {currentItem.item_type === 'audio_recording' && (
                                    <AudioRecorderItem
                                        itemId={currentItem.id}
                                        assignmentId={params.assignment_id as string}
                                        question={currentItem.content.question || 'Record your response'}
                                        instructions={currentItem.content.instructions}
                                        maxDuration={currentItem.content.max_duration || 300}
                                        savedAudioUrl={answers[currentItem.id]?.file_url}
                                        onSave={data => handleSaveAnswer({
                                            type:     'audio',
                                            file_url: data.audio_response.file_url,
                                            duration: data.audio_response.duration,
                                        })}
                                    />
                                )}

                                {/* file_upload */}
                                {currentItem.item_type === 'file_upload' && (
                                    <div className="space-y-4 p-6 bg-orange-50 rounded-xl border border-orange-200">
                                        {currentItem.content.prompt && (
                                            <p className="text-lg font-medium">{currentItem.content.prompt}</p>
                                        )}
                                        {currentItem.content.instructions && (
                                            <p className="text-sm text-gray-500">{currentItem.content.instructions}</p>
                                        )}
                                        <input
                                            type="file"
                                            accept={(currentItem.content.file_types || ['pdf']).map((t: string) => `.${t}`).join(',')}
                                            className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-600 file:text-white hover:file:bg-orange-700"
                                            disabled={isLocked}
                                        />
                                        <p className="text-xs text-gray-400">
                                            Allowed: {(currentItem.content.file_types || ['pdf']).map((t: string) => `.${t}`).join(', ')} · Max {currentItem.content.max_file_size_mb || 5} MB
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Navigation */}
                <div className="mt-4 flex items-center justify-between gap-3">
                    <Button
                        variant="outline"
                        onClick={() => { if (!isLocked && currentItemIndex > 0) setCurrentItemIndex(p => p - 1) }}
                        disabled={currentItemIndex === 0 || isLocked}
                        className="min-h-[44px] min-w-[90px] sm:w-32 touch-manipulation"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Previous</span>
                        <span className="sm:hidden">Prev</span>
                    </Button>
                    <span className="text-sm text-gray-500">
                        {currentItemIndex + 1} / {items.length}
                    </span>
                    <Button
                        onClick={() => { if (!isLocked && currentItemIndex < items.length - 1) setCurrentItemIndex(p => p + 1) }}
                        disabled={currentItemIndex === items.length - 1 || isLocked}
                        className="min-h-[44px] min-w-[90px] sm:w-32 touch-manipulation"
                    >
                        Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
            </main>
        </div>
    )
}
