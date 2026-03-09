import { useState, useRef, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Clock,
    BookA,
    HelpCircle,
    ChevronLeft,
    ChevronRight,
    Flag,
    CheckCircle,
    Mic,
    Square,
    Play,
    Pause,
    RotateCcw,
    Volume2,
    PenTool,
    FileText,
    Save,
    Send,
    AlertTriangle,
    X,
    LayoutGrid,
    CheckSquare,
    Info,
    AlertCircle,
    UploadCloud as CloudUpload
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { authStorage } from '@/lib/auth-storage'

// Question classification helper
const isQuestion = (itemType: string): boolean => {
    return itemType === 'mcq' || itemType === 'subjective' || itemType === 'audio_recording'
}

type TestPreviewModalProps = {
    isOpen: boolean
    onClose: () => void
    testType: string
    items: any[]
    testTitle: string
    duration?: number
    globalTimeLeft?: number | null
}

export function TestPreviewModal({ isOpen, onClose, testType, items, testTitle, duration = 0, globalTimeLeft }: TestPreviewModalProps) {
    // --- State Management ---
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [answers, setAnswers] = useState<{ [itemId: string]: any }>({})
    const [visited, setVisited] = useState<Set<number>>(new Set([0]))
    const [marked, setMarked] = useState<Set<number>>(new Set())
    const [timeLeft, setTimeLeft] = useState((duration || 60) * 60)
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [isTimedOut, setIsTimedOut] = useState(false)  // true = expired by clock (not manual)
    const [isPaletteOpen, setIsPaletteOpen] = useState(false)

    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // --- Effects ---

    // Timer Logic
    useEffect(() => {
        if (!isOpen) return

        setCurrentQuestionIndex(0)
        setAnswers({})
        setVisited(new Set([0]))
        setMarked(new Set())
        setTimeLeft(duration > 0 ? duration * 60 : 60 * 60)
        setIsSubmitted(false)
        setIsTimedOut(false)
        setShowSubmitModal(false)
        setIsPaletteOpen(false)

        if (duration > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current!)
                        handleTimeUp()
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [isOpen, duration])

    // Update Visited on Navigation
    useEffect(() => {
        if (isOpen && !visited.has(currentQuestionIndex)) {
            setVisited(prev => new Set(prev).add(currentQuestionIndex))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentQuestionIndex, isOpen])

    // Safety: ensure index relies on items
    useEffect(() => {
        if (items.length > 0 && currentQuestionIndex >= items.length) {
            setCurrentQuestionIndex(0)
        }
    }, [items.length, currentQuestionIndex])


    // --- Handlers ---

    const handleAnswer = (itemId: string, value: any) => {
        setAnswers(prev => {
            const newAnswers = { ...prev }
            if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
                delete newAnswers[itemId]
            } else {
                newAnswers[itemId] = value
            }
            return newAnswers
        })
    }

    const handleMarkReview = () => {
        setMarked(prev => {
            const newSet = new Set(prev)
            if (newSet.has(currentQuestionIndex)) newSet.delete(currentQuestionIndex)
            else newSet.add(currentQuestionIndex)
            return newSet
        })
    }

    const handleClearResponse = () => {
        const currentItem = items[currentQuestionIndex]
        if (!currentItem) return

        setAnswers(prev => {
            const newAnswers = { ...prev }
            delete newAnswers[currentItem.id]
            return newAnswers
        })
    }

    const handleNext = () => {
        if (currentQuestionIndex < items.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1)
        }
    }

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1)
        }
    }

    const handleTimeUp = () => {
        setIsSubmitted(true)
        setIsTimedOut(true)   // show the non-dismissible TIME'S UP overlay
    }

    const handleSubmitClick = () => {
        setShowSubmitModal(true)
    }

    const confirmSubmit = () => {
        setShowSubmitModal(false)
        onClose()
    }

    // --- Helper for Stats ---
    const getStats = () => {
        const questionItems = items.filter(item => isQuestion(item.item_type))
        const total = questionItems.length

        const answeredCount = Object.keys(answers).filter(itemId => {
            const item = items.find(i => i.id === itemId)
            return item && isQuestion(item.item_type)
        }).length

        const markedCount = Array.from(marked).filter(index => {
            const item = items[index]
            return item && isQuestion(item.item_type)
        }).length

        const visitedCount = Array.from(visited).filter(index => {
            const item = items[index]
            return item && isQuestion(item.item_type)
        }).length

        const notVisitedCount = total - visitedCount

        return {
            total,
            answered: answeredCount,
            notAnswered: total - answeredCount,
            marked: markedCount,
            visited: visitedCount,
            notVisited: notVisitedCount
        }
    }

    const stats = getStats()
    const currentItem = items[currentQuestionIndex]

    if (!isOpen) return null

    // --- Render ---
    return (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col overflow-hidden animate-in fade-in duration-200">

            {/* 1. Header */}
            <header className="bg-slate-800 text-white px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 shadow-md gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-white/10 p-2 rounded-lg shrink-0">
                        {testType === 'listening' && <Volume2 className="w-5 h-5" />}
                        {testType === 'speaking' && <Mic className="w-5 h-5" />}
                        {testType === 'reading' && <BookA className="w-5 h-5" />}
                        {testType === 'writing' && <PenTool className="w-5 h-5" />}
                        {testType === 'vocabulary' && <CheckSquare className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm sm:text-lg font-bold truncate">{testTitle}</h2>
                        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-300 uppercase tracking-widest mt-0.5">
                            <span>{testType} Test</span>
                            <span className="w-1 h-1 rounded-full bg-slate-500" />
                            <span className="text-indigo-200 font-bold">
                                Total: {items.reduce((sum, item) => sum + (item.item_type === 'mcq' ? (item.points || 0) : 0), 0)} Marks
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    {/* Timer */}
                    {(globalTimeLeft !== undefined && globalTimeLeft !== null) ? (
                        <div className={`flex items-center gap-1 sm:gap-2 text-base sm:text-xl font-mono font-bold ${globalTimeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                            {Math.floor(globalTimeLeft / 60).toString().padStart(2, '0')}:{(globalTimeLeft % 60).toString().padStart(2, '0')}
                        </div>
                    ) : duration > 0 ? (
                        <div className={`flex items-center gap-1 sm:gap-2 text-base sm:text-xl font-mono font-bold ${timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                            {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                        </div>
                    ) : (
                        <div className="hidden sm:block text-sm text-gray-400 font-mono">No Time Limit</div>
                    )}

                    {/* Mobile Palette Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden text-white hover:bg-white/20 h-9 w-9"
                        onClick={() => setIsPaletteOpen(true)}
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </Button>

                    {/* Exit button - full on sm+, icon-only on xs */}
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={onClose}
                        className="hidden sm:flex bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50"
                    >
                        <X className="w-4 h-4 mr-2" />
                        Exit Preview
                    </Button>
                    <Button
                        variant="destructive"
                        size="icon"
                        onClick={onClose}
                        className="sm:hidden bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50 h-9 w-9"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </header>

            {/* 2. Main Layout */}
            <div className="flex flex-row flex-1 overflow-hidden">

                {/* LEFT PANE: Question Area */}
                <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
                    {items.length === 0 || !currentItem ? (
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                            {items.length === 0 ? "No questions available." : "Loading question..."}
                        </div>
                    ) : (
                        <>
                            {/* Question Header Bar */}
                            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0 z-10">
                                <h3 className="text-base sm:text-lg font-bold text-slate-800">
                                    {isQuestion(currentItem.item_type)
                                        ? `Question ${items.slice(0, currentQuestionIndex + 1).filter((i: any) => isQuestion(i.item_type)).length}`
                                        : currentItem.item_type.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                </h3>
                                <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                                    <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100 uppercase text-[10px] font-black tracking-wider">
                                        {currentItem.item_type.replace(/_/g, ' ')}
                                    </span>
                                    {currentItem.item_type === 'mcq' && (
                                        <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded-md border border-amber-100 font-bold text-xs">
                                            <span>+{currentItem.points || 0} Marks</span>
                                        </div>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`${marked.has(currentQuestionIndex) ? 'text-purple-600 bg-purple-50' : 'text-slate-500 hover:bg-purple-50 hover:text-purple-600'} transition-all font-semibold rounded-full`}
                                        onClick={handleMarkReview}
                                    >
                                        <Flag className={`w-4 h-4 mr-1.5 ${marked.has(currentQuestionIndex) ? 'fill-purple-600' : ''}`} />
                                        <span className="hidden sm:inline">{marked.has(currentQuestionIndex) ? 'Marked' : 'Mark for Review'}</span>
                                    </Button>
                                </div>
                            </div>

                            {/* Content Scroll Area */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                                <div className="max-w-4xl mx-auto pb-24">
                                    <Card className="shadow-md border-slate-200 overflow-hidden">
                                        <CardContent className="p-6 sm:p-10">
                                            <ItemRenderer
                                                item={currentItem}
                                                answer={answers[currentItem.id]}
                                                onAnswer={(val: any) => handleAnswer(currentItem.id, val)}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between shrink-0 gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-10">
                                <div className="flex gap-2 w-full sm:w-auto order-2 sm:order-1">
                                    <Button
                                        variant="outline"
                                        onClick={handleClearResponse}
                                        disabled={answers[currentItem.id] === undefined}
                                        className="w-full sm:w-auto text-slate-500 border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-bold shadow-sm group px-6"
                                    >
                                        <RotateCcw className="w-4 h-4 mr-2 transition-transform group-hover:-rotate-45" />
                                        <span>Clear Response</span>
                                    </Button>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
                                    <Button
                                        variant="outline"
                                        onClick={handlePrev}
                                        disabled={currentQuestionIndex === 0}
                                        className="flex-1 sm:w-40 bg-slate-100 border-slate-300 text-slate-700 shadow-sm hover:bg-slate-200 hover:border-slate-400 transition-all font-bold"
                                    >
                                        <ChevronLeft className="w-5 h-5 mr-1" />
                                        <span>Previous</span>
                                    </Button>
                                    {currentQuestionIndex === items.length - 1 ? (
                                        <Button
                                            className="flex-1 sm:w-40 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-100 font-black text-lg border-b-4 border-emerald-800 active:border-b-0 active:translate-y-[2px] transition-all"
                                            onClick={handleSubmitClick}
                                        >
                                            Submit
                                        </Button>
                                    ) : (
                                        <Button
                                            className="flex-1 sm:w-40 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 font-black text-lg border-b-4 border-indigo-800 active:border-b-0 active:translate-y-[2px] transition-all"
                                            onClick={handleNext}
                                        >
                                            <span className="hidden sm:inline">Save & Next</span>
                                            <span className="sm:hidden">Next</span>
                                            <ChevronRight className="w-5 h-5 ml-1" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Mobile Overlay */}
                {isPaletteOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setIsPaletteOpen(false)}
                    />
                )}

                {/* RIGHT PANE: Question Palette */}
                <div className={`
                    fixed inset-y-0 right-0 w-[85vw] sm:w-80 bg-white flex flex-col shadow-2xl z-50
                    transform transition-transform duration-300 ease-in-out
                    lg:static lg:translate-x-0 lg:w-72 xl:w-80 lg:shadow-none lg:border-l lg:border-gray-200 lg:shrink-0
                    ${isPaletteOpen ? 'translate-x-0' : 'translate-x-full'}
                `}>
                    {/* Profile Info */}
                    <div className="p-4 border-b flex items-center justify-between bg-slate-50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
                                TS
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-800">Test Student</p>
                                <p className="text-xs text-gray-500">Candidate</p>
                            </div>
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

                    {/* Palette Grid */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Questions Palette</h4>
                        <div className="grid grid-cols-5 gap-2">
                            {items.map((item, index) => {
                                if (!isQuestion(item.item_type)) return null

                                const isAnswered = answers[items[index].id] !== undefined
                                const isMarked = marked.has(index)
                                const isVisited = visited.has(index)
                                const isCurrent = currentQuestionIndex === index

                                const questionNumber = items.slice(0, index + 1).filter(i => isQuestion(i.item_type)).length

                                let colorClass = 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'

                                if (isVisited && !isAnswered) {
                                    colorClass = 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                }
                                if (isAnswered) {
                                    colorClass = 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                                }
                                if (isMarked) {
                                    colorClass = 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                                    if (isAnswered) {
                                        colorClass = 'bg-purple-100 text-purple-700 border-purple-300 ring-1 ring-green-400'
                                    }
                                }
                                if (isCurrent) {
                                    colorClass += ' ring-2 ring-indigo-500 ring-offset-1'
                                }

                                return (
                                    <button
                                        key={index}
                                        onClick={() => { setCurrentQuestionIndex(index); setIsPaletteOpen(false); }}
                                        className={`relative h-9 w-full rounded-lg flex items-center justify-center font-bold text-sm transition-all border ${colorClass}`}
                                    >
                                        {questionNumber}
                                        {isMarked && (
                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full border border-white" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Submit Section */}
                    <div className="p-4 border-t bg-gray-50 shrink-0">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmitClick}>
                            Submit Test
                        </Button>
                    </div>
                </div>
            </div>

            {/* 3. Submit Modal */}
            {/* TIME'S UP overlay — shown when timer expires (not dismissible — mirrors what students see) */}
            {isTimedOut && (
                <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-6 text-center">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-5">
                        <div className="w-16 h-16 rounded-full bg-red-100 border-2 border-red-400 flex items-center justify-center mx-auto">
                            <Clock className="w-8 h-8 text-red-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Time Is Up</h2>
                            <p className="text-gray-500 mt-1 text-sm">
                                In the live exam, students&apos; module is auto-submitted and they are redirected back to the dashboard.
                            </p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-left space-y-1">
                            <p className="font-bold">Admin Preview Note</p>
                            <p>Timer was set to <strong>{duration} minutes</strong> as configured in the Configure tab.</p>
                            <p>This timer enforces auto-submission for students in real exams.</p>
                        </div>
                        <Button onClick={onClose} className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                            Close Preview
                        </Button>
                    </div>
                </div>
            )}

            {showSubmitModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900">Submit Test</h3>
                            <p className="text-sm text-gray-500 mt-1">Are you sure you want to submit your test? Here is your summary:</p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center col-span-2">
                                    <span className="text-gray-600 text-sm">Total Questions</span>
                                    <span className="font-bold text-gray-900">{stats.total}</span>
                                </div>
                                <div className="bg-green-50 p-3 rounded-lg flex justify-between items-center text-green-700">
                                    <span className="flex items-center gap-2 text-sm"><CheckCircle className="w-3 h-3" /> Answered</span>
                                    <span className="font-bold">{stats.answered}</span>
                                </div>
                                <div className="bg-red-50 p-3 rounded-lg flex justify-between items-center text-red-700">
                                    <span className="flex items-center gap-2 text-sm"><AlertCircle className="w-3 h-3" /> Not Answered</span>
                                    <span className="font-bold">{stats.notAnswered}</span>
                                </div>
                                <div className="bg-purple-50 p-3 rounded-lg flex justify-between items-center text-purple-700">
                                    <span className="flex items-center gap-2 text-sm"><Flag className="w-3 h-3" /> Marked</span>
                                    <span className="font-bold">{stats.marked}</span>
                                </div>
                                <div className="bg-slate-100 p-3 rounded-lg flex justify-between items-center text-slate-700">
                                    <span className="flex items-center gap-2 text-sm"><HelpCircle className="w-3 h-3" /> Not Visited</span>
                                    <span className="font-bold">{stats.notVisited}</span>
                                </div>
                            </div>

                            {stats.notAnswered > 0 && (
                                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg text-amber-800 text-sm border border-amber-200">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <p>Warning: You have <strong>{stats.notAnswered}</strong> unanswered questions. Proceeding will submit the test as is.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>Back to Test</Button>
                            <Button onClick={confirmSubmit} className="bg-green-600 hover:bg-green-700 text-white px-6">
                                Yes, Submit
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// --- Audio Player Component ---
function AdminPreviewAudioPlayer({ item }: { item: any }) {
    const playLimit = item.content?.play_limit || 0
    const hasLimit = playLimit > 0
    const [playCount, setPlayCount] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [progress, setProgress] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [audioSrc, setAudioSrc] = useState<string>('')
    const [isLoadingAudio, setIsLoadingAudio] = useState(true)
    const audioRef = useRef<HTMLAudioElement>(null)
    const limitReached = hasLimit && playCount >= playLimit

    useEffect(() => {
        const userId = typeof window !== 'undefined' ? authStorage.get('user_id') : null

        if (item.content?.has_audio_file) {
            const baseUrl = getApiUrl(`admin/clap-items/${item.id}/audio`)
            const separator = baseUrl.includes('?') ? '&' : '?'
            setAudioSrc(`${baseUrl}${separator}user_id=${userId || ''}`)
            setIsLoadingAudio(false)
        } else if (item.content?.url) {
            setAudioSrc(item.content.url)
            setIsLoadingAudio(false)
        } else {
            setAudioSrc('')
            setIsLoadingAudio(false)
        }
    }, [item.id, item.content?.has_audio_file, item.content?.url])

    const handlePlayPause = () => {
        if (!audioRef.current) return
        if (limitReached) return

        if (audioRef.current.paused) {
            audioRef.current.play().catch(err => {
                console.error('Play error:', err)
                setIsPlaying(false)
            })
            setIsPlaying(true)
        } else {
            audioRef.current.pause()
            setIsPlaying(false)
        }
    }

    const handleEnded = () => {
        setIsPlaying(false)
        setProgress(0)
        setCurrentTime(0)
        if (hasLimit) {
            setPlayCount((prev: number) => prev + 1)
        }
    }

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            const current = audioRef.current.currentTime
            const dur = audioRef.current.duration || 1
            setProgress((current / dur) * 100)
            setCurrentTime(current)
        }
    }

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration)
        }
    }

    const formatTime = (timeInSeconds: number) => {
        if (!timeInSeconds || isNaN(timeInSeconds)) return '0:00'
        const m = Math.floor(timeInSeconds / 60)
        const s = Math.floor(timeInSeconds % 60)
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const visualizerHeights = useMemo(() => {
        return Array.from({ length: 40 }).map(() => Math.floor(Math.random() * 20) + 12)
    }, [])

    const [hasError, setHasError] = useState(false)

    const handleAudioError = (e: any) => {
        console.error('Audio element error:', e)
        setHasError(true)
    }

    if (isLoadingAudio) {
        return (
            <div className="text-sm text-gray-500 italic p-4 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent flex-shrink-0 animate-spin rounded-full" />
                Loading securely authenticated audio...
            </div>
        )
    }

    if (!audioSrc) {
        return <div className="text-sm text-gray-500 italic p-4">No audio file uploaded or reachable.</div>
    }

    return (
        <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <Volume2 className="w-6 h-6 text-indigo-600" />
                    <span className="text-sm font-bold text-gray-700 uppercase tracking-widest">Audio Track</span>
                </div>
                <div className="text-sm font-semibold">
                    {hasLimit ? (
                        <span className={limitReached ? 'text-red-600 font-bold' : 'text-gray-600'}>
                            Plays: {playCount} / {playLimit}
                        </span>
                    ) : (
                        <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 text-xs">Unlimited</span>
                    )}
                </div>
            </div>

            <audio
                ref={audioRef}
                src={audioSrc}
                onEnded={handleEnded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onError={handleAudioError}
                className="hidden"
            />

            {hasError && (
                <div className="mb-6 w-full p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-600">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div className="text-sm">
                        <p className="font-bold text-base">Playback Error</p>
                        <p>The audio file could not be loaded. Please check your internet connection or try re-uploading the file.</p>
                    </div>
                </div>
            )}

            {/* Audio Visualizer & Timestamps */}
            <div className="w-full max-w-sm mb-8">
                <div className="flex items-end justify-between gap-[2px] h-12 px-4 bg-gray-50/50 rounded-xl py-2 border border-gray-100">
                    {visualizerHeights.map((height, i) => {
                        const isActive = (i / 40) * 100 <= progress
                        return (
                            <div
                                key={i}
                                className={`w-1 rounded-full transition-all duration-150 ease-in-out ${isActive ? 'bg-indigo-600' : 'bg-indigo-200'}`}
                                style={{
                                    height: `${isActive && isPlaying ? height * 1.2 : height}px`,
                                    opacity: isActive ? 1 : 0.5
                                }}
                            />
                        )
                    })}
                </div>
                {/* Timestamps */}
                <div className="flex justify-between items-center mt-2 px-2 text-[11px] font-medium text-gray-500 font-mono tracking-wider">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            <Button
                onClick={handlePlayPause}
                disabled={limitReached}
                variant={limitReached ? 'destructive' : 'default'}
                size="lg"
                className={`w-full max-w-sm gap-3 h-14 rounded-xl text-lg shadow-md transition-all ${!limitReached ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-105 hover:shadow-lg' : ''}`}
            >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                {isPlaying ? 'Pause Audio' : 'Play Audio'}
            </Button>

            {limitReached && (
                <div className="mt-6 flex items-center justify-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg w-full max-w-sm border border-red-100">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p className="font-medium text-center">No more plays left, you have reached your limit.</p>
                </div>
            )}
        </div>
    )
}

// --- Audio Recorder Component (Simulation Only) ---
function AdminPreviewAudioRecorder({ item, answer, onAnswer }: { item: any, answer: any, onAnswer: (val: any) => void }) {
    const safeContent = item.content || {}
    const maxDuration = safeContent.max_duration || 300

    const [isRecording, setIsRecording] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const playbackAudioRef = useRef<HTMLAudioElement | null>(null)

    const formatTime = (timeInSeconds: number) => {
        if (!timeInSeconds || isNaN(timeInSeconds)) return '0:00'
        const m = Math.floor(timeInSeconds / 60)
        const s = Math.floor(timeInSeconds % 60)
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                setAudioUrl(URL.createObjectURL(blob))
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorder.start()
            setIsRecording(true)
            setRecordingTime(0)

            timerRef.current = setInterval(() => {
                setRecordingTime((prev: number) => {
                    if (prev >= maxDuration) {
                        stopRecording()
                        return prev
                    }
                    return prev + 1
                })
            }, 1000)
        } catch (error) {
            console.error('Error accessing microphone:', error)
            alert('Cannot access microphone for simulation. Please check browser permissions.')
        }
    }

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording()
        } else {
            setAudioUrl(null)
            startRecording()
        }
    }

    const togglePlayback = () => {
        if (isPlaying) {
            playbackAudioRef.current?.pause()
            setIsPlaying(false)
        } else if (playbackAudioRef.current) {
            playbackAudioRef.current.currentTime = 0
            playbackAudioRef.current.play()
            setIsPlaying(true)
        }
    }

    const handleSubmit = () => {
        onAnswer(recordingTime)
    }

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-sm">
                <p className="text-xl font-medium text-gray-800">{safeContent.question || 'Question missing'}</p>
                {safeContent.instructions && (
                    <p className="text-sm text-gray-600 mt-2">{safeContent.instructions}</p>
                )}
                <p className="text-xs text-blue-700 mt-2 font-medium">Max duration: {maxDuration} seconds</p>
            </div>

            <div className="flex flex-col items-center justify-center gap-6 p-8 bg-white rounded-2xl border border-gray-200 shadow-sm">

                {/* Status */}
                <div className="w-full flex justify-center items-center h-16">
                    {isRecording ? (
                        <div className="flex items-center gap-4 text-red-500 font-medium tracking-wide">
                            <span className="relative flex h-4 w-4">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
                            </span>
                            Recording... {formatTime(recordingTime)} / {formatTime(maxDuration)}
                        </div>
                    ) : audioUrl ? (
                        <div className="flex items-center gap-3 text-indigo-600 font-medium">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            Recording ready ({formatTime(recordingTime)})
                        </div>
                    ) : (
                        <div className="text-gray-400 font-medium tracking-wide">Click microphone to start recording</div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center justify-center gap-4">
                    <Button
                        onClick={toggleRecording}
                        variant={isRecording ? 'destructive' : 'default'}
                        size="lg"
                        className={`rounded-full shadow-md w-16 h-16 p-0 flex items-center justify-center transition-all duration-300 ${!isRecording ? 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 hover:shadow-lg' : 'hover:scale-105'}`}
                    >
                        {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </Button>

                    {audioUrl && !isRecording && (
                        <>
                            <audio
                                ref={playbackAudioRef}
                                src={audioUrl}
                                onEnded={() => setIsPlaying(false)}
                                className="hidden"
                            />

                            <Button
                                onClick={togglePlayback}
                                variant="outline"
                                className="h-16 w-16 rounded-full p-0 flex items-center justify-center border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:scale-105 transition-all shadow-sm"
                            >
                                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
                            </Button>

                            <Button
                                onClick={handleSubmit}
                                className="h-16 px-8 rounded-full bg-emerald-600 hover:bg-emerald-700 hover:scale-105 transition-all font-semibold tracking-wider shadow-md text-white text-lg"
                            >
                                Submit Recording
                            </Button>
                        </>
                    )}
                </div>

                {answer && (
                    <div className="mt-4 flex items-center gap-3 p-4 bg-emerald-50 rounded-xl text-emerald-700 border border-emerald-200 w-full justify-center">
                        <CheckCircle className="w-6 h-6" />
                        <span className="font-medium text-center">Successfully saved! (Visual Confirmation Only)</span>
                    </div>
                )}
            </div>
        </div>
    )
}

// --- Item Renderer Component ---
function ItemRenderer({ item, answer, onAnswer }: { item: any, answer: any, onAnswer: (val: any) => void }) {
    if (!item) return <div>Invalid Item</div>
    const { item_type, content } = item
    const safeContent = content || {}

    // --- TEXT BLOCK ---
    if (item_type === 'text_block') {
        return (
            <div className="prose max-w-none">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-lg text-gray-800 leading-relaxed font-serif whitespace-pre-wrap shadow-sm">
                    {safeContent.text || 'No text content provided.'}
                </div>
                <div className="flex justify-center mt-6">
                    <Button
                        variant="outline"
                        onClick={() => onAnswer('read')}
                        className={`transition-all ${answer === 'read' ? 'bg-green-100 border-green-300 text-green-700' : 'hover:bg-green-600 hover:text-white hover:border-green-600'}`}
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {answer === 'read' ? 'Marked as Read' : 'Mark as Read'}
                    </Button>
                </div>
            </div>
        )
    }

    // --- MCQ ---
    if (item_type === 'mcq') {
        let options = safeContent.options
        if (!options || !Array.isArray(options) || options.length === 0) {
            return (
                <div className="space-y-6">
                    <p className="text-xl font-medium text-gray-800">{safeContent.question || 'No question text'}</p>
                    <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-red-600 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        <span>No options defined for this question. Please edit the question to add options.</span>
                    </div>
                </div>
            )
        }

        return (
            <div className="space-y-8">
                <p className="text-xl font-medium text-gray-800 leading-snug">{safeContent.question || 'Question text missing'}</p>
                <div className="grid gap-4">
                    {options.map((opt: string, idx: number) => {
                        const isSelected = answer === idx
                        return (
                            <div
                                key={idx}
                                onClick={() => onAnswer(idx)}
                                className={`relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all group ${isSelected ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'}`}
                            >
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold mr-4 transition-colors ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 text-gray-500 group-hover:border-indigo-400'}`}>
                                    {String.fromCharCode(65 + idx)}
                                </div>
                                <div className={`text-lg ${isSelected ? 'text-indigo-900 font-medium' : 'text-gray-700'}`}>
                                    {opt || <span className="italic text-gray-400">Option {idx + 1}</span>}
                                </div>
                                {isSelected && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                        <CheckCircle className="w-6 h-6 text-indigo-600 fill-indigo-100" />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    // --- SUBJECTIVE / WRITING ---
    if (item_type === 'subjective') {
        return (
            <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xl font-medium text-gray-800">{safeContent.question || 'Question prompt missing'}</p>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                        <span>Your Answer</span>
                        <span>{answer ? answer.split(/\s+/).filter(Boolean).length : 0} words (Min: {safeContent.min_words || 0})</span>
                    </div>
                    <Textarea
                        value={answer || ''}
                        onChange={(e) => onAnswer(e.target.value)}
                        placeholder="Type your answer here..."
                        className="min-h-[300px] text-lg p-4 font-serif leading-relaxed resize-y focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
            </div>
        )
    }

    // --- AUDIO BLOCK ---
    if (item_type === 'audio_block') {
        return (
            <div className="space-y-4 text-center max-w-2xl mx-auto pb-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
                    <Volume2 className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">{safeContent.title || 'Audio Clip'}</h3>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-gray-600 mb-4 text-base">{safeContent.instructions || 'Listen carefully to the audio clip.'}</p>
                    <AdminPreviewAudioPlayer item={item} />
                </div>

                <div className="pt-4">
                    <Button
                        variant="outline"
                        onClick={() => onAnswer('listened')}
                        className={`w-full py-6 text-lg ${answer === 'listened' ? 'bg-green-50 border-green-500 text-green-700' : ''}`}
                    >
                        {answer === 'listened' ? (
                            <><CheckCircle className="w-5 h-5 mr-2" /> I have finished listening</>
                        ) : (
                            'Mark as Listened'
                        )}
                    </Button>
                </div>
            </div>
        )
    }

    // --- FILE UPLOAD ---
    if (item_type === 'file_upload') {
        return (
            <div className="space-y-6">
                <div className="bg-orange-50 p-6 rounded-xl border border-orange-200 shadow-sm">
                    <p className="text-xl font-medium text-gray-800">{safeContent.prompt || 'Upload prompt missing'}</p>
                    <p className="text-sm text-gray-500 mt-2">Allowed types: {(safeContent.file_types || ['pdf', 'docx']).join(', ')}</p>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:bg-gray-50 transition-colors cursor-pointer group">
                    <CloudUpload className="mx-auto h-12 w-12 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                    <p className="mt-2 text-sm text-gray-600">Click to select file or drag and drop</p>
                    <p className="text-xs text-gray-400 mt-1">Simulated Upload</p>
                </div>

                {answer && (
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg text-green-700 border border-green-200">
                        <FileText className="w-5 h-5" />
                        <span>{answer}</span>
                        <CheckCircle className="w-5 h-5 ml-auto text-green-600" />
                    </div>
                )}

                {!answer && (
                    <Button
                        variant="outline"
                        onClick={() => onAnswer('simulated_file.pdf')}
                        className="w-full border-dashed border-gray-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                    >
                        Simulate File Upload
                    </Button>
                )}
                {answer && (
                    <Button
                        variant="ghost"
                        onClick={() => onAnswer('')}
                        className="w-full text-red-500 hover:bg-red-600 hover:text-white transition-all"
                    >
                        Remove File
                    </Button>
                )}
            </div>
        )
    }

    // --- AUDIO RECORDING ---
    if (item_type === 'audio_recording') {
        return <AdminPreviewAudioRecorder item={item} answer={answer} onAnswer={onAnswer} />
    }

    // Fallback
    return (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-xl">
            Unknown Item Type: {item_type}
        </div>
    )
}
