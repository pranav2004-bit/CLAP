'use client'

/**
 * useScreenWakeLock — Prevents the device screen from sleeping during an active test.
 *
 * Why this matters:
 *   - Students reading long passages stop interacting with their device for minutes.
 *   - Without a wake lock, the OS dims/turns off the screen after the system idle timeout
 *     (typically 30 seconds – 2 minutes on phones, 5–10 minutes on laptops).
 *   - On mobile (Android Chrome, Samsung Internet), a suspended tab throttles or pauses
 *     setInterval/setTimeout, causing the local countdown to drift until the next
 *     server poll corrects it.
 *   - A visible "screen off" mid-essay breaks student focus and wastes precious exam time.
 *
 * Implementation:
 *   - Uses the Screen Wake Lock API (navigator.wakeLock.request('screen')).
 *   - Supported: Chrome 84+, Edge 84+, Android Chrome, Samsung Internet.
 *   - Not supported: Safari / iOS (graceful no-op — no error thrown).
 *   - Wake lock is automatically released by the browser when the tab loses visibility
 *     (user switches app/tab). The hook re-acquires it when the tab becomes visible again.
 *   - Released immediately when `active` prop is set to false (test ends / auto-submits).
 *
 * Usage:
 *   useScreenWakeLock(true)   // in test page — keeps screen on while test is active
 *   useScreenWakeLock(false)  // released — after submit / auto-submit / time up
 */

import { useEffect, useRef } from 'react'

export function useScreenWakeLock(active: boolean): void {
    const wakeLockRef = useRef<WakeLockSentinel | null>(null)

    useEffect(() => {
        // Screen Wake Lock API availability check
        if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

        let isMounted = true

        const acquire = async () => {
            // Don't acquire if already held
            if (wakeLockRef.current !== null) return
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen')

                // Re-acquire on release (browser releases it automatically on tab hide)
                wakeLockRef.current.addEventListener('release', () => {
                    wakeLockRef.current = null
                })
            } catch (_err) {
                // Permission denied or not supported — silent no-op.
                // The server-authoritative timer and Celery Beat auto-submit are the
                // primary safety nets; wake lock is a UX enhancement, not a critical path.
                wakeLockRef.current = null
            }
        }

        // Re-acquire when page becomes visible again after tab switch / screen wake
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isMounted && active) {
                acquire()
            }
        }

        acquire()
        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            isMounted = false
            document.removeEventListener('visibilitychange', onVisibilityChange)
            // Release wake lock when test ends or component unmounts
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {/* ignore */})
                wakeLockRef.current = null
            }
        }
    }, [active])
}
