'use client'
import { useEffect, useRef, useCallback } from 'react'

interface AntiCheatOptions {
  onTabSwitch: (count: number) => void
  onFullscreenExit: () => void
  enabled?: boolean
}

export function useAntiCheat({ onTabSwitch, onFullscreenExit, enabled = true }: AntiCheatOptions) {
  const switchCount = useRef(0)
  const isFullscreen = useRef(false)

  // Tab visibility detection
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

  // Fullscreen change detection
  useEffect(() => {
    if (!enabled) return
    const handler = () => {
      const inFS = !!document.fullscreenElement
      if (isFullscreen.current && !inFS) onFullscreenExit()
      isFullscreen.current = inFS
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [enabled, onFullscreenExit])

  // Right-click, F12/DevTools keys, beforeunload
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
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      isFullscreen.current = true
    } catch {
      // iOS Safari does not support requestFullscreen — caller applies CSS simulation
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    try {
      await document.exitFullscreen()
    } catch {
      // Ignore if not in fullscreen
    }
    isFullscreen.current = false
  }, [])

  return { requestFullscreen, exitFullscreen, tabSwitchCount: switchCount }
}
