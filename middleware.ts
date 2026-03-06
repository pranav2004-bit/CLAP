import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // For now, we'll handle authentication in the client-side
  // The middleware will primarily handle routing logic
  const { pathname } = req.nextUrl

  // Define public paths that don't require authentication
  const publicPaths = ['/login', '/admin-login', '/', '/api']
  const isPublicPath = publicPaths.some(path =>
    pathname === path || pathname.startsWith(`${path}/`)
  )

  // Define admin-only paths
  const isAdminPath = pathname.startsWith('/admin')

  // For now, we'll handle authentication redirects in client components
  // This middleware focuses on basic routing protection

  // You can add more sophisticated logic here as needed

  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}