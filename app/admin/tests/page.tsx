'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BookOpen,
  Brain,
  Clock,
  Edit,
  FileText,
  Headphones,
  Loader2,
  Mic,
  PenTool,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  Square,
  ArrowLeft,
  ArrowRight,
  Timer,
  TrendingUp,
  Zap,
  Users,
  History,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Search,
} from 'lucide-react'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { feedback } from '@/lib/user-feedback'
import { TestPreviewModal } from '@/components/admin/TestPreviewModal'

export default function AdminTestsPage() {
  const [showCreateClapTestModal, setShowCreateClapTestModal] = useState(false)
  const [showEditClapTestModal, setShowEditClapTestModal] = useState(false)
  const [showClapTestDetails, setShowClapTestDetails] = useState(false)
  const [selectedClapTest, setSelectedClapTest] = useState<any>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<'question-papers' | 'configure' | 'results' | 'retest' | 'live-timer'>('question-papers')

  // ── Live Timer state ──────────────────────────────────────────────────────
  const [liveTimer, setLiveTimer]               = useState<any>(null)  // status from API
  const [liveTimerLoading, setLiveTimerLoading] = useState(false)
  const [extendMinutes, setExtendMinutes]       = useState(10)
  const [extendReason, setExtendReason]         = useState('')
  const [extendLoading, setExtendLoading]       = useState(false)
  const [startLoading, setStartLoading]         = useState(false)
  const [liveTimerTimeLeft, setLiveTimerTimeLeft] = useState<number | null>(null)
  const liveTimerPollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const liveClockOffsetRef = useRef(0)   // ms: server_time - client_time
  const [clapTests, setClapTests] = useState<any[]>([])
  const [isLoadingTests, setIsLoadingTests] = useState(true)
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

  const [retestCandidates, setRetestCandidates] = useState<any[]>([])
  const [retestLoading, setRetestLoading] = useState(false)
  const [retestGranting, setRetestGranting] = useState<string | null>(null)
  const [retestReason, setRetestReason] = useState('')
  const [retestModalAssignment, setRetestModalAssignment] = useState<any>(null)

  // --- Sets State ---
  const [sets, setSets] = useState<any[]>([])
  const [setsLoading, setSetsLoading] = useState(false)
  const [setsCanDistribute, setSetsCanDistribute] = useState(false)
  const [distributeStrategy, setDistributeStrategy] = useState<'round_robin' | 'latin_square' | 'manual'>('round_robin')
  const [distributeRows, setDistributeRows] = useState(5)
  const [distributeCols, setDistributeCols] = useState(8)
  const [distributing, setDistributing] = useState(false)
  const [distributionStatus, setDistributionStatus] = useState<any>(null)
  const [distributionStatusLoading, setDistributionStatusLoading] = useState(false)
  const [setsValidation, setSetsValidation] = useState<any>(null)
  const [creatingSet, setCreatingSet] = useState(false)
  const [cloneSourceSetId, setCloneSourceSetId] = useState('')


  // --- Retest Pagination (server-side) ---
  const [retestPage, setRetestPage] = useState(1)
  const [retestSearch, setRetestSearch] = useState('')
  const [retestTotalCount, setRetestTotalCount] = useState(0)
  const [retestTotalPages, setRetestTotalPages] = useState(1)
  const RETEST_PAGE_SIZE = 50
  const retestSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Sets Dist Pagination ---
  const [setsDistPage, setSetsDistPage] = useState(1)
  const setsDistPageSize = 10

  const fetchRetestCandidates = async (testId: string, page = 1, search = '') => {
    setRetestLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(RETEST_PAGE_SIZE) })
      if (search.trim()) params.set('search', search.trim())
      const res = await apiFetch(
        getApiUrl(`admin/clap-tests/${testId}/retest-candidates?${params}`),
        { headers: getAuthHeaders(), cache: 'no-store' }
      )
      if (!res.ok) { toast.error('Failed to load retest candidates'); return }
      const data = await res.json()
      setRetestCandidates(data.candidates || [])
      setRetestTotalCount(data.pagination?.total_count ?? 0)
      setRetestTotalPages(data.pagination?.total_pages ?? 1)
      setRetestPage(page)
    } catch (_e) {
      toast.error('Network error loading retest candidates')
    } finally {
      setRetestLoading(false)
    }
  }

  const handleRetestSearchChange = (value: string) => {
    setRetestSearch(value)
    if (retestSearchTimerRef.current) clearTimeout(retestSearchTimerRef.current)
    retestSearchTimerRef.current = setTimeout(() => {
      if (selectedClapTest) fetchRetestCandidates(selectedClapTest.id, 1, value)
    }, 400)
  }

  const handleGrantRetest = async () => {
    if (!retestModalAssignment) return
    if (!retestReason.trim()) { toast.error('Please enter a reason for the retest.'); return }
    setRetestGranting(retestModalAssignment.assignment_id)
    try {
      const res = await fetch(
        getApiUrl(`admin/assignments/${retestModalAssignment.assignment_id}/grant-retest`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ reason: retestReason.trim() })
        }
      )
      const data = await res.json()
      if (res.ok) {
        toast.success(`Retest granted to ${retestModalAssignment.student_name}! Their previous data has been cleared.`)
        setRetestModalAssignment(null)
        setRetestReason('')
        if (selectedClapTest) fetchRetestCandidates(selectedClapTest.id, retestPage, retestSearch)
      } else {
        toast.error(data.error || 'Failed to grant retest.')
      }
    } catch (_e) {
      toast.error('Network error. Retest was NOT granted.')
    } finally {
      setRetestGranting(null)
    }
  }

  const router = useRouter()

  const fetchBatches = async () => {
    try {
      const response = await apiFetch(getApiUrl('admin/batches'), { headers: getAuthHeaders() });
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
      const response = await apiFetch(getApiUrl('admin/clap-tests'), {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });

      if (!response.ok) {
        console.error('Failed to fetch CLAP tests:', response.status);
        return;
      }
      const data = await response.json();

      if (data.clapTests) {
        setClapTests(data.clapTests);
        // Also refresh selectedClapTest so Live Timer button reflects current server data
        // (e.g. global_duration_minutes configured in a previous session)
        setSelectedClapTest((prev: any) => {
          if (!prev) return prev
          const updated = data.clapTests.find((t: any) => t.id === prev.id)
          return updated ? { ...prev, ...updated } : prev
        })
      }
    } catch (error) {
      console.error('Error fetching CLAP tests:', error);
      feedback.error('Failed to load CLAP tests', {
        description: 'Please refresh the page'
      });
    } finally {
      setIsLoadingTests(false)
    }
  };

  const handleCreateNewClapTest = async (clapTestData: any) => {
    try {
      setIsCreatingTest(true);
      const loadingToast = feedback.creating('CLAP test')
      const response = await apiFetch(getApiUrl('admin/clap-tests'), {
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

  // ── Sets Feature Handlers ────────────────────────────────────────────────

  const fetchSets = async (testId: string) => {
    setSetsLoading(true)
    setSetsValidation(null)
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${testId}/sets`), {
        headers: getAuthHeaders(), cache: 'no-store'
      })
      if (!res.ok) { toast.error('Failed to load sets'); return }
      const data = await res.json()
      setSets(data.sets || [])
      setSetsCanDistribute(data.can_distribute || false)
    } catch (_e) {
      toast.error('Network error loading sets')
    } finally {
      setSetsLoading(false)
    }
  }

  const fetchDistributionStatus = async (testId: string) => {
    setDistributionStatusLoading(true)
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${testId}/distribution-status`), {
        headers: getAuthHeaders(), cache: 'no-store'
      })
      if (!res.ok) { toast.error('Failed to load distribution status'); return }
      const data = await res.json()
      setDistributionStatus(data)
      setSetsDistPage(1)
    } catch (_e) {
      toast.error('Network error loading distribution status')
    } finally {
      setDistributionStatusLoading(false)
    }
  }

  const handleCreateSet = async (cloneFromId?: string) => {
    if (!selectedClapTest) return
    setCreatingSet(true)
    try {
      const body: any = {}
      if (cloneFromId) body.clone_from_set_id = cloneFromId
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/sets`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(cloneFromId ? `Set ${data.label} cloned successfully!` : `Set ${data.label} created!`)
        fetchSets(selectedClapTest.id)
        setCloneSourceSetId('')
      } else {
        toast.error(data.error || 'Failed to create set')
      }
    } catch (_e) {
      toast.error('Network error creating set')
    } finally {
      setCreatingSet(false)
    }
  }

  const handleDeleteSet = async (setId: string, setLabel: string, assignedCount: number) => {
    if (!selectedClapTest) return
    if (assignedCount > 0) {
      toast.error(`Cannot delete Set ${setLabel}: ${assignedCount} student(s) are actively assigned to it.`)
      return
    }
    if (!confirm(`Delete Set ${setLabel}? All items in this set will be permanently removed.`)) return
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/sets/${setId}`), {
        method: 'DELETE', headers: getAuthHeaders()
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Set ${setLabel} deleted.`)
        fetchSets(selectedClapTest.id)
      } else {
        toast.error(data.error || 'Failed to delete set')
      }
    } catch (_e) {
      toast.error('Network error deleting set')
    }
  }

  const handleValidateSets = async () => {
    if (!selectedClapTest) return
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/sets/validate`), {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      setSetsValidation(data)
      if (data.valid) {
        toast.success('All sets are valid and balanced!')
      } else {
        toast.warning(`Validation found ${data.issues.length} issue(s). Check the validation panel.`)
      }
    } catch (_e) {
      toast.error('Network error validating sets')
    }
  }


  const handleDistribute = async (dryRun = false) => {
    if (!selectedClapTest) return
    setDistributing(true)
    try {
      const body: any = { strategy: distributeStrategy, dry_run: dryRun }
      if (distributeStrategy === 'latin_square') {
        body.rows = distributeRows
        body.cols = distributeCols
      }
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/distribute-sets`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        if (dryRun) {
          toast.info(`Dry run: ${data.student_count} students, ${data.sequential_collisions} collision(s). Ready to distribute.`)
        } else {
          toast.success(`Sets distributed! ${data.student_count} students assigned. Collisions: ${data.sequential_collisions}`)
          fetchDistributionStatus(selectedClapTest.id)
        }
      } else {
        toast.error(data.error || 'Distribution failed')
      }
    } catch (_e) {
      toast.error('Network error during distribution')
    } finally {
      setDistributing(false)
    }
  }

  const handleClearDistribution = async () => {
    if (!selectedClapTest) return
    if (!confirm('Clear all set assignments? Students will go back to the default question paper.')) return
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/clear-distribution`), {
        method: 'POST', headers: getAuthHeaders()
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message)
        fetchDistributionStatus(selectedClapTest.id)
        setSets(prev => prev.map(s => ({ ...s, assigned_student_count: 0 })))
      } else {
        toast.error(data.error || 'Failed to clear distribution')
      }
    } catch (_e) {
      toast.error('Network error clearing distribution')
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    fetchClapTests();
    fetchBatches();
  }, []);

  // CLAP Test Handlers
  const handleCreateClapTest = () => {
    setShowCreateClapTestModal(true);
    // Batches already fetched on mount — no duplicate fetch needed
  };

  const handleCloseCreateClapTest = () => {
    setShowCreateClapTestModal(false);
    setNewClapTestName('');
    setNewClapTestBatchId('');
  };

  // ── Live Timer helpers ────────────────────────────────────────────────────

  const fetchLiveTimerStatus = useCallback(async (testId: string) => {
    if (!testId) return
    setLiveTimerLoading(true)
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${testId}/live-timer-status`), {
        headers: getAuthHeaders(),
      })
      const serverTimeStr = res.headers.get('X-Server-Time')
      if (serverTimeStr) {
        liveClockOffsetRef.current = new Date(serverTimeStr).getTime() - Date.now()
      }
      if (!res.ok) { toast.error('Failed to fetch live timer status'); return }
      const data = await res.json()
      setLiveTimer(data)
      if (data.remaining_seconds !== null) {
        setLiveTimerTimeLeft(data.remaining_seconds)
      }
    } catch (_e) {
      toast.error('Network error fetching timer status')
    } finally {
      setLiveTimerLoading(false)
    }
  }, [])

  const handleStartLiveTimer = async (force = false) => {
    if (!selectedClapTest) return
    setStartLoading(true)
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/start-live-timer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ force, reason: 'Started from Live Timer panel' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to start timer'); return }
      if (data.already_started) {
        toast.info('Timer is already running.')
      } else {
        toast.success(`Live timer started! Ends at ${new Date(data.deadline_utc).toLocaleTimeString()}`)
      }
      fetchLiveTimerStatus(selectedClapTest.id)
    } catch (_e) {
      toast.error('Network error starting timer')
    } finally {
      setStartLoading(false)
    }
  }

  const handleExtendTimer = async () => {
    if (!selectedClapTest || extendMinutes < 1) return
    setExtendLoading(true)
    try {
      const res = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/extend-timer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ extend_minutes: extendMinutes, reason: extendReason || 'Extended from Live Timer panel' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to extend timer'); return }
      toast.success(`Timer extended by ${extendMinutes} min! New deadline: ${new Date(data.new_deadline_utc).toLocaleTimeString()}`)
      setExtendReason('')
      fetchLiveTimerStatus(selectedClapTest.id)
    } catch (_e) {
      toast.error('Network error extending timer')
    } finally {
      setExtendLoading(false)
    }
  }

  // Admin-side live countdown (local tick, re-synced by fetchLiveTimerStatus)
  useEffect(() => {
    if (activeDetailTab !== 'live-timer' || !liveTimer?.global_deadline) {
      if (liveTimerPollRef.current) clearInterval(liveTimerPollRef.current)
      return
    }
    const deadline    = new Date(liveTimer.global_deadline)
    const tick = () => {
      const adjusted  = Date.now() + liveClockOffsetRef.current
      const remaining = Math.max(0, Math.floor((deadline.getTime() - adjusted) / 1000))
      setLiveTimerTimeLeft(remaining)
    }
    tick()
    liveTimerPollRef.current = setInterval(tick, 1000)
    // Re-fetch status every 15 s to stay in sync
    const pollInterval = setInterval(() => {
      if (selectedClapTest) fetchLiveTimerStatus(selectedClapTest.id)
    }, 15000)
    return () => {
      clearInterval(liveTimerPollRef.current!)
      clearInterval(pollInterval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDetailTab, liveTimer?.global_deadline])

  const handleViewClapTest = (clapTest: any) => {
    setSelectedClapTest(clapTest);
    setShowClapTestDetails(true);
    setActiveDetailTab('question-papers');
    // Pre-fetch sets for the Question Papers tab
    setSets([])
    fetchSets(clapTest.id)
    fetchDistributionStatus(clapTest.id)
    // Reset live timer state for the new test
    setLiveTimer(null)
    setLiveTimerTimeLeft(null)
    if (liveTimerPollRef.current) clearInterval(liveTimerPollRef.current)
  };

  const handlePreviewComponent = async (compType: string) => {
    const comp = (selectedClapTest.tests || []).find((t: any) => t.type === compType);
    if (!comp) {
      toast.error('Component not found');
      return;
    }

    const loadingToast = toast.loading(`Loading ${compType} preview...`);
    try {
      const response = await apiFetch(getApiUrl(`admin/clap-components/${comp.id}/items`), {
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
    // Batches already fetched on mount — no duplicate fetch needed
  };

  const handleCloseEditClapTest = () => {
    setShowEditClapTestModal(false);
    setSelectedClapTest(null);
  };

  const handleUpdateClapTest = async (updatedData: any) => {
    try {
      const loadingToast = feedback.updating('CLAP test')
      const response = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}`), {
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
      const testRes = await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}`), {
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

      // 2. Update each component's max_marks
      for (const comp of configComponents) {
        const compRes = await apiFetch(getApiUrl(`admin/clap-components/${comp.id}`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({
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
      // Optimistically update UI — status and is_assigned update together so the
      // header badge switches from Draft → Published on the spot (Fix #2)
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: true, status: 'published' }
            : test
        )
      );
      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: true, status: 'published' }));
      }

      // batch_id is intentionally omitted — backend uses the test's existing batch (Fix #3)
      const response = await apiFetch(getApiUrl(`admin/clap-tests/${clapTest.id}/assign`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({})
      });

      const data = await response.json();

      if (response.ok) {
        feedback.assigned('CLAP Test', clapTest.name, 'selected batch');
        // Re-fetch to ensure full server-side consistency (batch_name, student counts, etc.)
        fetchClapTests();
      } else {
        // Rollback both is_assigned AND status on error
        setClapTests(prevTests =>
          prevTests.map(test =>
            test.id === clapTest.id
              ? { ...test, is_assigned: false, status: 'draft' }
              : test
          )
        );
        if (selectedClapTest && selectedClapTest.id === clapTest.id) {
          setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false, status: 'draft' }));
        }
        feedback.error(data.error || 'Failed to start CLAP test');
      }
    } catch (error) {
      console.error('Error assigning CLAP test:', error);
      // Rollback on network error
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: false, status: 'draft' }
            : test
        )
      );
      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false, status: 'draft' }));
      }
      toast.error('Failed to start CLAP test');
    }
  };

  const handleUnassignClapTest = async (clapTest: any) => {
    try {
      // Optimistically update UI — status and is_assigned together so badge
      // switches Published → Draft on the spot (Fix #2).
      // batch_id / batch_name are intentionally kept — batch is preserved (Fix #3).
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: false, status: 'draft' }
            : test
        )
      );
      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: false, status: 'draft' }));
      }

      // Clear live-timer display immediately — backend will clear global_deadline
      setLiveTimer(null)
      setLiveTimerTimeLeft(null)
      if (liveTimerPollRef.current) clearInterval(liveTimerPollRef.current)

      const response = await apiFetch(getApiUrl(`admin/clap-tests/${clapTest.id}/unassign`), {
        method: 'POST',
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok) {
        feedback.unassigned('CLAP Test', clapTest.name);
        fetchClapTests();
      } else {
        // Rollback both is_assigned AND status on error
        setClapTests(prevTests =>
          prevTests.map(test =>
            test.id === clapTest.id
              ? { ...test, is_assigned: true, status: 'published' }
              : test
          )
        );
        if (selectedClapTest && selectedClapTest.id === clapTest.id) {
          setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: true, status: 'published' }));
        }
        feedback.error(data.error || 'Failed to stop CLAP test');
      }
    } catch (error) {
      console.error('Error unassigning CLAP test:', error);
      // Rollback on network error
      setClapTests(prevTests =>
        prevTests.map(test =>
          test.id === clapTest.id
            ? { ...test, is_assigned: true, status: 'published' }
            : test
        )
      );
      if (selectedClapTest && selectedClapTest.id === clapTest.id) {
        setSelectedClapTest((prev: any) => ({ ...prev, is_assigned: true, status: 'published' }));
      }
      feedback.error('Failed to stop CLAP test', { description: 'Please try again' });
    }
  };

  const handleDeleteClapTest = async (clapTest: any) => {
    if (!confirm(`Are you sure you want to delete "${clapTest.name}"?\n\nNote: This will remove the test from interfaces but preserve all student data, marks, and reports.`)) {
      return;
    }

    try {
      const response = await apiFetch(getApiUrl(`admin/clap-tests/${clapTest.id}`), {
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
      {!showClapTestDetails && (
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
      )}
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

                {/* Preview Bundle is ALWAYS available */}
                <Button
                  variant="outline"
                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                  onClick={() => router.push(`/admin/dashboard/clap-tests/${selectedClapTest.id}/bundle-preview`)}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Preview Bundle
                </Button>

                {selectedClapTest.is_assigned ? (
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => handleUnassignClapTest(selectedClapTest)}>
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
                className={`py-2 px-6 font-medium text-sm transition-colors flex items-center gap-1.5 ${activeDetailTab === 'question-papers' ? 'border-b-2 border-violet-600 text-violet-700' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => {
                  setActiveDetailTab('question-papers')
                  if (selectedClapTest) {
                    fetchSets(selectedClapTest.id)
                    fetchDistributionStatus(selectedClapTest.id)
                  }
                }}
              >
                <FileText className="w-3.5 h-3.5" /> Question Papers
                {sets.length > 0 && (
                  <span className="ml-1 bg-violet-100 text-violet-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{sets.length}</span>
                )}
              </button>
              <button
                className={`py-2 px-6 font-medium text-sm transition-colors ${activeDetailTab === 'configure' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveDetailTab('configure')}
              >
                Configure
              </button>
              <button
                className={`py-2 px-6 font-medium text-sm transition-colors ${activeDetailTab === 'results' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => { setActiveDetailTab('results') }}
              >
                Results
              </button>
              <button
                className={`py-2 px-6 font-medium text-sm transition-colors flex items-center gap-1.5 ${activeDetailTab === 'retest' ? 'border-b-2 border-amber-500 text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => { setActiveDetailTab('retest'); setRetestSearch(''); setRetestPage(1); if (selectedClapTest) fetchRetestCandidates(selectedClapTest.id, 1, '') }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retest
              </button>
              <button
                className={`py-2 px-6 font-medium text-sm transition-colors flex items-center gap-1.5 ${activeDetailTab === 'live-timer' ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => {
                  setActiveDetailTab('live-timer')
                  if (selectedClapTest) fetchLiveTimerStatus(selectedClapTest.id)
                }}
              >
                <Zap className="w-3.5 h-3.5" /> Live Timer
                {liveTimer?.timer_started && !liveTimer?.is_expired && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-0.5" />
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="mt-6">
              {activeDetailTab === 'question-papers' && (() => {
                return (
                  <div className="space-y-6">
                    {/* ── Question Paper Sets Section ───────────────────── */}
                    <div className="border-t-2 border-dashed border-gray-200 pt-6 space-y-6">

                      {/* ── Header Row ──────────────────────────────────── */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">Question Paper Sets</h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            Create multiple sets so no two neighbouring students get the same question paper.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleValidateSets}
                            disabled={sets.length < 2}
                            className="border-violet-200 text-violet-700 hover:bg-violet-50"
                          >
                            <TrendingUp className="w-4 h-4 mr-1.5" /> Validate Sets
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleCreateSet()}
                            disabled={creatingSet || sets.length >= 26}
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                          >
                            {creatingSet ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Creating...</> : <><Plus className="w-4 h-4 mr-1.5" />New Empty Set</>}
                          </Button>
                        </div>
                      </div>


                      {/* ── Minimum 2 sets info banner ───────────────────── */}
                      {sets.length > 0 && sets.length < 2 && (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800 flex gap-3">
                          <FileText className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">At least 2 sets are required for distribution.</p>
                            <p className="mt-0.5 text-violet-700">
                              Create a second set (blank or cloned) and add questions to it, then use Smart Distribute.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* ── Sets List ────────────────────────────────────── */}
                      {setsLoading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading sets...
                        </div>
                      ) : sets.length === 0 ? (
                        <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center">
                          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 font-medium">No question paper sets yet</p>
                          <p className="text-sm text-gray-400 mt-1">Use &ldquo;New Empty Set&rdquo; above to create your first set.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {sets.map((s: any) => (
                            <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 font-bold text-lg flex items-center justify-center">
                                    {s.label}
                                  </span>
                                  <div>
                                    <p className="font-semibold text-gray-900 text-sm">Set {s.label}</p>
                                    <p className="text-xs text-gray-400">{s.component_count} components · {s.total_item_count} items</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {s.assigned_student_count > 0 && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                      {s.assigned_student_count} students
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                  onClick={() => router.push(`/admin/dashboard/clap-tests/${selectedClapTest?.id}/sets/${s.id}/bundle-preview`)}
                                >
                                  <Play className="w-3 h-3 mr-1" /> Preview Set
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs border-violet-200 text-violet-600 hover:bg-violet-50"
                                  disabled={creatingSet || sets.length >= 26}
                                  onClick={() => handleCreateSet(s.id)}
                                >
                                  <Plus className="w-3 h-3 mr-1" /> Clone
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs border-red-200 text-red-500 hover:bg-red-50"
                                  onClick={() => handleDeleteSet(s.id, s.label, s.assigned_student_count)}
                                >
                                  ✕
                                </Button>
                              </div>

                              {/* Component list — each row navigates to that component's editor */}
                              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1.5">
                                {s.components && s.components.length > 0 ? (
                                  s.components.map((c: any) => (
                                    <div
                                      key={c.id}
                                      className="flex justify-between items-center hover:bg-blue-50 p-1.5 rounded transition-colors cursor-pointer group"
                                      onClick={() => router.push(`/admin/dashboard/clap-tests/${selectedClapTest?.id}/sets/${s.id}/${c.test_type}`)}
                                    >
                                      <span className="text-xs font-medium text-gray-700 capitalize">{c.test_type}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{c.item_count} items</span>
                                        <span className="text-[10px] text-blue-600 font-medium px-1.5 group-hover:underline">Edit →</span>
                                      </div>
                                    </div>
                                  ))
                                ) : s.component_count > 0 ? (
                                  /* Fallback: components not yet loaded in state — show generic edit buttons */
                                  (['listening', 'speaking', 'reading', 'writing', 'vocabulary'] as const).map((type) => (
                                    <div
                                      key={type}
                                      className="flex justify-between items-center hover:bg-blue-50 p-1.5 rounded transition-colors cursor-pointer group"
                                      onClick={() => router.push(`/admin/dashboard/clap-tests/${selectedClapTest?.id}/sets/${s.id}/${type}`)}
                                    >
                                      <span className="text-xs font-medium text-gray-700">{type === 'vocabulary' ? 'Verbal Ability' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
                                      <span className="text-[10px] text-blue-600 font-medium px-1.5 group-hover:underline">Edit →</span>
                                    </div>
                                  ))
                                ) : (
                                  /* Empty set: show edit links so admin can add items directly */
                                  (['listening', 'speaking', 'reading', 'writing', 'vocabulary'] as const).map((type) => (
                                    <div
                                      key={type}
                                      className="flex justify-between items-center hover:bg-blue-50 p-1.5 rounded transition-colors cursor-pointer group"
                                      onClick={() => router.push(`/admin/dashboard/clap-tests/${selectedClapTest?.id}/sets/${s.id}/${type}`)}
                                    >
                                      <span className="text-xs font-medium text-gray-700">{type === 'vocabulary' ? 'Verbal Ability' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">0 items</span>
                                        <span className="text-[10px] text-blue-600 font-medium px-1.5 group-hover:underline">Edit →</span>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Validation Panel ─────────────────────────────── */}
                      {setsValidation && (
                        <div className={`rounded-xl border p-4 text-sm ${setsValidation.valid ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                          <p className="font-semibold mb-1">
                            {setsValidation.valid ? '✅ All sets are balanced and ready for distribution.' : `❌ ${setsValidation.issues.length} issue(s) found — fix before distributing.`}
                          </p>
                          {!setsValidation.valid && (
                            <ul className="mt-2 space-y-1 list-disc list-inside text-red-700 text-xs">
                              {setsValidation.issues.map((issue: any, i: number) => (
                                <li key={i}>
                                  Set {issue.set_label} — {issue.test_type}:
                                  {issue.issue ? ` ${issue.issue}` : ` expected ${issue.expected_items} items, got ${issue.actual_items}`}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* ── Smart Distribution Panel ──────────────────────── */}
                      {sets.length >= 2 && (
                        <div className="bg-white border border-violet-200 rounded-xl p-5 space-y-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Settings className="w-4 h-4 text-violet-600" />
                            <h4 className="font-semibold text-gray-900">Smart Distribution</h4>
                          </div>
                          <p className="text-xs text-gray-500">
                            Distribute sets across all assigned students so no two adjacent students share the same question paper.
                          </p>

                          {/* Strategy Selector */}
                          <div className="flex flex-wrap gap-2">
                            {[
                              { id: 'round_robin', label: 'Round Robin', desc: 'Best when seating layout is unknown' },
                              { id: 'latin_square', label: 'Latin Square', desc: 'Perfect for grid seating (requires rows × cols)' },
                            ].map((s) => (
                              <label
                                key={s.id}
                                className={`flex-1 min-w-[180px] border rounded-lg p-3 cursor-pointer transition-colors ${distributeStrategy === s.id ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-300'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="dist_strategy"
                                    value={s.id}
                                    checked={distributeStrategy === s.id as any}
                                    onChange={() => setDistributeStrategy(s.id as any)}
                                    className="accent-violet-600"
                                  />
                                  <div>
                                    <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>

                          {/* Latin Square Config */}
                          {distributeStrategy === 'latin_square' && (
                            <div className="flex items-center gap-4 bg-violet-50 rounded-lg px-4 py-3 text-sm">
                              <label className="flex items-center gap-2 text-gray-700">
                                Rows:
                                <input
                                  type="number"
                                  min={1}
                                  value={distributeRows}
                                  onChange={e => setDistributeRows(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-16 border border-violet-300 rounded px-2 py-1 text-center focus:ring-1 focus:ring-violet-500 outline-none"
                                />
                              </label>
                              <span className="text-gray-400">×</span>
                              <label className="flex items-center gap-2 text-gray-700">
                                Cols:
                                <input
                                  type="number"
                                  min={1}
                                  value={distributeCols}
                                  onChange={e => setDistributeCols(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-16 border border-violet-300 rounded px-2 py-1 text-center focus:ring-1 focus:ring-violet-500 outline-none"
                                />
                              </label>
                              <span className="text-xs text-violet-600 font-medium">= {distributeRows * distributeCols} seats</span>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-wrap gap-3 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDistribute(true)}
                              disabled={distributing}
                              className="border-violet-200 text-violet-700 hover:bg-violet-50"
                            >
                              {distributing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-1.5" />}
                              Dry Run Preview
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleDistribute(false)}
                              disabled={distributing || !setsCanDistribute}
                              className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                            >
                              {distributing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Distributing...</> : <><ArrowRight className="w-4 h-4 mr-1.5" />Distribute Now</>}
                            </Button>
                            {distributionStatus?.distributed > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClearDistribution}
                                className="border-red-200 text-red-600 hover:bg-red-50"
                              >
                                Clear Distribution
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Distribution Status Table ─────────────────────── */}
                      {distributionStatus && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-900 text-sm">Distribution Status</h4>
                            <div className="flex items-center gap-3">
                              {Object.entries(distributionStatus.by_set || {}).map(([label, count]: any) => (
                                <span key={label} className="text-xs bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-medium">
                                  Set {label}: {count}
                                </span>
                              ))}
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${distributionStatus.distribution_complete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {distributionStatus.distributed}/{distributionStatus.total_students} distributed
                              </span>
                            </div>
                          </div>

                          {distributionStatusLoading ? (
                            <div className="flex items-center justify-center py-8 text-gray-400">
                              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                            </div>
                          ) : (
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                  <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Roll No.</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Assigned Set</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Test Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {(distributionStatus.students || []).slice((setsDistPage - 1) * setsDistPageSize, setsDistPage * setsDistPageSize).map((s: any) => (
                                    <tr key={s.assignment_id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.student_name}</td>
                                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{s.student_roll || '—'}</td>
                                      <td className="px-4 py-2.5 text-center">
                                        {s.assigned_set_label ? (
                                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 text-violet-700 font-bold text-sm">
                                            {s.assigned_set_label}
                                          </span>
                                        ) : (
                                          <span className="text-gray-300 text-xs">Unassigned</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <Badge className={`text-xs ${s.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : s.status === 'started' ? 'bg-blue-100 text-blue-700 border-blue-200' : s.status === 'expired' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                          {s.status}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {(distributionStatus?.students?.length || 0) > setsDistPageSize && (
                            <div className="flex items-center justify-between bg-white px-4 py-3 border border-gray-200 rounded-xl mt-3">
                              <div className="text-sm text-gray-500">
                                Showing <span className="font-medium">{(setsDistPage - 1) * setsDistPageSize + 1}</span> to <span className="font-medium">{Math.min(setsDistPage * setsDistPageSize, distributionStatus.students.length)}</span> of <span className="font-medium">{distributionStatus.students.length}</span> students
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSetsDistPage(p => Math.max(1, p - 1))}
                                  disabled={setsDistPage === 1}
                                >
                                  Previous
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSetsDistPage(p => Math.min(Math.ceil(distributionStatus.students.length / setsDistPageSize), p + 1))}
                                  disabled={setsDistPage === Math.ceil(distributionStatus.students.length / setsDistPageSize)}
                                >
                                  Next
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                );
              })()}

              {activeDetailTab === 'configure' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-indigo-600" />
                      Global Configuration Rules
                    </CardTitle>
                    <CardDescription>
                      These settings are <strong>binding across ALL question paper sets</strong>. Duration, max marks, and timer settings propagate to every set automatically on save — no per-set overrides allowed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">

                    {/* ── Enterprise Scope Banner ── */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900 text-white border border-slate-700">
                      <ShieldAlert className="w-4 h-4 text-indigo-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-indigo-100">
                          Enterprise Global Scope
                        </p>
                        {setsLoading ? (
                          <p className="text-xs text-slate-400 mt-0.5">Loading set coverage...</p>
                        ) : sets.length > 0 ? (
                          <p className="text-xs text-slate-300 mt-0.5">
                            Changes apply to all <span className="font-bold text-white">{sets.length}</span> question paper {sets.length === 1 ? 'set' : 'sets'}: {sets.map((s: any) => `Set ${s.label}`).join(', ')}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 mt-0.5">No sets created yet — settings will apply when sets are added</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] font-bold bg-indigo-600 px-2 py-1 rounded uppercase tracking-wider">
                        {sets.length > 0 ? `${sets.length} ${sets.length === 1 ? 'Set' : 'Sets'}` : 'Global'}
                      </span>
                    </div>

                    {/* ── Section 1: Global Timer ─────────────────────────────── */}
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-4 border-b border-indigo-100">
                        <div className="p-2 bg-indigo-600 rounded-lg shrink-0">
                          <Timer className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-indigo-900">Global Test Timer</p>
                          <p className="text-xs text-indigo-600">
                            Single countdown shown to students across all modules — no per-module timers
                          </p>
                        </div>
                      </div>

                      <div className="p-5 space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                              Total Duration (Minutes)
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                min={1}
                                value={selectedClapTest.global_duration_minutes ?? ''}
                                onChange={(e) => setSelectedClapTest({ ...selectedClapTest, global_duration_minutes: parseInt(e.target.value) || null })}
                                placeholder="e.g. 90"
                                className="w-28 p-2.5 border-2 border-indigo-300 rounded-lg text-lg font-mono font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              {selectedClapTest.global_duration_minutes ? (
                                <span className="text-sm text-gray-500">
                                  = {Math.floor((selectedClapTest.global_duration_minutes || 0) / 60)}h {(selectedClapTest.global_duration_minutes || 0) % 60}m
                                </span>
                              ) : (
                                <span className="text-sm text-amber-600 font-medium">⚠ Required before starting the live timer</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── Section 2: Per-Module Settings ─────────────────────── */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          Per-Module Settings
                        </p>
                        <span className="text-xs text-gray-400 italic">
                          Enforced identically across all sets
                        </span>
                      </div>

                      <div className="grid gap-4">
                        {(selectedClapTest.tests || []).map((comp: any, idx: number) => (
                          <div
                            key={comp.id}
                            className="p-4 rounded-xl border-2 border-gray-200 bg-white flex flex-col gap-4 transition-all"
                          >
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
                                  <p className="text-xs text-gray-500 uppercase">{comp.type === 'vocabulary' ? 'VERBAL ABILITY' : comp.type}</p>
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-1.5">
                                <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => handlePreviewComponent(comp.type)}>
                                  <Play className="w-3 h-3 mr-1" />Preview
                                </Button>
                                <Button
                                  variant="outline" size="sm"
                                  disabled={navigatingTo === `configure-${comp.type}`}
                                  className="text-xs h-7 px-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                  onClick={() => { setNavigatingTo(`configure-${comp.type}`); router.push(`/admin/dashboard/clap-tests/${selectedClapTest.id}/${comp.type}`); }}
                                >
                                  {navigatingTo === `configure-${comp.type}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit className="w-3 h-3 mr-1" />}
                                  {navigatingTo === `configure-${comp.type}` ? '' : 'Edit'}
                                </Button>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-gray-100">
                              <div className="space-y-1 w-32">
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
                    </div>

                    {/* ── Save Button ─────────────────────────────────────────── */}
                    <div className="flex items-center justify-between pt-4 border-t gap-4">
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        Saving will propagate these rules to{' '}
                        {sets.length > 0 ? (
                          <strong className="text-indigo-600">{sets.length} {sets.length === 1 ? 'set' : 'sets'}</strong>
                        ) : (
                          'all sets'
                        )}{' '}
                        automatically.
                      </p>
                      <div className="flex gap-3 shrink-0">
                        <Button variant="outline" onClick={() => setActiveDetailTab('question-papers')}>Cancel</Button>
                        <Button
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          onClick={async () => {
                            const loadingToast = toast.loading('Applying global rules to all sets...')
                            try {
                              // 1. Save ClapTest-level settings (including global_duration_minutes)
                              await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}`), {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                body: JSON.stringify({
                                  name: selectedClapTest.name,
                                  status: selectedClapTest.status,
                                  global_duration_minutes: selectedClapTest.global_duration_minutes ?? null
                                })
                              });

                              // 2. Save per-component max_marks
                              // Backend auto-syncs these to all matching ClapSetComponents
                              for (const comp of selectedClapTest.tests) {
                                await apiFetch(getApiUrl(`admin/clap-components/${comp.id}`), {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                  body: JSON.stringify({
                                    max_marks: comp.max_marks,
                                  })
                                });
                              }

                              // 3. Force full-sync as safety net (catches any edge cases)
                              await apiFetch(getApiUrl(`admin/clap-tests/${selectedClapTest.id}/sync-timers`), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                              });

                              toast.dismiss(loadingToast)
                              toast.success(
                                sets.length > 0
                                  ? `Global rules saved — synced to all ${sets.length} ${sets.length === 1 ? 'set' : 'sets'} automatically`
                                  : 'Global configuration saved successfully'
                              )
                              fetchClapTests();

                              // Re-apply to local selected test so it updates visually
                              setSelectedClapTest({
                                ...selectedClapTest,
                                global_duration_minutes: selectedClapTest.global_duration_minutes ?? null
                              });

                            } catch (err) {
                              toast.dismiss(loadingToast)
                              toast.error('Failed to save global configuration')
                            }
                          }}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save & Sync All Sets
                        </Button>
                      </div>
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

              {activeDetailTab === 'retest' && (
                <div className="space-y-4">
                  {/* Header + info callout */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold">Retest grants are permanent and irreversible.</p>
                      <p className="mt-0.5 text-amber-700">Granting a retest <strong>immediately and permanently wipes</strong> all of the student&apos;s previous responses, audio recordings, and submission records for this test. Only their most recent attempt&apos;s data will exist in the system. This action is logged for compliance.</p>
                    </div>
                  </div>

                  {/* Search + count bar */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search by name or student ID…"
                        value={retestSearch}
                        onChange={e => handleRetestSearchChange(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      />
                    </div>
                    {retestTotalCount > 0 && (
                      <span className="text-sm text-gray-500 whitespace-nowrap">
                        {retestTotalCount} student{retestTotalCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {retestLoading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading candidates...
                    </div>
                  ) : retestCandidates.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <RotateCcw className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">
                        {retestSearch.trim() ? 'No students match your search.' : 'No students found for this test.'}
                      </p>
                      {retestSearch.trim() && (
                        <button
                          onClick={() => handleRetestSearchChange('')}
                          className="mt-2 text-sm text-amber-600 hover:underline"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                            <th className="text-center px-4 py-3 font-semibold text-gray-600">Attempt #</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Retest By</th>
                            <th className="text-right px-4 py-3 font-semibold text-gray-600">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {retestCandidates.map((c: any) => (
                            <tr key={c.assignment_id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{c.student_name}</p>
                                <p className="text-xs text-gray-500">{c.student_id}</p>
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={`text-xs ${c.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                                  c.status === 'started' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                    c.status === 'expired' ? 'bg-red-100 text-red-700 border-red-200' :
                                      'bg-gray-100 text-gray-600 border-gray-200'
                                  }`}>
                                  {c.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-bold text-base ${c.attempt_number > 1 ? 'text-amber-600' : 'text-gray-600'}`}>
                                  {c.attempt_number}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {c.retest_granted_at ? (
                                  <div>
                                    <p className="font-medium text-gray-700">{c.retest_granted_by}</p>
                                    <p>{new Date(c.retest_granted_at).toLocaleString()}</p>
                                    {c.retest_reason && <p className="italic truncate max-w-[160px]" title={c.retest_reason}>&ldquo;{c.retest_reason}&rdquo;</p>}
                                  </div>
                                ) : <span>—</span>}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {c.status === 'started' ? (
                                  <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-xs">Mid-Test — Cannot Grant</Badge>
                                ) : c.can_grant_retest ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                    onClick={() => { setRetestModalAssignment(c); setRetestReason('') }}
                                    disabled={retestGranting === c.assignment_id}
                                  >
                                    {retestGranting === c.assignment_id
                                      ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Granting...</>
                                      : <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Grant Retest</>}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-gray-400">N/A</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {retestTotalCount > 0 && (
                    <div className="flex items-center justify-between bg-white px-4 py-3 border border-gray-200 rounded-xl mt-3">
                      <div className="text-sm text-gray-500">
                        Showing{' '}
                        <span className="font-medium">{(retestPage - 1) * RETEST_PAGE_SIZE + 1}</span>
                        {' '}–{' '}
                        <span className="font-medium">{Math.min(retestPage * RETEST_PAGE_SIZE, retestTotalCount)}</span>
                        {' '}of{' '}
                        <span className="font-medium">{retestTotalCount}</span> student{retestTotalCount !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedClapTest && fetchRetestCandidates(selectedClapTest.id, retestPage - 1, retestSearch)}
                          disabled={retestPage === 1 || retestLoading}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-gray-500 px-1">
                          Page {retestPage} of {retestTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedClapTest && fetchRetestCandidates(selectedClapTest.id, retestPage + 1, retestSearch)}
                          disabled={retestPage === retestTotalPages || retestLoading}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── LIVE TIMER TAB ─────────────────────────────────────────── */}
              {activeDetailTab === 'live-timer' && (() => {
                const fmt = (secs: number) => {
                  const h = Math.floor(secs / 3600)
                  const m = Math.floor((secs % 3600) / 60)
                  const s = secs % 60
                  return h > 0
                    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                }
                const isRunning   = liveTimer?.timer_started && !liveTimer?.is_expired
                const isExpired   = liveTimer?.is_expired
                const isNotStarted = !liveTimer?.timer_started
                const tLeft       = liveTimerTimeLeft ?? 0
                const isCritical  = isRunning && tLeft <= 120
                const isUrgent    = isRunning && tLeft <= 300 && !isCritical

                return (
                  <div className="space-y-6">

                    {/* Status banner */}
                    <div className={`rounded-2xl p-6 flex items-center justify-between gap-4 ${
                      isRunning  ? (isCritical ? 'bg-red-600 text-white' : isUrgent ? 'bg-orange-500 text-white' : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white')
                      : isExpired  ? 'bg-gray-800 text-white'
                      : 'bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200'
                    }`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
                          isRunning ? 'bg-white/20' : isExpired ? 'bg-white/10' : 'bg-indigo-100'
                        }`}>
                          <Clock className={`w-7 h-7 ${isRunning && isCritical ? 'animate-pulse' : ''} ${isRunning || isExpired ? 'text-white' : 'text-indigo-600'}`} />
                        </div>
                        <div>
                          {isNotStarted && (
                            <>
                              <p className="text-lg font-bold text-indigo-900">Live Timer Not Started</p>
                              <p className="text-sm text-indigo-600 mt-0.5">
                                {selectedClapTest?.global_duration_minutes
                                  ? `Configured: ${selectedClapTest.global_duration_minutes} minutes`
                                  : 'Set global_duration_minutes in the Configure tab first.'}
                              </p>
                            </>
                          )}
                          {isRunning && (
                            <>
                              <p className="text-sm font-medium opacity-80">Time Remaining</p>
                              <p className={`font-mono font-bold text-4xl tracking-tight ${isCritical ? 'animate-pulse' : ''}`}>
                                {liveTimerLoading ? '–:––' : fmt(tLeft)}
                              </p>
                              {liveTimer?.global_deadline && (
                                <p className="text-xs opacity-70 mt-1">
                                  Ends at {new Date(liveTimer.global_deadline).toLocaleTimeString()} local · {new Date(liveTimer.global_deadline).toUTCString()}
                                </p>
                              )}
                            </>
                          )}
                          {isExpired && (
                            <>
                              <p className="text-lg font-bold">Test Time Expired</p>
                              <p className="text-sm opacity-70 mt-0.5">All active students have been auto-submitted.</p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isNotStarted && (
                          <Button
                            onClick={() => handleStartLiveTimer(false)}
                            disabled={
                              startLoading ||
                              !selectedClapTest?.batch_id ||
                              selectedClapTest?.status !== 'published' ||
                              !selectedClapTest?.global_duration_minutes ||
                              !distributionStatus?.distribution_complete
                            }
                            title={
                              !selectedClapTest?.batch_id
                                ? 'Assign a batch to this test first'
                                : selectedClapTest?.status !== 'published'
                                ? 'Click "Start Test" in the header first'
                                : !selectedClapTest?.global_duration_minutes
                                ? 'Set a duration in the Configure tab first'
                                : !distributionStatus?.distribution_complete
                                ? 'Distribute question papers to all students first (Question Papers tab)'
                                : 'Start the live countdown for all students'
                            }
                            className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {startLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                            Start Live Timer
                          </Button>
                        )}
                        {isRunning && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchLiveTimerStatus(selectedClapTest.id)}
                            disabled={liveTimerLoading}
                            className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${liveTimerLoading ? 'animate-spin' : ''}`} /> Refresh
                          </Button>
                        )}
                        {isExpired && (
                          <Button
                            onClick={() => handleStartLiveTimer(true)}
                            disabled={startLoading}
                            variant="outline"
                            className="border-white/30 text-white hover:bg-white/10"
                          >
                            {startLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                            Reset & Restart
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Prerequisites checklist — shown only when timer has not started */}
                    {isNotStarted && (
                      <div className="bg-white border border-gray-200 rounded-xl p-5">
                        <p className="text-sm font-semibold text-gray-700 mb-3">Start Checklist — all 4 must be green</p>
                        <div className="space-y-2">
                          {[
                            {
                              label: 'Batch assigned to test',
                              met: !!selectedClapTest?.batch_id,
                              hint: 'Assign a batch in the test settings panel',
                            },
                            {
                              label: 'Test started (Published)',
                              met: selectedClapTest?.status === 'published',
                              hint: 'Click "Start Test" in the header above',
                            },
                            {
                              label: 'Timer duration configured',
                              met: !!selectedClapTest?.global_duration_minutes,
                              hint: 'Set a Global Duration in the Configure tab',
                            },
                            {
                              label: 'Question papers distributed to all students',
                              met: !!distributionStatus?.distribution_complete,
                              hint: 'Go to the Question Papers tab and distribute',
                            },
                          ].map(({ label, met, hint }) => (
                            <div key={label} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${met ? 'bg-green-50' : 'bg-red-50'}`}>
                              {met
                                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                : <XCircle     className="w-4 h-4 text-red-500 shrink-0" />}
                              <span className={`font-medium ${met ? 'text-green-800' : 'text-red-700'}`}>{label}</span>
                              {!met && <span className="ml-auto text-xs text-red-500 hidden sm:inline">{hint}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Student counters */}
                    {liveTimer && (
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Total Assigned', value: liveTimer.total_assigned ?? '–', icon: Users, color: 'indigo' },
                          { label: 'Active / Writing', value: liveTimer.active_students ?? '–', icon: Zap, color: 'green' },
                          { label: 'Completed', value: liveTimer.completed_students ?? '–', icon: CheckCircle2, color: 'blue' },
                        ].map(({ label, value, icon: Icon, color }) => (
                          <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4 text-center`}>
                            <Icon className={`w-5 h-5 text-${color}-500 mx-auto mb-1`} />
                            <p className={`text-2xl font-bold text-${color}-700`}>{value}</p>
                            <p className={`text-xs text-${color}-600`}>{label}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Extend Timer Panel — only when running */}
                    {isRunning && (
                      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <h4 className="font-semibold text-gray-900">Extend Live Timer</h4>
                        </div>
                        <p className="text-sm text-gray-500">
                          Extension is instant and atomic. All {liveTimer?.active_students ?? '…'} active students will see
                          the updated countdown on their next poll (within 30 s).
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {[5, 10, 15, 30].map(m => (
                            <button
                              key={m}
                              onClick={() => setExtendMinutes(m)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                extendMinutes === m
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-red-400 hover:text-red-600'
                              }`}
                            >
                              +{m} min
                            </button>
                          ))}
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={180}
                              value={extendMinutes}
                              onChange={e => setExtendMinutes(Math.max(1, Math.min(180, parseInt(e.target.value) || 1)))}
                              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none"
                              placeholder="Custom"
                            />
                            <span className="text-sm text-gray-500">min</span>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={extendReason}
                          onChange={e => setExtendReason(e.target.value)}
                          placeholder="Reason (optional — logged in audit trail)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none"
                        />

                        {liveTimer?.global_deadline && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                            <strong>New deadline preview:</strong>{' '}
                            {new Date(new Date(liveTimer.global_deadline).getTime() + extendMinutes * 60000).toLocaleTimeString()}
                            {' '}({extendMinutes} min added)
                          </div>
                        )}

                        <Button
                          onClick={handleExtendTimer}
                          disabled={extendLoading || extendMinutes < 1}
                          className="bg-red-600 hover:bg-red-700 text-white w-full"
                        >
                          {extendLoading
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extending…</>
                            : <><ChevronRight className="w-4 h-4 mr-2" />Confirm: Add {extendMinutes} Minutes to All Students</>}
                        </Button>
                      </div>
                    )}

                    {/* Extension History */}
                    {(liveTimer?.extension_log ?? []).length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <History className="w-4 h-4 text-gray-500" />
                          <h4 className="font-semibold text-gray-900">Timer Audit Log</h4>
                          <span className="ml-auto text-xs text-gray-400">{liveTimer.extension_log.length} event{liveTimer.extension_log.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {[...liveTimer.extension_log].reverse().map((entry: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0 text-sm">
                              <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                entry.action === 'extend'     ? 'bg-orange-100 text-orange-700' :
                                entry.action === 'start'      ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {entry.action === 'extend' ? `+${entry.extend_minutes}m` :
                                 entry.action === 'start'  ? 'START' : entry.action.toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-gray-700 font-medium truncate">{entry.reason}</p>
                                <p className="text-gray-400 text-xs">
                                  {new Date(entry.at).toLocaleString()} · by {entry.by}
                                  {entry.new_deadline_utc && (
                                    <> · deadline → {new Date(entry.new_deadline_utc).toLocaleTimeString()}</>
                                  )}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Locked warning — no batch assigned */}
                    {isNotStarted && !liveTimerLoading && !selectedClapTest?.batch_id && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <p>
                          <strong>No batch assigned to this test.</strong>{' '}
                          A batch must be assigned before the live timer can start.
                          Select a batch in the test settings panel on the left, then return here.
                        </p>
                      </div>
                    )}

                    {/* Locked warning — test not yet Published */}
                    {isNotStarted && !liveTimerLoading && selectedClapTest?.status !== 'published' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <p>
                          <strong>Live Timer is locked.</strong>{' '}
                          The test must be <strong>Published</strong> (Started) before you can use the live timer.
                          Click <strong>&ldquo;Start Test&rdquo;</strong> in the header above, then return here to start the countdown.
                        </p>
                      </div>
                    )}

                    {/* Locked warning — Published but duration not configured */}
                    {isNotStarted && !liveTimerLoading && selectedClapTest?.status === 'published' && !selectedClapTest?.global_duration_minutes && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                        <p>
                          <strong>Timer duration not set — students are waiting.</strong>{' '}
                          Go to the <strong>Configure</strong> tab and set a <strong>Global Duration</strong> (in minutes), then return here to start the countdown.
                          Until this is done, students will see &ldquo;Starting Soon&rdquo; and cannot begin the test.
                        </p>
                      </div>
                    )}

                    {/* Locked warning — papers not yet distributed to all students */}
                    {isNotStarted && !liveTimerLoading && selectedClapTest?.status === 'published' && !!selectedClapTest?.global_duration_minutes && !distributionStatus?.distribution_complete && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                        <p>
                          <strong>Question papers not fully distributed — students are waiting.</strong>{' '}
                          Go to the <strong>Question Papers</strong> tab and distribute papers to all students in the batch,
                          then return here to start the countdown.
                          {distributionStatus && (
                            <>{' '}Currently <strong>{distributionStatus.distributed ?? 0}/{distributionStatus.total_students ?? '?'}</strong> students have received their papers.</>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Not started help text */}
                    {isNotStarted && !liveTimerLoading && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
                        <p className="font-semibold">How Live Timer Works</p>
                        <ul className="list-disc pl-4 space-y-1 text-blue-700">
                          <li>Click <strong>Start Live Timer</strong> to set a server-authoritative deadline for all students.</li>
                          <li>Students refresh automatically — they see the timer go live within <strong>5 seconds</strong>.</li>
                          <li>Use <strong>Extend Timer</strong> at any time — all active students see the new time within 5 seconds.</li>
                          <li>On expiry, students are auto-submitted with no action required from you.</li>
                          <li>All changes are logged in the audit trail above.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })()}


            </div>

            {/* ── Grant Retest Confirmation Modal ─────────────────────────────────── */}
            {retestModalAssignment && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 border border-amber-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <RotateCcw className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Grant Retest</h3>
                      <p className="text-sm text-gray-500">{retestModalAssignment.student_name} · {retestModalAssignment.student_id}</p>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                    <strong>⚠ Warning:</strong> This will permanently delete all of this student&apos;s existing responses and submission records for this test. Attempt #{retestModalAssignment.attempt_number + 1} will start fresh.
                  </div>

                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason for retest <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-amber-400 outline-none"
                    rows={3}
                    placeholder="e.g. Student experienced technical issues during the exam."
                    value={retestReason}
                    onChange={e => setRetestReason(e.target.value)}
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-400 text-right mb-4">{retestReason.length}/500</p>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setRetestModalAssignment(null); setRetestReason('') }}
                      disabled={!!retestGranting}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={handleGrantRetest}
                      disabled={!retestReason.trim() || !!retestGranting}
                    >
                      {retestGranting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Granting...</> : 'Confirm & Grant Retest'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : isLoadingTests ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500">Loading CLAP tests…</p>
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
                    <li>• Verbal Ability Test (10 marks)</li>
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
