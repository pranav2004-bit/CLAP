'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3,
  Users,
  FileText,
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  Brain,
  Clock,
  Settings,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Calendar,
  Edit,
  Trash2,
  Menu,
  Bell,
  LogOut,
  Plus,
  Download,
  Search,
  Filter,
  Sparkles,
  Target,
  X,
  Save,
  Play,
  Square,
  Loader2,
  Monitor,
  Mail,
  Brain,
  Activity,
  BarChart,
  FileCheck
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import { BatchManagement } from '@/components/BatchManagement'
import { EnhancedStudentManagement } from '@/components/EnhancedStudentManagement'
import { EnhancedStudentManagementModal } from '@/components/EnhancedStudentManagementModal'
import { SubmissionMonitor } from '@/components/admin/SubmissionMonitor'
import { ScoreManagement } from '@/components/admin/ScoreManagement'
import { LLMControls } from '@/components/admin/LLMControls'
import { ReportManagement } from '@/components/admin/ReportManagement'
import { EmailManagement } from '@/components/admin/EmailManagement'
import { DLQManagement } from '@/components/admin/DLQManagement'
import { AdminNotifications } from '@/components/admin/AdminNotifications'
import { getApiUrl } from '@/lib/api-config'
import { feedback } from '@/lib/user-feedback'

export default function SimplifiedAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'analytics' | 'batches' | 'clap-tests' | 'control-room' | 'submissions' | 'scores' | 'llm' | 'reports' | 'emails' | 'dlq' | 'notifications'>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [controlRoomSubTab, setControlRoomSubTab] = useState<'wt' | 'st'>('wt')
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false)
  const [showCreateClapTestModal, setShowCreateClapTestModal] = useState(false)
  const [showClapTestDetails, setShowClapTestDetails] = useState(false)
  const [showEditClapTestModal, setShowEditClapTestModal] = useState(false)
  const [selectedClapTest, setSelectedClapTest] = useState<any>(null)
  const [clapTests, setClapTests] = useState<any[]>([])
  const [batches, setBatches] = useState<any[]>([])

  const [newClapTestName, setNewClapTestName] = useState('')
  const [newClapTestBatchId, setNewClapTestBatchId] = useState('')
  const [isCreatingTest, setIsCreatingTest] = useState(false)
  const [loadingTestId, setLoadingTestId] = useState<string | null>(null)
  const [showClapConfigureModal, setShowClapConfigureModal] = useState(false)
  const [configureSaving, setConfigureSaving] = useState(false)
  const [configName, setConfigName] = useState('')
  const [configStatus, setConfigStatus] = useState('draft')
  const [configComponents, setConfigComponents] = useState<any[]>([])
  const router = useRouter()

  const fetchBatches = async () => {
    try {
      const response = await fetch(getApiUrl('admin/batches'));
      if (!response.ok) {
        console.error('Failed to fetch batches:', response.status);
        return;
      }
      const data = await response.json();

      if (data.batches) {
        setBatches(data.batches);
      }
    } catch (error) {
      console.error('Error fetching batches:', error);
    }
  };

  const fetchClapTests = async () => {
    try {
      const loadingToast = feedback.loadingData('CLAP tests')
      const response = await fetch(getApiUrl('admin/clap-tests'));

      toast.dismiss(loadingToast)

      if (!response.ok) {
        console.error('Failed to fetch CLAP tests:', response.status);
        return;
      }
      const data = await response.json();

      if (data.clapTests) {
        setClapTests(data.clapTests);
      }
    } catch (error) {
      console.error('Error fetching CLAP tests:', error);
      feedback.error('Failed to load CLAP tests', {
        description: 'Please refresh the page'
      });
    }
  };

  const handleCreateNewClapTest = async (clapTestData: any) => {
    try {
      setIsCreatingTest(true);
      const loadingToast = feedback.creating('CLAP test')
      const response = await fetch(getApiUrl('admin/clap-tests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testName: clapTestData.testName,
          batchId: clapTestData.batchId
        })
      });

      const data = await response.json();

      toast.dismiss(loadingToast)

      if (response.ok) {
        feedback.created('CLAP Test', clapTestData.testName);
        fetchClapTests(); // Refresh the list
        handleCloseCreateClapTest();
      } else {
        feedback.error(data.error || 'Failed to create CLAP test');
      }
    } catch (error) {
      console.error('Error creating CLAP test:', error);
      feedback.networkError();
    } finally {
      setIsCreatingTest(false);
    }
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchClapTests();
    fetchBatches();
  }, []);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default'
      case 'in_progress': return 'secondary'
      case 'not_started': return 'outline'
      default: return 'outline'
    }
  };

  const handleCreateStudent = async (studentData: any) => {
    try {
      const response = await fetch(getApiUrl('admin/students'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: studentData.student_id,
          batch_id: studentData.batch_id || null
        }),
      });

      const data = await response.json();

      if (response.ok && data.student) {
        // Show appropriate message based on whether it was restored or newly created
        if (data.student.restored) {
          toast.success(`✨ Student "${studentData.student_id}" was previously deleted and has been restored!`, {
            description: 'Password reset to CLAP@123',
            duration: 5000
          });
        } else {
          toast.success(`✅ Student "${studentData.student_id}" created successfully!`, {
            description: 'Default password: CLAP@123',
            duration: 5000
          });
        }

        // Refresh the page to show the student
        setTimeout(() => {
          window.location.reload();
        }, 1000); // Small delay to let user see the message

        return data.student;
      } else {
        // Show specific error message from backend
        const errorMessage = data.error || 'Failed to create student';
        toast.error(`❌ ${errorMessage}`, {
          duration: 5000
        });
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('Error creating student:', error);

      // Show user-friendly error message
      if (!error.message || error.message === 'Failed to fetch') {
        toast.error('❌ Network error - Please check your connection', {
          description: 'Make sure the backend server is running',
          duration: 5000
        });
      } else if (!error.message.includes('already exists')) {
        // Only show generic error if we haven't already shown a specific one
        toast.error(`❌ ${error.message}`, {
          duration: 5000
        });
      }

      throw error;
    }
  };



  // CLAP Test Handlers
  const handleCreateClapTest = () => {
    setShowCreateClapTestModal(true);
    fetchBatches(); // Fetch batches when modal opens
  };

  const handleCloseCreateClapTest = () => {
    setShowCreateClapTestModal(false);
    setNewClapTestName('');
    setNewClapTestBatchId('');
  };

  const handleViewClapTest = (clapTest: any) => {
    setSelectedClapTest(clapTest);
    setShowClapTestDetails(true);
  };

  const handleCloseClapTestDetails = () => {
    setShowClapTestDetails(false);
    setSelectedClapTest(null);
  };

  const handleEditClapTest = (clapTest: any) => {
    setSelectedClapTest(clapTest);
    setShowEditClapTestModal(true);
    fetchBatches(); // Fetch batches when modal opens
  };

  const handleCloseEditClapTest = () => {
    setShowEditClapTestModal(false);
    setSelectedClapTest(null);
  };

  const handleUpdateClapTest = async (updatedData: any) => {
    try {
      const loadingToast = feedback.updating('CLAP test')
      const response = await fetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedData)
      });

      const data = await response.json();

      toast.dismiss(loadingToast)

      if (response.ok) {
        feedback.updated('CLAP Test', updatedData.name);
        fetchClapTests(); // Refresh the list
        handleCloseEditClapTest();
      } else {
        feedback.error(data.error || 'Failed to update CLAP test');
      }
    } catch (error) {
      console.error('Error updating CLAP test:', error);
      feedback.networkError();
    }
  };

  // ---- Configure Modal Handlers ----
  const handleOpenClapConfigure = () => {
    if (!selectedClapTest) return
    setConfigName(selectedClapTest.name || '')
    setConfigStatus(selectedClapTest.status || 'draft')
    setConfigComponents(
      (selectedClapTest.tests || []).map((comp: any) => ({
        id: comp.id,
        name: comp.name,
        type: comp.type,
        duration: comp.duration ?? 0,
        max_marks: comp.max_marks ?? 10,
      }))
    )
    setShowClapConfigureModal(true)
  }

  const handleSaveClapConfiguration = async () => {
    if (!selectedClapTest) return
    setConfigureSaving(true)
    try {
      // 1. Update test name/status
      const testRes = await fetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': localStorage.getItem('user_id') || ''
        },
        body: JSON.stringify({ name: configName, status: configStatus })
      })
      if (!testRes.ok) {
        const err = await testRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update test')
      }

      // 2. Update each component's duration and max_marks
      for (const comp of configComponents) {
        const compRes = await fetch(getApiUrl(`admin/clap-components/${comp.id}`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': localStorage.getItem('user_id') || ''
          },
          body: JSON.stringify({
            duration: comp.duration,
            max_marks: comp.max_marks
          })
        })
        if (!compRes.ok) {
          const err = await compRes.json().catch(() => ({}))
          throw new Error(err.error || `Failed to update ${comp.name}`)
        }
      }

      toast.success('Configuration saved successfully')
      // Refresh test data
      await fetchClapTests()
      // Update selected test locally
      setSelectedClapTest((prev: any) => ({
        ...prev,
        name: configName,
        status: configStatus,
        tests: configComponents.map((c: any) => ({
          ...((prev?.tests || []).find((t: any) => t.id === c.id) || {}),
          duration: c.duration,
          max_marks: c.max_marks,
        }))
      }))
      setShowClapConfigureModal(false)
    } catch (error: any) {
      console.error('Error saving configuration:', error)
      toast.error(error.message || 'Failed to save configuration')
    } finally {
      setConfigureSaving(false)
    }
  }

  // ---- View Results Handler ----
  const handleOpenClapResults = () => {
    if (!selectedClapTest) return
    router.push(`/admin/dashboard/clap-tests/${selectedClapTest.id}/results`)
  }

  const handleAssignClapTest = async (clapTest: any) => {
    try {

      // Optimistically update UI first
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: true }
            : test
        )
      );

      // Update selected test if it's the same one
      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: true }));
      }

      // Make API call to assign the test
      const response = await fetch(getApiUrl(`admin/clap-tests/${clapTest.id}/assign`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batch_id: clapTest.batch_id
        })
      });

      const data = await response.json();

      if (response.ok) {
        feedback.assigned('CLAP Test', clapTest.name, 'selected batch');
        // Refresh to ensure data consistency
        fetchClapTests();
      } else {
        // Rollback optimistic update on error
        setClapTests(prevTests =>
          prevTests.map(test =>
            test.id === clapTest.id
              ? { ...test, is_assigned: false }
              : test
          )
        );

        if (selectedClapTest && selectedClapTest.id === clapTest.id) {
          setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false }));
        }

        feedback.error(data.error || 'Failed to assign CLAP test');
      }
    } catch (error) {
      console.error('Error assigning CLAP test:', error);
      // Rollback optimistic update on error
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: false }
            : test
        )
      );

      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false }));
      }

      toast.error('Failed to assign CLAP test');
    }
  };

  const handleUnassignClapTest = async (clapTest: any) => {
    try {

      // Optimistically update UI first
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: false }
            : test
        )
      );

      // Update selected test if it's the same one
      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false }));
      }

      // Make API call to unassign the test
      const response = await fetch(getApiUrl(`admin/clap-tests/${clapTest.id}/unassign`), {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        feedback.unassigned('CLAP Test', clapTest.name);
        // Refresh to ensure data consistency
        fetchClapTests();
      } else {
        // Rollback optimistic update on error - revert to unassigned state
        setClapTests(prevTests =>
          prevTests.map(test =>
            test.id === clapTest.id
              ? { ...test, is_assigned: false }
              : test
          )
        );

        if (selectedClapTest && selectedClapTest.id === clapTest.id) {
          setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false }));
        }

        feedback.error(data.error || 'Failed to unassign CLAP test');
      }
    } catch (error) {
      console.error('Error unassigning CLAP test:', error);
      // Rollback optimistic update on error - revert to unassigned state
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: false }
            : test
        )
      );

      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false }));
      }

      feedback.error('Failed to unassign CLAP test', {
        description: 'Please try again'
      });
    }
  };

  const handleDeleteClapTest = async (clapTest: any) => {
    if (!confirm(`Are you sure you want to delete "${clapTest.name}"?\n\nNote: This will remove the test from interfaces but preserve all student data, marks, and reports.`)) {
      return;
    }

    try {
      const response = await fetch(getApiUrl(`admin/clap-tests/${clapTest.id}`), {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        // Immediately update UI by removing the deleted test
        setClapTests(prevTests => prevTests.filter(test => test.id !== clapTest.id));
        feedback.deleted('CLAP Test', clapTest.name);
        // Also refresh from server to ensure consistency
        fetchClapTests();
      } else {
        console.error('Delete failed:', data);
        feedback.error(data.error || 'Failed to delete CLAP test');
      }
    } catch (error) {
      console.error('Error deleting CLAP test:', error);
      feedback.error('Failed to delete CLAP test', {
        description: 'Please try again'
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-50 h-screen w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Logo Header */}
          <div className="flex flex-col gap-1 px-6 py-5 border-b border-gray-200">
            <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={113} height={46} className="w-auto h-10 object-contain" priority />
            <p className="text-xs text-gray-500 font-medium pl-1">Admin Portal</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6">
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab('overview');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'overview'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <BarChart3 className="w-5 h-5" />
                Dashboard
              </button>

              <button
                onClick={() => {
                  setActiveTab('students');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'students'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <Users className="w-5 h-5" />
                Students
              </button>

              <button
                onClick={() => {
                  setActiveTab('batches');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'batches'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <Users className="w-5 h-5" />
                Batches
              </button>



              <button
                onClick={() => {
                  setActiveTab('analytics');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'analytics'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <TrendingUp className="w-5 h-5" />
                Analytics
              </button>

              <button
                onClick={() => {
                  setActiveTab('clap-tests');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'clap-tests'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <FileText className="w-5 h-5" />
                CLAP Tests
              </button>

              <button
                onClick={() => {
                  setActiveTab('control-room');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'control-room'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <Monitor className="w-5 h-5" />
                Control Room
              </button>

              {/* Phase 11 - Pipeline & Operations */}
              <div className="pt-4 mt-4 border-t border-gray-200">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Operations</p>

                <button
                  onClick={() => { setActiveTab('submissions'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'submissions' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Activity className="w-5 h-5" />
                  Submissions
                </button>

                <button
                  onClick={() => { setActiveTab('scores'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'scores' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <BarChart className="w-5 h-5" />
                  Scores
                </button>

                <button
                  onClick={() => { setActiveTab('llm'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'llm' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Brain className="w-5 h-5" />
                  LLM Controls
                </button>

                <button
                  onClick={() => { setActiveTab('reports'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'reports' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <FileCheck className="w-5 h-5" />
                  Reports
                </button>

                <button
                  onClick={() => { setActiveTab('emails'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'emails' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Mail className="w-5 h-5" />
                  Emails
                </button>

                <button
                  onClick={() => { setActiveTab('dlq'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dlq' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <AlertCircle className="w-5 h-5" />
                  DLQ
                </button>

                <button
                  onClick={() => { setActiveTab('notifications'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notifications' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Bell className="w-5 h-5" />
                  Notifications
                </button>
              </div>
            </div>
          </nav>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-gray-200">
            <button
              onClick={() => {
                // Clear any stored authentication
                localStorage.clear();
                document.cookie.split(";").forEach((c) => {
                  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                });
                window.location.href = '/login';
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen lg:ml-64">


        <div className="p-0">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="text-center py-2 bg-gray-50 border-b border-gray-100">
                <h1 className="text-lg font-bold text-gray-900">System Performance Metrics</h1>
              </div>
              <div className="p-4">

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Total Students</p>
                          <p className="text-3xl font-bold text-gray-900 mt-1">25</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                          <Users className="w-6 h-6 text-indigo-600" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-3 text-sm text-green-600">
                        <TrendingUp className="w-4 h-4" />
                        <span>+12% from last month</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Completed Tests</p>
                          <p className="text-3xl font-bold text-gray-900 mt-1">18</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-green-600 h-2 rounded-full" style={{ width: '72%' }}></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">In Progress</p>
                          <p className="text-3xl font-bold text-gray-900 mt-1">7</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
                          <Clock className="w-6 h-6 text-yellow-600" />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-3">Currently taking tests</p>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Avg. Score</p>
                          <p className="text-3xl font-bold text-gray-900 mt-1">7.2/10</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                          <TrendingUp className="w-6 h-6 text-blue-600" />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-3">72% average performance</p>
                    </CardContent>
                  </Card>
                </div>


              </div>
            </div>
          )}

          {/* STUDENTS TAB */}
          {activeTab === 'students' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="py-2 px-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h1 className="text-lg font-bold text-gray-900">Student Directory</h1>
                <Button size="sm" onClick={() => setIsAddStudentModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Student
                </Button>
              </div>
              <div className="p-4">
                <EnhancedStudentManagement />
              </div>
            </div>
          )}

          {/* BATCHES TAB */}
          {activeTab === 'batches' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="py-2 px-4 bg-gray-50 border-b border-gray-100">
                <h1 className="text-lg font-bold text-gray-900">Academic Batches</h1>
              </div>
              <div className="p-4">
                <BatchManagement />
              </div>
            </div>
          )}




          {/* ANALYTICS TAB */}
          {activeTab === 'analytics' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="py-2 px-4 bg-gray-50 border-b border-gray-100">
                <h1 className="text-lg font-bold text-gray-900">Performance Insights</h1>
              </div>
              <div className="p-4">

                <div className="grid gap-8 lg:grid-cols-2">
                  <Card className="border border-gray-200 bg-white">
                    <CardHeader>
                      <CardTitle>Score Distribution</CardTitle>
                      <CardDescription>Performance breakdown by score ranges</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {[
                          { range: '40-50', percentage: 25, count: 6, color: 'green' },
                          { range: '30-40', percentage: 45, count: 11, color: 'indigo' },
                          { range: '20-30', percentage: 20, count: 5, color: 'yellow' },
                          { range: '0-20', percentage: 10, count: 3, color: 'red' }
                        ].map((item) => (
                          <div key={item.range} className="flex items-center gap-4">
                            <span className="text-sm font-medium w-16 text-gray-900">{item.range}</span>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                  <div
                                    className={`h-2.5 rounded-full bg-${item.color}-600`}
                                    style={{ width: `${item.percentage}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-gray-600 ml-3 w-16 text-right">{item.percentage}%</span>
                              </div>
                              <div className="text-xs text-gray-600">{item.count} students</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200 bg-white">
                    <CardHeader>
                      <CardTitle>Key Insights</CardTitle>
                      <CardDescription>Important performance metrics and trends</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">Highest Score</p>
                              <p className="text-sm text-gray-600">45/50 (Emma Davis)</p>
                            </div>
                          </div>
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                              <AlertCircle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">Lowest Score</p>
                              <p className="text-sm text-gray-600">35/50 (Frank Miller)</p>
                            </div>
                          </div>
                          <TrendingDown className="w-5 h-5 text-red-600" />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                              <Target className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">Best Performing</p>
                              <p className="text-sm text-gray-600">Reading Test (8.2/10)</p>
                            </div>
                          </div>
                          <TrendingUp className="w-5 h-5 text-indigo-600" />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                              <AlertCircle className="w-5 h-5 text-yellow-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">Needs Attention</p>
                              <p className="text-sm text-gray-600">Speaking Test (6.5/10)</p>
                            </div>
                          </div>
                          <TrendingDown className="w-5 h-5 text-yellow-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* CLAP TESTS TAB */}
          {activeTab === 'clap-tests' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="py-4 px-6 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">CLAP Test Management</h1>
                    <p className="text-sm text-gray-600 mt-1">Create and manage comprehensive CLAP assessments</p>
                  </div>
                  <Button onClick={handleCreateClapTest}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add CLAP Test
                  </Button>
                </div>
              </div>
              <div className="p-6">
                {clapTests.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                      <FileText className="w-12 h-12 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No CLAP Tests Created</h3>
                    <p className="text-gray-500 mb-6">Create your first CLAP test to get started</p>
                    <Button onClick={handleCreateClapTest}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First CLAP Test
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {clapTests.map((clapTest) => (
                      <Card
                        key={clapTest.id}
                        className="border border-gray-200 hover:border-indigo-300 transition-all duration-200 hover:shadow-md cursor-pointer"
                        onClick={() => handleViewClapTest(clapTest)}
                      >
                        <CardHeader className="pb-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                              <FileText className="w-6 h-6 text-indigo-600" />
                            </div>
                            <Badge variant={clapTest.status === 'published' ? 'default' : 'secondary'}>
                              {clapTest.status === 'published' ? 'Published' : 'Draft'}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg">
                            {clapTest.test_id && (
                              <span className="font-mono text-indigo-600 mr-2">{clapTest.test_id}</span>
                            )}
                            {clapTest.name}
                          </CardTitle>
                          <p className="text-sm text-gray-600 mt-1">Batch: {clapTest.batch_name}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className={`w-2 h-2 rounded-full ${clapTest.is_assigned ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                            <span className="text-xs font-medium">
                              {clapTest.is_assigned ? 'Assigned' : 'Not Assigned'}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Tests Included</span>
                              <span className="font-semibold">5/5</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-indigo-600"
                                style={{ width: '100%' }}
                              ></div>
                            </div>
                            <div className="flex gap-2 pt-4 border-t border-gray-100">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all font-medium"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClapTest(clapTest);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-red-600 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all font-medium"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClapTest(clapTest);
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Create CLAP Test Modal */}
              {showCreateClapTestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                  <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-2xl">Create New CLAP Test</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseCreateClapTest}
                          className="h-10 w-10 p-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Test Name</label>
                          <input
                            id="clap-test-name"
                            type="text"
                            value={newClapTestName}
                            onChange={(e) => setNewClapTestName(e.target.value)}
                            placeholder="Enter CLAP test name"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>

                        <div className="relative">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Select Batch</label>
                          <select
                            id="clap-test-batch"
                            value={newClapTestBatchId}
                            onChange={(e) => setNewClapTestBatchId(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block appearance-none bg-white"
                            style={{ minWidth: '200px' }}
                          >
                            <option value="">Select a batch...</option>
                            {batches.map((batch: any) => (
                              <option key={batch.id} value={batch.id}>
                                {batch.batch_name} ({batch.start_year}-{batch.end_year})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h4 className="font-medium text-blue-900 mb-2">CLAP Test Components</h4>
                          <p className="text-sm text-blue-700 mb-3">This CLAP test will automatically include all 5 core assessments:</p>
                          <ul className="text-sm text-blue-700 space-y-1">
                            <li>• Listening Test (10 marks)</li>
                            <li>• Speaking Test (10 marks)</li>
                            <li>• Reading Test (10 marks)</li>
                            <li>• Writing Test (10 marks)</li>
                            <li>• Vocabulary & Grammar Test (10 marks)</li>
                          </ul>
                          <p className="text-sm text-blue-700 mt-2 font-medium">Total: 50 marks</p>
                        </div>

                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={handleCloseCreateClapTest}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            className={`flex-1 transition-all duration-300 ${(newClapTestName && newClapTestBatchId) || isCreatingTest
                              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              } ${isCreatingTest ? 'opacity-90 cursor-wait' : (newClapTestName && newClapTestBatchId ? 'hover:from-indigo-700 hover:to-purple-700 hover:scale-[1.02]' : '')}`}
                            disabled={!newClapTestName || !newClapTestBatchId || isCreatingTest}
                            onClick={() => {
                              const batchName = batches.find(b => b.id === newClapTestBatchId)?.batch_name || 'Selected Batch'
                              handleCreateNewClapTest({
                                testName: newClapTestName,
                                batchId: newClapTestBatchId,
                                batchName
                              });
                            }}
                          >
                            {isCreatingTest ? (
                              <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                <span className="font-medium">Creating...</span>
                              </div>
                            ) : (
                              <>
                                <Plus className="w-4 h-4 mr-2" />
                                Create CLAP Test
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Edit CLAP Test Modal */}
              {showEditClapTestModal && selectedClapTest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                  <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-2xl">Edit CLAP Test</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseEditClapTest}
                          className="h-10 w-10 p-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Test Name</label>
                          <input
                            id="edit-clap-test-name"
                            type="text"
                            defaultValue={selectedClapTest.name}
                            placeholder="Enter CLAP test name"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Select Batch</label>
                          <select
                            id="edit-clap-test-batch"
                            defaultValue={selectedClapTest.batch_id}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">Select a batch...</option>
                            {batches.map((batch: any) => (
                              <option key={batch.id} value={batch.id}>
                                {batch.batch_name} ({batch.start_year}-{batch.end_year})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h4 className="font-medium text-blue-900 mb-2">Current Assignment</h4>
                          <p className="text-sm text-blue-700">Currently assigned to: <strong>{selectedClapTest.batch_name}</strong></p>
                          <p className="text-sm text-blue-700 mt-1">Changing the batch will reassign this test to students in the new batch.</p>
                        </div>

                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={handleCloseEditClapTest}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            className="flex-1"
                            onClick={() => {
                              const testName = (document.getElementById('edit-clap-test-name') as HTMLInputElement)?.value;
                              const batchSelect = document.getElementById('edit-clap-test-batch') as HTMLSelectElement;
                              const batchId = batchSelect.value;

                              if (!testName) {
                                toast.error('Test name is required');
                                return;
                              }

                              const updateData: any = { name: testName };
                              if (batchId && batchId !== selectedClapTest.batch_id) {
                                updateData.batch_id = batchId;

                                // Safety: Revert to Draft if currently Published to prevent unintended access
                                if (selectedClapTest.status === 'published') {
                                  updateData.status = 'draft';
                                  toast.warning('Test set to DRAFT due to batch change');
                                }
                              }

                              handleUpdateClapTest(updateData);
                            }}
                          >
                            <Save className="w-4 h-4 mr-2" />
                            Update CLAP Test
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* CLAP Test Details Modal */}
              {showClapTestDetails && selectedClapTest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                  <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-2xl">
                            {selectedClapTest.test_id && (
                              <span className="font-mono text-indigo-600 mr-3">{selectedClapTest.test_id}</span>
                            )}
                            {selectedClapTest.name}
                          </CardTitle>
                          <p className="text-sm text-gray-600 mt-1">Batch: {selectedClapTest.batch_name}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseClapTestDetails}
                          className="h-10 w-10 p-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        {/* Test Components */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Test Components (50 Marks Total)</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedClapTest.tests.map((test: any) => (
                              <Card key={test.id} className="border border-gray-200 hover:border-indigo-300 transition-colors">
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h4 className="font-medium text-gray-900">{test.name}</h4>
                                      <p className="text-sm text-gray-600 capitalize">{test.type} test</p>
                                      <Badge variant="secondary" className="mt-2">10 marks</Badge>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                      {test.type === 'listening' && <Headphones className="w-5 h-5 text-indigo-600" />}
                                      {test.type === 'speaking' && <Mic className="w-5 h-5 text-indigo-600" />}
                                      {test.type === 'reading' && <BookOpen className="w-5 h-5 text-indigo-600" />}
                                      {test.type === 'writing' && <PenTool className="w-5 h-5 text-indigo-600" />}
                                      {test.type === 'vocabulary' && <Brain className="w-5 h-5 text-indigo-600" />}
                                    </div>
                                  </div>

                                  <div className="mt-4 pt-3 border-t border-gray-100">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all font-medium"
                                      disabled={loadingTestId === test.id}
                                      onClick={() => {
                                        setLoadingTestId(test.id);
                                        router.push(`/admin/dashboard/clap-tests/${selectedClapTest.id}/${test.type}`);
                                      }}
                                    >
                                      {loadingTestId === test.id ? (
                                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                      ) : (
                                        <Edit className="w-3 h-3 mr-2" />
                                      )}
                                      {loadingTestId === test.id ? 'Loading Editor...' : 'Edit Content'}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Actions</h3>
                          <div className="flex gap-3">
                            <Button
                              className={`flex-1 ${selectedClapTest.status === 'published' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                const isPublished = selectedClapTest.status === 'published';
                                const newStatus = isPublished ? 'draft' : 'published';
                                const action = isPublished ? 'stopping' : 'starting';

                                // Validation: Cannot start if no batch assigned
                                if (!isPublished && !selectedClapTest.batch_id) {
                                  toast.error('Cannot start test series: Please assign a batch first');
                                  return;
                                }

                                // Handle Mock Data (non-UUID IDs) - Simulate success
                                if (selectedClapTest.id && selectedClapTest.id.length < 10) {
                                  setSelectedClapTest((prev: any) => ({ ...prev, status: newStatus }));
                                  setClapTests(prev => prev.map(t => t.id === selectedClapTest.id ? { ...t, status: newStatus } : t));
                                  toast.success(`Test Series ${isPublished ? 'Stopped' : 'Started'} Successfully (Simulation)`);
                                  return;
                                }

                                try {
                                  // Use getApiUrl helper to ensure full absolute path to Django backend
                                  const response = await fetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}`), {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: newStatus })
                                  });

                                  if (response.ok) {
                                    setSelectedClapTest((prev: any) => ({ ...prev, status: newStatus }));
                                    await fetchClapTests();
                                    toast.success(`Test Series ${isPublished ? 'Stopped' : 'Started'} Successfully`);
                                  } else {
                                    const errorText = await response.text();
                                    console.error('API Error:', errorText);
                                    toast.error(`Failed to ${isPublished ? 'stop' : 'start'} test series`);
                                  }
                                } catch (error) {
                                  console.error(`Error ${action} test series:`, error);
                                  toast.error(`Error ${action} test series`);
                                }
                              }}
                            >
                              {selectedClapTest.status === 'published' ? (
                                <>
                                  <Square className="w-4 h-4 mr-2 fill-current" />
                                  Stop Test Series
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 mr-2 fill-current" />
                                  Start Test Series
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 border-gray-200 hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-all"
                              onClick={handleOpenClapConfigure}
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Configure
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 border-gray-200 hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-all"
                              onClick={handleOpenClapResults}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              View Results
                            </Button>
                          </div>
                        </div>

                        {/* Batch Assignment */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Batch Assignment</h3>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">Assigned to: {selectedClapTest.batch_name}</p>
                                <p className="text-sm text-gray-600">Students in this batch can access this CLAP test</p>
                              </div>
                            </div>
                          </div>
                        </div>


                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* CONTROL ROOM TAB */}
          {activeTab === 'control-room' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="py-4 px-6 bg-gray-50 border-b border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900">Control Room</h1>
                <p className="text-sm text-gray-600 mt-1">WT and ST Control Panels</p>
              </div>
              <div className="px-6 pt-4">
                <div className="flex gap-2 border-b border-gray-200">
                  <button
                    onClick={() => setControlRoomSubTab('wt')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${controlRoomSubTab === 'wt'
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    WT Control Panel
                  </button>
                  <button
                    onClick={() => setControlRoomSubTab('st')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${controlRoomSubTab === 'st'
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    ST Control Panel
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center py-24">
                <div className="text-center">
                  <Monitor className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-400">Coming Soon</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {controlRoomSubTab === 'wt' ? 'WT Control Panel' : 'ST Control Panel'} is under development.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SUBMISSION PIPELINE MONITOR TAB */}
          {activeTab === 'submissions' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="p-6">
                <SubmissionMonitor />
              </div>
            </div>
          )}

          {/* SCORE MANAGEMENT TAB */}
          {activeTab === 'scores' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="p-6">
                <ScoreManagement />
              </div>
            </div>
          )}

          {/* LLM CONTROLS TAB */}
          {activeTab === 'llm' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="p-6">
                <LLMControls />
              </div>
            </div>
          )}

          {/* REPORT MANAGEMENT TAB */}
          {activeTab === 'reports' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="p-6">
                <ReportManagement />
              </div>
            </div>
          )}

          {/* EMAIL MANAGEMENT TAB */}
          {activeTab === 'emails' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="p-6">
                <EmailManagement />
              </div>
            </div>
          )}

          {/* DLQ MANAGEMENT TAB */}
          {activeTab === 'dlq' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="p-6">
                <DLQManagement />
              </div>
            </div>
          )}

          {/* ADMIN NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="p-6">
                <AdminNotifications />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Student Modal */}
      <EnhancedStudentManagementModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        onSave={handleCreateStudent}
        mode="create"
      />

      {/* Configure CLAP Test Modal */}
      {showClapConfigureModal && selectedClapTest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Configure Test</CardTitle>
                <CardDescription>Update settings for {selectedClapTest.name}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowClapConfigureModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Test Name */}
              <div>
                <label className="text-sm font-medium block mb-2">Test Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                />
              </div>

              {/* Status */}
              <div>
                <label className="text-sm font-medium block mb-2">Status</label>
                <div className="flex gap-2">
                  <Button
                    variant={configStatus === 'draft' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setConfigStatus('draft')}
                  >
                    Draft
                  </Button>
                  <Button
                    variant={configStatus === 'published' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setConfigStatus('published')}
                  >
                    Published
                  </Button>
                </div>
              </div>

              {/* Component Settings */}
              <div>
                <label className="text-sm font-medium block mb-3">Component Settings</label>
                <div className="space-y-3">
                  {configComponents.map((comp, idx) => (
                    <div key={comp.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium w-28 capitalize">{comp.type}</span>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Duration (min)</label>
                        <input
                          type="number"
                          min={0}
                          className="w-20 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                          value={comp.duration}
                          onChange={(e) => {
                            const updated = [...configComponents]
                            updated[idx] = { ...updated[idx], duration: parseInt(e.target.value) || 0 }
                            setConfigComponents(updated)
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Max Marks</label>
                        <input
                          type="number"
                          min={0}
                          className="w-20 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                          value={comp.max_marks}
                          onChange={(e) => {
                            const updated = [...configComponents]
                            updated[idx] = { ...updated[idx], max_marks: parseInt(e.target.value) || 0 }
                            setConfigComponents(updated)
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowClapConfigureModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveClapConfiguration} disabled={configureSaving || !configName.trim()}>
                  {configureSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  )
}
