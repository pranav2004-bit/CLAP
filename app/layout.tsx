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
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen`}>
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AuthProvider>

        {/* Company Footer Branding */}
        <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-border py-2 px-4 text-center text-xs text-muted-foreground z-50">
          <div className="flex items-center justify-center gap-2">
            <span>Product developed by</span>
            <span className="font-semibold text-primary">SANJIVO</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
