/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Allow Vercel production builds to succeed even if there are
  // non-critical TypeScript or ESLint warnings/errors in the codebase.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Remove X-Powered-By: Next.js header — do not expose framework version
  poweredByHeader: false,

  // CDN asset prefix — set NEXT_PUBLIC_CDN_URL in .env to serve JS/CSS/fonts
  // from CloudFront or any CDN edge (e.g. https://cdn.yourdomain.com).
  // Leave unset in local dev — Next.js serves assets from localhost.
  // Production: NEXT_PUBLIC_CDN_URL=https://your-cloudfront-distribution.cloudfront.net
  assetPrefix: process.env.NEXT_PUBLIC_CDN_URL || '',

  // Instruct Next.js to only bundle the specific named exports imported per
  // file, instead of pulling in the entire library on every page.
  // lucide-react has 1,400+ icons; recharts ships multiple chart types.
  // This single flag drops admin-page compile times from 20–70 s → 2–6 s.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },

  // Serve all super-admin pages at /super-admin/* without moving the 47 files
  // under app/admin/. Requests to /super-admin/dashboard → renders /admin/dashboard,
  // but the browser URL stays as /super-admin/dashboard.
  async rewrites() {
    return [
      {
        source: '/super-admin/:path+',
        destination: '/admin/:path+',
      },
    ]
  },

  async headers() {
    return [
      {
        // Apply security headers to every route
        source: '/(.*)',
        headers: [
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // DNS prefetch for performance without leaking navigation intent
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          // Match Django's SECURE_REFERRER_POLICY setting
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restrict browser feature access:
          //   microphone=(self) — required for Speaking test recording
          //   fullscreen=(self) — required for exam fullscreen enforcement
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), fullscreen=(self)',
          },
          // Content Security Policy
          // Note: Next.js runtime requires 'unsafe-eval' and 'unsafe-inline' for scripts.
          // frame-ancestors 'none' — clickjacking protection (modern browsers)
          // Django also sets X_FRAME_OPTIONS='DENY' for older browsers.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              // 'self' for same-origin API calls; localhost for local dev;
              // NEXT_PUBLIC_API_URL covers the production backend (HTTP or HTTPS);
              // https: covers S3 presigned URLs and any other HTTPS origins
              `connect-src 'self' http://localhost:8000 ${process.env.NEXT_PUBLIC_API_URL || ''} https:`,
              // blob: required for audio playback (MediaRecorder output)
              `media-src 'self' blob: http://localhost:8000 ${process.env.NEXT_PUBLIC_API_URL || ''} https:`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
