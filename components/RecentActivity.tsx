'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Play, 
  CheckCircle, 
  Clock,
  Calendar,
  User,
  BookOpen
} from 'lucide-react'

interface RecentActivityProps {
  activities: Array<{
    id: string
    test_name: string
    action: 'started' | 'completed' | 'continued'
    timestamp: string
    score?: number
  }>
}

export function RecentActivity({ activities }: RecentActivityProps) {
  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'started': return <Play className="w-4 h-4 text-blue-500" />
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'continued': return <Play className="w-4 h-4 text-yellow-500" />
      default: return <BookOpen className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getActivityColor = (action: string) => {
    switch (action) {
      case 'started': return 'bg-blue-500/10 text-blue-500'
      case 'completed': return 'bg-green-500/10 text-green-500'
      case 'continued': return 'bg-yellow-500/10 text-yellow-500'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const getActivityLabel = (action: string) => {
    switch (action) {
      case 'started': return 'Started'
      case 'completed': return 'Completed'
      case 'continued': return 'Continued'
      default: return action
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) {
      return 'Just now'
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const formatScore = (score?: number) => {
    if (score === undefined) return null
    return `${score}%`
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No activity yet</p>
            <p className="text-sm mt-1">Start a test to see your activity here</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div 
              key={activity.id} 
              className="flex items-start gap-3 pb-4 border-b border-border last:border-b-0 last:pb-0"
            >
              <div className={`p-2 rounded-full ${getActivityColor(activity.action)}`}>
                {getActivityIcon(activity.action)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-sm truncate">{activity.test_name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge 
                        variant="secondary" 
                        className={`${getActivityColor(activity.action)} capitalize`}
                      >
                        {getActivityLabel(activity.action)}
                      </Badge>
                      {activity.score !== undefined && (
                        <Badge variant="outline" className="text-xs">
                          {formatScore(activity.score)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(activity.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}