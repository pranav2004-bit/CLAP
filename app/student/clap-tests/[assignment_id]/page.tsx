'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button' // Removed Badge import
import { Badge } from '@/components/ui/badge' // Re-added Badge import correctly
import { ArrowLeft, Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl } from '@/lib/api-config'

export default function StudentClapTestDetailPage() {
    const params = useParams()
    const router = useRouter()
    const [assignment, setAssignment] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchAssignment = async () => {
            try {
                const response = await fetch(getApiUrl('student/clap-assignments'))
                const data = await response.json()

                if (response.ok) {
                    const found = data.assignments.find((a: any) => a.assignment_id === params.assignment_id)
                    if (found) {
                        setAssignment(found)
                    } else {
                        toast.error('Assignment not found')
                        router.push('/student/clap-tests')
                    }
                } else {
                    toast.error('Failed to load assignment')
                }
            } catch (error) {
                console.error(error)
                toast.error('Network error')
            } finally {
                setIsLoading(false)
            }
        }

        if (params.assignment_id) {
            fetchAssignment()
        }
    }, [params.assignment_id, router])

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

    if (isLoading) return <div className="p-8 text-center">Loading details...</div>
    if (!assignment) return null

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <Button variant="ghost" className="mb-6 pl-0 hover:pl-2 transition-all" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
            </Button>

            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white mb-8 shadow-xl">
                <h1 className="text-3xl font-bold mb-2">{assignment.test_name}</h1>
                <p className="text-indigo-100">Complete all 5 modules to finish the assessment.</p>
                <div className="mt-4 flex gap-4">
                    <Badge className="bg-white/20 hover:bg-white/30 text-white border-0">
                        {assignment.status || 'Pending'}
                    </Badge>
                    <span className="text-sm text-indigo-200">Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}</span>
                </div>
            </div>

            <div className="grid gap-4">
                {assignment.components?.map((comp: any) => {
                    const Icon = getIcon(comp.type)
                    return (
                        <Card
                            key={comp.id}
                            className="hover:shadow-md transition-all cursor-pointer border-l-4 hover:border-l-indigo-500"
                            onClick={() => router.push(`/student/clap-tests/${params.assignment_id}/${comp.type}`)}
                        >
                            <CardContent className="p-6 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg capitalize">{comp.title}</h3>
                                        <p className="text-sm text-gray-500">{comp.duration || 10} min • 10 Marks</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Button size="sm" className="rounded-full px-6">
                                        Start <PlayCircle className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
