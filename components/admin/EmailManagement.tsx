'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import {
  Mail,
  RefreshCw,
  Send,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Eye
} from 'lucide-react'
import { toast } from 'sonner'

interface EmailStatus {
  total_sent: number
  delivered: number
  bounced: number
  complained: number
  pending: number
  recent_emails?: Array<{
    submission_id: string
    recipient: string
    status: string
    sent_at?: string
    delivered_at?: string
    error?: string
  }>
}

interface BounceLog {
  id: number
  recipient: string
  event_type: string
  reason: string
  timestamp: string
  submission_id?: string
}

export function EmailManagement() {
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null)
  const [bounceLogs, setBounceLogs] = useState<BounceLog[]>([])
  const [loading, setLoading] = useState(true)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [bulkResending, setBulkResending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'status' | 'logs'>('status')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, logsRes] = await Promise.allSettled([
        fetch(getApiUrl('admin/emails/status'), { headers: getAuthHeaders() }),
        fetch(getApiUrl('admin/emails/logs'), { headers: getAuthHeaders() }),
      ])

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        setEmailStatus(await statusRes.value.json())
      }
      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const data = await logsRes.value.json()
        setBounceLogs(data.logs || data.rows || [])
      }
    } catch (error) {
      console.error('Failed to fetch email data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  const resendEmail = async (submissionId: string) => {
    setResendingId(submissionId)
    try {
      const res = await fetch(getApiUrl(`admin/emails/submissions/${submissionId}/resend`), {
        method: 'POST',
        headers: getAuthHeaders()
      })
      if (res.ok) {
        toast.success('Email resend triggered')
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to resend email')
      }
    } catch (error) {
      toast.error('Network error resending email')
    } finally {
      setResendingId(null)
    }
  }

  const handleBulkResend = async () => {
    setBulkResending(true)
    try {
      const failedEmails = emailStatus?.recent_emails?.filter(e => e.status === 'failed' || e.status === 'bounced') || []
      const res = await fetch(getApiUrl('admin/emails/bulk-resend'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          submission_ids: failedEmails.map(e => e.submission_id),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Bulk resend triggered for ${data.count || failedEmails.length} emails`)
        fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to bulk resend')
      }
    } catch (error) {
      toast.error('Network error during bulk resend')
    } finally {
      setBulkResending(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered': return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case 'bounced': return <XCircle className="w-4 h-4 text-red-600" />
      case 'complained': return <AlertTriangle className="w-4 h-4 text-yellow-600" />
      case 'pending': return <Clock className="w-4 h-4 text-blue-600" />
      default: return <Mail className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-100 text-green-800'
      case 'bounced': case 'failed': return 'bg-red-100 text-red-800'
      case 'complained': return 'bg-yellow-100 text-yellow-800'
      case 'pending': case 'sending': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading && !emailStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading email data...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Email Management</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor email delivery and manage bounces</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBulkResend} disabled={bulkResending}>
            {bulkResending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Resend Failed
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      {emailStatus && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border border-gray-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{emailStatus.total_sent}</p>
              <p className="text-xs text-gray-500 mt-1">Total Sent</p>
            </CardContent>
          </Card>
          <Card className="border border-green-200 bg-green-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{emailStatus.delivered}</p>
              <p className="text-xs text-green-600 mt-1">Delivered</p>
            </CardContent>
          </Card>
          <Card className="border border-red-200 bg-red-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{emailStatus.bounced}</p>
              <p className="text-xs text-red-600 mt-1">Bounced</p>
            </CardContent>
          </Card>
          <Card className="border border-yellow-200 bg-yellow-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{emailStatus.complained}</p>
              <p className="text-xs text-yellow-600 mt-1">Complaints</p>
            </CardContent>
          </Card>
          <Card className="border border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{emailStatus.pending}</p>
              <p className="text-xs text-blue-600 mt-1">Pending</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('status')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'status'
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          Recent Emails
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'logs'
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          Bounce/Complaint Logs ({bounceLogs.length})
        </button>
      </div>

      {/* Recent Emails */}
      {activeTab === 'status' && emailStatus?.recent_emails && (
        <Card className="border border-gray-200">
          <CardContent className="p-0">
            {emailStatus.recent_emails.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No recent emails</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {emailStatus.recent_emails.map((email, i) => (
                  <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getStatusIcon(email.status)}
                      <div className="min-w-0">
                        <p className="text-sm truncate">{email.recipient}</p>
                        <p className="text-xs text-gray-400">
                          {email.sent_at ? new Date(email.sent_at).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(email.status)}`}>
                        {email.status}
                      </span>
                      {(email.status === 'failed' || email.status === 'bounced') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => resendEmail(email.submission_id)}
                          disabled={resendingId === email.submission_id}
                          className="h-7 px-2"
                        >
                          {resendingId === email.submission_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCw className="w-3 h-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bounce/Complaint Logs */}
      {activeTab === 'logs' && (
        <Card className="border border-gray-200">
          <CardContent className="p-0">
            {bounceLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No bounce or complaint logs</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {bounceLogs.map((log) => (
                  <div key={log.id} className="p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {log.event_type === 'bounce' ? (
                          <XCircle className="w-4 h-4 text-red-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        )}
                        <span className="text-sm font-medium">{log.recipient}</span>
                        <Badge className={log.event_type === 'bounce' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                          {log.event_type}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 ml-6">{log.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
