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
  LogOut,
  Mail,
  Monitor,
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
  const pathname = usePathname()
  const router = useRouter()

  // ── Auth guard + proactive token refresh ──────────────────────────────────
  useEffect(() => {
    let refreshInterval: ReturnType<typeof setInterval> | null = null

    const checkAuth = async () => {
      const token = authStorage.get('access_token')
      const role = authStorage.get('user_role')

      // No token or wrong role → redirect immediately, render nothing
      if (!token || role !== 'admin') {
        window.location.replace('/admin-login?reason=session_expired')
        return
      }

      // Proactive refresh: if the token expires within the next 10 minutes,
      // silently get a new one now so no tab click ever hits a 401.
      const expiresAt = Number(authStorage.get('token_expires_at') || 0)
      if (expiresAt && Date.now() > expiresAt - 10 * 60 * 1000) {
        await refreshAuthToken()  // best-effort; failure is caught by apiFetch on next call
      }

      setAuthChecked(true)

      // Background interval: re-check every 5 minutes and refresh ahead of expiry.
      // This keeps the token alive for admins who leave the dashboard open for hours.
      refreshInterval = setInterval(async () => {
        const currentToken = authStorage.get('access_token')
        if (!currentToken) {
          // Token was cleared externally (logout in another tab, etc.)
          window.location.replace('/admin-login?reason=session_expired')
          return
        }
        const exp = Number(authStorage.get('token_expires_at') || 0)
        if (exp && Date.now() > exp - 10 * 60 * 1000) {
          await refreshAuthToken()  // best-effort; apiFetch retries on 401 if this fails
        }
      }, 5 * 60 * 1000)
    }

    checkAuth()

    return () => {
      if (refreshInterval) clearInterval(refreshInterval)
    }
  }, [])

  // All hooks must be declared before any conditional return (Rules of Hooks).
  // isOperationsActive is derived from pathname (already a hook) — safe to compute here.
  const isOperationsActive = ['/admin/submissions', '/admin/scores', '/admin/llm-controls', '/admin/reports', '/admin/emails', '/admin/dlq', '/admin/notifications'].some(p => pathname.startsWith(p))
  const [controlRoomOpen, setControlRoomOpen] = useState(isOperationsActive)

  // Show a minimal spinner while auth state is being verified.
  // This prevents any authenticated API call from firing before we know
  // the session is valid — the root cause of the session_expired redirects.
  if (!authChecked) {
    return <CubeLoader />
  }

  const isActive = (route: string) => {
    if (route === '/admin/tests') {
      return pathname === '/admin/tests' || pathname.startsWith('/admin/dashboard/clap-tests')
    }
    return pathname === route
  }

  const goTo = (route: string) => {
    setSidebarOpen(false)
    startTransition(() => {
      router.push(route)
    })
  }

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
      <aside className={`fixed left-0 top-0 z-[60] h-[100dvh] w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Logo Header */}
        <div className="flex flex-col items-center gap-1 px-6 py-5 border-b border-gray-200 text-center shrink-0">
          <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={113} height={46} className="w-auto h-10 object-contain" priority style={{ width: 'auto', height: 'auto' }} />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Admin Portal</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto min-h-0">
          <div className="space-y-1">
            <button
              onClick={() => goTo('/admin/dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/dashboard')
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <BarChart3 className="w-5 h-5" />
              Dashboard
            </button>

            <button
              onClick={() => goTo('/admin/students')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/students')
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <Users className="w-5 h-5" />
              Students
            </button>

            <button
              onClick={() => goTo('/admin/batches')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/batches')
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <Users className="w-5 h-5" />
              Batches
            </button>

            <button
              onClick={() => goTo('/admin/analytics')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/analytics')
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <TrendingUp className="w-5 h-5" />
              Analytics
            </button>

            <button
              onClick={() => goTo('/admin/tests')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/tests')
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <FileText className="w-5 h-5" />
              CLAP Tests
            </button>

            {/* Control Room Toggle */}
            <div className="pt-4 mt-4 border-t border-gray-200">
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
                    onClick={() => goTo('/admin/submissions')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/submissions') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Activity className="w-4 h-4" />
                    Submissions
                  </button>

                  <button
                    onClick={() => goTo('/admin/scores')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/scores') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <BarChart className="w-4 h-4" />
                    Scores
                  </button>

                  <button
                    onClick={() => goTo('/admin/llm-controls')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/llm-controls') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Brain className="w-4 h-4" />
                    LLM Controls
                  </button>

                  <button
                    onClick={() => goTo('/admin/reports')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/reports') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <FileCheck className="w-4 h-4" />
                    Reports
                  </button>

                  <button
                    onClick={() => goTo('/admin/emails')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/emails') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Mail className="w-4 h-4" />
                    Emails
                  </button>

                  <button
                    onClick={() => goTo('/admin/dlq')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/dlq') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    DLQ
                  </button>

                  <button
                    onClick={() => goTo('/admin/notifications')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/admin/notifications') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Bell className="w-4 h-4" />
                    Notifications
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 shrink-0 mt-auto">
          <button
            onClick={() => {
              // Clear this tab's auth session
              authStorage.clear()
              document.cookie.split(";").forEach((c) => {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
              });
              window.location.href = '/admin-login';
            }}
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
