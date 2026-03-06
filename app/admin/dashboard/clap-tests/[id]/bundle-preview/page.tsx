'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { TestPreviewModal } from '@/components/admin/TestPreviewModal'

export default function AdminBundlePreviewPage() {
    const params = useParams()
    const router = useRouter()
    const [testData, setTestData] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Timer State
    const [globalTimeLeft, setGlobalTimeLeft] = useState<number | null>(null)
    const [isTestLocked, setIsTestLocked] = useState(false)
    const [startedAt, setStartedAt] = useState<Date | null>(null)

    // Completed Components State
    const [submittedComponents, setSubmittedComponents] = useState<string[]>([])

    // Modal State
    const [showPreviewModal, setShowPreviewModal] = useState(false)
    const [previewItems, setPreviewItems] = useState<any[]>([])
    const [previewTestType, setPreviewTestType] = useState('')
    const [previewTitle, setPreviewTitle] = useState('')
    const [previewDuration, setPreviewDuration] = useState(0)

    useEffect(() => {
        const fetchTest = async () => {
            try {
                // Fetch specific test
                const response = await fetch(getApiUrl(`admin/clap-tests/${params.id}`), { headers: getAuthHeaders() })
                if (!response.ok) throw new Error('Failed to load test')
                const data = await response.json()
                // API returns { clapTest: { id, name, tests: [...], ... } }
                const ct = data.clapTest || data
                setTestData(ct)

                // Auto-start for preview
                setStartedAt(new Date())

                // Load local state
                const saved = localStorage.getItem(`admin_bundle_preview_${params.id}`)
                if (saved) {
                    try {
                        setSubmittedComponents(JSON.parse(saved))
                    } catch (e) { }
                }
            } catch (error) {
                console.error(error)
                toast.error('Network error')
                router.back()
            } finally {
                setIsLoading(false)
            }
        }

        if (params.id) {
            fetchTest()
        }
    }, [params.id, router])

    // Global Timer Effect
    useEffect(() => {
        if (!testData || !startedAt || isTestLocked) return;

        // Use explicit global timer if set, else sum of auto-computed durations
        const totalDurationMins = testData.global_duration_minutes
            ?? (testData.tests?.reduce((sum: number, c: any) => sum + (c.duration || 10), 0) || 60);
        const totalDurationSecs = totalDurationMins * 60;

        const startedTime = startedAt.getTime();

        const updateTimer = () => {
            const now = Date.now();
            const elapsedSecs = Math.floor((now - startedTime) / 1000);
            const remaining = totalDurationSecs - elapsedSecs;

            if (remaining <= 0) {
                setGlobalTimeLeft(0);
                setIsTestLocked(true);
                if (showPreviewModal) {
                    setShowPreviewModal(false);
                }
                toast.error("Preview global time has expired.");
            } else {
                setGlobalTimeLeft(remaining);
            }
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);

        return () => clearInterval(timer);
    }, [testData, isTestLocked, startedAt, showPreviewModal]);

    const handleFinalSubmit = () => {
        if (!confirm('Submit the ENTIRE preview assessment?')) return;
        // Clear progress so it can be previewed again later
        localStorage.removeItem(`admin_bundle_preview_${params.id}`);
        toast.success('Preview Submitted Successfully! (No data saved)');
        router.back();
    };

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleOpenComponent = async (comp: any) => {
        if (isTestLocked) return;

        // Fetch items to open TestPreviewModal
        const loadingToast = toast.loading(`Loading ${comp.type} preview...`);
        try {
            const response = await fetch(getApiUrl(`admin/clap-components/${comp.id}/items`), {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            toast.dismiss(loadingToast);

            if (response.ok) {
                setPreviewItems(data.items || []);
                setPreviewTestType(comp.type);
                setPreviewTitle(`${comp.name} Preview`);
                // Only pass duration if timer is enabled for this component
                setPreviewDuration(comp.timer_enabled !== false ? (comp.duration || 0) : 0);
                setShowPreviewModal(true);
            } else {
                toast.error('Failed to load preview items');
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Network error while loading preview');
        }
    }

    const handleCloseComponentPreview = () => {
        setShowPreviewModal(false)
        // Mark as submitted locally for the bundle abstraction
        const updated = [...submittedComponents]
        if (!updated.includes(previewTestType)) {
            updated.push(previewTestType)
            setSubmittedComponents(updated)
            localStorage.setItem(`admin_bundle_preview_${params.id}`, JSON.stringify(updated))
            toast.success(`${previewTestType} module finished in preview mode!`)
        }
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

    if (isLoading) return <div className="p-8 flex items-center justify-center min-h-screen text-gray-500">Loading bundle preview...</div>
    if (!testData) return null

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <Button variant="ghost" className="mb-6 pl-0 hover:pl-2 transition-all" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Editor
            </Button>

            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 rounded-2xl p-8 text-white mb-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Brain className="w-48 h-48" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-white/20 hover:bg-white/30 text-white border-0">Admin Bundle Preview</Badge>
                        <Badge className="bg-amber-500 text-white border-0">No data will be saved</Badge>
                    </div>

                    <h1 className="text-3xl font-bold mb-2">{testData.name}</h1>
                    <p className="text-indigo-200">Simulating student view for the combined assessment.</p>

                    <div className="mt-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div></div>
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

            <div className="grid gap-4">
                {(testData.tests || []).map((comp: any) => {
                    const Icon = getIcon(comp.type)
                    const isSubmitted = submittedComponents.includes(comp.type);
                    const isDisabled = isTestLocked; // only disable if global timer expired

                    return (
                        <Card
                            key={comp.id}
                            className={`hover:shadow-md transition-all border-l-4 ${isSubmitted ? 'border-l-emerald-500 bg-emerald-50/10 cursor-pointer' : 'border-l-indigo-500 cursor-pointer'} ${isDisabled ? 'opacity-50 cursor-not-allowed border-l-gray-400' : ''}`}
                            onClick={() => {
                                if (!isDisabled) handleOpenComponent(comp)
                            }}
                        >
                            <CardContent className="p-6 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isSubmitted ? 'bg-emerald-100 text-emerald-600' : isDisabled ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className={`font-semibold text-lg capitalize ${isSubmitted ? 'text-emerald-800' : isDisabled ? 'text-gray-500' : ''}`}>{comp.name}</h3>
                                        <p className="text-sm text-gray-500">
                                            {comp.timer_enabled !== false ? `${comp.duration || 10} min` : 'No component timer'} • {comp.max_marks || 10} Marks
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {isSubmitted ? (
                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200 px-3 py-1">
                                            <CheckCircle className="w-4 h-4 mr-1.5" /> Submitted
                                        </Badge>
                                    ) : (
                                        <Button size="sm" className="rounded-full px-6" disabled={isDisabled}>
                                            Preview <PlayCircle className="w-4 h-4 ml-2" />
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {testData.tests && submittedComponents.length === testData.tests.length && (
                <div className="mt-8 flex justify-center">
                    <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg px-12 py-6 rounded-xl shadow-lg border-b-4 border-indigo-800 active:border-b-0 active:translate-y-[4px]" onClick={handleFinalSubmit}>
                        Final Submit Preview
                    </Button>
                </div>
            )}

            {!isTestLocked && submittedComponents.length < (testData.tests?.length || 5) && (
                <div className="mt-8 flex justify-center">
                    <Button variant="ghost" className="text-gray-400 hover:bg-gray-100 hover:text-gray-600 font-bold" onClick={() => {
                        localStorage.removeItem(`admin_bundle_preview_${params.id}`)
                        setSubmittedComponents([])
                    }}>
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
