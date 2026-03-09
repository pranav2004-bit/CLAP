/**
 * auth-storage.ts
 *
 * Tab-isolated storage for authentication state.
 *
 * WHY sessionStorage instead of localStorage?
 * localStorage is shared across every tab on the same origin.  If an admin logs
 * in on Tab 2, their token overwrites the student token from Tab 1 — causing
 * immediate "session expired" errors on Tab 1.
 *
 * sessionStorage is tab-specific: each tab has its own independent copy, so an
 * admin tab and a student tab can coexist in the same browser without any
 * token conflicts.
 *
 * All auth-related reads and writes in the app must go through this module.
 * Do NOT call sessionStorage / localStorage directly for auth keys elsewhere.
 */

const AUTH_KEYS = [
  'access_token',
  'token_expires_at',
  'user_id',
  'user_email',
  'user_role',
  'user_name',
] as const

export type AuthKey = (typeof AUTH_KEYS)[number]

const isClient = typeof window !== 'undefined'

export const authStorage = {
  get(key: AuthKey): string | null {
    if (!isClient) return null
    return sessionStorage.getItem(key)
  },

  set(key: AuthKey, value: string): void {
    if (!isClient) return
    sessionStorage.setItem(key, value)
  },

  remove(key: AuthKey): void {
    if (!isClient) return
    sessionStorage.removeItem(key)
  },

  /** Wipes all auth keys from this tab's session. */
  clear(): void {
    if (!isClient) return
    AUTH_KEYS.forEach((key) => sessionStorage.removeItem(key))
  },
}
