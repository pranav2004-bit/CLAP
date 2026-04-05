'use client'

import { useState, useEffect, useTransition } from 'react'
import { authStorage } from '@/lib/auth-storage'
import { refreshAuthToken } from '@/lib/api-config'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  BarChart,
  BarChart3,
  Bell,
  Brain,
  ChevronDown,
  ChevronRight,
  FileCheck,
  FileText,
  Lock,
  LogOut,
  Mail,
  Monitor,
  ShieldCheck,
  TrendingUp,
  Users
} from 'lucide-react'
import { CubeLoader } from '@/components/ui/CubeLoader'

type AdminLayoutProps = {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [authChecked, setAuthChecked] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const pathname = usePathname()
  const router = useRouter()

  // ── Auth guard + proactive token refresh ──────────────────────────────────
  useEffect(() => {
    let refreshInterval: ReturnType<typeof setInterval> | null = null

    const checkAuth = async () => {
      // The /admin page itself is the sub_admin login — no auth needed.
      // The page handles its own redirect if already logged in.
      if (pathname === '/admin') {
        setAuthChecked(true)
        return
      }

      const token = authStorage.get('access_token')
      const role = authStorage.get('user_role')

      // No token or wrong role → redirect to the appropriate login page
      if (!token || (role !== 'admin' && role !== 'sub_admin')) {
        window.location.replace('/super-admin?reason=session_expired')
        return
      }

      setUserRole(role)

      // Proactive refresh: if token expires within the next 10 minutes,
      // silently get a new one so no tab click ever hits a 401.
      const expiresAt = Number(authStorage.get('token_expires_at') || 0)
      if (expiresAt && Date.now() > expiresAt - 10 * 60 * 1000) {
        await refreshAuthToken()
      }

      setAuthChecked(true)

      // Background interval: re-check every 5 minutes.
      refreshInterval = setInterval(async () => {
        const currentToken = authStorage.get('access_token')
        if (!currentToken) {
          const currentRole = authStorage.get('user_role')
          const loginPage = currentRole === 'sub_admin' ? '/admin' : '/super-admin'
          window.location.replace(`${loginPage}?reason=session_expired`)
          return
        }
        const exp = Number(authStorage.get('token_expires_at') || 0)
        if (exp && Date.now() > exp - 10 * 60 * 1000) {
          await refreshAuthToken()
        }
      }, 5 * 60 * 1000)
    }

    checkAuth()

    return () => {
      if (refreshInterval) clearInterval(refreshInterval)
    }
  }, [])

  // Derive sub-admin flag and control-room active state after hooks are declared.
  const isSubAdmin = userRole === 'sub_admin'

  // For super-admin: paths include both /super-admin/* (rewritten URL) and /admin/* (direct)
  const isOperationsActive = [
    '/super-admin/submissions', '/super-admin/scores', '/super-admin/llm-controls',
    '/super-admin/reports', '/super-admin/emails', '/super-admin/dlq', '/super-admin/notifications',
    '/admin/submissions', '/admin/scores', '/admin/llm-controls',
    '/admin/reports', '/admin/emails', '/admin/dlq', '/admin/notifications',
  ].some(p => pathname.startsWith(p))

  const [controlRoomOpen, setControlRoomOpen] = useState(isOperationsActive)

  // /admin itself is the sub_admin login page — render it directly without
  // the sidebar or any auth wrappers.
  if (pathname === '/admin') {
    return <>{children}</>
  }

  if (!authChecked) {
    return <CubeLoader />
  }

  // Check if a route is currently active — supports both /super-admin/* and /admin/* URLs
  const isActive = (route: string) => {
    // Convert super-admin path to admin path for comparison (rewrite means both URLs can appear)
    const adminRoute = route.replace('/super-admin/', '/admin/')
    const superAdminRoute = route.replace('/admin/', '/super-admin/').replace('/super-admin/super-admin/', '/super-admin/')

    if (route.includes('/tests')) {
      return (
        pathname === adminRoute || pathname === superAdminRoute ||
        pathname.startsWith('/admin/dashboard/clap-tests') ||
        pathname.startsWith('/super-admin/dashboard/clap-tests')
      )
    }
    return pathname === adminRoute || pathname === superAdminRoute
  }

  const goTo = (route: string) => {
    setSidebarOpen(false)
    startTransition(() => {
      router.push(route)
    })
  }

  // Sub-admins are locked to the Students tab only.
  // Clicking any locked tab redirects them to Students.
  const handleLockedTabClick = () => {
    goTo('/super-admin/students')
  }

  const handleLogout = () => {
    const role = authStorage.get('user_role')
    authStorage.clear()
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
    })
    window.location.href = role === 'sub_admin' ? '/admin' : '/super-admin'
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-[60] h-[100dvh] w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Logo Header */}
        <div className="flex flex-col items-center gap-1 px-6 py-5 border-b border-gray-200 text-center shrink-0">
          <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={113} height={46} className="w-auto h-10 object-contain" priority style={{ width: 'auto', height: 'auto' }} />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
            {isSubAdmin ? 'Admin Portal' : 'Super Admin Portal'}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto min-h-0">
          <div className="space-y-1">

            {/* Dashboard — locked for sub_admin */}
            {isSubAdmin ? (
              <button
                onClick={handleLockedTabClick}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:bg-gray-50 cursor-not-allowed"
                title="Access restricted"
              >
                <BarChart3 className="w-5 h-5" />
                Dashboard
                <Lock className="w-3.5 h-3.5 ml-auto text-gray-300" />
              </button>
            ) : (
              <button
                onClick={() => goTo('/super-admin/dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/dashboard')
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <BarChart3 className="w-5 h-5" />
                Dashboard
              </button>
            )}

            {/* Students — always accessible */}
            <button
              onClick={() => goTo('/super-admin/students')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/students')
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <Users className="w-5 h-5" />
              Students
            </button>

            {/* Batches — locked for sub_admin */}
            {isSubAdmin ? (
              <button
                onClick={handleLockedTabClick}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:bg-gray-50 cursor-not-allowed"
                title="Access restricted"
              >
                <Users className="w-5 h-5" />
                Batches
                <Lock className="w-3.5 h-3.5 ml-auto text-gray-300" />
              </button>
            ) : (
              <button
                onClick={() => goTo('/super-admin/batches')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/batches')
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <Users className="w-5 h-5" />
                Batches
              </button>
            )}

            {/* Analytics — locked for sub_admin */}
            {isSubAdmin ? (
              <button
                onClick={handleLockedTabClick}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:bg-gray-50 cursor-not-allowed"
                title="Access restricted"
              >
                <TrendingUp className="w-5 h-5" />
                Analytics
                <Lock className="w-3.5 h-3.5 ml-auto text-gray-300" />
              </button>
            ) : (
              <button
                onClick={() => goTo('/super-admin/analytics')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/analytics')
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <TrendingUp className="w-5 h-5" />
                Analytics
              </button>
            )}

            {/* CLAP Tests — locked for sub_admin */}
            {isSubAdmin ? (
              <button
                onClick={handleLockedTabClick}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:bg-gray-50 cursor-not-allowed"
                title="Access restricted"
              >
                <FileText className="w-5 h-5" />
                CLAP Tests
                <Lock className="w-3.5 h-3.5 ml-auto text-gray-300" />
              </button>
            ) : (
              <button
                onClick={() => goTo('/super-admin/tests')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/tests')
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <FileText className="w-5 h-5" />
                CLAP Tests
              </button>
            )}

            {/* Control Room — locked for sub_admin */}
            <div className="pt-4 mt-4 border-t border-gray-200">
              {isSubAdmin ? (
                <button
                  onClick={handleLockedTabClick}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:bg-gray-50 cursor-not-allowed"
                  title="Access restricted"
                >
                  <div className="flex items-center gap-3">
                    <Monitor className="w-5 h-5" />
                    <span>Control Room</span>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-gray-300" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setControlRoomOpen(!controlRoomOpen)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isOperationsActive ? 'text-indigo-700 bg-indigo-50/50' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Monitor className="w-5 h-5 text-gray-500" />
                      <span>Control Room</span>
                    </div>
                    {controlRoomOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>

                  {controlRoomOpen && (
                    <div className="mt-2 ml-4 pl-4 border-l-2 border-slate-100 space-y-1">
                      <button
                        onClick={() => goTo('/super-admin/submissions')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/submissions') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <Activity className="w-4 h-4" />
                        Submissions
                      </button>
                      <button
                        onClick={() => goTo('/super-admin/scores')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/scores') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <BarChart className="w-4 h-4" />
                        Scores
                      </button>
                      <button
                        onClick={() => goTo('/super-admin/llm-controls')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/llm-controls') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <Brain className="w-4 h-4" />
                        LLM Controls
                      </button>
                      <button
                        onClick={() => goTo('/super-admin/reports')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/reports') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <FileCheck className="w-4 h-4" />
                        Reports
                      </button>
                      <button
                        onClick={() => goTo('/super-admin/emails')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/emails') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <Mail className="w-4 h-4" />
                        Emails
                      </button>
                      <button
                        onClick={() => goTo('/super-admin/dlq')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/dlq') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <AlertCircle className="w-4 h-4" />
                        DLQ
                      </button>
                      <button
                        onClick={() => goTo('/super-admin/notifications')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/notifications') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <Bell className="w-4 h-4" />
                        Notifications
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Admin Management — super admin only */}
            {!isSubAdmin && (
              <div className="pt-1">
                <button
                  onClick={() => goTo('/super-admin/admins')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/super-admin/admins')
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                  Admins
                </button>
              </div>
            )}

          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 shrink-0 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen lg:ml-64">
        <div className="p-0">{children}</div>
      </main>
    </div>
  )
}
