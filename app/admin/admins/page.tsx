'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Edit,
  KeyRound,
  Loader2,
  Plus,
  Power,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE_URL, getAuthHeaders } from '@/lib/api-config'

interface Admin {
  id: string
  email: string
  full_name: string
  is_active: boolean
  created_at: string | null
  default_password: string
}

const DEFAULT_PASSWORD = 'CLAP@123'

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

  // Delete confirm
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
      toast.success(`Admin ${data.admin.email} created. Default password: ${DEFAULT_PASSWORD}`)
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

    // Optimistic update
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
        return
      }
      toast.success(`Admin ${action}d`)
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(admin)}
                            className="h-8 w-8 p-0"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggle(admin)}
                            className="h-8 w-8 p-0"
                            title={admin.is_active ? 'Disable' : 'Enable'}
                          >
                            <Power className={`w-3.5 h-3.5 ${admin.is_active ? 'text-red-500' : 'text-green-500'}`} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResetPassword(admin)}
                            className="h-8 w-8 p-0"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(admin)}
                            className="h-8 w-8 p-0"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
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

      {/* Refresh button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={fetchAdmins} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* ── Add Admin Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Admin</DialogTitle>
            <DialogDescription>
              Create a new admin account. Default password will be <code className="text-xs bg-gray-100 px-1 rounded">{DEFAULT_PASSWORD}</code>.
            </DialogDescription>
          </DialogHeader>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addLoading}>
                {addLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : 'Create Admin'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Admin Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Admin</DialogTitle>
            <DialogDescription>Update admin account details.</DialogDescription>
          </DialogHeader>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Admin</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.email}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
