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
    // Fallback to x-user-id for backward compatibility
    const userId = localStorage.getItem('user_id')
    return userId ? { 'x-user-id': userId } : {}
}
