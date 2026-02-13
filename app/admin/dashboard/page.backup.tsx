'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  BarChart3,
  Users,
  FileText,
  GraduationCap,
  ArrowRight,
  Sparkles,
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  Brain,
  Clock,
  CheckCircle2,
  Shield,
  Target,
  Zap,
  Menu,
  Bell,
  Settings,
  LogOut,
  Plus,
  Download,
  Eye,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Calendar,
  Search,
  Filter
} from 'lucide-react'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'tests' | 'analytics' | 'batches'>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Mock data - preserving exact structure
  const studentData = [
    { id: 'STU001', name: 'John Smith', email: 'john.smith@example.com', status: 'completed', score: 42, avatar: 'JS' },
    { id: 'STU002', name: 'Sarah Johnson', email: 'sarah.johnson@example.com', status: 'in_progress', score: null, avatar: 'SJ' },
    { id: 'STU003', name: 'Mike Wilson', email: 'mike.wilson@example.com', status: 'completed', score: 38, avatar: 'MW' },
    { id: 'STU004', name: 'Emma Davis', email: 'emma.davis@example.com', status: 'not_started', score: null, avatar: 'ED' }
  ]

  const batchData = [
    { id: 'BATCH001', name: '2023-27', startYear: 2023, endYear: 2027, studentCount: 12, isActive: true },
    { id: 'BATCH002', name: '2024-28', startYear: 2024, endYear: 2028, studentCount: 8, isActive: true },
    { id: 'BATCH003', name: '2025-29', startYear: 2025, endYear: 2029, studentCount: 5, isActive: false }
  ]

  const testData = [
    { name: 'Listening Test', type: 'listening', avgScore: 7.5, completionRate: 85, icon: Headphones, color: 'listening', marks: 10, duration: '20 min' },
    { name: 'Speaking Test', type: 'speaking', avgScore: 6.8, completionRate: 72, icon: Mic, color: 'speaking', marks: 10, duration: '5 min' },
    { name: 'Reading Test', type: 'reading', avgScore: 8.1, completionRate: 92, icon: BookOpen, color: 'reading', marks: 10, duration: '25 min' },
    { name: 'Writing Test', type: 'writing', avgScore: 7.9, completionRate: 88, icon: PenTool, color: 'writing', marks: 10, duration: '30 min' },
    { name: 'Vocabulary Test', type: 'vocabulary', avgScore: 8.3, completionRate: 95, icon: Brain, color: 'vocabulary', marks: 10, duration: '15 min' }
  ]

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default'
      case 'in_progress': return 'secondary'
      case 'not_started': return 'outline'
      default: return 'outline'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
      
      {/* Sidebar - PRESERVING EXACT CURRENT UI */}
      <aside className={`fixed left-0 top-0 z-50 h-screen w-64 bg-card border-r border-border transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto shadow-lg`}>
        <div className="flex flex-col h-full">
          {/* Logo Header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-bold gradient-text">CLAP</span>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
          </div>

          {/* Navigation - PRESERVING EXACT CURRENT UI */}
          <nav className="flex-1 px-4 py-6">
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab('overview')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'overview' 
                    ? 'bg-primary/10 text-primary border border-primary/20' 
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <BarChart3 className="w-5 h-5" />
                Dashboard
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('students')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'students' 
                    ? 'bg-primary/10 text-primary border border-primary/20' 
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Users className="w-5 h-5" />
                Students
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('batches')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'batches' 
                    ? 'bg-primary/10 text-primary border border-primary/20' 
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Users className="w-5 h-5" />
                Batches
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('tests')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'tests' 
                    ? 'bg-primary/10 text-primary border border-primary/20' 
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <FileText className="w-5 h-5" />
                Tests
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('analytics')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'analytics' 
                    ? 'bg-primary/10 text-primary border border-primary/20' 
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                Analytics
              </button>
            </div>
          </nav>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-border">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-0' : ''} lg:ml-64`}>
        {/* Header - PRESERVING EXACT CURRENT UI */}
        <header className="sticky top-0 z-40 glass border-b border-border">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Welcome back, Admin</h2>
                <p className="text-sm text-muted-foreground">Production Dashboard • Last updated: Just now</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Bell className="w-4 h-4 mr-2" />
                Notifications
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Student
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* OVERVIEW TAB - PRESERVING EXACT UI WITH GUARANTEED CONTENT */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Hero-style section header */}
              <div className="text-center">
                <Badge variant="secondary" className="mb-4 px-4 py-1.5">
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  Admin Dashboard Overview
                </Badge>
                <h1 className="text-display-lg mb-4">System Performance Metrics</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Monitor student progress, test completion rates, and platform performance across all assessment areas
                </p>
              </div>
              
              {/* Stats Grid - PRESERVING EXACT UI */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="card-hover border-0 bg-card shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Students</p>
                        <p className="text-3xl font-bold text-foreground mt-1">25</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-3 text-sm text-success">
                      <TrendingUp className="w-4 h-4" />
                      <span>+12% from last month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-hover border-0 bg-card shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Completed Tests</p>
                        <p className="text-3xl font-bold text-foreground mt-1">18</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-success" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-border rounded-full h-2">
                        <div className="bg-success h-2 rounded-full" style={{ width: '72%' }}></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-hover border-0 bg-card shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                        <p className="text-3xl font-bold text-foreground mt-1">7</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-warning" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">Currently taking tests</p>
                  </CardContent>
                </Card>

                <Card className="card-hover border-0 bg-card shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Avg. Score</p>
                        <p className="text-3xl font-bold text-foreground mt-1">7.2/10</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-accent" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">72% average performance</p>
                  </CardContent>
                </Card>
              </div>

              {/* Test Performance - PRESERVING EXACT UI */}
              <Card className="border border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-display-sm">Test Performance Overview</CardTitle>
                  <CardDescription>Performance metrics across all assessment types</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {testData.map((test) => (
                      <Card key={test.name} className="card-hover cursor-pointer border-2 transition-all duration-300 border-transparent hover:border-primary">
                        <CardHeader className="pb-3">
                          <div className={`w-12 h-12 rounded-xl bg-${test.color}/10 flex items-center justify-center mb-3`}>
                            <test.icon className={`w-6 h-6 text-${test.color}`} style={{ color: `hsl(var(--${test.color}))` }} />
                          </div>
                          <Badge variant={test.color as any} className="w-fit mb-2">
                            {test.marks} marks
                          </Badge>
                          <CardTitle className="text-base">{test.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Avg Score</span>
                              <span className="font-semibold">{test.avgScore}/10</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Completion</span>
                              <span className="font-semibold">{test.completionRate}%</span>
                            </div>
                            <div className="w-full bg-border rounded-full h-1.5">
                              <div 
                                className={`h-1.5 rounded-full bg-${test.color}`}
                                style={{ 
                                  width: `${test.completionRate}%`,
                                  backgroundColor: `hsl(var(--${test.color}))`
                                }}
                              ></div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* STUDENTS TAB - PRESERVING EXACT UI WITH CONTENT */}
          {activeTab === 'students' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-center sm:text-left">
                  <Badge variant="outline" className="mb-4">Student Management</Badge>
                  <h1 className="text-display-sm mb-2">Student Directory</h1>
                  <p className="text-lg text-muted-foreground">
                    Manage and monitor all enrolled students in the system
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      className="pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent w-64 bg-background"
                    />
                  </div>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Student
                  </Button>
                </div>
              </div>
              
              <Card className="border border-border bg-card">
                <CardHeader>
                  <CardTitle>Student List</CardTitle>
                  <CardDescription>All registered students with current status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {studentData.map((student) => (
                      <Card key={student.id} className="card-hover border border-border bg-card hover:shadow-md transition-all">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="font-semibold text-primary">{student.avatar}</span>
                              </div>
                              <div>
                                <h3 className="font-semibold text-foreground">{student.name}</h3>
                                <p className="text-sm text-muted-foreground">{student.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <Badge variant={getStatusVariant(student.status) as any}>
                                {student.status.replace('_', ' ')}
                              </Badge>
                              {student.score && (
                                <span className="font-semibold text-foreground">{student.score}/50</span>
                              )}
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* BATCHES TAB - PRESERVING EXACT UI WITH CONTENT */}
          {activeTab === 'batches' && (
            <div className="space-y-8">
              <div className="text-center">
                <Badge variant="outline" className="mb-4">Batch Management</Badge>
                <h1 className="text-display-sm mb-4">Academic Batches</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Organize students into academic year groups with enrollment tracking
                </p>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {batchData.map((batch) => (
                  <Card key={batch.id} className="card-hover border border-border bg-card hover:shadow-md transition-all">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{batch.name}</CardTitle>
                        <Badge variant={batch.isActive ? "default" : "destructive"}>
                          {batch.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <CardDescription>
                        Academic Year {batch.startYear}-{batch.endYear}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <span className="font-semibold text-foreground">{batch.studentCount}</span>
                          <span className="text-muted-foreground ml-1">students enrolled</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Created 2 weeks ago</span>
                      </div>
                      <div className="pt-4 border-t border-border flex justify-between items-center">
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TESTS TAB - PRESERVING EXACT UI WITH CONTENT */}
          {activeTab === 'tests' && (
            <div className="space-y-8">
              <div className="text-center">
                <Badge variant="outline" className="mb-4">Test Management</Badge>
                <h1 className="text-display-sm mb-4">Assessment Tests</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Configure and manage all assessment tests with detailed performance metrics
                </p>
              </div>
              
              <Card className="border border-border bg-card">
                <CardHeader>
                  <CardTitle>Test Configuration</CardTitle>
                  <CardDescription>Manage test settings and view performance data</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {testData.map((test) => (
                      <Card key={test.name} className="card-hover border border-border bg-card hover:shadow-md transition-all">
                        <CardHeader className="pb-3">
                          <div className={`w-12 h-12 rounded-xl bg-${test.color}/10 flex items-center justify-center mb-3`}>
                            <test.icon className={`w-6 h-6 text-${test.color}`} style={{ color: `hsl(var(--${test.color}))` }} />
                          </div>
                          <Badge variant={test.color as any} className="w-fit mb-2">
                            {test.marks} marks • {test.duration}
                          </Badge>
                          <CardTitle className="text-base">{test.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="bg-secondary rounded-lg p-2">
                                <p className="text-xs text-muted-foreground">Avg Score</p>
                                <p className="font-semibold text-foreground">{test.avgScore}/10</p>
                              </div>
                              <div className="bg-secondary rounded-lg p-2">
                                <p className="text-xs text-muted-foreground">Completion</p>
                                <p className="font-semibold text-foreground">{test.completionRate}%</p>
                              </div>
                            </div>
                            <div className="w-full bg-border rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full bg-${test.color}`}
                                style={{ width: `${test.completionRate}%`, backgroundColor: `hsl(var(--${test.color}))` }}
                              ></div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="flex-1">
                                <Settings className="w-3 h-3 mr-1" />
                                Configure
                              </Button>
                              <Button variant="outline" size="sm">
                                <Eye className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ANALYTICS TAB - PRESERVING EXACT UI WITH CONTENT */}
          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <div className="text-center">
                <Badge variant="outline" className="mb-4">Analytics Dashboard</Badge>
                <h1 className="text-display-sm mb-4">Performance Insights</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Detailed analytics and insights to optimize assessment effectiveness
                </p>
              </div>
              
              <div className="grid gap-8 lg:grid-cols-2">
                <Card className="border border-border bg-card">
                  <CardHeader>
                    <CardTitle>Score Distribution</CardTitle>
                    <CardDescription>Performance breakdown by score ranges</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { range: '40-50', percentage: 25, count: 6, color: 'success' },
                        { range: '30-40', percentage: 45, count: 11, color: 'primary' },
                        { range: '20-30', percentage: 20, count: 5, color: 'warning' },
                        { range: '0-20', percentage: 10, count: 3, color: 'destructive' }
                      ].map((item) => (
                        <div key={item.range} className="flex items-center gap-4">
                          <span className="text-sm font-medium w-16 text-foreground">{item.range}</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="w-full bg-border rounded-full h-2.5">
                                <div 
                                  className={`h-2.5 rounded-full bg-${item.color}`}
                                  style={{ width: `${item.percentage}%`, backgroundColor: `hsl(var(--${item.color}))` }}
                                ></div>
                              </div>
                              <span className="text-sm text-muted-foreground ml-3 w-16 text-right">{item.percentage}%</span>
                            </div>
                            <div className="text-xs text-muted-foreground">{item.count} students</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border bg-card">
                  <CardHeader>
                    <CardTitle>Key Insights</CardTitle>
                    <CardDescription>Important performance metrics and trends</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-success" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Highest Score</p>
                            <p className="text-sm text-muted-foreground">45/50 (Emma Davis)</p>
                          </div>
                        </div>
                        <TrendingUp className="w-5 h-5 text-success" />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-destructive" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Lowest Score</p>
                            <p className="text-sm text-muted-foreground">35/50 (Frank Miller)</p>
                          </div>
                        </div>
                        <TrendingDown className="w-5 h-5 text-destructive" />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border border-primary/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Target className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Best Performing</p>
                            <p className="text-sm text-muted-foreground">Reading Test (8.2/10)</p>
                          </div>
                        </div>
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-warning/10 rounded-lg border border-warning/20">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-warning" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Needs Attention</p>
                            <p className="text-sm text-muted-foreground">Speaking Test (6.5/10)</p>
                          </div>
                        </div>
                        <TrendingDown className="w-5 h-5 text-warning" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}