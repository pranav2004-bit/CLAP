import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'CLAP - Continuing Language Assessment Program',
  description: 'Comprehensive English language assessment platform evaluating Listening, Speaking, Reading, Writing, and Vocabulary & Grammar skills with AI-powered scoring.',
  keywords: ['English assessment', 'language test', 'CLAP', 'proficiency test', 'AI scoring'],
  authors: [{ name: 'CLAP Team' }],
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
        </AuthProvider>

        {/* Company Footer Branding */}
        <footer className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border py-2 px-6 text-xs text-muted-foreground z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex-1"></div> {/* Left spacer */}

            <div className="flex-1 flex justify-center items-center gap-1.5">
              <span>Product by</span>
              <span className="font-bold text-primary tracking-wide">SANJIVO</span>
            </div>

            <div className="flex-1 flex justify-end items-center gap-1.5 opacity-80">
              <span className="italic">Co-Powered by</span>
              <span className="font-semibold text-foreground/90">Aura-Tech-Vision</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
