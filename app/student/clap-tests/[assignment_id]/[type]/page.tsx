'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Clock, Save, ChevronRight, ChevronLeft, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import AudioRecorderItem from '@/components/audio-recorder'
import AudioBlockPlayer from '@/components/AudioBlockPlayer'

// Question classification helper
const isQuestion = (itemType: string): boolean => {
    return itemType === 'mcq' || itemType === 'subjective'
}

export default function ClapTestTakingPage() {
    const params = useParams()
    const router = useRouter()
    const [items, setItems] = useState<any[]>([])
    const [currentItemIndex, setCurrentItemIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<string, any>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [timeLeft, setTimeLeft] = useState(0)
    const [componentId, setComponentId] = useState<string | null>(null)

    // Server-anchored timer state
    const [serverDeadline, setServerDeadline] = useState<Date | null>(null)
    const [isExpired, setIsExpired] = useState(false)
    const autoSubmitFiredRef = useRef(false)

    // Auto-submit when timer expires — no confirm dialog
    const handleAutoSubmit = useCallback(async () => {
        if (autoSubmitFiredRef.current) return
        autoSubmitFiredRef.current = true

        try {
            const compId = componentId
            if (compId) {
                await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${compId}/finish`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
                })
            }
            toast.warning('Time is up! Your answers have been submitted.')
            router.push(`/student/clap-tests/${params.assignment_id}`)
        } catch {
            toast.error('Auto-submit failed. Please click Submit manually immediately.')
        }
    }, [componentId, params.assignment_id, router])

    // Fetch Items
    useEffect(() => {
        const fetchTestContent = async () => {
            try {
                // 1. Fetch Assignment to get Component ID
                const assignmentResponse = await apiFetch(getApiUrl('student/clap-assignments'), {
                    headers: getAuthHeaders()
                })
                const assignmentData = await assignmentResponse.json()

                const myAssignment = assignmentData.assignments.find((a: any) => a.assignment_id === params.assignment_id)
                if (!myAssignment) throw new Error('Assignment not found')

                // 2. Find Component ID by Type
                const component = myAssignment.components.find((c: any) => c.type === params.type)
                if (!component) throw new Error('Component not found')

                setComponentId(component.id)

                // 3. Fetch Items — server creates ComponentAttempt + returns server_deadline
                const itemsResponse = await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${component.id}/items`), {
                    headers: getAuthHeaders()
                })
                const itemsData = await itemsResponse.json()

                if (itemsResponse.ok) {
                    setItems(itemsData.items)

                    // Sync timer from server deadline (authoritative source of truth)
                    if (itemsData.component?.server_deadline) {
                        const deadline = new Date(itemsData.component.server_deadline)
                        setServerDeadline(deadline)

                        // If already expired when page loads (e.g. student returns after tab crash)
                        if (itemsData.component.is_expired) {
                            setIsExpired(true)
                            setTimeLeft(0)
                        } else {
                            const remaining = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000))
                            setTimeLeft(remaining)
                        }
                    } else {
                        // Fallback: use component duration if server deadline not yet returned
                        setTimeLeft(component.duration * 60)
                    }

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
                console.error(error)
                toast.error('Failed to load assessment')
            } finally {
                setIsLoading(false)
            }
        }

        if (params.assignment_id && params.type) {
            fetchTestContent()
        }
    }, [params.assignment_id, params.type])

    // Server-anchored countdown timer
    // Derives timeLeft from serverDeadline (a UTC timestamp) on every tick.
    // Cannot be cheated by modifying localStorage or React state in DevTools.
    useEffect(() => {
        if (isLoading || !serverDeadline) return
        if (isExpired) return

        const updateTimer = () => {
            const remaining = Math.max(0, Math.floor((serverDeadline.getTime() - Date.now()) / 1000))
            setTimeLeft(remaining)

            if (remaining === 0 && !autoSubmitFiredRef.current) {
                setIsExpired(true)
                handleAutoSubmit()
            }
        }

        updateTimer() // immediate tick on mount
        const timer = setInterval(updateTimer, 1000)
        return () => clearInterval(timer)
    }, [isLoading, serverDeadline, isExpired, handleAutoSubmit])

    // If already expired on initial load (tab crash recovery)
    useEffect(() => {
        if (!isLoading && isExpired && !autoSubmitFiredRef.current) {
            handleAutoSubmit()
        }
    }, [isLoading, isExpired, handleAutoSubmit])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const isTimeCritical = timeLeft <= 60 && timeLeft > 0
    const isTimeWarning = timeLeft <= 300 && timeLeft > 60

    const handleSaveAnswer = async (val: any) => {
        const currentItem = items[currentItemIndex]
        const newAnswers = { ...answers, [currentItem.id]: val }
        setAnswers(newAnswers)

        // Auto-save to backend
        if (!componentId) return

        try {
            await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/submit`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    item_id: currentItem.id,
                    response_data: val
                })
            })
        } catch (e) {
            console.error('Auto-save failed', e)
        }
    }

    const handleNext = () => {
        if (currentItemIndex < items.length - 1) setCurrentItemIndex(prev => prev + 1)
    }

    const handlePrev = () => {
        if (currentItemIndex > 0) setCurrentItemIndex(prev => prev - 1)
    }

    const handleSubmit = async () => {
        if (isExpired) return // Already auto-submitted
        if (!confirm('Submit test?')) return

        try {
            if (componentId) {
                await apiFetch(getApiUrl(`student/clap-assignments/${params.assignment_id}/components/${componentId}/finish`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
                })
            }

            const idempotencyKey = crypto.randomUUID()
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
            })

            if (!submitResp.ok) {
                throw new Error('Submission creation failed')
            }

            const submissionData = await submitResp.json()
            const submissionId = submissionData.submission_id

            toast.success('Test Submitted! Processing has started.')
            router.push(`/student/clap-tests/${params.assignment_id}?submission_id=${submissionId}`)
        } catch (error) {
            toast.error('Failed to submit test')
            console.error(error)
        }
    }

    const currentItem = items[currentItemIndex]

    // Calculate question numbering (only MCQs count as questions)
    const totalQuestions = items.filter(item => isQuestion(item.item_type)).length
    const questionNumber = items.slice(0, currentItemIndex).filter(item => isQuestion(item.item_type)).length +
                          (currentItem && isQuestion(currentItem.item_type) ? 1 : 0)
    const isCurrentItemQuestion = currentItem && isQuestion(currentItem.item_type)

    if (isLoading) return <div className="p-8 text-center">Loading assessment...</div>

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()}>Quit</Button>
                    <h1 className="font-bold text-lg capitalize">{params.type} Assessment</h1>
                </div>
                <div className="flex items-center gap-4">
                    {/* Timer display — color shifts based on urgency */}
                    {!isExpired ? (
                        <div className={`px-4 py-2 rounded-full font-mono font-medium flex items-center gap-2 ${
                            isTimeCritical
                                ? 'bg-red-100 text-red-700 animate-pulse'
                                : isTimeWarning
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-indigo-50 text-indigo-700'
                        }`}>
                            <Clock className="w-4 h-4" />
                            {formatTime(timeLeft)}
                        </div>
                    ) : (
                        <div className="bg-red-100 text-red-700 px-4 py-2 rounded-full font-medium flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Time Expired
                        </div>
                    )}

                    {/* Submit button — disabled and replaced with message after auto-submit */}
                    {!isExpired ? (
                        <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
                            Submit Test
                        </Button>
                    ) : (
                        <span className="text-sm text-red-600 font-medium">Auto-submitted</span>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 container mx-auto p-6 max-w-4xl flex flex-col">
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 h-2 rounded-full mb-8">
                    <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${((currentItemIndex + 1) / items.length) * 100}%` }}
                    ></div>
                </div>

                <Card className="flex-1 shadow-md flex flex-col">
                    <CardContent className="p-8 flex-1 overflow-y-auto">
                        {currentItem && (
                            <div className="space-y-6">
                                {isCurrentItemQuestion && totalQuestions > 0 && (
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Question {questionNumber} of {totalQuestions}</span>
                                )}
                                {!isCurrentItemQuestion && (
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Item {currentItemIndex + 1} of {items.length}</span>
                                )}

                                {currentItem.item_type === 'text_block' && (
                                    <div className="prose max-w-none bg-gray-50 p-6 rounded-lg border">
                                        <p className="text-lg text-gray-800 leading-relaxed">{currentItem.content.text}</p>
                                    </div>
                                )}

                                {currentItem.item_type === 'mcq' && (
                                    <div className="space-y-6">
                                        <h3 className="text-xl font-medium">{currentItem.content.question}</h3>
                                        <div className="space-y-3">
                                            {currentItem.content.options?.map((opt: string, index: number) => (
                                                <div
                                                    key={index}
                                                    className={`p-4 rounded-lg border-2 transition-all ${isExpired ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${answers[currentItem.id] === index
                                                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                                                        : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                    onClick={() => !isExpired && handleSaveAnswer(index)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${answers[currentItem.id] === index ? 'border-indigo-600 bg-indigo-600' : 'border-gray-400'
                                                            }`}>
                                                            {answers[currentItem.id] === index && <CheckCircle className="w-4 h-4 text-white" />}
                                                        </div>
                                                        <span className="text-lg">{opt}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {currentItem.item_type === 'subjective' && (
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-medium">{currentItem.content.question}</h3>
                                        <Textarea
                                            value={answers[currentItem.id] || ''}
                                            onChange={(e) => !isExpired && handleSaveAnswer(e.target.value)}
                                            rows={10}
                                            placeholder="Type your answer here..."
                                            className="text-lg leading-relaxed p-4"
                                            disabled={isExpired}
                                        />
                                        <p className="text-sm text-gray-500 text-right">Min words: {currentItem.content.min_words || 50}</p>
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
                                            if (!isExpired) {
                                                handleSaveAnswer({
                                                    type: 'audio',
                                                    file_url: data.audio_response.file_url,
                                                    duration: data.audio_response.duration
                                                })
                                            }
                                        }}
                                    />
                                )}

                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Navigation */}
                <div className="mt-8 flex justify-between">
                    <Button
                        variant="outline"
                        onClick={handlePrev}
                        disabled={currentItemIndex === 0}
                        className="w-32"
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                    </Button>
                    <Button
                        onClick={handleNext}
                        disabled={currentItemIndex === items.length - 1}
                        className="w-32"
                    >
                        Next <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </main>
        </div>
    )
}
