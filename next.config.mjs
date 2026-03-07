/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
              // 'self' for same-origin API calls; http://localhost:8000 for local dev;
              // https: to allow production backend on any HTTPS domain
              "connect-src 'self' http://localhost:8000 https:",
              // blob: required for audio playback (MediaRecorder output)
              "media-src 'self' blob:",
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
