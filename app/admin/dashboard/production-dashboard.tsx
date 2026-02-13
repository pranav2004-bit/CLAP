'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  GraduationCap, 
  Users,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Download,
  Eye,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  Brain,
  Calendar,
  Edit,
  Trash2,
  User,
  Menu,
  RefreshCw,
  Search
} from 'lucide-react'

export default function ProductionAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'tests' | 'analytics' | 'batches'>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold gradient-text">CLAP</span>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'overview' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'students' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Users className="w-5 h-5" />
              Students
            </button>
            
            <button
              onClick={() => setActiveTab('batches')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'batches' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Users className="w-5 h-5" />
              Batches
            </button>
            <button
              onClick={() => setActiveTab('tests')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'tests' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <FileText className="w-5 h-5" />
              Tests
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'analytics' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              Analytics
            </button>
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

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
      
      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-0' : ''} lg:ml-64`}>
        {/* Header */}
        <header className="sticky top-0 z-30 glass border-b border-border">
          <div className="flex h-16 items-center justify-between px-6">
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
                <p className="text-sm text-muted-foreground mb-1">
                  Welcome, Admin
                </p>
                <p className="text-xs text-muted-foreground">
                  Production Dashboard Active
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
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
          {/* OVERVIEW TAB - GUARANTEED CONTENT */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold">Dashboard Overview</h1>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Students</p>
                        <p className="text-3xl font-bold mt-1">25</p>
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

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Completed</p>
                        <p className="text-3xl font-bold mt-1">18</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-success" />
                      </div>
                    </div>
                    <Progress value={72} variant="success" className="mt-3" />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">In Progress</p>
                        <p className="text-3xl font-bold mt-1">7</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-warning" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">Currently taking test</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg. Score</p>
                        <p className="text-3xl font-bold mt-1">7.2/10</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-accent" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">72% average</p>
                  </CardContent>
                </Card>
              </div>

              {/* Test Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Test Performance</CardTitle>
                  <CardDescription>Average scores across all tests</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { name: 'Listening Test', avgScore: 7.5, icon: Headphones },
                      { name: 'Speaking Test', avgScore: 6.8, icon: Mic },
                      { name: 'Reading Test', avgScore: 8.1, icon: BookOpen },
                      { name: 'Writing Test', avgScore: 7.9, icon: PenTool },
                      { name: 'Vocabulary Test', avgScore: 8.3, icon: Brain }
                    ].map((test) => {
                      const TestIcon = test.icon;
                      return (
                        <div key={test.name} className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
                            <TestIcon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{test.name}</span>
                              <span className="text-sm font-semibold">{test.avgScore}/10</span>
                            </div>
                            <Progress value={test.avgScore * 10} className="h-2" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* STUDENTS TAB - GUARANTEED CONTENT */}
          {activeTab === 'students' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold">Student Management</h1>
                  <p className="text-muted-foreground">Manage and monitor student progress</p>
                </div>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Student
                </Button>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Student List</CardTitle>
                  <CardDescription>All registered students in the system</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { id: 'STU001', name: 'John Smith', email: 'john.smith@example.com', status: 'completed', score: 42 },
                      { id: 'STU002', name: 'Sarah Johnson', email: 'sarah.johnson@example.com', status: 'in_progress', score: null },
                      { id: 'STU003', name: 'Mike Wilson', email: 'mike.wilson@example.com', status: 'completed', score: 38 },
                      { id: 'STU004', name: 'Emma Davis', email: 'emma.davis@example.com', status: 'not_started', score: null }
                    ].map((student) => (
                      <div key={student.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{student.name}</p>
                            <p className="text-sm text-muted-foreground">{student.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={student.status === 'completed' ? 'default' : student.status === 'in_progress' ? 'secondary' : 'outline'}>
                            {student.status.replace('_', ' ')}
                          </Badge>
                          {student.score && (
                            <span className="font-semibold">{student.score}/50</span>
                          )}
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* BATCHES TAB - GUARANTEED CONTENT */}
          {activeTab === 'batches' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold">Batch Management</h1>
                  <p className="text-muted-foreground">Organize students into batches</p>
                </div>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Batch
                </Button>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { id: 'BATCH001', name: '2023-27', startYear: 2023, endYear: 2027, studentCount: 12, isActive: true },
                  { id: 'BATCH002', name: '2024-28', startYear: 2024, endYear: 2028, studentCount: 8, isActive: true },
                  { id: 'BATCH003', name: '2025-29', startYear: 2025, endYear: 2029, studentCount: 5, isActive: false }
                ].map((batch) => (
                  <Card key={batch.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{batch.name}</CardTitle>
                        <Badge variant={batch.isActive ? "default" : "destructive"}>
                          {batch.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>{batch.startYear} - {batch.endYear}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{batch.studentCount}</span>
                        <span className="text-sm text-muted-foreground">students</span>
                      </div>
                      <div className="pt-2 border-t flex justify-between items-center">
                        <p className="text-xs text-muted-foreground">
                          Created recently
                        </p>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TESTS TAB - GUARANTEED CONTENT */}
          {activeTab === 'tests' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold">Test Management</h1>
                  <p className="text-muted-foreground">Create, edit, and manage assessments</p>
                </div>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Test
                </Button>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: 'Listening Test', type: 'listening', avgScore: 7.5, completionRate: 85, icon: Headphones },
                  { name: 'Speaking Test', type: 'speaking', avgScore: 6.8, completionRate: 72, icon: Mic },
                  { name: 'Reading Test', type: 'reading', avgScore: 8.1, completionRate: 92, icon: BookOpen },
                  { name: 'Writing Test', type: 'writing', avgScore: 7.9, completionRate: 88, icon: PenTool },
                  { name: 'Vocabulary Test', type: 'vocabulary', avgScore: 8.3, completionRate: 95, icon: Brain }
                ].map((test) => {
                  const TestIcon = test.icon;
                  return (
                    <Card key={test.name} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10">
                            <TestIcon className="w-6 h-6 text-primary" />
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm">
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <CardTitle className="text-lg mt-4">{test.name}</CardTitle>
                        <CardDescription>10 marks • Auto-evaluated</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Avg. Score</span>
                            <span className="font-semibold">{test.avgScore}/10</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Completion Rate</span>
                            <span className="font-semibold">{test.completionRate}%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* ANALYTICS TAB - GUARANTEED CONTENT */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
                  <p className="text-muted-foreground">Detailed performance metrics and insights</p>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export Report
                </Button>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Score Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm w-16">40-50</span>
                        <Progress value={25} className="flex-1 h-3" />
                        <span className="text-sm text-muted-foreground">25%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm w-16">30-40</span>
                        <Progress value={45} className="flex-1 h-3" />
                        <span className="text-sm text-muted-foreground">45%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm w-16">20-30</span>
                        <Progress value={20} className="flex-1 h-3" />
                        <span className="text-sm text-muted-foreground">20%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm w-16">0-20</span>
                        <Progress value={10} className="flex-1 h-3" />
                        <span className="text-sm text-muted-foreground">10%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Quick Stats</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Highest Score</span>
                        <span className="font-semibold">45/50 (Emma Davis)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Lowest Score</span>
                        <span className="font-semibold">35/50 (Frank Miller)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Best Test (Avg)</span>
                        <span className="font-semibold">Reading (8.2/10)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Needs Improvement</span>
                        <span className="font-semibold">Speaking (6.5/10)</span>
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