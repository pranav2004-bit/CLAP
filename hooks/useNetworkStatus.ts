/**
 * useNetworkStatus
 *
 * Returns `true` when the browser has network connectivity and `false` when
 * the browser detects it is offline.  Uses the browser-native `online` and
 * `offline` window events which fire reliably on all modern desktop and mobile
 * browsers (including iOS Safari 14+).
 *
 * Note: `navigator.onLine` can be a false-positive — the browser may report
 * online even when the actual internet connection is broken (e.g. connected to
 * a router with no upstream).  This hook is intentionally optimistic: it only
 * shows the offline banner when the browser itself signals the disconnect,
 * which is the right UX trade-off for an assessment environment.
 */

'use client'

import { useState, useEffect } from 'react'

export function useNetworkStatus(): boolean {
    const [isOnline, setIsOnline] = useState<boolean>(
        // SSR-safe default: assume online on the server, read actual value on client
        typeof navigator !== 'undefined' ? navigator.onLine : true
    )

    useEffect(() => {
        const handleOnline  = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online',  handleOnline)
        window.addEventListener('offline', handleOffline)

        // Sync immediately in case the state changed between SSR and hydration
        setIsOnline(navigator.onLine)

        return () => {
            window.removeEventListener('online',  handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    return isOnline
}
