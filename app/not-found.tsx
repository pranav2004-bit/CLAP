/**
 * app/not-found.tsx — Next.js global 404 page.
 *
 * Rendered when:
 *  - A route does not match any page in the app directory
 *  - notFound() is called explicitly from a Server Component
 *  - A user types a non-existent URL manually
 *
 * Kept as a pure Server Component (no 'use client') — no event handlers,
 * only <Link> navigation. This guarantees static generation succeeds on Vercel.
 */

import Link from 'next/link'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full text-center space-y-6">

                {/* Icon */}
                <div className="flex justify-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                        <FileQuestion className="w-8 h-8 text-blue-500" />
                    </div>
                </div>

                {/* Heading */}
                <div className="space-y-2">
                    <h1 className="text-4xl font-black text-gray-900">404</h1>
                    <h2 className="text-lg font-semibold text-gray-700">Page Not Found</h2>
                    <p className="text-sm text-gray-500">
                        The page you are looking for does not exist or has been moved.
                    </p>
                </div>

                {/* Actions — pure <Link> only, no onClick handlers */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        Go Home
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-200 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Go to Login
                    </Link>
                </div>

            </div>
        </div>
    )
}
