'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts'
import { 
  TrendingUp, 
  Users, 
  FileText, 
  BarChart3,
  Download,
  Calendar,
  Filter,
  RefreshCw
} from 'lucide-react'

interface AnalyticsData {
  // Overall statistics
  totalStudents: number
  totalTests: number
  completionRate: number
  averageScore: number
  
  // Time series data
  studentGrowth: { month: string; students: number }[]
  testCompletions: { date: string; completions: number }[]
  scoreDistribution: { range: string; count: number; percentage: number }[]
  
  // Test performance
  testPerformance: { 
    name: string; 
    avgScore: number; 
    completionRate: number;
    attempts: number;
  }[]
  
  // Student performance
  topPerformers: { name: string; score: number; test: string }[]
  strugglingStudents: { name: string; score: number; test: string }[]
  
  // Engagement metrics
  engagementStats: {
    activeStudents: number
    inactiveStudents: number
    averageTimePerTest: string
    mostPopularTest: string
  }
}

interface AnalyticsDashboardProps {
  refreshData: () => Promise<void>
  isLoading: boolean
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export function AnalyticsDashboard({ refreshData, isLoading }: AnalyticsDashboardProps) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month')
  const [selectedTest, setSelectedTest] = useState<string>('all')

  // Mock data - in real implementation, this would come from API
  useEffect(() => {
    // Simulate API call
    const mockData: AnalyticsData = {
      totalStudents: 142,
      totalTests: 5,
      completionRate: 78.3,
      averageScore: 34.2,
      
      studentGrowth: [
        { month: 'Jan', students: 25 },
        { month: 'Feb', students: 38 },
        { month: 'Mar', students: 52 },
        { month: 'Apr', students: 78 },
        { month: 'May', students: 105 },
        { month: 'Jun', students: 142 }
      ],
      
      testCompletions: [
        { date: '2024-06-01', completions: 12 },
        { date: '2024-06-02', completions: 18 },
        { date: '2024-06-03', completions: 15 },
        { date: '2024-06-04', completions: 22 },
        { date: '2024-06-05', completions: 19 },
        { date: '2024-06-06', completions: 25 },
        { date: '2024-06-07', completions: 16 }
      ],
      
      scoreDistribution: [
        { range: '40-50', count: 23, percentage: 18.5 },
        { range: '30-39', count: 45, percentage: 36.3 },
        { range: '20-29', count: 35, percentage: 28.2 },
        { range: '0-19', count: 21, percentage: 16.9 }
      ],
      
      testPerformance: [
        { name: 'Listening', avgScore: 8.2, completionRate: 85, attempts: 120 },
        { name: 'Reading', avgScore: 7.8, completionRate: 82, attempts: 115 },
        { name: 'Vocabulary', avgScore: 8.5, completionRate: 90, attempts: 135 },
        { name: 'Writing', avgScore: 6.9, completionRate: 75, attempts: 95 },
        { name: 'Speaking', avgScore: 6.5, completionRate: 70, attempts: 88 }
      ],
      
      topPerformers: [
        { name: 'Emma Davis', score: 48, test: 'Vocabulary' },
        { name: 'Michael Chen', score: 46, test: 'Listening' },
        { name: 'Sarah Johnson', score: 45, test: 'Reading' },
        { name: 'David Wilson', score: 44, test: 'Vocabulary' },
        { name: 'Lisa Park', score: 43, test: 'Listening' }
      ],
      
      strugglingStudents: [
        { name: 'John Smith', score: 12, test: 'Speaking' },
        { name: 'Robert Brown', score: 15, test: 'Writing' },
        { name: 'Jennifer Lee', score: 18, test: 'Speaking' },
        { name: 'Thomas Miller', score: 20, test: 'Writing' },
        { name: 'Karen White', score: 22, test: 'Speaking' }
      ],
      
      engagementStats: {
        activeStudents: 112,
        inactiveStudents: 30,
        averageTimePerTest: '28:45',
        mostPopularTest: 'Vocabulary'
      }
    }
    
    setAnalyticsData(mockData)
  }, [])

  if (!analyticsData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Detailed insights and performance metrics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm">
            <BarChart3 className="w-4 h-4 mr-2" />
            Detailed Report
          </Button>
          <Button variant="outline" size="sm">
            <Calendar className="w-4 h-4 mr-2" />
            Custom Range
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-3xl font-bold mt-1">{analyticsData.totalStudents}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3 text-sm text-success">
              <TrendingUp className="w-4 h-4" />
              <span>+15% from last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-3xl font-bold mt-1">{analyticsData.completionRate}%</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-success" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">Overall test completion</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Score</p>
                <p className="text-3xl font-bold mt-1">{analyticsData.averageScore}/50</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-accent" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">{((analyticsData.averageScore / 50) * 100).toFixed(0)}% average</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Students</p>
                <p className="text-3xl font-bold mt-1">{analyticsData.engagementStats.activeStudents}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-warning" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              {Math.round((analyticsData.engagementStats.activeStudents / analyticsData.totalStudents) * 100)}% engagement rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Student Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Student Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={analyticsData.studentGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="students" 
                  stroke="#8884d8" 
                  fill="#8884d8" 
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Test Completions Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Daily Test Completions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.testCompletions}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="completions" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance Analysis */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Test Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Test Performance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.testPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="avgScore" fill="#8884d8" name="Average Score" />
                <Bar yAxisId="right" dataKey="completionRate" fill="#82ca9d" name="Completion %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData.scoreDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.range}: ${entry.percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {analyticsData.scoreDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers and Struggling Students */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.topPerformers.map((student, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div>
                    <p className="font-medium">{student.name}</p>
                    <p className="text-sm text-muted-foreground">{student.test} Test</p>
                  </div>
                  <Badge variant="success" className="text-green-700">
                    {student.score}/50
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Struggling Students */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 rotate-180 text-red-600" />
              Need Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.strugglingStudents.map((student, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="font-medium">{student.name}</p>
                    <p className="text-sm text-muted-foreground">{student.test} Test</p>
                  </div>
                  <Badge variant="destructive">
                    {student.score}/50
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}