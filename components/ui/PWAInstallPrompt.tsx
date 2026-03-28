'use client'

/**
 * PWAInstallPrompt — shows a non-intrusive install banner on first visit
 * when the browser fires the `beforeinstallprompt` event (Chrome / Edge / Android).
 *
 * Behaviour:
 *  - Only shows if the app is NOT already running as a standalone PWA.
 *  - Only shows once per browser (dismissed state stored in localStorage).
 *  - Waits 4 seconds after mount so it doesn't interrupt the initial render.
 *  - Clicking "Install" triggers the native browser install flow.
 *  - Clicking "✕" or "Not now" dismisses and never shows again.
 */

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { X, Download } from 'lucide-react'

const STORAGE_KEY = 'clap_pwa_install_dismissed'

// The deferred prompt event type is not in the standard lib — define it here.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible]               = useState(false)
  const [installing, setInstalling]         = useState(false)

  useEffect(() => {
    // Don't show if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // Don't show if user already dismissed
    if (localStorage.getItem(STORAGE_KEY) === '1') return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Brief delay so the banner doesn't flash on every page load immediately
      setTimeout(() => setVisible(true), 4000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Also hide if user installs via browser chrome (not our prompt)
    const installedHandler = () => {
      setVisible(false)
      localStorage.setItem(STORAGE_KEY, '1')
    }
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem(STORAGE_KEY, '1')
    }
    setDeferredPrompt(null)
    setVisible(false)
    setInstalling(false)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }, [])

  if (!visible) return null

  return (
    // Positioned just above the fixed SANJIVO footer (footer is ~40px, prompt sits at bottom-14)
    <div
      className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2rem)] max-w-sm
                 bg-white border border-gray-200 rounded-2xl shadow-2xl
                 flex items-center gap-3 px-4 py-3 animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label="Install CLAP app"
    >
      {/* App icon */}
      <div className="shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-gray-100 shadow-sm">
        <Image
          src="/images/clap-icon.png"
          alt="CLAP"
          width={44}
          height={44}
          className="w-full h-full object-contain"
        />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 leading-tight">Install CLAP</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-tight truncate">
          Add to home screen for quick access
        </p>
      </div>

      {/* Install button */}
      <button
        onClick={handleInstall}
        disabled={installing}
        className="shrink-0 flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700
                   text-white text-xs font-semibold px-3 py-2 rounded-lg
                   transition-colors disabled:opacity-60"
      >
        <Download className="w-3.5 h-3.5" />
        {installing ? 'Installing…' : 'Install'}
      </button>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Dismiss install prompt"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
