'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Clock, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl } from '@/lib/api-config'

export default function StudentClapTestsPage() {
    const router = useRouter()
    const [assignments, setAssignments] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchAssignments = async () => {
            try {
                const response = await fetch(getApiUrl('student/clap-assignments'))
                const data = await response.json()

                if (response.ok) {
                    setAssignments(data.assignments)
                } else {
                    toast.error('Failed to load tests')
                }
            } catch (error) {
                console.error(error)
                toast.error('Network error')
            } finally {
                setIsLoading(false)
            }
        }

        fetchAssignments()
    }, [])

    if (isLoading) return <div className="p-8 text-center">Loading tests...</div>

    return (
        <div className="container mx-auto p-6 max-w-5xl">
            <h1 className="text-2xl font-bold mb-2">My CLAP Assessments</h1>
            <p className="text-gray-500 mb-8">Complete your assigned Continuous Learning Assessment Program tests.</p>

            {assignments.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Tests Assigned</h3>
                    <p className="text-gray-500">You don't have any pending CLAP tests at the moment.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {assignments.map((assignment) => (
                        <Card
                            key={assignment.assignment_id}
                            className="hover:shadow-md transition-all cursor-pointer border-l-4 border-l-indigo-500"
                            onClick={() => router.push(`/student/clap-tests/${assignment.assignment_id}`)}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-xl mb-1">{assignment.test_name}</CardTitle>
                                        <p className="text-sm text-gray-500">
                                            Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <Badge variant={assignment.status === 'completed' ? 'secondary' : 'default'} className={
                                        assignment.status === 'completed' ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''
                                    }>
                                        {assignment.status || 'Pending'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                                    <div className="flex items-center gap-1">
                                        <FileText className="w-4 h-4" />
                                        <span>5 Modules</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        <span>~50 mins</span>
                                    </div>
                                </div>

                                <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                                    <div className="h-2 rounded-full bg-indigo-600 w-0"></div>
                                    {/* Add progress logic later */}
                                </div>

                                <Button className="w-full">
                                    {assignment.status === 'started' ? 'Continue Test' : 'Start Assessment'}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
