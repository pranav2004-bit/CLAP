'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getApiUrl } from '@/lib/api-config'
import {
  Bell,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  AlertCircle,
  Send,
  Clock,
  X,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'

interface Alert {
  id: string | number
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  timestamp: string
  read: boolean
  source?: string
}

export function AdminNotifications() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingSummary, setSendingSummary] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread' | 'warning' | 'error'>('all')

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(getApiUrl('admin/notifications/alerts'))
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts || data.rows || [])
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAlerts() }, [])

  const sendDailySummary = async () => {
    setSendingSummary(true)
    try {
      const res = await fetch(getApiUrl('admin/notifications/daily-summary'), {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Daily summary email sent')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to send daily summary')
      }
    } catch (error) {
      toast.error('Network error sending daily summary')
    } finally {
      setSendingSummary(false)
    }
  }

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
      default: return <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
    }
  }

  const getAlertBg = (type: string) => {
    switch (type) {
      case 'error': return 'border-red-200 bg-red-50'
      case 'warning': return 'border-yellow-200 bg-yellow-50'
      case 'success': return 'border-green-200 bg-green-50'
      default: return 'border-blue-200 bg-blue-50'
    }
  }

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'all') return true
    if (filter === 'unread') return !alert.read
    return alert.type === filter
  })

  const unreadCount = alerts.filter(a => !a.read).length

  if (loading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading notifications...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Admin Notifications</h2>
          <p className="text-sm text-gray-500 mt-1">
            System alerts and notifications &middot; {unreadCount} unread
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={sendDailySummary} disabled={sendingSummary}>
            {sendingSummary ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Daily Summary
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAlerts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-gray-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('all')}>
          <CardContent className="p-4 text-center">
            <Bell className="w-5 h-5 text-gray-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{alerts.length}</p>
            <p className="text-xs text-gray-500">Total</p>
          </CardContent>
        </Card>
        <Card className="border border-blue-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('unread')}>
          <CardContent className="p-4 text-center">
            <Info className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-blue-700">{unreadCount}</p>
            <p className="text-xs text-blue-600">Unread</p>
          </CardContent>
        </Card>
        <Card className="border border-yellow-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('warning')}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-yellow-700">{alerts.filter(a => a.type === 'warning').length}</p>
            <p className="text-xs text-yellow-600">Warnings</p>
          </CardContent>
        </Card>
        <Card className="border border-red-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilter('error')}>
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-red-700">{alerts.filter(a => a.type === 'error').length}</p>
            <p className="text-xs text-red-600">Errors</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Indicator */}
      {filter !== 'all' && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            Filtered: {filter}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setFilter('all')} className="h-6 px-2">
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Alerts List */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Alerts ({filteredAlerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No {filter !== 'all' ? filter : ''} notifications</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 border rounded-lg ${getAlertBg(alert.type)} ${!alert.read ? 'ring-1 ring-offset-1 ring-indigo-200' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {getAlertIcon(alert.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-900">{alert.title}</h4>
                        <div className="flex items-center gap-2">
                          {!alert.read && (
                            <span className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0" />
                          )}
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : ''}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                      {alert.source && (
                        <p className="text-xs text-gray-400 mt-1">Source: {alert.source}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
