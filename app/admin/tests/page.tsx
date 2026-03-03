'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BookOpen,
  Brain,
  Edit,
  FileText,
  Headphones,
  Loader2,
  Mic,
  PenTool,
  Play,
  Plus,
  Save,
  Settings,
  Square,
  ArrowLeft,
  ArrowRight,
  TrendingUp
} from 'lucide-react'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { feedback } from '@/lib/user-feedback'
import { TestPreviewModal } from '@/components/admin/TestPreviewModal'

export default function AdminTestsPage() {
  const [showCreateClapTestModal, setShowCreateClapTestModal] = useState(false)
  const [showEditClapTestModal, setShowEditClapTestModal] = useState(false)
  const [showClapTestDetails, setShowClapTestDetails] = useState(false)
  const [selectedClapTest, setSelectedClapTest] = useState<any>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'configure' | 'results'>('overview')
  const [clapTests, setClapTests] = useState<any[]>([])
  const [batches, setBatches] = useState<any[]>([])

  // Preview State
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewItems, setPreviewItems] = useState<any[]>([])
  const [previewTestType, setPreviewTestType] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDuration, setPreviewDuration] = useState(0)

  const [newClapTestName, setNewClapTestName] = useState('')
  const [newClapTestBatchId, setNewClapTestBatchId] = useState('')
  const [isCreatingTest, setIsCreatingTest] = useState(false)
  const [loadingTestId, setLoadingTestId] = useState<string | null>(null)
  const [showClapConfigureModal, setShowClapConfigureModal] = useState(false)
  const [configureSaving, setConfigureSaving] = useState(false)
  const [configName, setConfigName] = useState('')
  const [configStatus, setConfigStatus] = useState('draft')
  const [configComponents, setConfigComponents] = useState<any[]>([])
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)
  const router = useRouter()

  const fetchBatches = async () => {
    try {
      const response = await fetch(getApiUrl('admin/batches'), { headers: getAuthHeaders() });
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
      const response = await fetch(getApiUrl('admin/clap-tests'), { headers: getAuthHeaders() });

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
          ...getAuthHeaders()
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
    setActiveDetailTab('overview');
  };

  const handlePreviewComponent = async (compType: string) => {
    const comp = (selectedClapTest.tests || []).find((t: any) => t.type === compType);
    if (!comp) {
      toast.error('Component not found');
      return;
    }

    const loadingToast = toast.loading(`Loading ${compType} preview...`);
    try {
      const response = await fetch(getApiUrl(`admin/clap-components/${comp.id}/items`), {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      toast.dismiss(loadingToast);

      if (response.ok) {
        setPreviewItems(data.items || []);
        setPreviewTestType(compType);
        setPreviewTitle(`${comp.name} Preview`);
        setPreviewDuration(comp.duration || 0);
        setShowPreviewModal(true);
      } else {
        toast.error('Failed to load preview items');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Network error while loading preview');
    }
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
          ...getAuthHeaders()
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
          ...getAuthHeaders()
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
            ...getAuthHeaders()
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
          ...getAuthHeaders()
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
        headers: getAuthHeaders()
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
        headers: getAuthHeaders()
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
        {showClapTestDetails && selectedClapTest ? (
          <div className="space-y-6">
            {/* Detail View Header */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={handleCloseClapTestDetails}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {selectedClapTest.test_id && (
                      <span className="font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md text-base">{selectedClapTest.test_id}</span>
                    )}
                    {selectedClapTest.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Batch: {selectedClapTest.batch_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={selectedClapTest.status === 'published' ? 'default' : 'secondary'}>
                  {selectedClapTest.status === 'published' ? 'Published' : 'Draft'}
                </Badge>
                {selectedClapTest.is_assigned ? (
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleUnassignClapTest(selectedClapTest)}>
                    <Square className="w-4 h-4 mr-2" />
                    Stop Test
                  </Button>
                ) : (
                  <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleAssignClapTest(selectedClapTest)}>
                    <Play className="w-4 h-4 mr-2" />
                    Start Test
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                className={`py-2 px-6 font-medium text-sm transition-colors ${activeDetailTab === 'overview' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveDetailTab('overview')}
              >
                Overview
              </button>
              <button
                className={`py-2 px-6 font-medium text-sm transition-colors ${activeDetailTab === 'configure' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveDetailTab('configure')}
              >
                Configure
              </button>
              <button
                className={`py-2 px-6 font-medium text-sm transition-colors ${activeDetailTab === 'results' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveDetailTab('results')}
              >
                Results
              </button>
            </div>

            {/* Tab Content */}
            <div className="mt-6">
              {activeDetailTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Individual Test Cards (Mocking 5 components) */}
                  {[
                    { name: 'Listening', type: 'listening', icon: Headphones, color: 'blue' },
                    { name: 'Speaking', type: 'speaking', icon: Mic, color: 'purple' },
                    { name: 'Reading', type: 'reading', icon: BookOpen, color: 'green' },
                    { name: 'Writing', type: 'writing', icon: PenTool, color: 'orange' },
                    { name: 'Vocabulary', type: 'vocabulary', icon: Brain, color: 'indigo' },
                  ].map((comp) => {
                    const stats = (selectedClapTest.tests || []).find((t: any) => t.type === comp.type) || {};
                    return (
                      <Card key={comp.type} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className={`p-2 rounded-lg bg-${comp.color}-100`}>
                              <comp.icon className={`w-5 h-5 text-${comp.color}-600`} />
                            </div>
                            <Badge variant="outline">Included</Badge>
                          </div>
                          <CardTitle className="text-lg mt-3">{comp.name} Test</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 text-sm text-gray-600">
                            <div className="flex justify-between">
                              <span>Duration</span>
                              <span className="font-medium">{stats.duration || 0} mins</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Max Marks</span>
                              <span className="font-medium">{stats.max_marks || 10}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1 text-indigo-600 hover:bg-indigo-50 border border-indigo-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewComponent(comp.type);
                              }}
                            >
                              <Play className="w-3.5 h-3.5 mr-1" />
                              Preview
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={navigatingTo === `overview-${comp.type}`}
                              className="flex-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 disabled:opacity-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNavigatingTo(`overview-${comp.type}`);
                                router.push(`/admin/dashboard/clap-tests/${selectedClapTest.id}/${comp.type}`);
                              }}
                            >
                              {navigatingTo === `overview-${comp.type}` ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              ) : (
                                <Edit className="w-3.5 h-3.5 mr-1" />
                              )}
                              {navigatingTo === `overview-${comp.type}` ? 'Loading...' : 'Edit Questions'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {activeDetailTab === 'configure' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Configure CLAP Test</CardTitle>
                    <CardDescription>Adjust durations and marks for each component</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6">
                      {(selectedClapTest.tests || []).map((comp: any, idx: number) => (
                        <div key={comp.id} className="p-4 rounded-lg border border-gray-100 bg-gray-50/50 flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center border border-gray-200 shadow-sm">
                                {comp.type === 'listening' && <Headphones className="w-5 h-5 text-blue-600" />}
                                {comp.type === 'speaking' && <Mic className="w-5 h-5 text-purple-600" />}
                                {comp.type === 'reading' && <BookOpen className="w-5 h-5 text-green-600" />}
                                {comp.type === 'writing' && <PenTool className="w-5 h-5 text-orange-600" />}
                                {comp.type === 'vocabulary' && <Brain className="w-5 h-5 text-indigo-600" />}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">{comp.name}</p>
                                <p className="text-xs text-gray-500 uppercase">{comp.type}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-8"
                                onClick={() => handlePreviewComponent(comp.type)}
                              >
                                <Play className="w-3 h-3 mr-1" />
                                Preview
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={navigatingTo === `configure-${comp.type}`}
                                className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 disabled:opacity-50"
                                onClick={() => {
                                  setNavigatingTo(`configure-${comp.type}`);
                                  router.push(`/admin/dashboard/clap-tests/${selectedClapTest.id}/${comp.type}`);
                                }}
                              >
                                {navigatingTo === `configure-${comp.type}` ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <Edit className="w-3 h-3 mr-1" />
                                )}
                                {navigatingTo === `configure-${comp.type}` ? 'Loading...' : 'Edit Content'}
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-6 pt-2 border-t border-gray-100">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">Duration (Min)</label>
                              <input
                                type="number"
                                value={comp.duration}
                                onChange={(e) => {
                                  const newTests = [...selectedClapTest.tests];
                                  newTests[idx].duration = parseInt(e.target.value) || 0;
                                  setSelectedClapTest({ ...selectedClapTest, tests: newTests });
                                }}
                                className="w-20 p-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">Max Marks</label>
                              <input
                                type="number"
                                value={comp.max_marks}
                                onChange={(e) => {
                                  const newTests = [...selectedClapTest.tests];
                                  newTests[idx].max_marks = parseInt(e.target.value) || 0;
                                  setSelectedClapTest({ ...selectedClapTest, tests: newTests });
                                }}
                                className="w-20 p-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <Button variant="outline" onClick={() => setActiveDetailTab('overview')}>Cancel</Button>
                      <Button
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={async () => {
                          const loadingToast = toast.loading('Saving configuration...')
                          try {
                            // Update name/status first
                            await fetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}`), {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                              body: JSON.stringify({ name: selectedClapTest.name, status: selectedClapTest.status })
                            });

                            // Update components
                            for (const comp of selectedClapTest.tests) {
                              await fetch(getApiUrl(`admin/clap-components/${comp.id}`), {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                body: JSON.stringify({ duration: comp.duration, max_marks: comp.max_marks })
                              });
                            }
                            toast.dismiss(loadingToast)
                            toast.success('Configuration saved')
                            fetchClapTests();
                          } catch (err) {
                            toast.dismiss(loadingToast)
                            toast.error('Failed to save configuration')
                          }
                        }}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeDetailTab === 'results' && (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-10 h-10 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Detailed Results & Analytics</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-6">View comprehensive score distributions, individual performance, and batch analytics.</p>
                  <Button
                    disabled={navigatingTo === 'results'}
                    onClick={() => { setNavigatingTo('results'); handleOpenClapResults() }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                  >
                    {navigatingTo === 'results' ? 'Loading Results...' : 'Open Results Dashboard'}
                    {navigatingTo === 'results' ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : clapTests.length === 0 ? (
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
                        {batch.batch_name}
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
                        {batch.batch_name}
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

      {/* Test Preview Modal */}
      <TestPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        testType={previewTestType}
        items={previewItems}
        testTitle={previewTitle}
        duration={previewDuration}
      />
    </div>
  )
}
