'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save, Plus, Trash2, GripVertical, FileText, Mic, Image as ImageIcon, CheckSquare, Eye, X, Loader2, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { toast } from 'sonner'
import { getApiUrl, apiFetch, getAuthHeaders } from '@/lib/api-config'
import { TestPreviewModal } from '@/components/admin/TestPreviewModal'

// Question classification helper
const isQuestion = (itemType: string): boolean => {
    return itemType === 'mcq' || itemType === 'subjective'
}

// ... imports ...

export default function ClapTestEditorPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center">Loading editor...</div>}>
            <ClapTestEditorContent />
        </Suspense>
    )
}

function ClapTestEditorContent() {
    const params = useParams()
    const router = useRouter()
    // ID here is the CLAP TEST ID, not component ID. We need component ID.
    // Actually, keeping it simple: The URL should be .../clap-tests/[clap_test_id]/[test_type]
    // We need to fetch the COMPONENT ID based on clap_test_id and test_type first, or we can just fetch all components for the test and filter.
    // But wait, my API `clap_test_items_handler` takes `component_id`.
    // So I need to find the component_id first.

    const [isLoading, setIsLoading] = useState(true)
    const [component, setComponent] = useState<any>(null)
    const [items, setItems] = useState<any[]>([])
    const [showAddMenu, setShowAddMenu] = useState(false)
    const [showPreview, setShowPreview] = useState(false)

    // Initialize and fetch data
    useEffect(() => {
        const fetchComponentAndItems = async () => {
            try {
                // 1. Fetch the CLAP Test Details to find the component ID
                // We can reuse `admin/clap-tests/[id]` to get the test details including components?
                // Let's assume we can get the test details.
                // Or better, let's just make an API that gets the component by test_id and type?
                // For now, I'll fetch the test details and find the component.

                const testResponse = await apiFetch(getApiUrl(`admin/clap-tests/${params.id}`))
                const testData = await testResponse.json()

                if (!testResponse.ok) throw new Error(testData.error)

                const foundComponent = testData.clapTest.tests.find((t: any) => t.type === params.type)
                if (!foundComponent) throw new Error('Component not found')

                setComponent(foundComponent)

                // 2. Fetch items for this component
                // Note: The `foundComponent` currently might just have basic info.
                // My `clap_test_detail_handler` returns `tests` array with `id`, `type`, `name`, `status`.
                // So `foundComponent.id` is the component ID! 

                const itemsResponse = await apiFetch(getApiUrl(`admin/clap-components/${foundComponent.id}/items`), {
                    headers: getAuthHeaders()
                })
                const itemsData = await itemsResponse.json()

                if (itemsResponse.ok) {
                    setItems(itemsData.items || [])
                }

            } catch (error: any) {
                toast.error('Failed to load test content')
                console.error(error)
            } finally {
                setIsLoading(false)
            }
        }

        if (params.id && params.type) {
            fetchComponentAndItems()
        }
    }, [params.id, params.type])

    const handleAddItem = async (type: string) => {
        try {
            if (!component) return

            const newItem = {
                item_type: type,
                order_index: items.length + 1,
                points: type === 'mcq' ? 1 : 0,
                content: getDefaultContent(type)
            }

            // Optimistic update
            setItems(prev => [...prev, { ...newItem, id: 'temp-' + Date.now() }]) // Temp ID

            const response = await apiFetch(getApiUrl(`admin/clap-components/${component.id}/items`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify(newItem)
            })

            const data = await response.json()
            if (response.ok && data.item) {
                // Replace temp item with real item from server
                setItems(prev => prev.map(item => item?.id?.startsWith('temp-') ? data.item : item).filter(Boolean))
                toast.success('Item added')
                setShowAddMenu(false)
            } else {
                toast.error(data.error || 'Failed to add item')
                setItems(prev => prev.filter(item => item && !item.id?.startsWith('temp-')))
            }
        } catch (error) {
            toast.error('Network error')
        }
    }

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return

        try {
            const response = await apiFetch(getApiUrl(`admin/clap-items/${itemId}`), {
                method: 'DELETE',
                headers: getAuthHeaders()
            })

            if (response.ok) {
                setItems(items.filter(item => item.id !== itemId))
                toast.success('Item deleted')
            }
        } catch (error) {
            toast.error('Failed to delete item')
        }
    }

    const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return
        if (direction === 'down' && index === items.length - 1) return

        const newItems = [...items]
        const targetIndex = direction === 'up' ? index - 1 : index + 1

        // Swap
        const temp = newItems[index]
        newItems[index] = newItems[targetIndex]
        newItems[targetIndex] = temp

        // Optimistic update
        setItems(newItems)

        // API Call
        try {
            // Need component ID to reorder
            if (!component) return

            await apiFetch(getApiUrl(`admin/clap-components/${component.id}/reorder-items`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ item_ids: newItems.map(i => i.id) })
            })
        } catch (error) {
            console.error('Failed to reorder', error)
            toast.error('Failed to save order')
            // Revert?
        }
    }

    const handleUpdateItem = async (itemId: string, updates: any) => {
        // Find the current item to merge content correctly
        const currentItem = items.find(i => i.id === itemId)
        if (!currentItem) return

        // Calculate the new content by merging existing content with the updates
        const newContent = {
            ...currentItem.content,
            ...(updates.content || {})
        }

        // Prepare the payload. If we are updating content, we must send the FULL object
        const payload = {
            ...updates,
            content: updates.content ? newContent : undefined
        }

        // If content is undefined in payload (only updating points etc), delete it specificially if we want pure partial,
        // but easier to just spread updates.
        // Actually, cleanest way:
        if (updates.content) {
            payload.content = newContent
        }

        // Optimistic update
        setItems(items.map(item => item.id === itemId ? {
            ...item,
            ...updates,
            content: newContent
        } : item))

        try {
            // Debounce logic could be added here, but for now simple save on change/blur
            const response = await apiFetch(getApiUrl(`admin/clap-items/${itemId}`), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify(payload)
            })

            if (!response.ok) toast.error('Failed to save changes')
        } catch (error) {
            // Revert on error?
            console.error(error)
        }
    }

    const handleAudioUpload = async (itemId: string, file?: File) => {
        let selectedFile = file
        if (!selectedFile) {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'audio/*'
            input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0]
                if (f) handleAudioUpload(itemId, f)
            }
            input.click()
            return
        }

        if (selectedFile.size > 10 * 1024 * 1024) {
            toast.error('File too large (max 10MB)')
            return
        }

        const formData = new FormData()
        formData.append('audio', selectedFile)

        try {
            const response = await apiFetch(
                getApiUrl(`admin/clap-items/${itemId}/upload-audio`),
                {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: formData
                }
            )

            const data = await response.json()
            if (response.ok) {
                setItems(items.map(i =>
                    i.id === itemId
                        ? { ...i, content: { ...i.content, has_audio_file: true } }
                        : i
                ))
                toast.success('Audio uploaded successfully')
            } else {
                toast.error(data.error || 'Upload failed')
            }
        } catch (error) {
            toast.error('Network error')
        }
    }

    const handleDeleteAudio = async (itemId: string) => {
        if (!confirm('Delete audio file? Students will not be able to play it.')) return

        try {
            const response = await apiFetch(
                getApiUrl(`admin/clap-items/${itemId}/audio`),
                {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                }
            )

            if (response.ok) {
                setItems(items.map(i =>
                    i.id === itemId
                        ? { ...i, content: { ...i.content, has_audio_file: false } }
                        : i
                ))
                toast.success('Audio deleted')
            } else {
                const data = await response.json()
                toast.error(data.error || 'Failed to delete')
            }
        } catch (error) {
            toast.error('Network error')
        }
    }


    const getDefaultContent = (type: string) => {
        switch (type) {
            case 'text_block': return { text: 'Enter instructions or reading passage here...' }
            case 'mcq': return { question: 'Question text', options: ['Option 1', 'Option 2'], correct_option: 0 }
            case 'subjective': return { question: 'Question text', min_words: 50 }
            case 'audio_block': return { title: 'Audio Clip', instructions: 'Listen carefully to the audio clip.', play_limit: 3, has_audio_file: false, url: '' }
            case 'file_upload': return { prompt: 'Upload your response', file_types: ['pdf', 'docx'] }
            case 'audio_recording': return { question: 'Describe your weekend plans', instructions: 'Speak clearly for 1-2 minutes', max_duration: 120 }
            default: return {}
        }
    }

    if (isLoading) return <div className="p-8 text-center">Loading editor...</div>

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => router.back()}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold capitalize">{params.type} Test Editor</h1>
                        <p className="text-sm text-gray-500 mb-1">
                            Total Marks: <span className="font-bold text-indigo-600">{items.reduce((sum, item) => sum + (item?.item_type === 'mcq' ? (item.points || 0) : 0), 0)}</span>
                        </p>
                        <p className="text-xs text-gray-400">{items.length} items • {items.filter(item => item && isQuestion(item.item_type)).length} questions • {component?.title}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowPreview(true)}>
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                    </Button>
                    <Button size="sm" onClick={() => toast.success('All changes saved')}>Saved</Button>
                </div>
            </header>

            <main className="flex-1 container mx-auto p-6 max-w-4xl">

                {/* Items List */}
                <div className="space-y-6">
                    {items.filter(Boolean).map((item, index) => (
                        <Card key={item.id} className="relative group hover:shadow-md transition-shadow">
                            <CardHeader className="bg-gray-50/50 border-b pb-3 pt-3 px-4">
                                <div className="flex items-center gap-3">
                                    <span className="bg-gray-200 text-gray-600 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0">
                                        {index + 1}
                                    </span>
                                    <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider shrink-0">
                                        {item.item_type.replace('_', ' ')}
                                    </span>

                                    <div className="flex items-center ml-auto gap-2">
                                        {item.item_type === 'mcq' && (
                                            <div className="flex items-center gap-2 mr-4">
                                                <Label className="text-xs text-gray-500">Points:</Label>
                                                <Input
                                                    type="number"
                                                    className="w-16 h-7 text-xs"
                                                    value={item.points || 0}
                                                    onChange={(e) => handleUpdateItem(item.id, { points: parseInt(e.target.value) })}
                                                />
                                            </div>
                                        )}

                                        <div className="h-6 w-px bg-gray-300 mx-1"></div>

                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={index === 0}
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                                                onClick={() => handleMoveItem(index, 'up')}
                                                title="Move Up"
                                            >
                                                <ArrowUp className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={index === items.length - 1}
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                                                onClick={() => handleMoveItem(index, 'down')}
                                                title="Move Down"
                                            >
                                                <ArrowDown className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                                                onClick={() => handleDeleteItem(item.id)}
                                                title="Delete Item"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="p-6">
                                {/* Editor based on type */}
                                {item.item_type === 'text_block' && (
                                    <Textarea
                                        value={item.content.text}
                                        onChange={(e) => handleUpdateItem(item.id, { content: { text: e.target.value } })}
                                        rows={4}
                                        placeholder="Enter text content or instructions..."
                                        className="font-sans text-base min-h-[100px]"
                                    />
                                )}

                                {item.item_type === 'mcq' && (
                                    <div className="space-y-4">
                                        <Textarea
                                            value={item.content.question}
                                            onChange={(e) => handleUpdateItem(item.id, { content: { question: e.target.value } })}
                                            placeholder="Question text..."
                                            className="resize-none font-medium"
                                            rows={2}
                                        />
                                        <div className="space-y-2 pl-4 border-l-2 border-indigo-100">
                                            <Label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Options</Label>
                                            {(item.content.options || []).map((opt: string, optIndex: number) => (
                                                <div key={optIndex} className="flex items-center gap-3">
                                                    <input
                                                        type="radio"
                                                        name={`correct-${item.id}`}
                                                        checked={item.content.correct_option === optIndex}
                                                        onChange={() => handleUpdateItem(item.id, { content: { correct_option: optIndex } })}
                                                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                                    />
                                                    <Input
                                                        value={opt}
                                                        onChange={(e) => {
                                                            const newOptions = [...item.content.options];
                                                            newOptions[optIndex] = e.target.value;
                                                            handleUpdateItem(item.id, { content: { options: newOptions } });
                                                        }}
                                                        className="flex-1 h-9"
                                                        placeholder={`Option ${optIndex + 1}`}
                                                    />
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
                                                        const newOptions = item.content.options.filter((_: any, i: number) => i !== optIndex);
                                                        handleUpdateItem(item.id, { content: { options: newOptions } });
                                                    }}>
                                                        <Trash2 className="w-3 h-3 text-gray-400" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button variant="link" size="sm" className="pl-0 text-indigo-600" onClick={() => {
                                                const currentOptions = item.content.options || [];
                                                handleUpdateItem(item.id, { content: { options: [...currentOptions, `Option ${currentOptions.length + 1}`] } });
                                            }}>
                                                + Add Option
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {item.item_type === 'subjective' && (
                                    <div className="space-y-4">
                                        <Textarea
                                            value={item.content.question}
                                            onChange={(e) => handleUpdateItem(item.id, { content: { question: e.target.value } })}
                                            placeholder="Enter essay question prompt..."
                                            className="font-medium"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Label className="text-sm text-gray-600">Min words:</Label>
                                            <div className="flex flex-col gap-1">
                                                <Input
                                                    type="number"
                                                    className={`w-28 ${(!item.content.min_words || item.content.min_words < 0) ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                                                    value={item.content.min_words !== undefined ? item.content.min_words : 50}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                        handleUpdateItem(item.id, { content: { min_words: isNaN(val) ? 0 : val } });
                                                    }}
                                                    onBlur={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        if (isNaN(val) || val <= 0) {
                                                            toast.warning('Minimum word count must be at least 1');
                                                            handleUpdateItem(item.id, { content: { min_words: 1 } });
                                                        }
                                                    }}
                                                    min="1"
                                                />
                                                {(!item.content.min_words || item.content.min_words <= 0) && (
                                                    <span className="text-[10px] text-red-500 font-bold ml-1">Required</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {item.item_type === 'audio_block' && (
                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                                        {/* File Upload */}
                                        <div>
                                            <Label className="mb-2 block">Audio File</Label>
                                            {item.content.has_audio_file ? (
                                                <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
                                                    <Check className="w-4 h-4 text-green-600" />
                                                    <span className="text-sm text-green-700">Audio uploaded</span>
                                                    <Button size="sm" variant="outline" onClick={() => handleAudioUpload(item.id)}>
                                                        Replace
                                                    </Button>
                                                    <Button size="sm" variant="destructive" onClick={() => handleDeleteAudio(item.id)}>
                                                        Delete
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Input
                                                    type="file"
                                                    accept="audio/wav,audio/mp3,audio/webm,audio/ogg,audio/m4a,audio/aac"
                                                    onChange={(e) => e.target.files?.[0] && handleAudioUpload(item.id, e.target.files[0])}
                                                />
                                            )}
                                        </div>

                                        {/* Play Limit */}
                                        <div>
                                            <Label className="mb-2 block">Play Limit (required)</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                value={item.content.play_limit || 1}
                                                onChange={(e) => handleUpdateItem(item.id, {
                                                    content: { ...item.content, play_limit: parseInt(e.target.value) || 1 }
                                                })}
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Number of times students can play this audio</p>
                                        </div>

                                        {/* Instructions */}
                                        <div>
                                            <Label className="mb-2 block">Instructions</Label>
                                            <Textarea
                                                value={item.content.instructions || ''}
                                                onChange={(e) => handleUpdateItem(item.id, {
                                                    content: { ...item.content, instructions: e.target.value }
                                                })}
                                                placeholder="Instructions for students (e.g., 'Listen carefully...')"
                                            />
                                        </div>

                                        {/* Legacy URL support */}
                                        {!item.content.has_audio_file && (
                                            <div>
                                                <Label className="mb-2 block">Audio URL (legacy)</Label>
                                                <Input
                                                    value={item.content.url || ''}
                                                    onChange={(e) => handleUpdateItem(item.id, {
                                                        content: { ...item.content, url: e.target.value }
                                                    })}
                                                    placeholder="https://example.com/audio.mp3"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {item.item_type === 'audio_recording' && (
                                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                        <Label className="mb-2 block font-semibold text-blue-900">Question / Prompt</Label>
                                        <Input
                                            value={item.content.question || ''}
                                            placeholder="e.g., Describe your weekend plans"
                                            onChange={(e) => handleUpdateItem(item.id, { content: { ...item.content, question: e.target.value } })}
                                            className="mb-3"
                                        />
                                        <Label className="mb-2 block font-semibold text-blue-900">Instructions (Optional)</Label>
                                        <Input
                                            value={item.content.instructions || ''}
                                            placeholder="e.g., Speak clearly for 1-2 minutes"
                                            onChange={(e) => handleUpdateItem(item.id, { content: { ...item.content, instructions: e.target.value } })}
                                            className="mb-3"
                                        />
                                        <Label className="mb-2 block font-semibold text-blue-900">Max Duration (seconds)</Label>
                                        <Input
                                            type="number"
                                            value={item.content.max_duration || 120}
                                            placeholder="120"
                                            onChange={(e) => handleUpdateItem(item.id, { content: { ...item.content, max_duration: parseInt(e.target.value) } })}
                                        />
                                        <p className="text-xs text-blue-600 mt-2">Students can record audio up to this duration</p>
                                    </div>
                                )}

                            </CardContent>
                        </Card>
                    ))}

                    {items.length === 0 && (
                        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                            <p className="text-gray-500 mb-4">No items yet. Click the + button to add content.</p>
                        </div>
                    )}
                </div>

                {/* Floating Add Menu */}
                <div className="fixed bottom-8 right-8 flex flex-col gap-2 items-end z-20">
                    {showAddMenu && (
                        <div className="bg-white shadow-xl rounded-lg p-2 flex flex-col gap-1 border border-indigo-100 mb-2 animate-in slide-in-from-bottom-5 fade-in duration-200">
                            <Button variant="ghost" size="sm" className="justify-start w-48 hover:bg-blue-600 hover:text-white group transition-colors" onClick={() => handleAddItem('text_block')}>
                                <FileText className="w-4 h-4 mr-2 text-blue-500 group-hover:text-white" /> Text / Instructions
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start w-48 hover:bg-green-600 hover:text-white group transition-colors" onClick={() => handleAddItem('mcq')}>
                                <CheckSquare className="w-4 h-4 mr-2 text-green-500 group-hover:text-white" /> Multiple Choice
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start w-48 hover:bg-purple-600 hover:text-white group transition-colors" onClick={() => handleAddItem('subjective')}>
                                <FileText className="w-4 h-4 mr-2 text-purple-500 group-hover:text-white" /> Essay / Subjective
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start w-48 hover:bg-red-600 hover:text-white group transition-colors" onClick={() => handleAddItem('audio_block')}>
                                <Mic className="w-4 h-4 mr-2 text-red-500 group-hover:text-white" /> Audio Clip
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start w-48 hover:bg-orange-600 hover:text-white group transition-colors" onClick={() => handleAddItem('file_upload')}>
                                <GripVertical className="w-4 h-4 mr-2 text-orange-500 group-hover:text-white" /> File Upload
                            </Button>
                            <Button variant="ghost" size="sm" className="justify-start w-48 hover:bg-pink-600 hover:text-white group transition-colors" onClick={() => handleAddItem('audio_recording')}>
                                <Mic className="w-4 h-4 mr-2 text-pink-500 group-hover:text-white" /> 🎤 Audio Recording
                            </Button>
                        </div>
                    )}
                    <Button
                        size="icon"
                        className={`h-14 w-14 rounded-full shadow-lg transition-transform duration-200 ${showAddMenu ? 'rotate-45 bg-gray-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                        onClick={() => setShowAddMenu(!showAddMenu)}
                    >
                        <Plus className="w-6 h-6" />
                    </Button>
                </div>

            </main>

            {/* Preview Modal */}
            <TestPreviewModal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                testType={items.length > 0 ? items[0].item_type === 'subjective' && params.type === 'writing' ? 'writing' : params.type as string : params.type as string}
                // Determine type more robustly? params.type is good: 'listening', 'speaking', 'reading', 'writing', 'vocabulary'
                // But my Preview Modal handles logic based on these string types.
                items={items}
                testTitle={component?.title || 'Test Preview'}
                duration={0}
            />
        </div>
    )
}
