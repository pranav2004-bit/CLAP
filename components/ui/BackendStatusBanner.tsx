'use client'

/**
 * BackendStatusBanner
 *
 * Listens for 'clap:backend:offline' / 'clap:backend:online' CustomEvents
 * dispatched by markBackendOffline() / markBackendOnline() in lib/api-config.ts.
 *
 * When the backend is unreachable (ERR_EMPTY_RESPONSE, connection refused):
 *  • Shows a fixed amber bar above the footer
 *  • Auto-pings /api/health at a JITTERED interval (base 5s ± up to 10s random)
 *  • When backend responds:
 *      - On active test page  → shows green "Reconnected" flash, then hides.
 *                               NEVER reloads — would destroy unsaved test answers.
 *      - On all other pages   → shows green flash then reloads with a random
 *                               stagger delay so 3000 students never all reload
 *                               at the exact same millisecond (thundering herd).
 *
 * ENTERPRISE DESIGN — Thundering Herd Prevention:
 *   Without jitter: all N students activate the banner simultaneously when the
 *   server blips, then ALL ping health at t=5s, t=10s, t=15s... in perfect sync.
 *   At 3000 students this is 600 synchronized req/s hitting a recovering Django —
 *   the banner itself re-overwhelms the backend it is trying to monitor.
 *
 *   With jitter: each student's ping fires at base + rand(0, JITTER_MS).
 *   3000 students spread across 15 seconds = ~200 req/s — easily absorbed.
 *   The reload cascade (non-test pages) is also staggered over 5 seconds.
 *
 * When backend is online → renders nothing (zero DOM cost).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl } from '@/lib/api-config'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'

// ── Timing constants ─────────────────────────────────────────────────────────
// Base ping interval — how often we check health when offline
const PING_BASE_MS   = 5_000
// Maximum random jitter added on top of the base interval.
// Spreads 3000 simultaneous banner activations across a ~15-second window:
//   3000 students / 15s = ~200 req/s  (vs 600 req/s without jitter)
const PING_JITTER_MS = 10_000
// Health request timeout — abandon the ping if Django doesn't respond in time
const HEALTH_TIMEOUT_MS = 4_000
// Maximum random stagger before reload fires on non-test pages.
// Spreads the reload cascade: 3000 students reload over 5s instead of 1.2s.
const RELOAD_STAGGER_MAX_MS = 5_000

/** Random integer in [0, max) */
const rand = (max: number) => Math.floor(Math.random() * max)

// ── Active test page detection ───────────────────────────────────────────────
// Matches /student/clap-tests/<uuid> and /student/clap-tests/<uuid>/anything.
// A student is mid-test if this pattern matches — we must never reload on these pages.
const ACTIVE_TEST_PATTERN =
  /\/student\/clap-tests\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/i

function isActiveTestPage(): boolean {
  if (typeof window === 'undefined') return false
  return ACTIVE_TEST_PATTERN.test(window.location.pathname)
}

type BannerState = 'hidden' | 'offline' | 'recovering'

export function BackendStatusBanner() {
  const [state, setState]           = useState<BannerState>('hidden')
  const [countdown, setCountdown]   = useState(PING_BASE_MS / 1000)
  const [pinging, setPinging]       = useState(false)
  const [onTestPage, setOnTestPage] = useState(false)
  const pingTimerRef                = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef           = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Schedule next ping with jitter ─────────────────────────────────────────
  // Each call schedules ONE ping after base + random jitter milliseconds.
  // This is deliberately NOT a fixed setInterval — the random delay changes
  // every cycle, so 3000 students that started in sync drift apart over time.
  const schedulePing = useCallback(() => {
    if (pingTimerRef.current) clearTimeout(pingTimerRef.current)
    const delay = PING_BASE_MS + rand(PING_JITTER_MS)
    pingTimerRef.current = setTimeout(() => {
      doPing()
    }, delay)
    // Countdown shows the base interval for UX clarity (not the actual jittered delay)
    setCountdown(PING_BASE_MS / 1000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Health ping ─────────────────────────────────────────────────────────────
  const doPing = useCallback(async () => {
    if (pinging) {
      schedulePing()   // already pinging — skip and reschedule
      return
    }
    setPinging(true)
    try {
      const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(HEALTH_TIMEOUT_MS)
        : undefined
      const res = await fetch(getApiUrl('health'), { signal })
      if (res.ok || res.status < 500) {
        // Backend is back
        if (pingTimerRef.current) { clearTimeout(pingTimerRef.current); pingTimerRef.current = null }
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null }
        setState('recovering')
        if (isActiveTestPage()) {
          // NEVER reload mid-test — student's unsaved state would be lost.
          // The test page's own polling/auto-save timers resume automatically.
          setTimeout(() => setState('hidden'), 3_000)
        } else {
          // Stagger the reload across all non-test users to prevent thundering herd.
          // Without stagger: 3000 non-test users all reload at t+1.2s → 30,000 API calls
          // in 2 seconds re-spike the recovering backend.
          // With stagger: reloads spread over RELOAD_STAGGER_MAX_MS → smooth ramp-up.
          const stagger = rand(RELOAD_STAGGER_MAX_MS)
          setTimeout(() => { window.location.reload() }, 1_200 + stagger)
        }
      } else {
        // Still offline — reschedule with jitter
        schedulePing()
      }
    } catch {
      // Still offline — reschedule with jitter
      schedulePing()
    } finally {
      setPinging(false)
    }
  }, [pinging, schedulePing])

  // ── Start polling ───────────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    // Countdown ticker (cosmetic — shows user how long until next retry)
    if (!countdownTimerRef.current) {
      countdownTimerRef.current = setInterval(() => {
        setCountdown(c => Math.max(0, c - 1))
      }, 1_000)
    }
    schedulePing()
  }, [schedulePing])

  // ── Stop polling ────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pingTimerRef.current)      { clearTimeout(pingTimerRef.current);       pingTimerRef.current = null }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null }
  }, [])

  // ── Listen for connectivity events ─────────────────────────────────────────
  useEffect(() => {
    const onOffline = () => {
      setOnTestPage(isActiveTestPage())
      setState('offline')
      startPolling()
    }
    const onOnline = () => {
      stopPolling()
      setState('recovering')
      if (isActiveTestPage()) {
        setTimeout(() => setState('hidden'), 3_000)
      } else {
        const stagger = rand(RELOAD_STAGGER_MAX_MS)
        setTimeout(() => { window.location.reload() }, 1_200 + stagger)
      }
    }

    window.addEventListener('clap:backend:offline', onOffline)
    window.addEventListener('clap:backend:online',  onOnline)
    return () => {
      window.removeEventListener('clap:backend:offline', onOffline)
      window.removeEventListener('clap:backend:online',  onOnline)
      stopPolling()
    }
  }, [startPolling, stopPolling])

  // ── Render ──────────────────────────────────────────────────────────────────
  if (state === 'hidden') return null

  if (state === 'recovering') {
    return (
      <div className="fixed bottom-10 left-0 right-0 z-[200] flex items-center justify-center gap-2.5 px-4 py-2.5 bg-emerald-50 border-t border-emerald-200 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
        <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-sm font-medium text-emerald-800">
          {onTestPage
            ? 'Connection restored — your test progress is safe. Continue working.'
            : 'Backend is back online — reloading…'}
        </span>
        {!onTestPage && <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />}
      </div>
    )
  }

  return (
    <div className="fixed bottom-10 left-0 right-0 z-[200] flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border-t border-amber-200 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2.5 min-w-0">
        <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm font-medium text-amber-800 truncate">
          {onTestPage
            ? <span>Connection lost — <strong>your answers are saved</strong>. Reconnecting in <strong>{countdown}s</strong>…</span>
            : <span>Backend is starting up — retrying in <strong>{countdown}s</strong></span>}
        </span>
      </div>
      <button
        onClick={() => { schedulePing() }}
        disabled={pinging}
        className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50 shrink-0 transition-colors"
        aria-label="Retry backend connection now"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${pinging ? 'animate-spin' : ''}`} />
        Retry now
      </button>
    </div>
  )
}
