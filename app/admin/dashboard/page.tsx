'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3,
  Users,
  FileText,
  GraduationCap,
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  Brain,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Calendar,
  Eye,
  Edit,
  Trash2,
  Menu,
  Bell,
  Settings,
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
  Loader2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BatchManagement } from '@/components/BatchManagement'
import { EnhancedStudentManagement } from '@/components/EnhancedStudentManagement'
import { EnhancedStudentManagementModal } from '@/components/EnhancedStudentManagementModal'
import { getApiUrl } from '@/lib/api-config'
import { feedback } from '@/lib/user-feedback'

export default function SimplifiedAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'tests' | 'analytics' | 'batches' | 'clap-tests'>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false)
  const [selectedTest, setSelectedTest] = useState<any>(null)
  const [showTestDetails, setShowTestDetails] = useState(false)
  const [showCreateTestModal, setShowCreateTestModal] = useState(false)
  const [showTestReports, setShowTestReports] = useState(false)
  const [showTestConfiguration, setShowTestConfiguration] = useState(false)
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
  const router = useRouter()

  const fetchBatches = async () => {
    try {
      const response = await fetch(getApiUrl('admin/batches'));
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
      const data = await response.json();

      toast.dismiss(loadingToast)

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

  // Debug: Log when component renders
  console.log('Admin Dashboard Rendering - Active Tab:', activeTab)

  // Fallback mock data if API fails
  useEffect(() => {
    if (clapTests.length === 0) {
      // Temporary mock data
      setTimeout(() => {
        setClapTests([
          {
            id: '1',
            name: 'CLAP Assessment - Semester 1',
            batch_id: 'batch-1',
            batch_name: '2023-27',
            status: 'published',
            is_assigned: true,
            created_at: '2024-01-15',
            tests: [
              { id: 'listening', name: 'Listening Test', type: 'listening', status: 'completed' },
              { id: 'speaking', name: 'Speaking Test', type: 'speaking', status: 'pending' },
              { id: 'reading', name: 'Reading Test', type: 'reading', status: 'completed' },
              { id: 'writing', name: 'Writing Test', type: 'writing', status: 'in-progress' },
              { id: 'vocabulary', name: 'Vocabulary & Grammar Test', type: 'vocabulary', status: 'pending' }
            ]
          },
          {
            id: '2',
            name: 'CLAP Assessment - Semester 2',
            batch_id: 'batch-2',
            batch_name: '2024-28',
            status: 'draft',
            is_assigned: false,
            created_at: '2024-02-01',
            tests: [
              { id: 'listening', name: 'Listening Test', type: 'listening', status: 'pending' },
              { id: 'speaking', name: 'Speaking Test', type: 'speaking', status: 'pending' },
              { id: 'reading', name: 'Reading Test', type: 'reading', status: 'pending' },
              { id: 'writing', name: 'Writing Test', type: 'writing', status: 'pending' },
              { id: 'vocabulary', name: 'Vocabulary & Grammar Test', type: 'vocabulary', status: 'pending' }
            ]
          }
        ]);
      }, 1000);
    }
  }, [clapTests.length]);

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

  // Debug: Log when component renders
  console.log('Admin Dashboard Rendering - Active Tab:', activeTab)

  // Fetch data on component mount
  useEffect(() => {
    fetchClapTests();
    fetchBatches();
  }, []);

  // Mock data
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
  };

  const handleCreateStudent = async (studentData: any) => {
    try {
      console.log('Sending student data:', studentData);

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

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

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

  const handleViewTest = (test: any) => {
    setSelectedTest(test);
    setShowTestDetails(true);
    console.log('Viewing test:', test.name);
  };

  const handleCloseTestDetails = () => {
    setShowTestDetails(false);
    setSelectedTest(null);
  };

  const handleConfigureTest = (test: any) => {
    setSelectedTest(test);
    setShowTestConfiguration(true);
    console.log('Configuring test:', test.name);
  };

  const handleCreateTest = () => {
    setShowCreateTestModal(true);
    console.log('Opening test creation wizard');
  };

  const handleCloseCreateTest = () => {
    setShowCreateTestModal(false);
  };

  const handleViewReport = (test: any) => {
    setSelectedTest(test);
    setShowTestReports(true);
    console.log('Viewing report for:', test.name);
  };

  const handleCloseReports = () => {
    setShowTestReports(false);
    setSelectedTest(null);
  };

  const handleCloseConfiguration = () => {
    setShowTestConfiguration(false);
    setSelectedTest(null);
  };

  const handleSaveTestConfiguration = (configData: any) => {
    console.log('Saving configuration:', configData);
    toast.success(`${selectedTest?.name} configuration saved successfully`);
    handleCloseConfiguration();
  };

  const handleCreateNewTest = (testData: any) => {
    console.log('Creating new test:', testData);
    toast.success(`New ${testData.type} test created successfully`);
    handleCloseCreateTest();
  };

  const handlePublishTest = (test: any) => {
    console.log('Publishing test:', test.name);
    toast.success(`${test.name} published successfully`);
  };

  const handleUnpublishTest = (test: any) => {
    console.log('Unpublishing test:', test.name);
    toast.success(`${test.name} unpublished successfully`);
  };

  // CLAP Test Handlers
  const handleCreateClapTest = () => {
    setShowCreateClapTestModal(true);
    fetchBatches(); // Fetch batches when modal opens
    console.log('Opening CLAP test creation wizard');
  };

  const handleCloseCreateClapTest = () => {
    setShowCreateClapTestModal(false);
    setNewClapTestName('');
    setNewClapTestBatchId('');
  };

  const handleViewClapTest = (clapTest: any) => {
    setSelectedClapTest(clapTest);
    setShowClapTestDetails(true);
    console.log('Viewing CLAP test:', clapTest.name);
  };

  const handleCloseClapTestDetails = () => {
    setShowClapTestDetails(false);
    setSelectedClapTest(null);
  };

  const handleEditClapTest = (clapTest: any) => {
    setSelectedClapTest(clapTest);
    setShowEditClapTestModal(true);
    fetchBatches(); // Fetch batches when modal opens
    console.log('Editing CLAP test:', clapTest.name);
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

  const handleAssignClapTest = async (clapTest: any) => {
    try {
      console.log('Assigning CLAP test:', clapTest.name);

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
      console.log('Unassigning CLAP test:', clapTest.name);

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
      console.log('Deleting CLAP test:', clapTest.id);
      const response = await fetch(getApiUrl(`admin/clap-tests/${clapTest.id}`), {
        method: 'DELETE',
      });

      const data = await response.json();
      console.log('Delete response:', response.status, data);

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
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold text-indigo-600">CLAP</span>
              <p className="text-xs text-gray-500">Admin Portal</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6">
            <div className="space-y-1">
              <button
                onClick={() => {
                  console.log('Switching to Overview tab');
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
                  console.log('Switching to Students tab');
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
                  console.log('Switching to Batches tab');
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
                  console.log('Switching to Tests tab');
                  setActiveTab('tests');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'tests'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <FileText className="w-5 h-5" />
                Tests
              </button>

              <button
                onClick={() => {
                  console.log('Switching to Analytics tab');
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
                  console.log('Switching to CLAP Tests tab');
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

                {/* Test Performance */}
                <Card className="border border-gray-200 bg-white">
                  <CardHeader>
                    <CardTitle className="text-2xl">Test Performance Overview</CardTitle>
                    <CardDescription>Performance metrics across all assessment types</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                      {testData.map((test) => (
                        <Card key={test.name} className="border-2 border-transparent hover:border-indigo-300 transition-all cursor-pointer">
                          <CardHeader className="pb-3">
                            <div className={`w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-3`}>
                              <test.icon className="w-6 h-6 text-indigo-600" />
                            </div>
                            <Badge variant="secondary" className="w-fit mb-2">
                              {test.marks} marks
                            </Badge>
                            <CardTitle className="text-base">{test.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Avg Score</span>
                                <span className="font-semibold">{test.avgScore}/10</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Completion</span>
                                <span className="font-semibold">{test.completionRate}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full bg-indigo-600"
                                  style={{ width: `${test.completionRate}%` }}
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

          {/* TESTS TAB */}
          {activeTab === 'tests' && (
            <div className="bg-white p-0 border-b border-gray-200">
              <div className="py-4 px-6 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Test Management</h1>
                    <p className="text-sm text-gray-600 mt-1">Configure assessments and monitor performance</p>
                  </div>
                  <Button onClick={handleCreateTest}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Test
                  </Button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                  {testData.map((test) => (
                    <Card
                      key={test.name}
                      className="border border-gray-200 hover:border-indigo-300 transition-all duration-200 hover:shadow-md cursor-pointer"
                      onClick={() => handleViewTest(test)}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <test.icon className="w-6 h-6 text-indigo-600" />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfigureTest(test);
                              }}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewTest(test);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <Badge variant="secondary" className="mb-3">
                          {test.marks} marks • {test.duration}
                        </Badge>
                        <CardTitle className="text-lg">{test.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Avg. Score</span>
                              <span className="font-semibold">{test.avgScore}/10</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Completion</span>
                              <span className="font-semibold">{test.completionRate}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
                              style={{ width: `${test.completionRate}%` }}
                            ></div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Test Details Modal */}
              {showTestDetails && selectedTest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                  <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <selectedTest.icon className="w-8 h-8 text-indigo-600" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl">{selectedTest.name}</CardTitle>
                            <Badge variant="secondary" className="mt-2">
                              {selectedTest.marks} marks • {selectedTest.duration}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseTestDetails}
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
                        {/* Performance Overview */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Performance Overview</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="border border-gray-200">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-gray-600">Average Score</p>
                                    <p className="text-2xl font-bold text-indigo-600">{selectedTest.avgScore}/10</p>
                                  </div>
                                  <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                                    <TrendingUp className="w-6 h-6 text-indigo-600" />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                            <Card className="border border-gray-200">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-gray-600">Completion Rate</p>
                                    <p className="text-2xl font-bold text-green-600">{selectedTest.completionRate}%</p>
                                  </div>
                                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Button className="h-12" onClick={() => {
                              handleCloseTestDetails();
                              handleCreateTest();
                            }}>
                              <Plus className="w-4 h-4 mr-2" />
                              Create New Test
                            </Button>
                            <Button variant="outline" className="h-12" onClick={() => {
                              handleCloseTestDetails();
                              handleViewReport(selectedTest);
                            }}>
                              <FileText className="w-4 h-4 mr-2" />
                              View Report
                            </Button>
                            <Button variant="outline" className="h-12" onClick={() => {
                              handleCloseTestDetails();
                              handleConfigureTest(selectedTest);
                            }}>
                              <Settings className="w-4 h-4 mr-2" />
                              Configure
                            </Button>
                          </div>
                        </div>

                        {/* Recent Activity */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-sm">15 students completed this test today</span>
                              </div>
                              <span className="text-xs text-gray-500">2 hours ago</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <span className="text-sm">Average score increased by 0.3 points</span>
                              </div>
                              <span className="text-xs text-gray-500">1 day ago</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <span className="text-sm">3 students need attention (score {'<'} 5)</span>
                              </div>
                              <span className="text-xs text-gray-500">3 days ago</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Create Test Modal */}
              {showCreateTestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                  <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-2xl">Create New Test</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseCreateTest}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Test Type</label>
                            <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                              <option value="listening">Listening Test</option>
                              <option value="reading">Reading Test</option>
                              <option value="speaking">Speaking Test</option>
                              <option value="writing">Writing Test</option>
                              <option value="vocabulary">Vocabulary & Grammar</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Test Name</label>
                            <input
                              type="text"
                              placeholder="Enter test name"
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Duration (minutes)</label>
                            <input
                              type="number"
                              defaultValue="20"
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Total Questions</label>
                            <input
                              type="number"
                              defaultValue="10"
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Marks</label>
                            <input
                              type="number"
                              defaultValue="10"
                              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Instructions</label>
                          <textarea
                            rows={4}
                            placeholder="Enter test instructions..."
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>

                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={handleCloseCreateTest}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            className="flex-1"
                            onClick={() => {
                              // Mock data for demonstration
                              handleCreateNewTest({
                                type: 'listening',
                                name: 'New Listening Test',
                                duration: 20,
                                questions: 10,
                                marks: 10
                              });
                            }}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Test
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Test Reports Modal */}
              {showTestReports && selectedTest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                  <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-2xl">{selectedTest.name} - Detailed Report</CardTitle>
                          <p className="text-sm text-gray-600 mt-1">Comprehensive performance analysis</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseReports}
                          className="h-10 w-10 p-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-8">
                        {/* Performance Metrics */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Card className="border border-gray-200">
                              <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-indigo-600">{selectedTest.avgScore}</div>
                                <div className="text-sm text-gray-600 mt-1">Average Score</div>
                              </CardContent>
                            </Card>
                            <Card className="border border-gray-200">
                              <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-green-600">{selectedTest.completionRate}%</div>
                                <div className="text-sm text-gray-600 mt-1">Completion Rate</div>
                              </CardContent>
                            </Card>
                            <Card className="border border-gray-200">
                              <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-blue-600">142</div>
                                <div className="text-sm text-gray-600 mt-1">Total Attempts</div>
                              </CardContent>
                            </Card>
                            <Card className="border border-gray-200">
                              <CardContent className="p-4 text-center">
                                <div className="text-3xl font-bold text-purple-600">8.7</div>
                                <div className="text-sm text-gray-600 mt-1">Pass Rate</div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        {/* Score Distribution */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Score Distribution</h3>
                          <div className="space-y-3">
                            {[
                              { range: '9-10', percentage: 15, count: 21, color: 'green' },
                              { range: '7-8', percentage: 35, count: 49, color: 'blue' },
                              { range: '5-6', percentage: 28, count: 39, color: 'yellow' },
                              { range: '0-4', percentage: 22, count: 31, color: 'red' }
                            ].map((item) => (
                              <div key={item.range} className="flex items-center gap-4">
                                <span className="text-sm font-medium w-16 text-gray-900">{item.range}</span>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                      <div
                                        className={`h-3 rounded-full bg-${item.color}-500`}
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
                        </div>

                        {/* Export Options */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Export Data</h3>
                          <div className="flex gap-3">
                            <Button variant="outline">
                              <Download className="w-4 h-4 mr-2" />
                              Export CSV
                            </Button>
                            <Button variant="outline">
                              <FileText className="w-4 h-4 mr-2" />
                              Generate PDF
                            </Button>
                            <Button variant="outline">
                              <BarChart3 className="w-4 h-4 mr-2" />
                              Detailed Analytics
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Test Configuration Modal */}
              {showTestConfiguration && selectedTest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                  <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-2xl">Configure {selectedTest.name}</CardTitle>
                          <p className="text-sm text-gray-600 mt-1">Manage test settings and availability</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseConfiguration}
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
                        {/* Status Controls */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Test Status</h3>
                          <div className="flex gap-3">
                            <Button
                              className="flex-1"
                              onClick={() => handlePublishTest(selectedTest)}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Publish Test
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleUnpublishTest(selectedTest)}
                            >
                              <X className="w-4 h-4 mr-2" />
                              Unpublish Test
                            </Button>
                          </div>
                        </div>

                        {/* Timing Settings */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Timing</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Duration (minutes)</label>
                              <input
                                type="number"
                                defaultValue={selectedTest.duration.replace(' min', '')}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Grace Period (seconds)</label>
                              <input
                                type="number"
                                defaultValue="30"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Access Control */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4">Access Control</h3>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">Allow Retakes</p>
                                <p className="text-sm text-gray-600">Students can attempt this test multiple times</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" defaultChecked />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">Show Answers After Submission</p>
                                <p className="text-sm text-gray-600">Display correct answers when test is completed</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" defaultChecked />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={handleCloseConfiguration}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            className="flex-1"
                            onClick={() => handleSaveTestConfiguration({
                              duration: 20,
                              gracePeriod: 30,
                              allowRetakes: true,
                              showAnswers: true
                            })}
                          >
                            <Save className="w-4 h-4 mr-2" />
                            Save Configuration
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
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
                              onClick={() => toast.info('Advanced configuration settings coming soon')}
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Configure
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 border-gray-200 hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-all"
                              onClick={() => toast.info('Detailed results dashboard coming soon')}
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
        </div>
      </main>

      {/* Add Student Modal */}
      <EnhancedStudentManagementModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        onSave={handleCreateStudent}
        mode="create"
      />
    </div>
  )
}