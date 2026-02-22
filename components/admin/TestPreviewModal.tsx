import { useState, useRef, useEffect } from 'react'
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

// Question classification helper
const isQuestion = (itemType: string): boolean => {
    return itemType === 'mcq' || itemType === 'subjective'
}

type TestPreviewModalProps = {
    isOpen: boolean
    onClose: () => void
    testType: string
    items: any[]
    testTitle: string
    duration?: number
}

export function TestPreviewModal({ isOpen, onClose, testType, items, testTitle, duration = 0 }: TestPreviewModalProps) {
    // --- State Management ---
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [answers, setAnswers] = useState<{ [itemId: string]: any }>({})
    const [visited, setVisited] = useState<Set<number>>(new Set([0]))
    const [marked, setMarked] = useState<Set<number>>(new Set())
    const [timeLeft, setTimeLeft] = useState((duration || 60) * 60) // Default 60 mins if 0
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [isSubmitted, setIsSubmitted] = useState(false)

    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // --- Effects ---

    // Timer Logic
    useEffect(() => {
        if (!isOpen) return

        // Reset state on open
        setCurrentQuestionIndex(0)
        setAnswers({})
        setVisited(new Set([0]))
        setMarked(new Set())
        setTimeLeft(duration > 0 ? duration * 60 : 60 * 60) // Use massive default if 0? No, if 0 show nothing?
        // User requested: "time of the test is completely optional... if the time limit is not there"
        // If duration is 0, we can hide timer or show stopwatch?
        // Let's assume passed duration is 0 means no limit.
        // But here I initialize timeLeft. If duration is 0, maybe set it to a huge number?

        setIsSubmitted(false)
        setShowSubmitModal(false)

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
        setShowSubmitModal(true)
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
        const total = items.length
        const answeredCount = Object.keys(answers).length
        const markedCount = marked.size
        const visitedCount = visited.size
        const notVisitedCount = total - visitedCount

        return {
            total,
            answered: answeredCount,
            notAnswered: total - answeredCount, // Simply total - answered for "Not Answered" warning
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
            {/* Main Modal Container */}
            <div className="w-[95vw] h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* 1. Header */}
                <header className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between shrink-0 shadow-md">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/10 p-2 rounded-lg">
                            {testType === 'listening' && <Volume2 className="w-6 h-6" />}
                            {testType === 'speaking' && <Mic className="w-6 h-6" />}
                            {testType === 'reading' && <BookA className="w-6 h-6" />}
                            {testType === 'writing' && <PenTool className="w-6 h-6" />}
                            {testType === 'vocabulary' && <CheckSquare className="w-6 h-6" />}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">{testTitle}</h2>
                            <div className="flex items-center gap-3 text-xs text-slate-300 uppercase tracking-widest">
                                <span>{testType} Test</span>
                                <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                                <span className="text-indigo-200 font-bold">Total: {items.reduce((sum, item) => sum + (item.points || 0), 0)} Marks</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Timer */}
                        {duration > 0 && (
                            <div className={`flex items-center gap-2 text-xl font-mono font-bold ${timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                                <Clock className="w-5 h-5" />
                                {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                            </div>
                        )}
                        {!duration && (
                            <div className="text-sm text-gray-400 font-mono">No Time Limit</div>
                        )}

                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={onClose}
                            className="bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Exit Preview
                        </Button>
                    </div>
                </header>

                {/* 2. Main Layout */}
                <div className="flex flex-1 overflow-hidden">

                    {/* LEFT PANE: Question Area */}
                    <div className="flex-1 flex flex-col border-r border-gray-200 bg-gray-50/50 overflow-hidden relative">
                        {items.length === 0 || !currentItem ? (
                            <div className="flex-1 flex items-center justify-center text-gray-500">
                                {items.length === 0 ? "No questions available." : "Loading question..."}
                            </div>
                        ) : (
                            <>
                                {/* Question Header Bar */}
                                <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
                                    <h3 className="text-lg font-semibold text-gray-800">
                                        Question {currentQuestionIndex + 1}
                                    </h3>
                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 uppercase text-xs font-bold">
                                            {currentItem.item_type.replace('_', ' ')}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <span className="font-bold text-gray-900">+{currentItem.points || 1}</span>
                                            <span>marks</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`${marked.has(currentQuestionIndex) ? 'text-purple-600 bg-purple-50' : 'text-gray-500 hover:bg-purple-600 hover:text-white'} transition-all`}
                                            onClick={handleMarkReview}
                                        >
                                            <Flag className={`w-4 h-4 mr-2 ${marked.has(currentQuestionIndex) ? 'fill-purple-600' : 'group-hover:text-white'}`} />
                                            {marked.has(currentQuestionIndex) ? 'Marked' : 'Mark for Review'}
                                        </Button>
                                    </div>
                                </div>

                                {/* Content Scroll Area (Native Div replacement for ScrollArea) */}
                                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                    <div className="max-w-4xl mx-auto space-y-8 pb-20">
                                        <ItemRenderer
                                            item={currentItem}
                                            answer={answers[currentItem.id]}
                                            onAnswer={(val) => handleAnswer(currentItem.id, val)}
                                        />
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={handleClearResponse}
                                            disabled={!answers[currentItem.id]}
                                            className="text-gray-500 border-gray-300 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all font-medium"
                                        >
                                            Clear Response
                                        </Button>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={handlePrev}
                                            disabled={currentQuestionIndex === 0}
                                            className="w-32 border-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-all"
                                        >
                                            <ChevronLeft className="w-4 h-4 mr-2" />
                                            Previous
                                        </Button>
                                        {currentQuestionIndex === items.length - 1 ? (
                                            <Button
                                                className="w-32 bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200"
                                                onClick={handleSubmitClick}
                                            >
                                                Submit Test
                                            </Button>
                                        ) : (
                                            <Button
                                                className="w-32 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                                                onClick={handleNext}
                                            >
                                                Save & Next
                                                <ChevronRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* RIGHT PANE: Question Palette */}
                    <div className="w-80 bg-white flex flex-col shadow-inner z-10 border-l border-gray-200">
                        {/* Profile Info */}
                        <div className="p-4 border-b flex items-center gap-3 bg-slate-50">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
                                TS
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-800">Test Student</p>
                                <p className="text-xs text-gray-500">Candidate</p>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="p-4 bg-gray-50/50 border-b grid grid-cols-2 gap-2 text-xs text-gray-600">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded flex items-center justify-center bg-green-500 text-white font-bold">A</div>
                                <span>Answered</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded flex items-center justify-center bg-red-500 text-white font-bold">NA</div>
                                <span>Not Answered</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded flex items-center justify-center bg-gray-200 text-gray-600 font-bold">NV</div>
                                <span>Not Visited</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded flex items-center justify-center bg-purple-500 text-white font-bold">M</div>
                                <span>Marked</span>
                            </div>
                        </div>

                        {/* Palette Grid */}
                        <div className="flex-1 overflow-y-auto p-4 content-start custom-scrollbar">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Questions Palette</h4>
                            <div className="grid grid-cols-4 gap-2">
                                {items.map((item, index) => {
                                    // Only render questions in palette
                                    if (!isQuestion(item.item_type)) return null;

                                    const isAnswered = answers[items[index].id] !== undefined;
                                    const isMarked = marked.has(index);
                                    const isVisited = visited.has(index);
                                    const isCurrent = currentQuestionIndex === index;

                                    // Calculate question number (count of questions up to this index)
                                    const questionNumber = items.slice(0, index + 1).filter(i => isQuestion(i.item_type)).length;

                                    let colorClass = 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'; // Default Not Visited

                                    if (isVisited && !isAnswered) {
                                        colorClass = 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'; // Visited but Not Answered
                                    }
                                    if (isAnswered) {
                                        colorClass = 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'; // Answered
                                    }
                                    if (isMarked) {
                                        colorClass = 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'; // Marked
                                        if (isAnswered) {
                                            colorClass = 'bg-purple-100 text-purple-700 border-purple-300 ring-1 ring-green-400';
                                        }
                                    }

                                    if (isCurrent) {
                                        colorClass += ' ring-2 ring-indigo-500 ring-offset-2';
                                    }

                                    return (
                                        <button
                                            key={index}
                                            onClick={() => setCurrentQuestionIndex(index)}
                                            className={`
                                                relative h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm transition-all border
                                                ${colorClass}
                                            `}
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
                        <div className="p-4 border-t bg-gray-50">
                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmitClick}>
                                Submit Test
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 3. Custom Submit Modal Implementation (No Shadcn Dialog dependency) */}
                {showSubmitModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-6 border-b border-gray-100">
                                <h3 className="text-xl font-bold text-gray-900">Submit Test</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Are you sure you want to submit your test? Here is your summary:
                                </p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">Total</span>
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
                    {safeContent.text || "No text content provided."}
                </div>
                <div className="flex justify-center mt-6">
                    <Button variant="outline" onClick={() => onAnswer('read')} className={`transition-all ${answer === 'read' ? 'bg-green-100 border-green-300 text-green-700' : 'hover:bg-green-600 hover:text-white hover:border-green-600'}`}>
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
                    <p className="text-xl font-medium text-gray-800">{safeContent.question || "No question text"}</p>
                    <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-red-600 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        <span>No options defined for this question. Please edit the question to add options.</span>
                    </div>
                </div>
            )
        }

        return (
            <div className="space-y-8">
                <p className="text-xl font-medium text-gray-800 leading-snug">{safeContent.question || "Question text missing"}</p>
                <div className="grid gap-4">
                    {options.map((opt: string, idx: number) => {
                        const isSelected = answer === idx
                        return (
                            <div
                                key={idx}
                                onClick={() => onAnswer(idx)}
                                className={`
                                    relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all group
                                    ${isSelected
                                        ? 'border-indigo-600 bg-indigo-50 shadow-md'
                                        : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                                    }
                                `}
                            >
                                <div className={`
                                    flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold mr-4 transition-colors
                                    ${isSelected
                                        ? 'border-indigo-600 bg-indigo-600 text-white'
                                        : 'border-gray-300 text-gray-500 group-hover:border-indigo-400'
                                    }
                                `}>
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
                    <p className="text-xl font-medium text-gray-800">{safeContent.question || "Question prompt missing"}</p>
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
            <div className="space-y-8 text-center max-w-2xl mx-auto py-10">
                <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Volume2 className="w-10 h-10 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{safeContent.title || 'Audio Clip'}</h3>

                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                    <p className="text-gray-600 mb-6 text-lg">{safeContent.instructions || "Listen carefully to the audio clip."}</p>

                    {/* Mock Player */}
                    <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl">
                        <Button size="icon" className="h-12 w-12 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-md">
                            <Play className="w-5 h-5 ml-1 text-white" />
                        </Button>
                        <div className="flex-1">
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full w-1/3 bg-indigo-500 rounded-full relative">
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-sm border border-indigo-500" />
                                </div>
                            </div>
                            <div className="flex justify-between mt-2 text-xs font-mono text-gray-500">
                                <span>0:45</span>
                                <span>2:30</span>
                            </div>
                        </div>
                    </div>
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
                            "Mark as Listened"
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
                    <p className="text-xl font-medium text-gray-800">{safeContent.prompt || "Upload prompt missing"}</p>
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
        return (
            <div className="space-y-6">
                <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-sm">
                    <p className="text-xl font-medium text-gray-800">{safeContent.question || "Question missing"}</p>
                    {safeContent.instructions && (
                        <p className="text-sm text-gray-600 mt-2">{safeContent.instructions}</p>
                    )}
                    <p className="text-xs text-blue-700 mt-2 font-medium">
                        Max duration: {safeContent.max_duration || 300} seconds
                    </p>
                </div>

                <div className="flex items-center justify-center gap-4 p-8 bg-gray-100 rounded-lg border border-gray-300">
                    <Mic className="w-6 h-6 text-red-500" />
                    <span className="text-gray-600 font-medium">Audio recorder will appear here</span>
                </div>

                {answer && (
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg text-green-700 border border-green-200">
                        <CheckCircle className="w-5 h-5" />
                        <span>Audio recorded ({answer}s)</span>
                    </div>
                )}

                {!answer && (
                    <Button
                        variant="outline"
                        onClick={() => onAnswer('45')}
                        className="w-full border-dashed border-gray-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                    >
                        Simulate Audio Recording
                    </Button>
                )}
            </div>
        )
    }

    // Fallback
    return (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-xl">
            Unknown Item Type: {item_type}
        </div>
    )
}
