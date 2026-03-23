'use client'

/**
 * BackendStatusBanner
 *
 * Listens for 'clap:backend:offline' / 'clap:backend:online' CustomEvents
 * dispatched by markBackendOffline() / markBackendOnline() in lib/api-config.ts.
 *
 * When the backend is unreachable (ERR_EMPTY_RESPONSE, connection refused):
 *  • Shows a fixed amber bar above the footer
 *  • Auto-pings /api/health every 5 s
 *  • When backend responds → shows a green "Back online" flash → reloads page
 *    so all data is re-fetched cleanly without stale state
 *
 * When backend is online → renders nothing (zero DOM cost).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl } from '@/lib/api-config'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'

const PING_INTERVAL_MS = 5_000
const HEALTH_TIMEOUT_MS = 4_000

type BannerState = 'hidden' | 'offline' | 'recovering'

export function BackendStatusBanner() {
  const [state, setState]       = useState<BannerState>('hidden')
  const [countdown, setCountdown] = useState(PING_INTERVAL_MS / 1000)
  const [pinging, setPinging]   = useState(false)
  const pingTimerRef            = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Health ping ────────────────────────────────────────────────────────────
  const ping = useCallback(async () => {
    if (pinging) return
    setPinging(true)
    try {
      // AbortSignal.timeout is broadly supported; fall back gracefully if not
      const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(HEALTH_TIMEOUT_MS)
        : undefined
      const res = await fetch(getApiUrl('health'), { signal })
      if (res.ok || res.status < 500) {
        // Backend is back — show brief green state then reload
        setState('recovering')
        setTimeout(() => { window.location.reload() }, 1_200)
      }
    } catch {
      // Still offline — reset countdown
      setCountdown(PING_INTERVAL_MS / 1000)
    } finally {
      setPinging(false)
    }
  }, [pinging])

  // ── Start/stop auto-ping interval ─────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pingTimerRef.current) return
    setCountdown(PING_INTERVAL_MS / 1000)

    // Countdown ticker
    countdownTimerRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1))
    }, 1_000)

    // Ping interval
    pingTimerRef.current = setInterval(() => {
      ping()
      setCountdown(PING_INTERVAL_MS / 1000)
    }, PING_INTERVAL_MS)
  }, [ping])

  const stopPolling = useCallback(() => {
    if (pingTimerRef.current)     { clearInterval(pingTimerRef.current);     pingTimerRef.current = null }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null }
  }, [])

  // ── Listen for connectivity events ────────────────────────────────────────
  useEffect(() => {
    const onOffline = () => {
      setState('offline')
      startPolling()
    }
    const onOnline = () => {
      stopPolling()
      setState('recovering')
      setTimeout(() => { window.location.reload() }, 1_200)
    }

    window.addEventListener('clap:backend:offline', onOffline)
    window.addEventListener('clap:backend:online',  onOnline)
    return () => {
      window.removeEventListener('clap:backend:offline', onOffline)
      window.removeEventListener('clap:backend:online',  onOnline)
      stopPolling()
    }
  }, [startPolling, stopPolling])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (state === 'hidden') return null

  if (state === 'recovering') {
    return (
      <div className="fixed bottom-10 left-0 right-0 z-[200] flex items-center justify-center gap-2.5 px-4 py-2.5 bg-emerald-50 border-t border-emerald-200 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
        <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-sm font-medium text-emerald-800">
          Backend is back online — reloading…
        </span>
        <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed bottom-10 left-0 right-0 z-[200] flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border-t border-amber-200 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2.5 min-w-0">
        <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm font-medium text-amber-800 truncate">
          Backend is starting up — retrying in <strong>{countdown}s</strong>
        </span>
      </div>
      <button
        onClick={() => { setCountdown(PING_INTERVAL_MS / 1000); ping() }}
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
