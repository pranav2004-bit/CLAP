// API Configuration
// Central configuration for API base URL, auth headers, and resilient fetch helpers.
import { authStorage } from '@/lib/auth-storage'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

export const getApiUrl = (endpoint: string) => {
    // Remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
    // Remove 'api/' prefix if present (since it's already in BASE_URL)
    const finalEndpoint = cleanEndpoint.startsWith('api/') ? cleanEndpoint.slice(4) : cleanEndpoint
    return `${API_BASE_URL}/${finalEndpoint}`
}

export const getAuthHeaders = (): Record<string, string> => {
    if (typeof window === 'undefined') return {}
    // Prefer JWT Bearer token (more secure — server validates signature)
    const accessToken = authStorage.get('access_token')
    if (accessToken) {
        return { 'Authorization': `Bearer ${accessToken}` }
    }
    // Fallback to x-user-id for backward compatibility during migration
    const userId = authStorage.get('user_id')
    return userId ? { 'x-user-id': userId } : {}
}

// ── Debounce guard ─────────────────────────────────────────────────────────────
// Prevents multiple simultaneous 401s (e.g. from background timer polls) from all
// triggering separate redirects and competing over localStorage cleanup.
let _redirecting = false

/**
 * Handle a 401 Unauthorized response that could NOT be recovered by token refresh.
 * Clears auth state and redirects to the appropriate login page exactly once,
 * even if called concurrently by multiple in-flight requests.
 */
export const handle401 = () => {
    if (typeof window === 'undefined') return
    if (_redirecting) return   // another 401 already triggered the redirect
    _redirecting = true

    const role = authStorage.get('user_role')
    // Clear all auth tokens — the session is truly expired
    authStorage.clear()

    const loginPath = role === 'admin' ? '/admin-login' : '/login'
    window.location.href = `${loginPath}?reason=session_expired`
}

// ── Token refresh ──────────────────────────────────────────────────────────────
// Deduplicates concurrent refresh attempts — only one HTTP call is made even if
// several requests all get 401 at the same time.
let _refreshPromise: Promise<boolean> | null = null

/**
 * Silently request a fresh access token from the backend using the current token
 * as proof of identity (no password required).  The backend allows a 30-minute
 * grace window past the token's `exp` claim, so brief server restarts or clock
 * drift never log the user out.
 *
 * Returns true if a new token was stored, false if the refresh was rejected
 * (token too old / account disabled) — caller should then call handle401().
 */
export const refreshAuthToken = async (): Promise<boolean> => {
    // If a refresh is already in-flight, wait for it instead of sending another
    if (_refreshPromise) return _refreshPromise

    _refreshPromise = (async () => {
        const token = authStorage.get('access_token')
        if (!token) return false

        try {
            const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            })
            if (!res.ok) return false

            const data = await res.json()
            if (data.access_token) {
                authStorage.set('access_token', data.access_token)
                if (data.expires_in) {
                    authStorage.set('token_expires_at', String(Date.now() + data.expires_in * 1000))
                }
                return true
            }
            return false
        } catch {
            return false  // network error — don't log out; let the next call retry
        } finally {
            _refreshPromise = null
        }
    })()

    return _refreshPromise
}

/**
 * apiFetch — drop-in replacement for fetch() for all foreground CLAP API calls.
 *
 * On a 401 response it automatically:
 *   1. Attempts a silent token refresh (POST /auth/refresh)
 *   2. Retries the original request once with the fresh token
 *   3. Only redirects to login if the retry also returns 401
 *
 * This means a transient server restart or an about-to-expire token will never
 * interrupt the user's session.
 */
export const apiFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    const res = await fetch(url, options)
    if (res.status !== 401) return res

    // ── 401 received — try to silently refresh ────────────────────────────────
    const refreshed = await refreshAuthToken()
    if (!refreshed) {
        handle401()
        return res
    }

    // Retry once with the new token
    const retryOptions: RequestInit = {
        ...options,
        headers: {
            ...options?.headers,
            ...getAuthHeaders(),   // picks up the freshly stored token
        },
    }
    const retryRes = await fetch(url, retryOptions)
    if (retryRes.status === 401) {
        // Refresh succeeded but the server still says 401 — account issue, log out
        handle401()
    }
    return retryRes
}

/**
 * silentFetch — like fetch() but NEVER redirects to login on 401.
 *
 * Use this for fire-and-forget / best-effort calls (malpractice events, analytics)
 * where a failure must never interrupt the user's active session.
 *
 * It still returns the Response so callers can check status if they care.
 */
export const silentFetch = (url: string, options?: RequestInit): Promise<Response> => {
    return fetch(url, options)
}
