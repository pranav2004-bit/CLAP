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
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  })
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const { data, error: signInError } = await signIn(formData.identifier, formData.password, 'admin')

      if (signInError) {
        setError(signInError.message || 'Invalid credentials')
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
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDF6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />

        <div className="relative z-10 flex flex-col justify-center px-12 py-16">
          <Link href="/" className="block mb-12">
            <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={172} height={70} className="w-auto h-16 object-contain mb-2 brightness-0 invert" priority style={{ width: 'auto', height: 'auto' }} />
            <div className="text-sm text-primary-foreground/80 font-medium pl-1">A SANJIVO Product</div>
          </Link>

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
                <p className="text-sm text-primary-foreground/70">Get detailed score reports immediately after completion</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link href="/" className="inline-block">
              <Image src="/images/clap-logo.png?v=new" alt="CLAP Logo" width={140} height={56} className="w-auto h-10 sm:h-12 object-contain" priority style={{ width: 'auto', height: 'auto' }} />
            </Link>
          </div>

          <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <div className="flex gap-2 mb-8 p-1 bg-secondary rounded-lg">
            <div
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 ease-in-out bg-card text-foreground shadow-sm transform scale-105`}
            >
              <Shield className="w-4 h-4" />
              Admin Portal
            </div>
          </div>

          <Card className="border-border shadow-soft">
            <CardHeader className="space-y-1 pb-6">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="bg-speaking/10 text-speaking hover:bg-speaking/20 transition-colors border-0 px-3 py-1">
                  <Shield className="w-3.5 h-3.5 mr-1.5" />
                  Admin Portal
                </Badge>
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Sign In</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Access your admin dashboard to manage tests and students
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">
                    Email
                  </Label>
                  <Input
                    id="identifier"
                    name="identifier"
                    type={'email'}
                    placeholder={'admin@example.com'}
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

              <p className="text-xs text-muted-foreground text-center mt-6">
                Forgot your password? Contact your system administrator.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
