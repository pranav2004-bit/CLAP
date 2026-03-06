'use client'

import { memo, useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft, Plus, Trash2, FileText, Mic, CheckSquare, Eye,
  Clock, ArrowUp, ArrowDown, Check, Loader2, AlertCircle,
  Upload, X, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { TestPreviewModal } from '@/components/admin/TestPreviewModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_LABELS: Record<string, string> = {
  text_block:       'Text / Instructions',
  mcq:              'Multiple Choice (MCQ)',
  subjective:       'Essay / Subjective',
  audio_block:      'Audio Clip',
  file_upload:      'File Upload',
  audio_recording:  'Audio Recording',
}

const ITEM_BADGE: Record<string, string> = {
  text_block:       'bg-blue-100 text-blue-700',
  mcq:              'bg-green-100 text-green-700',
  subjective:       'bg-purple-100 text-purple-700',
  audio_block:      'bg-red-100 text-red-700',
  file_upload:      'bg-orange-100 text-orange-700',
  audio_recording:  'bg-pink-100 text-pink-700',
}

const ADD_MENU_ITEMS = [
  { type: 'text_block',      label: 'Text / Instructions',   hoverCls: 'hover:bg-blue-50   hover:text-blue-700',   iconCls: 'text-blue-500'   },
  { type: 'mcq',             label: 'Multiple Choice (MCQ)', hoverCls: 'hover:bg-green-50  hover:text-green-700',  iconCls: 'text-green-500'  },
  { type: 'subjective',      label: 'Essay / Subjective',    hoverCls: 'hover:bg-purple-50 hover:text-purple-700', iconCls: 'text-purple-500' },
  { type: 'audio_block',     label: 'Audio Clip',            hoverCls: 'hover:bg-red-50    hover:text-red-700',    iconCls: 'text-red-500'    },
  { type: 'file_upload',     label: 'File Upload',           hoverCls: 'hover:bg-orange-50 hover:text-orange-700', iconCls: 'text-orange-500' },
  { type: 'audio_recording', label: 'Audio Recording',       hoverCls: 'hover:bg-pink-50   hover:text-pink-700',   iconCls: 'text-pink-500'   },
]

const isQuestion = (t: string) => t === 'mcq' || t === 'subjective'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ─── Default content per item type ────────────────────────────────────────────

function defaultContent(type: string): Record<string, any> {
  switch (type) {
    case 'text_block':
      return { text: '' }
    case 'mcq':
      return { question: '', options: ['', '', '', ''], correct_option: 0 }
    case 'subjective':
      return { question: '', min_words: 50, max_words: 500 }
    case 'audio_block':
      return { title: '', instructions: '', play_limit: 2, has_audio_file: false, url: '' }
    case 'file_upload':
      return { prompt: '', instructions: '', file_types: ['pdf', 'docx'], max_file_size_mb: 5, max_files: 1 }
    case 'audio_recording':
      return { question: '', instructions: '', max_duration: 120 }
    default:
      return {}
  }
}

// ─── Page export (Suspense wrapper) ───────────────────────────────────────────

export default function SetEditorPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading editor...
      </div>
    }>
      <SetEditorContent />
    </Suspense>
  )
}

// ─── Main content component ───────────────────────────────────────────────────

function SetEditorContent() {
  const params   = useParams()
  const router   = useRouter()

  const [isLoading,   setIsLoading]   = useState(true)
  const [component,   setComponent]   = useState<any>(null)
  const [items,       setItems]       = useState<any[]>([])
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [setLabel,    setSetLabel]    = useState('')
  const [testName,    setTestName]    = useState('')
  const [saveStatus,  setSaveStatus]  = useState<SaveStatus>('idle')

  // Refs for stable callbacks
  const itemsRef      = useRef<any[]>([])
  const componentRef  = useRef<any>(null)
  const pendingSaves  = useRef(0)
  const saveTimers    = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Keep refs in sync
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { componentRef.current = component }, [component])

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!params.id || !params.setId || !params.type) return

    const load = async () => {
      try {
        // Parallel: fetch set components + test name
        const [setRes, testRes] = await Promise.all([
          fetch(getApiUrl(`admin/sets/${params.setId}/components`), { headers: getAuthHeaders() }),
          fetch(getApiUrl(`admin/clap-tests/${params.id}`),         { headers: getAuthHeaders() }),
        ])

        const setData = await setRes.json()
        if (!setRes.ok) throw new Error(setData.error || 'Failed to load set')

        setSetLabel(setData.set_label || '')

        const found = (setData.components || []).find((c: any) => c.test_type === params.type)
        if (!found) throw new Error(`No ${params.type} component in this set`)
        setComponent(found)

        if (testRes.ok) {
          const td = await testRes.json()
          setTestName(td.clapTest?.name || td.name || '')
        }

        // Fetch items for this component
        const itemsRes  = await fetch(getApiUrl(`admin/set-components/${found.id}/items`), { headers: getAuthHeaders() })
        const itemsData = await itemsRes.json()
        if (itemsRes.ok) setItems((itemsData.items || []).filter(Boolean))

      } catch (err: any) {
        toast.error(err.message || 'Failed to load editor')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [params.id, params.setId, params.type])

  // ── Add item ───────────────────────────────────────────────────────────────

  const handleAddItem = async (type: string) => {
    const comp = componentRef.current
    if (!comp) return

    const tempId  = `temp-${Date.now()}`
    const newItem = {
      item_type:   type,
      order_index: itemsRef.current.length + 1,
      points:      type === 'mcq' ? 1 : 0,
      content:     defaultContent(type),
    }

    // Optimistic insert
    setItems(prev => [...prev, { ...newItem, id: tempId }])
    setShowAddMenu(false)

    try {
      const res  = await fetch(getApiUrl(`admin/set-components/${comp.id}/items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(newItem),
      })
      const data = await res.json()

      if (res.ok && data.item) {
        setItems(prev => prev.map(i => i?.id === tempId ? data.item : i).filter(Boolean))
        toast.success(`${ITEM_LABELS[type] || type} added`)
      } else {
        toast.error(data.error || 'Failed to add item')
        setItems(prev => prev.filter(i => i?.id !== tempId))
      }
    } catch {
      toast.error('Network error — item not saved')
      setItems(prev => prev.filter(i => i?.id !== tempId))
    }
  }

  // ── Delete item ────────────────────────────────────────────────────────────

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Delete this item? This cannot be undone.')) return

    const snapshot = itemsRef.current.slice()
    setItems(prev => prev.filter(i => i?.id !== itemId))

    try {
      const res = await fetch(getApiUrl(`admin/set-items/${itemId}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        toast.error('Failed to delete — item restored')
        setItems(snapshot)
      } else {
        toast.success('Item deleted')
      }
    } catch {
      toast.error('Network error — item restored')
      setItems(snapshot)
    }
  }

  // ── Reorder items ──────────────────────────────────────────────────────────

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const current = itemsRef.current
    if (direction === 'up'   && index === 0)               return
    if (direction === 'down' && index === current.length - 1) return

    const next   = [...current]
    const target = direction === 'up' ? index - 1 : index + 1
    ;[next[index], next[target]] = [next[target], next[index]]

    // 1. Optimistic update (pure — no side effects)
    setItems(next)

    // 2. Persist new order
    const comp = componentRef.current
    if (comp) {
      fetch(getApiUrl(`admin/set-components/${comp.id}/reorder-items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ item_ids: next.filter(Boolean).map(i => i.id) }),
      }).then(r => { if (!r.ok) toast.error('Failed to save new order') })
        .catch(() => toast.error('Network error saving order'))
    }
  }

  // ── Auto-save (debounced 500 ms) ───────────────────────────────────────────
  // Always saves FULL content + points from latest ref — no stale closure risk.

  const handleUpdateItem = useCallback((itemId: string, updates: { points?: number; content?: Record<string, any> }) => {
    // 1. Optimistic state update
    setItems(prev => prev.map(item => {
      if (!item || item.id !== itemId) return item
      return {
        ...item,
        ...(updates.points !== undefined ? { points: updates.points } : {}),
        content: updates.content
          ? { ...item.content, ...updates.content }
          : item.content,
      }
    }))

    // 2. Clear any pending timer for this item
    if (saveTimers.current[itemId]) clearTimeout(saveTimers.current[itemId])

    setSaveStatus('saving')
    pendingSaves.current += 1

    // 3. Debounced persist — reads from ref so it always has latest merged state
    saveTimers.current[itemId] = setTimeout(async () => {
      try {
        const current = itemsRef.current.find(i => i?.id === itemId)
        if (!current) return

        const res = await fetch(getApiUrl(`admin/set-items/${itemId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            content: current.content, // always send full merged content
            points:  current.points,
          }),
        })

        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Save failed')
        }
      } catch (err: any) {
        toast.error(err.message || 'Auto-save failed — check connection')
        setSaveStatus('error')
      } finally {
        pendingSaves.current = Math.max(0, pendingSaves.current - 1)
        if (pendingSaves.current === 0) {
          setSaveStatus(s => (s === 'error' ? 'error' : 'saved'))
          setTimeout(() => setSaveStatus(s => (s === 'saved' ? 'idle' : s)), 3000)
        }
      }
    }, 500)
  }, []) // stable — all state accessed via refs

  // ── Audio upload ───────────────────────────────────────────────────────────

  const handleAudioUpload = useCallback(async (itemId: string, file?: File) => {
    if (!file) {
      const inp = document.createElement('input')
      inp.type   = 'file'
      inp.accept = 'audio/*'
      inp.onchange = e => {
        const f = (e.target as HTMLInputElement).files?.[0]
        if (f) handleAudioUpload(itemId, f)
      }
      inp.click()
      return
    }

    if (file.size > 10 * 1024 * 1024) { toast.error('Max audio size is 10 MB'); return }

    const form = new FormData()
    form.append('audio', file)

    const t = toast.loading('Uploading audio...')
    try {
      const res  = await fetch(getApiUrl(`admin/set-items/${itemId}/upload-audio`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: form,
      })
      const data = await res.json()
      toast.dismiss(t)
      if (res.ok) {
        setItems(prev => prev.map(i =>
          i?.id === itemId ? { ...i, content: { ...i.content, has_audio_file: true } } : i
        ))
        toast.success('Audio uploaded successfully')
      } else {
        toast.error(data.error || 'Upload failed')
      }
    } catch {
      toast.dismiss(t)
      toast.error('Network error during upload')
    }
  }, [])

  const handleDeleteAudio = useCallback(async (itemId: string) => {
    if (!confirm('Delete this audio file? Students will lose access to it.')) return
    try {
      const res  = await fetch(getApiUrl(`admin/set-items/${itemId}/audio`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (res.ok) {
        setItems(prev => prev.map(i =>
          i?.id === itemId ? { ...i, content: { ...i.content, has_audio_file: false } } : i
        ))
        toast.success('Audio file deleted')
      } else {
        toast.error(data.error || 'Failed to delete audio')
      }
    } catch {
      toast.error('Network error')
    }
  }, [])

  // ── Derived values ─────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen gap-2 text-gray-500">
      <Loader2 className="w-5 h-5 animate-spin" /> Loading editor...
    </div>
  )

  const validItems   = items.filter(Boolean)
  const totalMarks   = validItems.reduce((s, i) => s + (i.points || 0), 0)
  const questionCount = validItems.filter(i => isQuestion(i.item_type)).length
  const typeLabel     = String(params.type).charAt(0).toUpperCase() + String(params.type).slice(1)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-28">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">

          {/* Left: back + breadcrumb + stats */}
          <div className="flex items-center gap-4 min-w-0">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/tests')} className="shrink-0">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">
                {testName && <><span className="truncate max-w-[200px]">{testName}</span><ChevronRight className="w-3 h-3 shrink-0" /></>}
                <span>Set {setLabel}</span>
                <ChevronRight className="w-3 h-3 shrink-0" />
                <span>{typeLabel}</span>
              </div>
              {/* Title */}
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                Set {setLabel} — {typeLabel} Editor
              </h1>
              {/* Stats */}
              <p className="text-xs text-gray-400 mt-0.5">
                {validItems.length} items · {questionCount} questions · {totalMarks} marks
                {component?.title ? ` · ${component.title}` : ''}
              </p>
            </div>
          </div>

          {/* Right: save status + preview */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs min-w-[80px] justify-end">
              {saveStatus === 'saving' && <>
                <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                <span className="text-gray-400">Saving…</span>
              </>}
              {saveStatus === 'saved' && <>
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-green-600 font-medium">Saved</span>
              </>}
              {saveStatus === 'error' && <>
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-red-600 font-medium">Save failed</span>
              </>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowPreview(true)}>
              <Eye className="w-4 h-4 mr-2" /> Preview
            </Button>
          </div>
        </div>
      </header>

      {/* ── Isolation + global-rules banner ──────────────────────────────── */}
      {component && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-amber-800">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <strong>Global rules:</strong>{' '}
              {component.timer_enabled
                ? <><strong>{component.duration_minutes} min</strong> time limit</>
                : 'No time limit'
              }
              {' · '}Max marks: <strong>{component.max_marks}</strong>
            </span>
            <span className="text-xs text-amber-600 ml-auto font-medium">
              ✦ All edits on this page apply to <strong>Set {setLabel} only</strong> — other sets are unaffected
            </span>
          </div>
        </div>
      )}

      {/* ── Item list ─────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-6 space-y-5">
        {validItems.map((item, index) => (
          <ItemCard
            key={item.id}
            item={item}
            index={index}
            total={validItems.length}
            onUpdate={handleUpdateItem}
            onDelete={handleDeleteItem}
            onMove={handleMoveItem}
            onAudioUpload={handleAudioUpload}
            onDeleteAudio={handleDeleteAudio}
          />
        ))}

        {validItems.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-semibold text-lg">No items yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Click the <strong>+</strong> button to add questions and content blocks
            </p>
          </div>
        )}
      </main>

      {/* ── Floating add button ───────────────────────────────────────────── */}
      <AddMenu show={showAddMenu} onToggle={() => setShowAddMenu(v => !v)} onAdd={handleAddItem} />

      {/* ── Preview modal ─────────────────────────────────────────────────── */}
      <TestPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        testType={String(params.type)}
        items={validItems}
        testTitle={`Set ${setLabel} — ${typeLabel}`}
        duration={component?.timer_enabled ? (component?.duration_minutes || 0) : 0}
      />
    </div>
  )
}

// ─── Item card (memoised to avoid re-renders on unrelated state changes) ──────

interface ItemCardProps {
  item:          any
  index:         number
  total:         number
  onUpdate:      (id: string, u: { points?: number; content?: Record<string, any> }) => void
  onDelete:      (id: string) => void
  onMove:        (i: number, dir: 'up' | 'down') => void
  onAudioUpload: (id: string, file?: File) => void
  onDeleteAudio: (id: string) => void
}

const ItemCard = memo(function ItemCard({
  item, index, total, onUpdate, onDelete, onMove, onAudioUpload, onDeleteAudio,
}: ItemCardProps) {
  const label    = ITEM_LABELS[item.item_type] || item.item_type
  const badgeCls = ITEM_BADGE[item.item_type]  || 'bg-gray-100 text-gray-600'

  return (
    <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">

      {/* Card header row */}
      <CardHeader className="bg-gray-50/80 border-b py-3 px-5 rounded-t-xl">
        <div className="flex items-center gap-3">
          {/* Item number */}
          <span className="w-7 h-7 bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center justify-center shrink-0">
            {index + 1}
          </span>

          {/* Type badge */}
          <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${badgeCls}`}>
            {label}
          </span>

          {/* Right controls */}
          <div className="flex items-center ml-auto gap-4">
            {/* Marks — shown for scoreable types */}
            {isQuestion(item.item_type) && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-500 shrink-0">Marks</Label>
                <Input
                  type="number"
                  min="0"
                  className="w-16 h-7 text-xs text-center"
                  value={item.points ?? 0}
                  onChange={e => onUpdate(item.id, { points: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}

            {/* Move + delete */}
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="sm" disabled={index === 0}
                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700 disabled:opacity-25"
                onClick={() => onMove(index, 'up')} title="Move up">
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" disabled={index === total - 1}
                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700 disabled:opacity-25"
                onClick={() => onMove(index, 'down')} title="Move down">
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 ml-1"
                onClick={() => onDelete(item.id)} title="Delete item">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Editor body */}
      <CardContent className="p-6">
        {item.item_type === 'text_block'      && <TextBlockEditor      item={item} onUpdate={onUpdate} />}
        {item.item_type === 'mcq'             && <MCQEditor             item={item} onUpdate={onUpdate} />}
        {item.item_type === 'subjective'      && <SubjectiveEditor      item={item} onUpdate={onUpdate} />}
        {item.item_type === 'audio_block'     && <AudioBlockEditor      item={item} onUpdate={onUpdate} onUpload={onAudioUpload} onDeleteAudio={onDeleteAudio} />}
        {item.item_type === 'file_upload'     && <FileUploadEditor      item={item} onUpdate={onUpdate} />}
        {item.item_type === 'audio_recording' && <AudioRecordingEditor  item={item} onUpdate={onUpdate} />}
      </CardContent>
    </Card>
  )
})

// ─── Type-specific editors ────────────────────────────────────────────────────

function TextBlockEditor({ item, onUpdate }: { item: any; onUpdate: any }) {
  return (
    <div>
      <Label className="text-xs text-gray-500 mb-2 block">Content / Instructions</Label>
      <Textarea
        value={item.content?.text || ''}
        onChange={e => onUpdate(item.id, { content: { text: e.target.value } })}
        placeholder="Enter reading passage, instructions, or any display text…"
        rows={6}
        className="font-sans text-sm leading-relaxed resize-y"
      />
    </div>
  )
}

function MCQEditor({ item, onUpdate }: { item: any; onUpdate: any }) {
  const options: string[] = item.content?.options || []
  const correct: number   = item.content?.correct_option ?? 0

  const setOption = (i: number, val: string) => {
    const next = [...options]; next[i] = val
    onUpdate(item.id, { content: { options: next } })
  }

  const removeOption = (i: number) => {
    const next       = options.filter((_, idx) => idx !== i)
    const newCorrect = correct === i ? 0 : correct > i ? correct - 1 : correct
    onUpdate(item.id, { content: { options: next, correct_option: newCorrect } })
  }

  const addOption = () =>
    onUpdate(item.id, { content: { options: [...options, ''] } })

  return (
    <div className="space-y-5">
      {/* Question */}
      <div>
        <Label className="text-xs text-gray-500 mb-2 block">Question</Label>
        <Textarea
          value={item.content?.question || ''}
          onChange={e => onUpdate(item.id, { content: { question: e.target.value } })}
          placeholder="Type the question here…"
          rows={3}
          className="font-medium resize-none"
        />
      </div>

      {/* Options */}
      <div>
        <Label className="text-xs text-gray-500 mb-2 block">
          Answer Options — click the radio button to mark the correct answer
        </Label>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                correct === i
                  ? 'bg-green-50 border-green-300'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Correct radio */}
              <input
                type="radio"
                name={`correct-${item.id}`}
                checked={correct === i}
                onChange={() => onUpdate(item.id, { content: { correct_option: i } })}
                className="w-4 h-4 text-green-600 cursor-pointer shrink-0"
              />
              {/* Option label */}
              <span className={`text-xs font-bold w-4 shrink-0 ${correct === i ? 'text-green-600' : 'text-gray-400'}`}>
                {String.fromCharCode(65 + i)}
              </span>
              {/* Option text */}
              <Input
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                className={`flex-1 h-8 text-sm ${correct === i ? 'border-green-200 bg-transparent' : ''}`}
              />
              {/* Remove (only if > 2 options) */}
              {options.length > 2 && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-300 hover:text-red-500 shrink-0"
                  onClick={() => removeOption(i)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {options.length < 6 && (
          <Button variant="link" size="sm" className="pl-0 mt-2 h-7 text-indigo-600" onClick={addOption}>
            + Add option
          </Button>
        )}
      </div>

      {/* Correct answer summary */}
      {options[correct] && (
        <p className="text-xs text-green-700 font-semibold flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />
          Correct answer: Option {String.fromCharCode(65 + correct)} — "{options[correct]}"
        </p>
      )}
    </div>
  )
}

function SubjectiveEditor({ item, onUpdate }: { item: any; onUpdate: any }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500 mb-2 block">Question / Writing Prompt</Label>
        <Textarea
          value={item.content?.question || ''}
          onChange={e => onUpdate(item.id, { content: { question: e.target.value } })}
          placeholder="Enter the essay question or writing prompt…"
          rows={4}
          className="font-medium resize-y"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Minimum Words</Label>
          <Input
            type="number" min="0"
            value={item.content?.min_words ?? 50}
            onChange={e => onUpdate(item.id, { content: { min_words: parseInt(e.target.value) || 0 } })}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Maximum Words</Label>
          <Input
            type="number" min="0"
            value={item.content?.max_words ?? 500}
            onChange={e => onUpdate(item.id, { content: { max_words: parseInt(e.target.value) || 0 } })}
          />
        </div>
      </div>
    </div>
  )
}

function AudioBlockEditor({ item, onUpdate, onUpload, onDeleteAudio }: { item: any; onUpdate: any; onUpload: any; onDeleteAudio: any }) {
  return (
    <div className="space-y-4 p-4 bg-red-50/40 rounded-xl border border-red-100">
      {/* Title */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Title / Label</Label>
        <Input
          value={item.content?.title || ''}
          onChange={e => onUpdate(item.id, { content: { title: e.target.value } })}
          placeholder="e.g. Listening Passage 1"
        />
      </div>

      {/* Audio file */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Audio File</Label>
        {item.content?.has_audio_file ? (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Check className="w-5 h-5 text-green-600 shrink-0" />
            <span className="text-sm text-green-700 font-medium flex-1">Audio file uploaded</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onUpload(item.id)}>
              Replace
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => onDeleteAudio(item.id)}>
              Delete
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Input
              type="file"
              accept="audio/wav,audio/mp3,audio/mpeg,audio/webm,audio/ogg,audio/m4a,audio/aac"
              onChange={e => e.target.files?.[0] && onUpload(item.id, e.target.files[0])}
              className="text-sm"
            />
            <p className="text-xs text-gray-400">MP3, WAV, M4A, AAC · Max 10 MB</p>
          </div>
        )}
      </div>

      {/* Play limit */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">
          Play Limit <span className="text-gray-400">(how many times students can replay)</span>
        </Label>
        <Input
          type="number" min="1" max="10"
          value={item.content?.play_limit ?? 2}
          onChange={e => onUpdate(item.id, { content: { play_limit: parseInt(e.target.value) || 1 } })}
          className="w-28"
        />
      </div>

      {/* Instructions */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Instructions for students</Label>
        <Textarea
          value={item.content?.instructions || ''}
          onChange={e => onUpdate(item.id, { content: { instructions: e.target.value } })}
          placeholder="e.g. Listen carefully to the audio and answer the questions."
          rows={2}
        />
      </div>
    </div>
  )
}

const ALL_FILE_TYPES = ['pdf', 'docx', 'doc', 'xlsx', 'pptx', 'jpg', 'jpeg', 'png', 'mp3', 'wav', 'mp4', 'zip', 'txt']

function FileUploadEditor({ item, onUpdate }: { item: any; onUpdate: any }) {
  const selected: string[] = item.content?.file_types || ['pdf']

  const toggleType = (type: string) => {
    const next = selected.includes(type)
      ? selected.filter(t => t !== type)
      : [...selected, type]
    if (next.length === 0) return // at least one type required
    onUpdate(item.id, { content: { file_types: next } })
  }

  return (
    <div className="space-y-4 p-4 bg-orange-50/40 rounded-xl border border-orange-100">
      {/* Prompt */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Prompt / Task Description</Label>
        <Textarea
          value={item.content?.prompt || ''}
          onChange={e => onUpdate(item.id, { content: { prompt: e.target.value } })}
          placeholder="e.g. Upload your written response as a PDF or Word document."
          rows={3}
          className="font-medium"
        />
      </div>

      {/* Instructions */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Additional Instructions (optional)</Label>
        <Textarea
          value={item.content?.instructions || ''}
          onChange={e => onUpdate(item.id, { content: { instructions: e.target.value } })}
          placeholder="e.g. File must be under 5 MB. Name the file with your student ID."
          rows={2}
        />
      </div>

      {/* File types */}
      <div>
        <Label className="text-xs text-gray-500 mb-2 block">Allowed File Types (select all that apply)</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_FILE_TYPES.map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-full border transition-all ${
                selected.includes(type)
                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300 hover:text-orange-600'
              }`}
            >
              .{type}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Allowed: {selected.map(t => `.${t}`).join(', ')}
        </p>
      </div>

      {/* Max size + count */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Max File Size (MB)</Label>
          <Input
            type="number" min="1" max="100"
            value={item.content?.max_file_size_mb ?? 5}
            onChange={e => onUpdate(item.id, { content: { max_file_size_mb: parseInt(e.target.value) || 5 } })}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Max Files Allowed</Label>
          <Input
            type="number" min="1" max="10"
            value={item.content?.max_files ?? 1}
            onChange={e => onUpdate(item.id, { content: { max_files: parseInt(e.target.value) || 1 } })}
          />
        </div>
      </div>
    </div>
  )
}

function AudioRecordingEditor({ item, onUpdate }: { item: any; onUpdate: any }) {
  const duration = item.content?.max_duration ?? 120
  const mins     = Math.floor(duration / 60)
  const secs     = duration % 60

  return (
    <div className="space-y-4 p-4 bg-pink-50/40 rounded-xl border border-pink-100">
      {/* Question */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Question / Speaking Prompt</Label>
        <Textarea
          value={item.content?.question || ''}
          onChange={e => onUpdate(item.id, { content: { question: e.target.value } })}
          placeholder="e.g. Describe a memorable journey you have taken."
          rows={3}
          className="font-medium"
        />
      </div>

      {/* Instructions */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Instructions (optional)</Label>
        <Input
          value={item.content?.instructions || ''}
          onChange={e => onUpdate(item.id, { content: { instructions: e.target.value } })}
          placeholder="e.g. Speak clearly for 1–2 minutes. Organise your response logically."
        />
      </div>

      {/* Duration */}
      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Max Recording Duration (seconds)</Label>
        <div className="flex items-center gap-3">
          <Input
            type="number" min="10" max="600"
            value={duration}
            onChange={e => onUpdate(item.id, { content: { max_duration: parseInt(e.target.value) || 120 } })}
            className="w-32"
          />
          <span className="text-sm text-gray-500 font-medium">
            = {mins}m {secs}s
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Floating add menu ────────────────────────────────────────────────────────

function AddMenu({ show, onToggle, onAdd }: { show: boolean; onToggle: () => void; onAdd: (t: string) => void }) {
  const iconFor = (type: string) => {
    if (type === 'mcq')             return <CheckSquare className="w-4 h-4 shrink-0" />
    if (type === 'audio_block')     return <Mic className="w-4 h-4 shrink-0" />
    if (type === 'audio_recording') return <Mic className="w-4 h-4 shrink-0" />
    if (type === 'file_upload')     return <Upload className="w-4 h-4 shrink-0" />
    return <FileText className="w-4 h-4 shrink-0" />
  }

  return (
    <div className="fixed bottom-8 right-8 flex flex-col items-end gap-2 z-30">
      {show && (
        <div className="bg-white shadow-2xl rounded-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200 mb-2 min-w-[230px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3 border-b">
            Add Item to Set
          </p>
          {ADD_MENU_ITEMS.map(({ type, label, hoverCls, iconCls }) => (
            <button
              key={type}
              onClick={() => onAdd(type)}
              className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-gray-700 transition-colors ${hoverCls}`}
            >
              <span className={iconCls}>{iconFor(type)}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      <Button
        size="icon"
        className={`h-14 w-14 rounded-full shadow-xl border-4 transition-all duration-200 ${
          show
            ? 'rotate-45 bg-slate-800 border-slate-700 hover:bg-slate-700'
            : 'bg-indigo-600 border-indigo-500 hover:bg-indigo-700'
        }`}
        onClick={onToggle}
      >
        <Plus className="w-6 h-6" />
      </Button>
    </div>
  )
}
