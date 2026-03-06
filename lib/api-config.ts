// API Configuration
// Central configuration for API base URL

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
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
        return { 'Authorization': `Bearer ${accessToken}` }
    }
    // Fallback to x-user-id for backward compatibility during migration
    const userId = localStorage.getItem('user_id')
    return userId ? { 'x-user-id': userId } : {}
}

/**
 * Handle a 401 Unauthorized response from the API.
 * Clears auth state and redirects to the appropriate login page.
 * Call this whenever an API response returns status 401.
 *
 * Usage:
 *   const res = await fetch(...)
 *   if (res.status === 401) { handle401(); return; }
 */
export const handle401 = () => {
    if (typeof window === 'undefined') return
    const role = localStorage.getItem('user_role')
    // Clear all auth tokens — the session has expired
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_role')
    localStorage.removeItem('user_name')
    // Redirect to the correct login page
    const loginPath = role === 'admin' ? '/admin-login' : '/login'
    window.location.href = `${loginPath}?reason=session_expired`
}

/**
 * Drop-in replacement for fetch() for all CLAP API calls.
 * Automatically calls handle401() when the server returns 401,
 * clearing auth state and redirecting to the login page instantly.
 *
 * Usage (identical to fetch):
 *   const res = await apiFetch(getApiUrl('admin/...'), { headers: getAuthHeaders() })
 */
export const apiFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    const res = await fetch(url, options)
    if (res.status === 401) handle401()
    return res
}
