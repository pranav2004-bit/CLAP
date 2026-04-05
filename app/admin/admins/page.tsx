'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Edit,
  KeyRound,
  Loader2,
  Plus,
  Power,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE_URL, getAuthHeaders } from '@/lib/api-config'

interface Admin {
  id: string
  email: string
  full_name: string
  is_active: boolean
  created_at: string | null
}

const DEFAULT_PASSWORD = 'CLAP@123'

// ── Simple overlay modal ──────────────────────────────────────────────────────
function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-4 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', full_name: '' })
  const [addLoading, setAddLoading] = useState(false)

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Admin | null>(null)
  const [editForm, setEditForm] = useState({ email: '', full_name: '' })
  const [editLoading, setEditLoading] = useState(false)

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<Admin | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchAdmins = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/admin/admins`, { headers: getAuthHeaders() })
      const data = await res.json()
      if (data.admins) setAdmins(data.admins)
    } catch {
      toast.error('Failed to load admins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAdmins() }, [fetchAdmins])

  // ── Add ───────────────────────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(addForm),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to create admin'); return }
      toast.success(`Admin created. Default password: ${DEFAULT_PASSWORD}`)
      setAdmins(prev => [data.admin, ...prev])
      setAddOpen(false)
      setAddForm({ email: '', full_name: '' })
    } catch {
      toast.error('Failed to create admin')
    } finally {
      setAddLoading(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (admin: Admin) => {
    setEditTarget(admin)
    setEditForm({ email: admin.email, full_name: admin.full_name })
    setEditOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    setEditLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/admins/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to update admin'); return }
      toast.success('Admin updated')
      setAdmins(prev => prev.map(a => a.id === editTarget.id ? data.admin : a))
      setEditOpen(false)
      setEditTarget(null)
    } catch {
      toast.error('Failed to update admin')
    } finally {
      setEditLoading(false)
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  const handleToggle = async (admin: Admin) => {
    const action = admin.is_active ? 'disable' : 'enable'
    if (!confirm(`${action === 'enable' ? 'Enable' : 'Disable'} admin "${admin.email}"?`)) return

    setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, is_active: !a.is_active } : a))
    try {
      const res = await fetch(`${API_BASE_URL}/admin/admins/${admin.id}/toggle`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (!res.ok) {
        setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, is_active: admin.is_active } : a))
        toast.error(data.error || `Failed to ${action} admin`)
      } else {
        toast.success(`Admin ${action}d`)
      }
    } catch {
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, is_active: admin.is_active } : a))
      toast.error(`Failed to ${action} admin`)
    }
  }

  // ── Reset password ────────────────────────────────────────────────────────
  const handleResetPassword = async (admin: Admin) => {
    if (!confirm(`Reset password for "${admin.email}" to ${DEFAULT_PASSWORD}?`)) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/admins/${admin.id}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to reset password'); return }
      toast.success(`Password reset to ${DEFAULT_PASSWORD}`)
    } catch {
      toast.error('Failed to reset password')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/admin/admins/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to delete admin'); return }
      toast.success('Admin deleted')
      setAdmins(prev => prev.filter(a => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete admin')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            Admin Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage admin accounts. Admins can only access the Students tab.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Admin
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" />
            Admin Accounts
            <Badge variant="secondary">{admins.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : admins.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No admins found. Click &ldquo;Add Admin&rdquo; to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-center p-4 text-sm font-medium text-muted-foreground w-24">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email (ID)</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Full Name</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Password</th>
                    <th className="text-center p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map(admin => (
                    <tr key={admin.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="p-4 text-center">
                        <Badge
                          variant={admin.is_active ? 'default' : 'destructive'}
                          className={admin.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                        >
                          <Power className="w-3 h-3 mr-1" />
                          {admin.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-sm">{admin.email}</div>
                        <div className="text-xs text-gray-400 font-mono">{admin.id.slice(0, 8)}…</div>
                      </td>
                      <td className="p-4 text-sm text-gray-700">{admin.full_name || '—'}</td>
                      <td className="p-4">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-600">
                          {DEFAULT_PASSWORD}
                        </code>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(admin)}
                            className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleToggle(admin)}
                            className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                            title={admin.is_active ? 'Disable' : 'Enable'}
                          >
                            <Power className={`w-3.5 h-3.5 ${admin.is_active ? 'text-red-500' : 'text-green-500'}`} />
                          </button>
                          <button
                            onClick={() => handleResetPassword(admin)}
                            className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(admin)}
                            className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={fetchAdmins} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* ── Add Admin Modal ───────────────────────────────────────────────────── */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Admin"
        description={`Create a new admin account. Default password: ${DEFAULT_PASSWORD}`}
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-email">Email *</Label>
            <Input
              id="add-email"
              type="email"
              placeholder="admin@example.com"
              value={addForm.email}
              onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-name">Full Name</Label>
            <Input
              id="add-name"
              placeholder="John Doe"
              value={addForm.full_name}
              onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={addLoading}>
              {addLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : 'Create Admin'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Admin Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Admin"
        description="Update admin account details."
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email *</Label>
            <Input
              id="edit-email"
              type="email"
              value={editForm.email}
              onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Full Name</Label>
            <Input
              id="edit-name"
              value={editForm.full_name}
              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={editLoading}>
              {editLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Admin"
        description={`Permanently delete "${deleteTarget?.email}"? This cannot be undone.`}
      >
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleteLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</> : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
