'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ChevronRight, ChevronLeft, CheckCircle, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import AudioRecorderItem from '@/components/audio-recorder'
import AudioBlockPlayer from '@/components/AudioBlockPlayer'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

// Question classification helper
const isQuestion = (itemType: string): boolean => {
    return itemType === 'mcq' || itemType === 'subjective'
}

// M4: Retry helper with exponential backoff (0.5s, 1s, 2s)
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error = new Error('Unknown error')
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await apiFetch(url, options)
            // Don't retry client errors (4xx) — only server errors (5xx) and network failures
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
    const params = useParams()
    const router = useRouter()
    const isOnline = useNetworkStatus()  // H2: offline detection

    const [items, setItems] = useState<any[]>([])
    const [currentItemIndex, setCurrentItemIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<string, any>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [componentId, setComponentId] = useState<string | null>(null)

    // H3: Auto-save status indicator
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Fetch Items — H1: AbortController prevents setState on unmounted component
    useEffect(() => {
        const controller = new AbortController()

        const fetchTestContent = async () => {
            try {
                // 1. Fetch Assignment to get Component ID
                const assignmentResponse = await apiFetch(getApiUrl('student/clap-assignments'), {
                    headers: getAuthHeaders(),
                    signal: controller.signal,
                })
                if (controller.signal.aborted) return
                const assignmentData = await assignmentResponse.json()

                const myAssignment = assignmentData.assignments.find((a: any) => a.assignment_id === params.assignment_id)
                if (!myAssignment) throw new Error('Assignment not found')

                // 2. Find Component ID by Type
                const component = myAssignment.components.find((c: any) => c.type === params.type)
                if (!component) throw new Error('Component not found')

                setComponentId(component.id)

                // 3. Fetch Items — server creates ComponentAttempt for server-side deadline enforcement
                const itemsResponse = await apiFetch(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${component.id}/items`),
                    { headers: getAuthHeaders(), signal: controller.signal }
                )
                if (controller.signal.aborted) return
                const itemsData = await itemsResponse.json()

                if (itemsResponse.ok) {
                    setItems(itemsData.items)

                    // Load saved answers
                    const savedAnswers: Record<string, any> = {}
                    itemsData.items.forEach((item: any) => {
                        if (item.saved_response) {
                            savedAnswers[item.id] = item.saved_response
                        }
                    })
                    setAnswers(savedAnswers)
                } else {
                    toast.error('Failed to load questions')
                }

            } catch (error) {
                if ((error as Error).name === 'AbortError') return  // H1: expected on unmount
                console.error(error)
                toast.error('Failed to load assessment')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        if (params.assignment_id && params.type) {
            fetchTestContent()
        }

        return () => controller.abort()  // H1: cleanup on unmount
    }, [params.assignment_id, params.type])

    const handleSaveAnswer = async (val: any) => {
        const currentItem = items[currentItemIndex]
        const newAnswers = { ...answers, [currentItem.id]: val }
        setAnswers(newAnswers)

        // Auto-save to backend
        if (!componentId) return

        // H3: Clear any pending "saved" reset timer
        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)

        try {
            setSaveStatus('saving')
            await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/submit`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    item_id: currentItem.id,
                    response_data: val
                })
            })
            setSaveStatus('saved')
            // H3: Reset indicator after 2s
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
        } catch (e) {
            console.error('Auto-save failed', e)
            setSaveStatus('error')
        }
    }

    const handleNext = () => {
        if (currentItemIndex < items.length - 1) setCurrentItemIndex(prev => prev + 1)
    }

    const handlePrev = () => {
        if (currentItemIndex > 0) setCurrentItemIndex(prev => prev - 1)
    }

    // M4: Manual submit with retry logic for critical network failures
    const handleSubmit = async () => {
        if (!confirm('Submit test?')) return

        try {
            // M4: Retry finish_component up to 3×
            if (componentId) {
                await fetchWithRetry(
                    getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${componentId}/finish`),
                    { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } }
                )
            }

            const idempotencyKey = crypto.randomUUID()
            // M4: Retry final submission up to 3×
            const submitResp = await fetchWithRetry(getApiUrl('submissions'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    assignment_id: params.assignment_id,
                    idempotency_key: idempotencyKey,
                    correlation_id: idempotencyKey
                })
            })

            if (!submitResp.ok) {
                throw new Error('Submission creation failed')
            }

            const submissionData = await submitResp.json()
            const submissionId = submissionData.submission_id

            toast.success('Test Submitted! Processing has started.')
            router.push(`/student/clap-tests/${params.assignment_id}?submission_id=${submissionId}`)
        } catch (error) {
            toast.error('Failed to submit test. Please try again or contact support.')
            console.error(error)
        }
    }

    const currentItem = items[currentItemIndex]

    // Calculate question numbering (only MCQs count as questions)
    const totalQuestions = items.filter(item => isQuestion(item.item_type)).length
    const questionNumber = items.slice(0, currentItemIndex).filter(item => isQuestion(item.item_type)).length +
                          (currentItem && isQuestion(currentItem.item_type) ? 1 : 0)
    const isCurrentItemQuestion = currentItem && isQuestion(currentItem.item_type)

    // M3: Copy-paste prevention applies only to writing/subjective components
    const isWritingType = params.type === 'writing' || params.type === 'subjective'
    const preventCopyOrCut = isWritingType
        ? (e: React.ClipboardEvent) => { e.preventDefault() }
        : undefined
    // Paste also fires a server-side malpractice event (fire-and-forget)
    const preventPaste = isWritingType
        ? (e: React.ClipboardEvent) => {
            e.preventDefault()
            apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/malpractice-event`), {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_type: 'paste_attempt', meta: { component_type: params.type } }),
            }).catch(() => { /* silent */ })
          }
        : undefined

    if (isLoading) {
        return (
            <div className="h-screen flex flex-col bg-gray-50">
                {/* M1: Skeleton loading state */}
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
                <main className="flex-1 container mx-auto p-6 max-w-4xl flex flex-col">
                    <div className="h-2 bg-gray-200 rounded-full mb-8 animate-pulse" />
                    <div className="flex-1 rounded-xl border bg-white p-8 animate-pulse space-y-6">
                        <div className="h-4 bg-gray-100 rounded w-32" />
                        <div className="h-7 bg-gray-200 rounded w-3/4" />
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-14 bg-gray-100 rounded-lg border-2 border-gray-100" />
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* H2: Offline banner — fixed at top */}
            {!isOnline && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm font-medium
                                text-center py-2 px-4 flex items-center justify-center gap-2">
                    <WifiOff className="w-4 h-4" />
                    No internet connection — your answers are at risk. Reconnect immediately.
                </div>
            )}

            {/* Header */}
            <header className={`bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm ${!isOnline ? 'mt-9' : ''}`}>
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()}>
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Quit</span>
                    </Button>
                    <h1 className="font-bold text-lg capitalize">{params.type} Assessment</h1>
                </div>
                <div className="flex items-center gap-3">
                    {/* H3: Save status indicator — inline, non-intrusive */}
                    <span className={`text-xs font-medium transition-all duration-200 min-w-[70px] text-right ${
                        saveStatus === 'saving' ? 'text-blue-500' :
                        saveStatus === 'saved'  ? 'text-green-600' :
                        saveStatus === 'error'  ? 'text-red-500'  :
                        'text-transparent select-none'
                    }`}>
                        {saveStatus === 'saving' ? 'Saving…'       :
                         saveStatus === 'saved'  ? '✓ Saved'       :
                         saveStatus === 'error'  ? '⚠ Save failed' : '·'}
                    </span>

                    <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
                        Submit Test
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 container mx-auto p-6 max-w-4xl flex flex-col overflow-hidden">
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 h-2 rounded-full mb-6 flex-shrink-0">
                    <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${((currentItemIndex + 1) / items.length) * 100}%` }}
                    />
                </div>

                <Card className="flex-1 shadow-md flex flex-col min-h-0">
                    <CardContent className="p-6 sm:p-8 flex-1 overflow-y-auto">
                        {currentItem && (
                            <div className="space-y-6">
                                {isCurrentItemQuestion && totalQuestions > 0 && (
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                        Question {questionNumber} of {totalQuestions}
                                    </span>
                                )}
                                {!isCurrentItemQuestion && (
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                        Item {currentItemIndex + 1} of {items.length}
                                    </span>
                                )}

                                {currentItem.item_type === 'text_block' && (
                                    <div className="prose max-w-none bg-gray-50 p-6 rounded-lg border">
                                        <p className="text-base sm:text-lg text-gray-800 leading-relaxed">{currentItem.content.text}</p>
                                    </div>
                                )}

                                {currentItem.item_type === 'mcq' && (
                                    <div className="space-y-6">
                                        <h3 className="text-lg sm:text-xl font-medium">{currentItem.content.question}</h3>
                                        <div className="space-y-3">
                                            {currentItem.content.options?.map((opt: string, index: number) => (
                                                <div
                                                    key={index}
                                                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                                                        answers[currentItem.id] === index
                                                            ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                                                            : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                                    onClick={() => handleSaveAnswer(index)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                                            answers[currentItem.id] === index
                                                                ? 'border-indigo-600 bg-indigo-600'
                                                                : 'border-gray-400'
                                                        }`}>
                                                            {answers[currentItem.id] === index && <CheckCircle className="w-4 h-4 text-white" />}
                                                        </div>
                                                        <span className="text-base sm:text-lg">{opt}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {currentItem.item_type === 'subjective' && (
                                    <div className="space-y-4">
                                        <h3 className="text-lg sm:text-xl font-medium">{currentItem.content.question}</h3>
                                        {/* M3: Copy-paste prevention on writing/subjective types */}
                                        <Textarea
                                            value={answers[currentItem.id] || ''}
                                            onChange={(e) => handleSaveAnswer(e.target.value)}
                                            onCopy={preventCopyOrCut}
                                            onPaste={preventPaste}
                                            onCut={preventCopyOrCut}
                                            placeholder="Type your answer here..."
                                            className="text-base sm:text-lg leading-relaxed p-4 min-h-[150px] sm:min-h-[240px] resize-y"
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
                                        onSave={(data) => {
                                            handleSaveAnswer({
                                                type: 'audio',
                                                file_url: data.audio_response.file_url,
                                                duration: data.audio_response.duration
                                            })
                                        }}
                                    />
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* M2: Navigation — flex-1 buttons instead of w-32 fixed width */}
                <div className="mt-4 flex justify-between gap-3 flex-shrink-0">
                    <Button
                        variant="outline"
                        onClick={handlePrev}
                        disabled={currentItemIndex === 0}
                        className="flex-1 min-w-[80px]"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Previous</span>
                        <span className="sm:hidden">Prev</span>
                    </Button>
                    <Button
                        onClick={handleNext}
                        disabled={currentItemIndex === items.length - 1}
                        className="flex-1 min-w-[80px]"
                    >
                        <span className="hidden sm:inline">Next</span>
                        <span className="sm:hidden">Next</span>
                        <ChevronRight className="w-4 h-4 ml-1 sm:ml-2" />
                    </Button>
                </div>
            </main>
        </div>
    )
}
