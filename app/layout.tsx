import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { BackendStatusBanner } from '@/components/ui/BackendStatusBanner'
import { PWAInstallPrompt } from '@/components/ui/PWAInstallPrompt'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// Explicit viewport — prevents mobile browsers from applying a desktop-width default,
// which causes the zoomed-out "enlarged" appearance on phones.
// maximumScale: 5 preserves accessibility zoom; the viewport width is still constrained.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',   // safe-area support for notched / island phones
}

export const metadata: Metadata = {
  title: 'CLAP - Continuing Language Assessment Program',
  description: 'Comprehensive English language assessment platform evaluating Listening, Speaking, Reading, Writing, and Verbal Ability skills with AI-powered scoring.',
  keywords: ['English assessment', 'language test', 'CLAP', 'proficiency test', 'AI scoring'],
  authors: [{ name: 'CLAP Team' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CLAP',
  },
  openGraph: {
    title: 'CLAP - Continuing Language Assessment Program',
    description: 'Comprehensive English language assessment platform with AI-powered scoring',
    type: 'website',
  },
  icons: {
    icon: '/images/clap-icon.png?v=new',
    shortcut: '/images/clap-icon.png?v=new',
    apple: '/images/clap-icon.png?v=new',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen pb-12`}>
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
          <BackendStatusBanner />
          <PWAInstallPrompt />
        </AuthProvider>

        {/* Company Footer Branding */}
        <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-border py-1.5 md:py-2 px-4 md:px-6 text-[10px] md:text-xs text-muted-foreground z-50 flex items-center">
          <div className="w-full max-w-7xl mx-auto flex items-center justify-center md:justify-between">
            <div className="hidden md:block flex-1"></div> {/* Left spacer for desktop symmetry */}

            <div className="flex justify-center items-center gap-2 flex-none md:flex-1 w-full md:w-auto">
              <span className="uppercase tracking-[0.15em] font-medium text-foreground opacity-70 text-[11px] md:text-[13px]">A</span>
              <span className="font-black text-primary tracking-[0.2em] text-[11px] md:text-[13px] uppercase antialiased">SANJIVO</span>
              <span className="tracking-[0.15em] font-medium text-foreground opacity-70 text-[11px] md:text-[13px]">Product</span>
            </div>

            <div className="hidden md:flex flex-1 justify-end items-center gap-1.5">
              <span className="italic font-medium text-foreground text-[11px] md:text-[13px]">Co-partnered by</span>
              <span className="font-black text-primary tracking-wide text-[11px] md:text-[13px]">AuraTech-Vision</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
