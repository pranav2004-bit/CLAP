'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  LogOut,
  Plus,
  Download,
  Eye,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
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
  Filter,
  Search,
  ChevronDown,
  Bell,
  Settings
} from 'lucide-react'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'tests' | 'analytics' | 'batches'>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Mock data for demonstration
  const studentData = [
    { id: 'STU001', name: 'John Smith', email: 'john.smith@example.com', status: 'completed', score: 42, avatar: 'JS' },
    { id: 'STU002', name: 'Sarah Johnson', email: 'sarah.johnson@example.com', status: 'in_progress', score: null, avatar: 'SJ' },
    { id: 'STU003', name: 'Mike Wilson', email: 'mike.wilson@example.com', status: 'completed', score: 38, avatar: 'MW' },
    { id: 'STU004', name: 'Emma Davis', email: 'emma.davis@example.com', status: 'not_started', score: null, avatar: 'ED' },
    { id: 'STU005', name: 'David Brown', email: 'david.brown@example.com', status: 'completed', score: 45, avatar: 'DB' }
  ]

  const batchData = [
    { id: 'BATCH001', name: '2023-27', startYear: 2023, endYear: 2027, studentCount: 12, isActive: true, color: 'blue' },
    { id: 'BATCH002', name: '2024-28', startYear: 2024, endYear: 2028, studentCount: 8, isActive: true, color: 'green' },
    { id: 'BATCH003', name: '2025-29', startYear: 2025, endYear: 2029, studentCount: 5, isActive: false, color: 'gray' }
  ]

  const testData = [
    { name: 'Listening Test', type: 'listening', avgScore: 7.5, completionRate: 85, icon: 'Headphones', color: 'blue' },
    { name: 'Speaking Test', type: 'speaking', avgScore: 6.8, completionRate: 72, icon: 'Mic', color: 'purple' },
    { name: 'Reading Test', type: 'reading', avgScore: 8.1, completionRate: 92, icon: 'BookOpen', color: 'green' },
    { name: 'Writing Test', type: 'writing', avgScore: 7.9, completionRate: 88, icon: 'PenTool', color: 'orange' },
    { name: 'Verbal Ability Test', type: 'vocabulary', avgScore: 8.3, completionRate: 95, icon: 'Brain', color: 'indigo' }
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'not_started': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getBatchColor = (color: string) => {
    switch (color) {
      case 'blue': return 'bg-blue-500'
      case 'green': return 'bg-green-500'
      case 'gray': return 'bg-gray-500'
      default: return 'bg-blue-500'
    }
  }

  const getTestIcon = (iconName: string) => {
    const icons: Record<string, React.ReactNode> = {
      'Headphones': <Headphones className="w-5 h-5" />,
      'Mic': <Mic className="w-5 h-5" />,
      'BookOpen': <BookOpen className="w-5 h-5" />,
      'PenTool': <PenTool className="w-5 h-5" />,
      'Brain': <Brain className="w-5 h-5" />
    }
    return icons[iconName] || <FileText className="w-5 h-5" />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
      
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-50 h-screen w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto shadow-lg`}>
        <div className="flex flex-col h-full">
          {/* Logo Header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-lg">🎓</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">CLAP</h1>
              <p className="text-xs text-gray-500 font-medium">Admin Portal</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6">
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab('overview')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'overview' 
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' 
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <BarChart3 className={`w-5 h-5 ${activeTab === 'overview' ? 'text-indigo-600' : 'text-gray-500'}`} />
                Dashboard
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('students')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'students' 
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' 
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Users className={`w-5 h-5 ${activeTab === 'students' ? 'text-indigo-600' : 'text-gray-500'}`} />
                Students
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('batches')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'batches' 
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' 
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Users className={`w-5 h-5 ${activeTab === 'batches' ? 'text-indigo-600' : 'text-gray-500'}`} />
                Batches
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('tests')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'tests' 
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' 
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <FileText className={`w-5 h-5 ${activeTab === 'tests' ? 'text-indigo-600' : 'text-gray-500'}`} />
                Tests
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('analytics')
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'analytics' 
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' 
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <TrendingUp className={`w-5 h-5 ${activeTab === 'analytics' ? 'text-indigo-600' : 'text-gray-500'}`} />
                Analytics
              </button>
            </div>
          </nav>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-gray-200">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              <LogOut className="w-5 h-5 text-gray-500" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-0' : ''} lg:ml-64`}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
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
                <h2 className="text-lg font-semibold text-gray-900">Welcome back, Admin</h2>
                <p className="text-sm text-gray-500">Production Dashboard • Last updated: Just now</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Bell className="w-4 h-4 mr-2" />
                Notifications
              </Button>
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Student
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* OVERVIEW TAB - PROFESSIONAL DASHBOARD */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
                  <p className="text-gray-600 mt-1">Monitor system performance and student progress</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-2" />
                    Filter
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
              
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Students</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">25</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Users className="w-6 h-6 text-indigo-600" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-3 text-sm text-green-600">
                      <TrendingUp className="w-4 h-4" />
                      <span>+12% from last month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Completed Tests</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">18</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                    <Progress value={72} className="mt-3 h-2" />
                  </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">In Progress</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">7</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-yellow-600" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-3">Currently taking tests</p>
                  </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Avg. Score</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">7.2/10</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-purple-600" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-3">72% average performance</p>
                  </CardContent>
                </Card>
              </div>

              {/* Test Performance Chart */}
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">Test Performance Overview</CardTitle>
                  <p className="text-gray-600 text-sm">Average scores across all assessment types</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    {testData.map((test) => (
                      <div key={test.name} className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getBatchColor(test.color)} bg-opacity-10`}>
                          <div className={`${getBatchColor(test.color)} text-white`}>
                            {getTestIcon(test.icon)}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">{test.name}</span>
                            <span className="font-semibold text-gray-900">{test.avgScore}/10</span>
                          </div>
                          <Progress value={test.avgScore * 10} className="h-2.5" />
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-500">Completion: {test.completionRate}%</span>
                            <span className="text-xs text-gray-500">{test.type.charAt(0).toUpperCase() + test.type.slice(1)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* STUDENTS TAB - PROFESSIONAL MANAGEMENT */}
          {activeTab === 'students' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
                  <p className="text-gray-600 mt-1">View and manage all enrolled students</p>
                </div>
                <div className="flex gap-2">
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
                    />
                  </div>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Student
                  </Button>
                </div>
              </div>
              
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">Student Directory</CardTitle>
                  <p className="text-gray-600 text-sm">All registered students in the system</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Student</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Score</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Last Activity</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {studentData.map((student) => (
                          <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                  <span className="text-indigo-800 font-medium text-sm">{student.avatar}</span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{student.name}</p>
                                  <p className="text-sm text-gray-500">{student.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <Badge className={`${getStatusColor(student.status)} font-medium`}>
                                {student.status.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="py-4 px-4">
                              {student.score ? (
                                <span className="font-semibold text-gray-900">{student.score}/50</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-sm text-gray-500">2 hours ago</span>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* BATCHES TAB - PROFESSIONAL ORGANIZATION */}
          {activeTab === 'batches' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Batch Management</h1>
                  <p className="text-gray-600 mt-1">Organize students into academic batches</p>
                </div>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Batch
                </Button>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {batchData.map((batch) => (
                  <Card key={batch.id} className="border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-semibold text-gray-900">{batch.name}</CardTitle>
                          <p className="text-sm text-gray-500">Academic Year {batch.startYear}-{batch.endYear}</p>
                        </div>
                        <Badge variant={batch.isActive ? "default" : "secondary"}>
                          {batch.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-gray-400" />
                        <div>
                          <span className="font-semibold text-gray-900">{batch.studentCount}</span>
                          <span className="text-gray-500 ml-1">students enrolled</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Created 2 weeks ago</span>
                      </div>
                      <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
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

          {/* TESTS TAB - PROFESSIONAL ASSESSMENT */}
          {activeTab === 'tests' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Test Management</h1>
                  <p className="text-gray-600 mt-1">Create and manage assessment tests</p>
                </div>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Test
                </Button>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {testData.map((test) => (
                  <Card key={test.name} className="border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getBatchColor(test.color)} bg-opacity-10`}>
                          <div className={`${getBatchColor(test.color)} text-white`}>
                            {getTestIcon(test.icon)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <CardTitle className="text-lg font-semibold text-gray-900 mt-4">{test.name}</CardTitle>
                      <p className="text-gray-600 text-sm">10 marks • Auto-evaluated • {test.type.charAt(0).toUpperCase() + test.type.slice(1)}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg. Score</p>
                          <p className="text-lg font-semibold text-gray-900 mt-1">{test.avgScore}/10</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Completion</p>
                          <p className="text-lg font-semibold text-gray-900 mt-1">{test.completionRate}%</p>
                        </div>
                      </div>
                      <Progress value={test.completionRate} className="h-2" />
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">25 students completed</span>
                        <span className="text-gray-500">Auto-graded</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ANALYTICS TAB - PROFESSIONAL INSIGHTS */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
                  <p className="text-gray-600 mt-1">Detailed performance metrics and insights</p>
                </div>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export Report
                </Button>
              </div>
              
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">Score Distribution</CardTitle>
                    <p className="text-gray-600 text-sm">Performance breakdown by score ranges</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { range: '40-50', count: 6, percentage: 25, color: 'bg-green-500' },
                        { range: '30-40', count: 11, percentage: 45, color: 'bg-blue-500' },
                        { range: '20-30', count: 5, percentage: 20, color: 'bg-yellow-500' },
                        { range: '0-20', count: 3, percentage: 10, color: 'bg-red-500' }
                      ].map((item) => (
                        <div key={item.range} className="flex items-center gap-4">
                          <div className="w-20 text-sm font-medium text-gray-700">{item.range}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div className={`${item.color} h-2.5 rounded-full`} style={{ width: `${item.percentage}%` }}></div>
                              </div>
                              <span className="text-sm text-gray-500 ml-3 w-12 text-right">{item.percentage}%</span>
                            </div>
                            <div className="text-xs text-gray-500">{item.count} students</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">Performance Insights</CardTitle>
                    <p className="text-gray-600 text-sm">Key metrics and system health</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-5">
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Highest Score</p>
                            <p className="text-sm text-gray-600">45/50 (Emma Davis)</p>
                          </div>
                        </div>
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Lowest Score</p>
                            <p className="text-sm text-gray-600">35/50 (Frank Miller)</p>
                          </div>
                        </div>
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Best Performing</p>
                            <p className="text-sm text-gray-600">Reading Test (8.2/10)</p>
                          </div>
                        </div>
                        <ChevronDown className="w-5 h-5 text-blue-600 rotate-180" />
                      </div>
                      
                      <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-yellow-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Needs Attention</p>
                            <p className="text-sm text-gray-600">Speaking Test (6.5/10)</p>
                          </div>
                        </div>
                        <ChevronDown className="w-5 h-5 text-yellow-600" />
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