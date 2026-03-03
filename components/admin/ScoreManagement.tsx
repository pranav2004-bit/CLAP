'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import {
  Search,
  Download,
  Edit,
  Loader2,
  RefreshCw,
  BarChart3,
  Save,
  X,
  CheckCircle2
} from 'lucide-react'
import { toast } from 'sonner'

interface ScoreRow {
  domain: string
  score: number
  feedback?: any
  evaluated_by: string
  evaluated_at?: string
}

export function ScoreManagement() {
  const [searchMode, setSearchMode] = useState<'submission' | 'batch' | 'assessment'>('submission')
  const [searchId, setSearchId] = useState('')
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [editingDomain, setEditingDomain] = useState<string | null>(null)
  const [editScore, setEditScore] = useState('')
  const [editReason, setEditReason] = useState('')
  const [overriding, setOverriding] = useState(false)
  const [submissionId, setSubmissionId] = useState('')

  const fetchScores = useCallback(async () => {
    if (!searchId.trim()) return
    setLoading(true)
    try {
      let url = ''
      switch (searchMode) {
        case 'submission':
          url = getApiUrl(`admin/scores/submissions/${searchId}`)
          setSubmissionId(searchId)
          break
        case 'batch':
          url = getApiUrl(`admin/scores/batches/${searchId}`)
          break
        case 'assessment':
          url = getApiUrl(`admin/scores/assessments/${searchId}`)
          break
      }

      const res = await fetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setScores(data.scores || data.rows || [])
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to fetch scores')
        setScores([])
      }
    } catch (error) {
      console.error('Failed to fetch scores:', error)
      toast.error('Network error fetching scores')
    } finally {
      setLoading(false)
    }
  }, [searchId, searchMode])

  const handleOverride = async (domain: string) => {
    if (!submissionId || !editScore) return
    setOverriding(true)
    try {
      const res = await fetch(getApiUrl(`admin/scores/submissions/${submissionId}/override`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          domain: editingDomain,
          new_score: parseFloat(editScore),
          reason: editReason
        })
      })

      if (res.ok) {
        toast.success(`Score for ${domain} overridden successfully`)
        setEditingDomain(null)
        setEditScore('')
        setEditReason('')
        fetchScores()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to override score')
      }
    } catch (error) {
      toast.error('Network error during score override')
    } finally {
      setOverriding(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(getApiUrl('admin/scores/export'))
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `scores-export-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Scores exported successfully')
      } else {
        toast.error('Failed to export scores')
      }
    } catch (error) {
      toast.error('Network error exporting scores')
    } finally {
      setExporting(false)
    }
  }

  const getDomainColor = (domain: string) => {
    const colors: Record<string, string> = {
      listening: 'bg-blue-100 text-blue-800',
      speaking: 'bg-purple-100 text-purple-800',
      reading: 'bg-green-100 text-green-800',
      writing: 'bg-orange-100 text-orange-800',
      vocab: 'bg-teal-100 text-teal-800',
    }
    return colors[domain] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Score Management</h2>
          <p className="text-sm text-gray-500 mt-1">View, override, and export submission scores</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Export CSV
        </Button>
      </div>

      {/* Search */}
      <Card className="border border-gray-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <select
              value={searchMode}
              onChange={(e) => setSearchMode(e.target.value as any)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="submission">By Submission</option>
              <option value="batch">By Batch</option>
              <option value="assessment">By Assessment</option>
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={`Enter ${searchMode} ID...`}
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchScores()}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Button size="sm" onClick={fetchScores} disabled={loading || !searchId.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scores Table */}
      {scores.length > 0 && (
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Scores ({scores.length} domains)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-600 font-medium">Domain</th>
                    <th className="text-left py-2 px-3 text-gray-600 font-medium">Score</th>
                    <th className="text-left py-2 px-3 text-gray-600 font-medium">Evaluated By</th>
                    <th className="text-left py-2 px-3 text-gray-600 font-medium">Evaluated At</th>
                    <th className="text-right py-2 px-3 text-gray-600 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((score) => (
                    <tr key={score.domain} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <span className={`text-xs px-2 py-1 rounded-full capitalize ${getDomainColor(score.domain)}`}>
                          {score.domain}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {editingDomain === score.domain ? (
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.01"
                            value={editScore}
                            onChange={(e) => setEditScore(e.target.value)}
                            className="w-20 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                          />
                        ) : (
                          <span className="font-semibold">{score.score.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={score.evaluated_by === 'llm' ? 'default' : 'secondary'}>
                          {score.evaluated_by}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-gray-500 text-xs">
                        {score.evaluated_at ? new Date(score.evaluated_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {editingDomain === score.domain ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="text"
                              placeholder="Reason..."
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              className="w-32 px-2 py-1 text-xs border rounded"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOverride(score.domain)}
                              disabled={overriding}
                              className="h-7 px-2"
                            >
                              {overriding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditingDomain(null); setEditScore(''); setEditReason('') }}
                              className="h-7 px-2"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (searchMode === 'submission') {
                                setEditingDomain(score.domain)
                                setEditScore(String(score.score))
                              } else {
                                toast.info('Override is only available when viewing by submission')
                              }
                            }}
                            className="h-7 px-2"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {scores.length === 0 && !loading && searchId && (
        <div className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No scores found. Enter a valid ID and search.</p>
        </div>
      )}

      {!searchId && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Enter a submission, batch, or assessment ID to view scores</p>
        </div>
      )}
    </div>
  )
}
