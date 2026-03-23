'use client'

import { useState, useRef, useCallback } from 'react'
import { getApiUrl, getAuthHeaders } from '@/lib/api-config'
import { toast } from 'sonner'
import { Upload, Download, X, AlertTriangle, CheckCircle2, RefreshCw, Users, FileText } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Batch {
    id: string
    batch_name: string
}

interface FailedRow {
    row: string | number
    student_id: string
    reason: string
}

interface ImportSummary {
    total_rows_in_file: number
    created: number
    restored: number
    skipped_duplicates: number
    skipped_invalid: number
    batch_name: string
    default_password: string
}

interface ImportResult {
    success: boolean
    summary: ImportSummary
    failed_count: number
    failures: FailedRow[]
    failed_csv_b64?: string
    error?: string
}

type Stage = 'select' | 'uploading' | 'result' | 'error'

interface Props {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    batches: Batch[]
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BulkImportModal({ isOpen, onClose, onSuccess, batches }: Props) {
    const [stage, setStage] = useState<Stage>('select')
    const [selectedBatchId, setSelectedBatchId] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [result, setResult] = useState<ImportResult | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Reset ────────────────────────────────────────────────────────────────────
    const reset = useCallback(() => {
        setStage('select')
        setSelectedFile(null)
        setSelectedBatchId('')
        setResult(null)
        setErrorMsg('')
        setDragOver(false)
    }, [])

    const handleClose = () => {
        reset()
        onClose()
    }

    // ── File selection ───────────────────────────────────────────────────────────
    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) validateAndSetFile(file)
    }

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) validateAndSetFile(file)
    }

    const validateAndSetFile = (file: File) => {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error('Only .csv files are accepted.')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File is too large. Maximum size is 5 MB.')
            return
        }
        setSelectedFile(file)
    }

    // ── Template Download ────────────────────────────────────────────────────────
    const handleTemplateDownload = async () => {
        try {
            const res = await fetch(getApiUrl('admin/students/bulk-template'), {
                headers: getAuthHeaders(),
            })
            if (!res.ok) throw new Error('Failed to download template')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'clap_student_import_template.csv'
            a.click()
            URL.revokeObjectURL(url)
        } catch (_e) {
            toast.error('Could not download the template. Please try again.')
        }
    }

    // ── Failed Rows Download ─────────────────────────────────────────────────────
    const handleFailedRowsDownload = () => {
        if (!result?.failed_csv_b64) return
        const bytes = atob(result.failed_csv_b64)
        const blob = new Blob([bytes], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'clap_import_failed_rows.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    // ── Submit ───────────────────────────────────────────────────────────────────
    const handleImport = async () => {
        if (!selectedFile) { toast.error('Please select a CSV file.'); return }
        if (!selectedBatchId) { toast.error('Please select a batch.'); return }

        setStage('uploading')

        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('batch_id', selectedBatchId)

        try {
            const res = await fetch(getApiUrl('admin/students/bulk-import'), {
                method: 'POST',
                headers: getAuthHeaders(),   // No Content-Type — browser sets boundary for multipart
                body: formData,
            })

            const data: ImportResult = await res.json()

            if (res.status === 400 || res.status === 404 || res.status === 409 || res.status === 500) {
                setErrorMsg(data.error || 'An unexpected error occurred.')
                setStage('error')
                return
            }

            // 200 = fully successful, 207 = partial success (some failures)
            if (res.ok || res.status === 207) {
                // 422 with error = all rows failed
                if (!data.success && data.error) {
                    setErrorMsg(data.error)
                    setResult(data)
                    setStage('error')
                    return
                }
                setResult(data)
                setStage('result')

                if (data.summary.created + data.summary.restored > 0) {
                    onSuccess()  // Trigger parent to refresh the student list
                }
                return
            }

            setErrorMsg(data.error || 'Unknown server error.')
            setStage('error')
        } catch (e) {
            setErrorMsg('Network error — Please check that the backend server is running and try again.')
            setStage('error')
        }
    }

    if (!isOpen) return null

    // ── Render ───────────────────────────────────────────────────────────────────
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <Users className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Bulk Student Import</h2>
                            <p className="text-xs text-gray-500">Upload a CSV to create hundreds of accounts at once</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* ── SELECT STAGE ── */}
                    {(stage === 'select') && (
                        <>
                            {/* Template Download Banner */}
                            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                                <div>
                                    <p className="text-sm font-semibold text-indigo-800">Step 1: Download the template</p>
                                    <p className="text-xs text-indigo-600 mt-0.5">Fill in student IDs in the provided format (one per row)</p>
                                </div>
                                <button
                                    onClick={handleTemplateDownload}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 border border-indigo-300 bg-white rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download Template
                                </button>
                            </div>

                            {/* Batch Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                    Step 2: Select Batch <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedBatchId}
                                    onChange={(e) => setSelectedBatchId(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">— Select a batch —</option>
                                    {batches.map((b) => (
                                        <option key={b.id} value={b.id}>{b.batch_name}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-400 mt-1">All imported students will be assigned to this batch.</p>
                            </div>

                            {/* File Drop Zone */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                    Step 3: Upload your CSV <span className="text-red-500">*</span>
                                </label>
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleFileDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver
                                            ? 'border-indigo-400 bg-indigo-50'
                                            : selectedFile
                                                ? 'border-green-400 bg-green-50'
                                                : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50'
                                        }`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileInput}
                                        className="hidden"
                                    />
                                    {selectedFile ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <FileText className="w-8 h-8 text-green-500" />
                                            <p className="text-sm font-semibold text-green-700">{selectedFile.name}</p>
                                            <p className="text-xs text-green-500">{(selectedFile.size / 1024).toFixed(1)} KB — Click to change</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Upload className="w-8 h-8 text-gray-400" />
                                            <p className="text-sm font-semibold text-gray-600">Drag & drop your CSV here</p>
                                            <p className="text-xs text-gray-400">or click to browse — max 5 MB, .csv only</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Rules */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-1">
                                <p className="font-semibold">Important rules:</p>
                                <ul className="list-disc ml-4 space-y-0.5">
                                    <li>CSV must have a column header named <code className="bg-amber-100 px-1 rounded">student_id</code></li>
                                    <li>Student IDs: 3–50 characters, letters, numbers, hyphens, underscores only</li>
                                    <li>Max 10,000 rows per upload</li>
                                    <li>Duplicate IDs (already in system) are silently skipped — no error</li>
                                    <li>All created accounts get default password: <code className="bg-amber-100 px-1 rounded">CLAP@123</code></li>
                                </ul>
                            </div>
                        </>
                    )}

                    {/* ── UPLOADING STAGE ── */}
                    {stage === 'uploading' && (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-indigo-100 rounded-full" />
                                <div className="w-16 h-16 border-4 border-t-indigo-600 rounded-full animate-spin absolute inset-0" />
                            </div>
                            <p className="text-sm font-semibold text-gray-700">Processing your CSV...</p>
                            <p className="text-xs text-gray-400 text-center max-w-xs">
                                Validating rows, checking for duplicates, and creating accounts atomically. This may take a few seconds for large files.
                            </p>
                        </div>
                    )}

                    {/* ── RESULT STAGE ── */}
                    {stage === 'result' && result && (
                        <>
                            {/* Success Summary */}
                            <div className={`rounded-xl p-5 border ${result.failed_count > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                                <div className="flex items-center gap-3 mb-4">
                                    {result.failed_count > 0
                                        ? <AlertTriangle className="w-6 h-6 text-amber-500" />
                                        : <CheckCircle2 className="w-6 h-6 text-green-500" />
                                    }
                                    <div>
                                        <p className="font-bold text-gray-800">
                                            {result.failed_count > 0 ? 'Import Partially Successful' : 'Import Successful!'}
                                        </p>
                                        <p className="text-xs text-gray-500">Batch: {result.summary.batch_name}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <Stat label="✅ Created" value={result.summary.created} color="text-green-700" />
                                    <Stat label="♻️ Restored" value={result.summary.restored} color="text-blue-700" />
                                    <Stat label="⏭️ Skipped" value={result.summary.skipped_duplicates} color="text-gray-600" />
                                    <Stat label="❌ Failed" value={result.failed_count} color="text-red-600" />
                                </div>
                                <p className="text-xs text-gray-500 mt-3">
                                    Default password for all new accounts: <code className="bg-white px-1 py-0.5 rounded border border-gray-200 font-mono">{result.summary.default_password}</code>
                                </p>
                            </div>

                            {/* Failed Rows Table */}
                            {result.failures.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-semibold text-gray-700">Failed Rows ({result.failed_count})</p>
                                        {result.failed_csv_b64 && (
                                            <button
                                                onClick={handleFailedRowsDownload}
                                                className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 transition-colors"
                                            >
                                                <Download className="w-3 h-3" />
                                                Download Failed Rows CSV
                                            </button>
                                        )}
                                    </div>
                                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="text-left px-3 py-2 text-gray-500 font-semibold">Row</th>
                                                    <th className="text-left px-3 py-2 text-gray-500 font-semibold">Student ID</th>
                                                    <th className="text-left px-3 py-2 text-gray-500 font-semibold">Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.failures.map((f, i) => (
                                                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                                        <td className="px-3 py-2 text-gray-500 font-mono">{f.row}</td>
                                                        <td className="px-3 py-2 text-gray-800 font-mono">{f.student_id || '—'}</td>
                                                        <td className="px-3 py-2 text-red-600">{f.reason}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── ERROR STAGE ── */}
                    {stage === 'error' && (
                        <div className="flex flex-col items-center text-center gap-4 py-10">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertTriangle className="w-7 h-7 text-red-500" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 mb-1">Import Failed</p>
                                <p className="text-sm text-red-600 max-w-sm">{errorMsg}</p>
                            </div>
                            {/* Show failed rows download even on total failure if we have data */}
                            {result?.failed_csv_b64 && (
                                <button
                                    onClick={handleFailedRowsDownload}
                                    className="flex items-center gap-1.5 text-sm text-red-600 border border-red-300 rounded-lg px-3 py-2 hover:bg-red-50"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Failed Rows
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                    {stage === 'select' && (
                        <>
                            <button onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-4 py-2">
                                Cancel
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={!selectedFile || !selectedBatchId}
                                className="flex items-center gap-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg px-5 py-2.5 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                Import & Create Accounts
                            </button>
                        </>
                    )}
                    {stage === 'uploading' && (
                        <p className="text-xs text-gray-400 mx-auto">Please wait — do not close this window</p>
                    )}
                    {(stage === 'result' || stage === 'error') && (
                        <>
                            <button
                                onClick={reset}
                                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Import Another File
                            </button>
                            <button
                                onClick={handleClose}
                                className="text-sm font-semibold bg-indigo-600 text-white rounded-lg px-5 py-2.5 hover:bg-indigo-700 transition-colors"
                            >
                                Done
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="bg-white rounded-lg p-3 text-center border border-white/80 shadow-sm">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
        </div>
    )
}
