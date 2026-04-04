'use client'

/**
 * app/error.tsx — Next.js global error boundary (client component, required).
 *
 * Catches any unhandled runtime error that bubbles up from any page or layout
 * in the app tree. Without this file, Next.js shows a generic white screen with
 * no recovery path.
 *
 * Covers:
 *  - JavaScript runtime exceptions thrown inside React components
 *  - Unhandled promise rejections inside Server Components
 *  - Any error not caught by a local try/catch in a page
 *
 * Does NOT cover:
 *  - Network/fetch errors (handled by apiFetch + BackendStatusBanner)
 *  - 404s (handled by not-found.tsx)
 *  - Errors inside the root layout.tsx itself (needs a global-error.tsx)
 */

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log to console for debugging — in production pair with Sentry/CloudWatch
        console.error('[GlobalError]', error)
    }, [error])

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-lg border border-red-100 p-8 max-w-md w-full text-center space-y-6">

                {/* Icon */}
                <div className="flex justify-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                </div>

                {/* Heading */}
                <div className="space-y-2">
                    <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
                    <p className="text-sm text-gray-500">
                        An unexpected error occurred. Your progress has been saved — please try again.
                    </p>
                </div>

                {/* Error detail — only shown in dev, hidden in production */}
                {process.env.NODE_ENV === 'development' && error?.message && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-left">
                        <p className="text-xs font-mono text-red-700 break-words">{error.message}</p>
                        {error.digest && (
                            <p className="text-xs text-red-400 mt-1">Digest: {error.digest}</p>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </button>
                    <button
                        onClick={() => { window.location.href = '/' }}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-200 transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        Go Home
                    </button>
                </div>

            </div>
        </div>
    )
}
