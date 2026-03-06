'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Clock, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { TestPreviewModal } from '@/components/admin/TestPreviewModal'

export default function SetBundlePreviewPage() {
    const params = useParams()
    const router = useRouter()

    const [setLabel, setSetLabel] = useState<string>('')
    const [testName, setTestName] = useState<string>('')
    const [components, setComponents] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // Timer state
    const [globalTimeLeft, setGlobalTimeLeft] = useState<number | null>(null)
    const [isTestLocked, setIsTestLocked] = useState(false)
    const [startedAt, setStartedAt] = useState<Date | null>(null)

    // Per-component submitted tracking
    const [submittedComponents, setSubmittedComponents] = useState<string[]>([])

    // Modal state
    const [showPreviewModal, setShowPreviewModal] = useState(false)
    const [previewItems, setPreviewItems] = useState<any[]>([])
    const [previewTestType, setPreviewTestType] = useState('')
    const [previewTitle, setPreviewTitle] = useState('')
    const [previewDuration, setPreviewDuration] = useState(0)

    // Load set components on mount
    useEffect(() => {
        const fetchSet = async () => {
            try {
                // 1. Get components for this set
                const setRes = await fetch(getApiUrl(`admin/sets/${params.setId}/components`), {
                    headers: getAuthHeaders()
                })
                if (!setRes.ok) throw new Error('Failed to load set')
                const setData = await setRes.json()
                setSetLabel(setData.set_label || '')
                setComponents(setData.components || [])

                // 2. Get the test name from the parent test
                const testRes = await fetch(getApiUrl(`admin/clap-tests/${params.id}`), {
                    headers: getAuthHeaders()
                })
                if (testRes.ok) {
                    const testData = await testRes.json()
                    const ct = testData.clapTest || testData
                    setTestName(ct.name || '')
                }

                setStartedAt(new Date())

                // Restore any saved progress
                const storageKey = `admin_set_preview_${params.setId}`
                const saved = localStorage.getItem(storageKey)
                if (saved) {
                    try { setSubmittedComponents(JSON.parse(saved)) } catch { }
                }
            } catch (error) {
                console.error(error)
                toast.error('Failed to load set preview')
                router.back()
            } finally {
                setIsLoading(false)
            }
        }

        if (params.id && params.setId) fetchSet()
    }, [params.id, params.setId, router])

    // Global timer — sum of all component durations in this set
    useEffect(() => {
        if (!components.length || !startedAt || isTestLocked) return

        const totalMins = components.reduce((sum, c) => sum + (c.duration_minutes || 10), 0)
        const totalSecs = totalMins * 60
        const startedTime = startedAt.getTime()

        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - startedTime) / 1000)
            const remaining = totalSecs - elapsed
            if (remaining <= 0) {
                setGlobalTimeLeft(0)
                setIsTestLocked(true)
                if (showPreviewModal) setShowPreviewModal(false)
                toast.error('Preview time has expired.')
            } else {
                setGlobalTimeLeft(remaining)
            }
        }

        updateTimer()
        const timer = setInterval(updateTimer, 1000)
        return () => clearInterval(timer)
    }, [components, startedAt, isTestLocked, showPreviewModal])

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        return `${mins}:${secs.toString().padStart(2, '0')}`
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

    const handleOpenComponent = async (comp: any) => {
        if (isTestLocked) return
        const loadingToast = toast.loading(`Loading ${comp.test_type} preview...`)
        try {
            const res = await fetch(getApiUrl(`admin/set-components/${comp.id}/items`), {
                headers: getAuthHeaders()
            })
            const data = await res.json()
            toast.dismiss(loadingToast)

            if (res.ok) {
                setPreviewItems(data.items || [])
                setPreviewTestType(comp.test_type)
                setPreviewTitle(`Set ${setLabel} — ${comp.title}`)
                setPreviewDuration(comp.timer_enabled ? (comp.duration_minutes || 0) : 0)
                setShowPreviewModal(true)
            } else {
                toast.error('Failed to load preview items')
            }
        } catch {
            toast.dismiss(loadingToast)
            toast.error('Network error')
        }
    }

    const handleCloseComponentPreview = () => {
        setShowPreviewModal(false)
        const updated = [...submittedComponents]
        if (!updated.includes(previewTestType)) {
            updated.push(previewTestType)
            setSubmittedComponents(updated)
            localStorage.setItem(`admin_set_preview_${params.setId}`, JSON.stringify(updated))
            toast.success(`${previewTestType} module finished in preview mode!`)
        }
    }

    const handleFinalSubmit = () => {
        if (!confirm('Submit the ENTIRE Set preview?')) return
        localStorage.removeItem(`admin_set_preview_${params.setId}`)
        toast.success('Preview submitted! (No data saved)')
        router.push('/admin/tests')
    }

    const handleResetProgress = () => {
        localStorage.removeItem(`admin_set_preview_${params.setId}`)
        setSubmittedComponents([])
        setStartedAt(new Date())
        setIsTestLocked(false)
        setGlobalTimeLeft(null)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen text-gray-500">
                Loading Set preview...
            </div>
        )
    }

    const allDone = submittedComponents.length === components.length && components.length > 0

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <Button variant="ghost" className="mb-6 pl-0 hover:pl-2 transition-all" onClick={() => router.push('/admin/tests')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sets
            </Button>

            {/* Header banner */}
            <div className="bg-gradient-to-r from-slate-800 to-violet-900 rounded-2xl p-8 text-white mb-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Brain className="w-48 h-48" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-white/20 hover:bg-white/30 text-white border-0">
                            Set {setLabel} — Bundle Preview
                        </Badge>
                        <Badge className="bg-amber-500 text-white border-0">No data will be saved</Badge>
                    </div>
                    <h1 className="text-3xl font-bold mb-1">{testName}</h1>
                    <p className="text-violet-200">
                        Simulating student view for <strong>Question Paper Set {setLabel}</strong>.
                    </p>

                    <div className="mt-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div className="text-sm text-white/70">
                            {components.length} components · {submittedComponents.length}/{components.length} previewed
                        </div>
                        {globalTimeLeft !== null && (
                            <div className="bg-white/10 px-4 py-2 rounded-xl flex items-center gap-2 font-mono text-xl font-bold border border-white/20 shadow-inner">
                                <Clock className="w-5 h-5" />
                                <span className={globalTimeLeft < 300 ? 'text-red-400 animate-pulse' : ''}>
                                    {formatTime(globalTimeLeft)} Total Left
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Component cards */}
            <div className="grid gap-4">
                {components.map((comp: any) => {
                    const Icon = getIcon(comp.test_type)
                    const isSubmitted = submittedComponents.includes(comp.test_type)
                    const isDisabled = isTestLocked

                    return (
                        <Card
                            key={comp.id}
                            className={`transition-all border-l-4 ${
                                isSubmitted
                                    ? 'border-l-emerald-500 bg-emerald-50/10 cursor-pointer'
                                    : isDisabled
                                        ? 'opacity-50 cursor-not-allowed border-l-gray-400'
                                        : 'border-l-violet-500 cursor-pointer hover:shadow-md'
                            }`}
                            onClick={() => { if (!isDisabled) handleOpenComponent(comp) }}
                        >
                            <CardContent className="p-6 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                        isSubmitted ? 'bg-emerald-100 text-emerald-600'
                                            : isDisabled ? 'bg-gray-100 text-gray-400'
                                                : 'bg-violet-50 text-violet-600'
                                    }`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className={`font-semibold text-lg capitalize ${
                                            isSubmitted ? 'text-emerald-800'
                                                : isDisabled ? 'text-gray-500' : ''
                                        }`}>
                                            {comp.title || comp.test_type}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {comp.timer_enabled
                                                ? `${comp.duration_minutes || 10} min`
                                                : 'No component timer'
                                            } · {comp.max_marks || 0} marks · {comp.item_count} items
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    {isSubmitted ? (
                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200 px-3 py-1">
                                            <CheckCircle className="w-4 h-4 mr-1.5" /> Submitted
                                        </Badge>
                                    ) : (
                                        <Button size="sm" className="rounded-full px-6 bg-violet-600 hover:bg-violet-700" disabled={isDisabled}>
                                            Preview <PlayCircle className="w-4 h-4 ml-2" />
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Final submit when all done */}
            {allDone && (
                <div className="mt-8 flex justify-center">
                    <Button
                        size="lg"
                        className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-lg px-12 py-6 rounded-xl shadow-lg border-b-4 border-violet-800 active:border-b-0 active:translate-y-[4px]"
                        onClick={handleFinalSubmit}
                    >
                        Finish Set {setLabel} Preview
                    </Button>
                </div>
            )}

            {/* Reset progress */}
            {!isTestLocked && submittedComponents.length > 0 && !allDone && (
                <div className="mt-8 flex justify-center">
                    <Button
                        variant="ghost"
                        className="text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        onClick={handleResetProgress}
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset Preview Progress
                    </Button>
                </div>
            )}

            <TestPreviewModal
                isOpen={showPreviewModal}
                onClose={handleCloseComponentPreview}
                testType={previewTestType}
                items={previewItems}
                testTitle={previewTitle}
                duration={previewDuration}
                globalTimeLeft={globalTimeLeft}
            />
        </div>
    )
}
