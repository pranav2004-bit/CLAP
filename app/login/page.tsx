'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Users,
  Shield,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { signIn } from '@/lib/auth'
import { authStorage } from '@/lib/auth-storage'

type UserRole = 'student' | 'admin'

function LoginContent() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isBackLoading, setIsBackLoading] = useState(false)
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setAttemptsLeft(null)

    try {
      const { data, error: signInError } = await signIn(formData.identifier, formData.password, 'student')

      if (signInError) {
        setError(signInError.message || 'Invalid credentials')
        // Show remaining attempts only when it's a plain credential failure
        // (backend returns this field; lockout / disabled-account errors don't include it)
        if (typeof signInError.attempts_remaining === 'number' && signInError.attempts_remaining > 0) {
          setAttemptsLeft(signInError.attempts_remaining)
        } else {
          setAttemptsLeft(null)
        }
        setIsLoading(false)
        return
      }

      if (data?.user) {
        // Store user data (tab-isolated via sessionStorage)
        authStorage.set('user_id', data.user.id)
        authStorage.set('user_email', data.user.email)
        authStorage.set('user_role', data.user.user_metadata?.role || 'student')
        authStorage.set('user_name', data.user.user_metadata?.full_name || '')

        // Check if profile is completed
        const profileCompleted = data.user.user_metadata?.profile_completed || false

        // Redirect based on role and profile completion
        if (data.user.user_metadata?.role === 'admin') {
          router.push('/admin/dashboard')
        } else {
          if (profileCompleted) {
            router.push('/student/dashboard')
          } else {
            router.push('/student/profile')
          }
        }
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <>
    <style>{`@media (min-width: 1024px) { body { overflow: hidden; } }`}</style>
    <div className="min-h-dvh lg:h-dvh bg-background flex lg:overflow-hidden">
      {/* Left Panel - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{backgroundColor: 'hsl(12, 72%, 40%)'}}>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDF6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />

        <div className="relative z-10 flex flex-col justify-center px-12 py-12">
          {/* Institutional co-brand */}
          <div className="mb-10 flex items-center gap-3">
            <Image src="/images/anits-logo.png" alt="ANITS" width={48} height={48} className="h-12 w-auto object-contain flex-shrink-0" />
            <div className="w-px h-8 bg-primary-foreground/30" />
            <Link href="/" className="bg-white/95 rounded-lg px-2 py-1 inline-flex items-center">
              <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={120} height={48} className="h-10 w-auto object-contain" priority />
            </Link>
          </div>

          <h1 className="text-4xl font-bold text-primary-foreground mb-4">
            Welcome Back
          </h1>
          <p className="text-lg text-primary-foreground/80 mb-12 max-w-md">
            Continue your English language assessment journey with our comprehensive testing platform.
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-primary-foreground">5 Core Skills Assessment</h3>
                <p className="text-sm text-primary-foreground/70">Listening, Speaking, Reading, Writing, Verbal Ability</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-primary-foreground">AI-Powered Evaluation</h3>
                <p className="text-sm text-primary-foreground/70">Advanced LLM scoring for speaking and writing tasks</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-primary-foreground">Instant Results</h3>
                <p className="text-sm text-primary-foreground/70">Get detailed score card immediately after completion</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col relative bg-gray-50">
        {/* Back to Home - top anchored */}
        <div className="absolute top-6 left-6 lg:left-8 z-10">
          <button
            onClick={() => { if (isBackLoading) return; setIsBackLoading(true); router.push('/') }}
            disabled={isBackLoading}
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed border border-border rounded-lg px-4 py-2 hover:bg-secondary bg-white"
          >
            {isBackLoading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <ArrowLeft className="w-4 h-4 mr-2" />}
            Back to Home
          </button>
        </div>

        {/* Centered form */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-20 pb-8 sm:py-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo — ANITS + CLAP co-brand */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <Image src="/images/anits-logo.png" alt="ANITS" width={40} height={40} className="h-10 w-auto object-contain flex-shrink-0" />
            <div className="w-px h-7 bg-border" />
            <Link href="/" className="inline-block">
              <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={120} height={48} className="w-auto h-9 object-contain" priority />
            </Link>
          </div>

          <Card className="border-border shadow-soft">
            <CardHeader className="space-y-1 pb-6">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors border-0 px-3 py-1">
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  Student Portal
                </Badge>
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Sign In</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Enter your credentials provided by your institution
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {error}
                    {attemptsLeft !== null && (
                      <span className="block mt-1 font-semibold">
                        {attemptsLeft === 1
                          ? '1 attempt left before your account is temporarily locked.'
                          : `${attemptsLeft} attempts left.`}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">
                    Student ID
                  </Label>
                  <Input
                    id="identifier"
                    name="identifier"
                    type={'text'}
                    placeholder={'Enter your Roll number'}
                    value={formData.identifier}
                    onChange={handleInputChange}
                    required
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      className="h-12 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 md:h-14 mt-6 text-base font-medium bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200"
                  variant="default"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
