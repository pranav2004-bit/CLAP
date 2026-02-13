'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  GraduationCap, 
  Users, 
  Shield, 
  Eye, 
  EyeOff,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { signIn } from '@/lib/supabase'

type UserRole = 'student' | 'admin'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialRole = (searchParams.get('role') as UserRole) || 'student'
  
  const [role, setRole] = useState<UserRole>('student')
  
  // Force initial role from URL params
  useEffect(() => {
    const urlRole = searchParams.get('role') as UserRole;
    if (urlRole === 'admin' || urlRole === 'student') {
      setRole(urlRole);
    }
  }, [searchParams]);
  
  // Debug logging
  console.log('Current role:', role);
  console.log('Initial role:', initialRole);
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
      // For student login, we need to get the actual email from username
      let email = formData.identifier
      
      if (role === 'student') {
        // In a real app, you'd look up the email by username
        // For now, we'll assume username is the email
        email = formData.identifier
      }
      
      const { data, error: signInError } = await signIn(email, formData.password, role)
      
      if (signInError) {
        setError(signInError.message || 'Invalid credentials')
        setIsLoading(false)
        return
      }
      
      if (data?.user) {
        // Store user data
        localStorage.setItem('user_id', data.user.id)
        localStorage.setItem('user_email', data.user.email)
        localStorage.setItem('user_role', data.user.user_metadata?.role || 'student')
        localStorage.setItem('user_name', data.user.user_metadata?.full_name || '')
        
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
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-speaking relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDF6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
        
        <div className="relative z-10 flex flex-col justify-center px-12 py-16">
          <Link href="/" className="flex items-center gap-2 mb-12">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <span className="text-2xl font-bold text-primary-foreground">CLAP</span>
              <div className="text-xs text-primary-foreground/70 mt-1">by SANJIVO</div>
            </div>
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
                <p className="text-sm text-primary-foreground/70">Listening, Speaking, Reading, Writing, Vocabulary & Grammar</p>
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
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          {/* Role Selector */}
          <div className="flex gap-2 mb-8 p-1 bg-secondary rounded-lg">
            <button
              onClick={() => {
                console.log('Student tab clicked');
                setRole('student');
                // Force re-render
                setTimeout(() => {
                  console.log('Role after timeout:', role);
                }, 100);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 ease-in-out ${
                role === 'student' 
                  ? 'bg-card text-foreground shadow-sm transform scale-105' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Users className="w-4 h-4" />
              Student
            </button>
            <button
              onClick={() => {
                console.log('Admin tab clicked');
                setRole('admin');
                // Force re-render
                setTimeout(() => {
                  console.log('Role after timeout:', role);
                }, 100);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 ease-in-out ${
                role === 'admin' 
                  ? 'bg-card text-foreground shadow-sm transform scale-105' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="space-y-1 pb-6">
              <div className="flex items-center gap-2 mb-2">
                {role === 'student' ? (
                  <Badge variant="default" className="bg-primary/10 text-primary border-0">
                    <Users className="w-3 h-3 mr-1" />
                    Student Portal
                  </Badge>
                ) : (
                  <Badge variant="default" className="bg-speaking/10 text-speaking border-0">
                    <Shield className="w-3 h-3 mr-1" />
                    Admin Portal
                  </Badge>
                )}
              </div>
              <CardTitle className="text-2xl">Sign In</CardTitle>
              <CardDescription>
                {role === 'student' 
                  ? 'Enter your credentials provided by your institution'
                  : 'Access your admin dashboard to manage tests and students'
                }
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
                    {role === 'student' ? 'Username' : 'Email'}
                  </Label>
                  <Input
                    id="identifier"
                    name="identifier"
                    type={role === 'student' ? 'text' : 'email'}
                    placeholder={role === 'student' ? 'Enter your username' : 'admin@example.com'}
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
                  className="w-full h-12 mt-6" 
                  variant="hero"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              {role === 'admin' && (
                <p className="text-xs text-muted-foreground text-center mt-6">
                  Forgot your password? Contact your system administrator.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Demo credentials hint */}
          <div className="mt-6 p-4 rounded-lg bg-secondary/50 border border-border">
            <p className="text-xs text-muted-foreground text-center">
              <span className="font-medium">Demo:</span> Use any credentials to explore the dashboard
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
