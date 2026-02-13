'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Trophy, 
  Clock, 
  Calendar, 
  CheckCircle, 
  PlayCircle, 
  Circle,
  TrendingUp,
  BarChart3
} from 'lucide-react'

interface TestProgressCardProps {
  test: {
    id: string
    name: string
    type: string
    status: 'not_started' | 'in_progress' | 'completed'
    score?: number
    max_score?: number
    last_attempt_date?: string
    attempts_count: number
    duration_minutes: number
    total_questions: number
  }
  onClick?: (testId: string) => void
}

export function TestProgressCard({ test, onClick }: TestProgressCardProps) {
  const getStatusColor = () => {
    switch (test.status) {
      case 'completed': return 'bg-success/10 text-success border-success/20'
      case 'in_progress': return 'bg-warning/10 text-warning border-warning/20'
      default: return 'bg-muted text-muted-foreground border-muted'
    }
  }

  const getStatusIcon = () => {
    switch (test.status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-success" />
      case 'in_progress': return <PlayCircle className="w-5 h-5 text-warning" />
      default: return <Circle className="w-5 h-5 text-muted" />
    }
  }

  const getScorePercentage = () => {
    if (test.score !== undefined && test.max_score) {
      return Math.round((test.score / test.max_score) * 100)
    }
    return 0
  }

  const formatLastAttemptDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <Card 
      className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary/20"
      onClick={() => onClick?.(test.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-1">{test.name}</CardTitle>
            <Badge variant="secondary" className="capitalize">
              {test.type}
            </Badge>
          </div>
          <div className={`p-2 rounded-full ${getStatusColor()}`}>
            {getStatusIcon()}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Progress/Score Display */}
        {test.status === 'completed' && test.score !== undefined ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-medium">Score</span>
              </div>
              <span className="text-sm font-bold">
                {test.score}/{test.max_score} ({getScorePercentage()}%)
              </span>
            </div>
            <Progress value={getScorePercentage()} className="h-2" />
          </div>
        ) : test.status === 'in_progress' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-warning" />
              <span className="text-sm text-warning">In Progress</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {test.attempts_count} attempt{test.attempts_count !== 1 ? 's' : ''} started
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Circle className="w-4 h-4 text-muted" />
              <span className="text-sm text-muted-foreground">Not Started</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {test.duration_minutes} minutes • {test.total_questions} questions
            </div>
          </div>
        )}

        {/* Additional Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>Last: {formatLastAttemptDate(test.last_attempt_date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            <span>{test.attempts_count} attempts</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}