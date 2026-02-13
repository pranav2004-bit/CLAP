'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  BookOpen, 
  CheckCircle, 
  PlayCircle, 
  Circle,
  TrendingUp,
  Target,
  Award,
  BarChart3
} from 'lucide-react'

interface StatsOverviewProps {
  stats: {
    total_tests: number
    completed_tests: number
    in_progress_tests: number
    not_started_tests: number
    average_score?: number
    total_attempts: number
  }
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  const getCompletionPercentage = () => {
    if (stats.total_tests === 0) return 0
    return Math.round((stats.completed_tests / stats.total_tests) * 100)
  }

  const formatAverageScore = () => {
    if (stats.average_score === undefined) return 'N/A'
    return `${stats.average_score.toFixed(1)}%`
  }

  const statItems = [
    {
      title: 'Total Tests',
      value: stats.total_tests,
      icon: BookOpen,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    {
      title: 'Completed',
      value: stats.completed_tests,
      icon: CheckCircle,
      color: 'text-success',
      bgColor: 'bg-success/10'
    },
    {
      title: 'In Progress',
      value: stats.in_progress_tests,
      icon: PlayCircle,
      color: 'text-warning',
      bgColor: 'bg-warning/10'
    },
    {
      title: 'Not Started',
      value: stats.not_started_tests,
      icon: Circle,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/10'
    },
    {
      title: 'Total Attempts',
      value: stats.total_attempts,
      icon: BarChart3,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Average Score',
      value: formatAverageScore(),
      icon: Award,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Overall Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Completion Rate</span>
              <span className="text-sm font-bold">{getCompletionPercentage()}%</span>
            </div>
            <Progress value={getCompletionPercentage()} className="h-3" />
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <span>{stats.completed_tests} completed</span>
            </div>
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-warning" />
              <span>{stats.in_progress_tests} in progress</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-4 h-4 text-muted" />
              <span>{stats.not_started_tests} not started</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span>{formatAverageScore()} average</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statItems.map((item) => (
          <Card key={item.title} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{item.title}</p>
                  <p className="text-2xl font-bold mt-1">{item.value}</p>
                </div>
                <div className={`p-3 rounded-full ${item.bgColor}`}>
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Achievement Badges */}
      {stats.completed_tests > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.completed_tests >= 1 && (
                <Badge variant="secondary" className="bg-success/10 text-success hover:bg-success/20">
                  First Test Completed
                </Badge>
              )}
              {stats.completed_tests >= 3 && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20">
                  Test Master
                </Badge>
              )}
              {stats.average_score && stats.average_score >= 80 && (
                <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20">
                  High Achiever
                </Badge>
              )}
              {stats.total_attempts >= 5 && (
                <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20">
                  Persistent Learner
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}