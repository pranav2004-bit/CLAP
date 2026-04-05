'use client'

// Permanent redirect — /admin-login has been renamed to /super-admin
// This file handles any bookmarked or cached old URLs gracefully.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function AdminLoginRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/super-admin')
  }, [router])

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
    </div>
  )
}
