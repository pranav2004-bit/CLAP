'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Loader2, Download } from 'lucide-react'
import { ArrowLeft, Headphones, Mic, BookOpen, PenTool, Brain, CheckCircle, PlayCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl } from '@/lib/api-config'

const STATUS_STEPS = [
  'PENDING',
  'RULES_COMPLETE',
  'LLM_PROCESSING',
  'LLM_COMPLETE',
  'REPORT_GENERATING',
  'REPORT_READY',
  'EMAIL_SENDING',
  'COMPLETE',
]

export default function StudentClapTestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [assignment, setAssignment] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [submission, setSubmission] = useState<any>(null)
  const [polling, setPolling] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])

  const submissionId = searchParams.get('submission_id')


  const submissionId = searchParams.get('submission_id')

  useEffect(() => {
    const fetchAssignment = async () => {
      try {
        const response = await fetch(getApiUrl('student/clap-assignments'))
        const data = await response.json()


  const submissionId = searchParams.get('submission_id')

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

  useEffect(() => {
    if (!submissionId) return

    let interval: NodeJS.Timeout | null = null
    let stopped = false

    const poll = async () => {
      try {
        setPolling(true)
        const userId = localStorage.getItem('user_id') || ''
        const resp = await fetch(getApiUrl(`submissions/${submissionId}/status`), {
          headers: userId ? { 'x-user-id': userId } : {},
        })

        if (!resp.ok) return
        const data = await resp.json()
        setSubmission(data)

        if (data.status === 'COMPLETE' || String(data.status || '').startsWith('FAILED')) {
          if (interval) clearInterval(interval)
          stopped = true
        }
      } catch (e) {
        console.error('Submission polling failed', e)
      } finally {
        setPolling(false)
      }
    }

    poll()
    interval = setInterval(poll, 5000)

    return () => {
      if (interval) clearInterval(interval)
      setPolling(false)
    }
  }, [submissionId])

  useEffect(() => {
    if (!submissionId || !submission?.status) return
    if (submission.status !== 'COMPLETE' && !submission.status.startsWith('REPORT_')) return

    const fetchResults = async () => {
      try {
        const userId = localStorage.getItem('user_id') || ''
        const resp = await fetch(getApiUrl(`submissions/${submissionId}/results`), {
          headers: userId ? { 'x-user-id': userId } : {},
        })
        if (!resp.ok) return
        const data = await resp.json()
        setResults(data)
      } catch (e) {
        console.error('Failed loading results', e)
      }
    }

    fetchResults()
  }, [submissionId, submission])

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const userId = localStorage.getItem('user_id') || ''
        const assessmentId = assignment?.test_id || assignment?.clap_test_id || assignment?.id || ''
        const url = assessmentId ? getApiUrl(`submissions/history?assessment_id=${assessmentId}`) : getApiUrl('submissions/history')
        const resp = await fetch(url, { headers: userId ? { 'x-user-id': userId } : {} })
        if (!resp.ok) return
        const data = await resp.json()
        setHistory(Array.isArray(data.rows) ? data.rows : [])
      } catch (e) {
        console.error('Failed loading history', e)
      }
    }

    if (assignment) fetchHistory()
  }, [assignment])
    }

    poll()
    interval = setInterval(poll, 5000)

    return () => {
      if (interval) clearInterval(interval)
      if (!stopped) setPolling(false)
    }
  }, [submissionId])

  const statusProgress = useMemo(() => {
    if (!submission?.status) return 0
    const idx = STATUS_STEPS.indexOf(submission.status)
    if (idx < 0) return 0
    return Math.round(((idx + 1) / STATUS_STEPS.length) * 100)
  }, [submission])

  const overallScore = useMemo(() => {
    if (!results?.scores?.length) return null
    const vals = results.scores.map((s: any) => Number(s.score || 0))
    return Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 100) / 100
  }, [results])


  const reportDownloadUrl = useMemo(() => {
    if (results?.report_download_url) return results.report_download_url
    const ready = history.find((h: any) => Boolean(h.report_download_url))
    return ready?.report_download_url || ''
  }, [results, history])

  const reportIsReady = Boolean(reportDownloadUrl)

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

      {submissionId && (
        <Card className="mb-6 border-indigo-200">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Submission Processing</p>
                <p className="font-semibold">Status: {submission?.status || 'Loading...'}</p>
              </div>
              {polling && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full">
              <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${statusProgress}%` }} />
            </div>
          </CardContent>
        </Card>
      )}


      <Card className="mb-6 border-sky-200">
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Assessment Report</p>
            <p className="font-semibold">
              {reportIsReady ? 'Your PDF report is ready to download.' : 'Report is still being generated.'}
            </p>
            {!reportIsReady && (
              <p className="text-xs text-gray-500 mt-1">Fallback: check your latest results in the CLAP dashboard while processing continues.</p>
            )}
          </div>

          {reportIsReady ? (
            <a href={reportDownloadUrl} target="_blank" rel="noreferrer">
              <Button><Download className="w-4 h-4 mr-2" />Download PDF</Button>
            </a>
          ) : (
            <Button variant="outline" onClick={() => router.push('/student/clap-tests')}>
              Go to Dashboard
            </Button>
          )}
        </CardContent>
      </Card>

      {results && (
        <Card className="mb-6 border-green-200">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Latest Result Summary</p>
                <p className="text-xl font-bold">Overall Score: {overallScore ?? '-'} / 10</p>
              </div>
              {results.report_download_url && (
                <a href={results.report_download_url} target="_blank" rel="noreferrer">
                  <Button><Download className="w-4 h-4 mr-2" />Download Report</Button>
                </a>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {results.scores?.map((s: any) => (
                <div key={s.domain} className="rounded-lg border p-3 bg-white">
                  <div className="flex items-center justify-between">
                    <p className="capitalize font-medium">{s.domain}</p>
                    <Badge>{s.score}</Badge>
                  </div>
                  {s.feedback?.overall && <p className="text-sm text-gray-600 mt-2">{s.feedback.overall}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <p className="font-semibold mb-3">Score History</p>
            <div className="space-y-2">
              {history.slice(0, 8).map((row: any) => (
                <div key={row.submission_id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <p className="text-sm">{new Date(row.created_at).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Status: {row.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{row.overall_score ?? '-'} / 10</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full">
              <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${statusProgress}%` }} />
            </div>

            <p className="text-xs text-gray-500">
              {submission?.status === 'COMPLETE'
                ? 'Processing complete. Your report/results are ready.'
                : 'We are processing your submission (rule scoring → LLM evaluation → report generation).'}
            </p>
          </CardContent>
        </Card>
      )}

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
                <Button size="sm" className="rounded-full px-6">Start <PlayCircle className="w-4 h-4 ml-2" /></Button>
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
