'use client'
import { useEffect, useRef, useCallback } from 'react'

interface AntiCheatOptions {
  onTabSwitch: (count: number) => void
  onFullscreenExit: () => void
  enabled?: boolean
}

export function useAntiCheat({ onTabSwitch, onFullscreenExit, enabled = true }: AntiCheatOptions) {
  const switchCount = useRef(0)

  // ── Initialise from the REAL browser state ─────────────────────────────────
  // Critical: when [type]/page mounts after the overview page already entered
  // fullscreen, this ref must be `true` immediately — not `false`. If it starts
  // as false, the guard `if (isFullscreen.current && !inFS)` never fires and the
  // popup is never shown when the student presses Escape.
  const isFullscreen = useRef(
    typeof document !== 'undefined'
      ? !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
      : false
  )

  // ── Tab visibility detection ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const handler = () => {
      if (document.hidden) {
        switchCount.current++
        onTabSwitch(switchCount.current)
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [enabled, onTabSwitch])

  // ── Fullscreen change detection ─────────────────────────────────────────────
  // NOTE: NOT gated by `enabled`. The listener must be active from the very
  // first render so that exits during the loading phase (before enabled flips
  // true) are still caught. Gating it caused the popup to silently miss exits
  // that happened while items were still being fetched.
  useEffect(() => {
    const handler = () => {
      const inFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
      if (isFullscreen.current && !inFS) onFullscreenExit()
      isFullscreen.current = inFS
    }
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)   // Safari
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [onFullscreenExit])

  // ── Right-click, F12/DevTools keys, beforeunload ────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const noCtx = (e: MouseEvent) => e.preventDefault()
    const noKey = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key))) {
        e.preventDefault()
      }
    }
    const noLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    document.addEventListener('contextmenu', noCtx)
    document.addEventListener('keydown', noKey)
    window.addEventListener('beforeunload', noLeave)
    return () => {
      document.removeEventListener('contextmenu', noCtx)
      document.removeEventListener('keydown', noKey)
      window.removeEventListener('beforeunload', noLeave)
    }
  }, [enabled])

  const requestFullscreen = useCallback(async () => {
    try {
      // If already in fullscreen (e.g. overview page requested it and we just
      // navigated here), skip the API call and sync the ref immediately so
      // the exit detection works straight away.
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        isFullscreen.current = true
        return
      }
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      isFullscreen.current = true
    } catch {
      // iOS Safari does not support requestFullscreen — caller applies CSS simulation.
      // Sync from actual browser state in case the element is still fullscreen
      // despite the exception (some browsers throw on already-fullscreen calls).
      isFullscreen.current = !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    try {
      if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen()   // Safari
      } else {
        await document.exitFullscreen()
      }
    } catch {
      // Ignore if not in fullscreen
    }
    isFullscreen.current = false
  }, [])

  return { requestFullscreen, exitFullscreen, tabSwitchCount: switchCount }
}
