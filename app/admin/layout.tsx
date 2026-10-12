'use client'

import { useState, useEffect, useTransition } from 'react'
import { authStorage } from '@/lib/auth-storage'
import { refreshAuthToken } from '@/lib/api-config'
import Image from 'next/image'
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
  Menu,
  Monitor,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { CubeLoader } from '@/components/ui/CubeLoader'

type AdminLayoutProps = {
  children: React.ReactNode
}

type NavItem = {
  route: string
  label: string
  icon: React.ReactNode
  lockable: boolean
}

const TOP_LEVEL_ITEMS: NavItem[] = [
  { route: '/super-admin/dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/students', label: 'Students', icon: <Users className="w-4 h-4" />, lockable: false },
  { route: '/super-admin/batches', label: 'Batches', icon: <Users className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/analytics', label: 'Analytics', icon: <TrendingUp className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/tests', label: 'CLAP Tests', icon: <FileText className="w-4 h-4" />, lockable: true },
]

const CONTROL_ROOM_ITEMS: NavItem[] = [
  { route: '/super-admin/submissions', label: 'Submissions', icon: <Activity className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/scores', label: 'Scores', icon: <BarChart className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/llm-controls', label: 'LLM Controls', icon: <Brain className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/reports', label: 'Reports', icon: <FileCheck className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/emails', label: 'Emails', icon: <Mail className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/dlq', label: 'DLQ', icon: <AlertCircle className="w-4 h-4" />, lockable: true },
  { route: '/super-admin/notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, lockable: true },
]

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
  // the nav bar or any auth wrappers.
  if (pathname === '/admin') {
    return <>{children}</>
  }

  if (!authChecked) {
    return <CubeLoader />
  }

  // Sub-admins are only allowed on the students page.
  // If they somehow navigate to any other route (direct URL, browser back, etc.)
  // bounce them immediately — before the page renders and fires admin-only API
  // calls that would return 401 and incorrectly trigger a session-expired redirect.
  if (isSubAdmin) {
    const onStudents =
      pathname === '/super-admin/students' ||
      pathname === '/admin/students'
    if (!onStudents) {
      router.replace('/super-admin/students')
      return <CubeLoader />
    }
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
    setControlRoomOpen(false)
    startTransition(() => {
      router.push(route)
    })
  }

  // Sub-admins are locked to the Students tab only.
  // Clicking any locked tab redirects them to Students.
  const handleLockedTabClick = () => {
    goTo('/super-admin/students')
  }

  const handleItemClick = (item: NavItem) => {
    if (item.lockable && isSubAdmin) {
      handleLockedTabClick()
    } else {
      goTo(item.route)
    }
  }

  const handleLogout = () => {
    const role = authStorage.get('user_role')
    authStorage.clear()
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
    })
    window.location.href = role === 'sub_admin' ? '/admin' : '/super-admin'
  }

  const desktopBtnClass = (active: boolean, locked: boolean) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${locked
      ? 'text-gray-400 cursor-not-allowed hover:bg-gray-50'
      : active
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-gray-600 hover:bg-gray-100'
    }`

  const mobileBtnClass = (active: boolean, locked: boolean) =>
    `w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${locked
      ? 'text-gray-400 hover:bg-gray-50 cursor-not-allowed'
      : active
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-[60] h-16 bg-white border-b border-gray-200 flex items-center gap-3 px-4 lg:px-6">

        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={90} height={36} className="w-auto h-8 object-contain" priority style={{ width: 'auto', height: 'auto' }} />
          <span className="hidden md:block text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
            {isSubAdmin ? 'Admin Portal' : 'Super Admin Portal'}
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {TOP_LEVEL_ITEMS.map((item) => {
            const locked = item.lockable && isSubAdmin
            return (
              <button
                key={item.route}
                onClick={() => handleItemClick(item)}
                className={desktopBtnClass(isActive(item.route), locked)}
                title={locked ? 'Access restricted' : undefined}
              >
                {item.icon}
                {item.label}
                {locked && <Lock className="w-3 h-3 text-gray-300" />}
              </button>
            )
          })}

          {/* Control Room — dropdown */}
          <div className="relative">
            <button
              onClick={() => isSubAdmin ? handleLockedTabClick() : setControlRoomOpen(!controlRoomOpen)}
              className={desktopBtnClass(isOperationsActive, isSubAdmin)}
              title={isSubAdmin ? 'Access restricted' : undefined}
            >
              <Monitor className="w-4 h-4" />
              Control Room
              {isSubAdmin ? (
                <Lock className="w-3 h-3 text-gray-300" />
              ) : controlRoomOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>

            {!isSubAdmin && controlRoomOpen && (
              <>
                <div
                  className="hidden lg:block fixed inset-0 z-[55]"
                  onClick={() => setControlRoomOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-[70] py-1.5">
                  {CONTROL_ROOM_ITEMS.map((item) => (
                    <button
                      key={item.route}
                      onClick={() => handleItemClick(item)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors ${isActive(item.route) ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Admins — super admin only */}
          {!isSubAdmin && (
            <button
              onClick={() => goTo('/super-admin/admins')}
              className={desktopBtnClass(isActive('/super-admin/admins'), false)}
            >
              <ShieldCheck className="w-4 h-4" />
              Admins
            </button>
          )}
        </nav>

        {/* Right side: desktop logout + mobile hamburger */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={handleLogout}
            className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[50] bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile menu panel */}
      {sidebarOpen && (
        <div className="fixed top-16 left-0 right-0 z-[55] bg-white border-b border-gray-200 shadow-lg lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto">
          <nav className="px-4 py-4 space-y-1">
            {TOP_LEVEL_ITEMS.map((item) => {
              const locked = item.lockable && isSubAdmin
              return (
                <button
                  key={item.route}
                  onClick={() => handleItemClick(item)}
                  className={mobileBtnClass(isActive(item.route), locked)}
                  title={locked ? 'Access restricted' : undefined}
                >
                  {item.icon}
                  {item.label}
                  {locked && <Lock className="w-3.5 h-3.5 ml-auto text-gray-300" />}
                </button>
              )
            })}

            {/* Control Room — inline expand */}
            <div className="pt-4 mt-4 border-t border-gray-200">
              <button
                onClick={() => isSubAdmin ? handleLockedTabClick() : setControlRoomOpen(!controlRoomOpen)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isSubAdmin
                  ? 'text-gray-400 hover:bg-gray-50 cursor-not-allowed'
                  : isOperationsActive ? 'text-indigo-700 bg-indigo-50/50' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                title={isSubAdmin ? 'Access restricted' : undefined}
              >
                <div className="flex items-center gap-3">
                  <Monitor className="w-5 h-5 text-gray-500" />
                  <span>Control Room</span>
                </div>
                {isSubAdmin ? (
                  <Lock className="w-3.5 h-3.5 text-gray-300" />
                ) : controlRoomOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {!isSubAdmin && controlRoomOpen && (
                <div className="mt-2 ml-4 pl-4 border-l-2 border-slate-100 space-y-1">
                  {CONTROL_ROOM_ITEMS.map((item) => (
                    <button
                      key={item.route}
                      onClick={() => handleItemClick(item)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive(item.route) ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Admins — super admin only */}
            {!isSubAdmin && (
              <div className="pt-1">
                <button
                  onClick={() => goTo('/super-admin/admins')}
                  className={mobileBtnClass(isActive('/super-admin/admins'), false)}
                >
                  <ShieldCheck className="w-5 h-5" />
                  Admins
                </button>
              </div>
            )}

            {/* Logout */}
            <div className="pt-4 mt-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex flex-col min-h-screen pt-16">
        <div className="p-0">{children}</div>
      </main>
    </div>
  )
}
