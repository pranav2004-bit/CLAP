'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl } from '@/lib/api-config'
import {
  Brain,
  RefreshCw,
  Play,
  Loader2,
  Search,
  BarChart3,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Zap,
  X
} from 'lucide-react'
import { toast } from 'sonner'

interface LLMAnalytics {
  total_evaluations: number
  avg_latency_seconds: number
  success_rate: number
  failure_count: number
  provider: string
  model: string
  semantic_warnings: number
  evaluations_by_domain?: Record<string, number>
}

interface LLMTrace {
  submission_id: string
  traces: Array<{
    domain: string
    request_id: string
    timestamp: string
    latency_ms?: number
    status: string
    input_preview?: string
    output_preview?: string
  }>
}

export function LLMControls() {
  const [analytics, setAnalytics] = useState<LLMAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [submissionId, setSubmissionId] = useState('')
  const [trace, setTrace] = useState<LLMTrace | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [retriggeringId, setRetriggeringId] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/llm/analytics'))
      if (res.ok) {
        setAnalytics(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch LLM analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAnalytics() }, [])

  const fetchTrace = async () => {
    if (!submissionId.trim()) return
    setTraceLoading(true)
    try {
      const res = await fetch(getApiUrl(`admin/llm/submissions/${submissionId}/trace`))
      if (res.ok) {
        setTrace(await res.json())
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to fetch LLM trace')
        setTrace(null)
      }
    } catch (error) {
      toast.error('Network error fetching trace')
    } finally {
      setTraceLoading(false)
    }
  }

  const retriggerEvaluation = async (sid: string) => {
    setRetriggeringId(sid)
    try {
      const res = await fetch(getApiUrl(`admin/llm/submissions/${sid}/retrigger`), {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('LLM evaluation re-triggered successfully')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to re-trigger evaluation')
      }
    } catch (error) {
      toast.error('Network error re-triggering evaluation')
    } finally {
      setRetriggeringId(null)
    }
  }

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading LLM analytics...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">LLM Evaluation Controls</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor and manage AI-powered evaluations</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-purple-600" />
                <span className="text-xs text-gray-500">Total Evaluations</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{analytics.total_evaluations}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-gray-500">Avg Latency</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{analytics.avg_latency_seconds?.toFixed(1)}s</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs text-gray-500">Success Rate</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{(analytics.success_rate * 100).toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-xs text-gray-500">Semantic Warnings</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{analytics.semantic_warnings || 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Provider Info */}
      {analytics && (
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-medium">Provider:</span>
                <Badge variant="default">{analytics.provider || 'N/A'}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Model:</span>
                <Badge variant="secondary">{analytics.model || 'N/A'}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Failures:</span>
                <Badge className={analytics.failure_count > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                  {analytics.failure_count}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domain Breakdown */}
      {analytics?.evaluations_by_domain && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Evaluations by Domain
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.evaluations_by_domain).map(([domain, count]) => (
                <div key={domain} className="flex items-center gap-3">
                  <span className="text-sm font-medium capitalize w-20">{domain}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full"
                      style={{ width: `${(count / analytics.total_evaluations) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-12 text-right">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trace Lookup & Re-trigger */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Submission Actions</CardTitle>
          <CardDescription>Look up LLM trace or re-trigger evaluation for a submission</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Enter submission ID..."
                value={submissionId}
                onChange={(e) => setSubmissionId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchTrace()}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Button size="sm" variant="outline" onClick={fetchTrace} disabled={traceLoading || !submissionId.trim()}>
              {traceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
              View Trace
            </Button>
            <Button
              size="sm"
              onClick={() => retriggerEvaluation(submissionId)}
              disabled={!submissionId.trim() || retriggeringId === submissionId}
            >
              {retriggeringId === submissionId ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              Re-trigger
            </Button>
          </div>

          {/* Trace Results */}
          {trace && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium">LLM Trace for {trace.submission_id?.slice(0, 8)}...</h4>
              {(trace.traces || []).map((t, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{t.domain}</Badge>
                    <Badge className={t.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {t.status}
                    </Badge>
                    {t.latency_ms && <span className="text-xs text-gray-500">{t.latency_ms}ms</span>}
                  </div>
                  <p className="text-xs text-gray-500 font-mono">Request: {t.request_id}</p>
                  {t.input_preview && <p className="text-xs text-gray-600">Input: {t.input_preview.slice(0, 100)}...</p>}
                  {t.output_preview && <p className="text-xs text-gray-600">Output: {t.output_preview.slice(0, 100)}...</p>}
                </div>
              ))}
              {(!trace.traces || trace.traces.length === 0) && (
                <p className="text-sm text-gray-500 py-2">No trace records found for this submission</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
