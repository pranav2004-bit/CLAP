'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  User,
  Mail,
  Lock,
  Save,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  WifiOff
} from 'lucide-react'
import { getApiUrl, getAuthHeaders, apiFetch } from '@/lib/api-config'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

interface StudentProfile {
  id: string
  full_name: string
  email: string
  username: string | null
  student_id: string
  profile_completed: boolean
  is_active: boolean
}

export default function StudentProfilePage() {
  const router = useRouter()
  const isOnline = useNetworkStatus()  // H2: offline detection
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)  // H4: double-submit guard
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Profile form state
  const [formData, setFormData] = useState({
    username: '',
    email: ''
  })

  // Password change form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // Password visibility state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Fetch profile data — H1: AbortController cleanup
  useEffect(() => {
    const controller = new AbortController()

    const fetchProfile = async () => {
      try {
        setLoading(true)
        const userId = localStorage.getItem('user_id')

        if (!userId) {
          router.push('/login')
          return
        }

        const response = await apiFetch(getApiUrl('student/profile'), {
          headers: getAuthHeaders(),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return

        if (!response.ok) {
          throw new Error('Network response was not ok')
        }

        const data = await response.json()

        if (data.profile) {
          setProfile(data.profile)
          setFormData({
            username: data.profile.username || '',
            email: data.profile.email || ''
          })
        } else {
          setError(data.error || 'Failed to load profile')
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return  // H1: expected on unmount
        console.error('Error fetching profile:', err)
        setError('Failed to load profile. Please check your connection.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    fetchProfile()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.username.trim()) {
      setError('Username is required')
      return
    }

    if (!formData.email.trim()) {
      setError('Email is required')
      return
    }

    try {
      setSaving(true)
      const userId = localStorage.getItem('user_id')

      const response = await apiFetch(getApiUrl('student/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          email: formData.email.trim()
        })
      })

      const data = await response.json()

      if (data.profile) {
        setProfile(data.profile)
        setSuccess('Profile updated successfully!')

        // If profile was just completed, redirect to dashboard
        if (data.profile.profile_completed && !profile?.profile_completed) {
          setTimeout(() => {
            router.push('/student/dashboard')
          }, 1500)
        }
      } else {
        setError(data.error || 'Failed to update profile')
      }
    } catch (err) {
      setError('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!passwordData.currentPassword) {
      setPasswordError('Current password is required')
      return
    }

    if (!passwordData.newPassword) {
      setPasswordError('New password is required')
      return
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long')
      return
    }

    try {
      setPasswordSaving(true)  // H4: disable button during request
      const response = await apiFetch(getApiUrl('student/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      })

      const data = await response.json()

      if (data.user) {
        setPasswordSuccess('Password changed successfully!')
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
      } else {
        setPasswordError(data.error || 'Failed to change password')
      }
    } catch (err) {
      setPasswordError('Failed to change password')
    } finally {
      setPasswordSaving(false)  // H4: re-enable button
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        {/* M1: Skeleton loading state */}
        <div className="w-full max-w-2xl mx-auto px-4 animate-pulse">
          <div className="h-8 bg-blue-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-blue-100 rounded w-1/2 mb-8" />
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-xl border bg-white p-6">
              <div className="h-6 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
                <div className="h-10 bg-blue-200 rounded-lg mt-2" />
              </div>
            </div>
            <div className="rounded-xl border bg-white p-6">
              <div className="h-6 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
                <div className="h-10 bg-gray-200 rounded-lg mt-2" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Unable to load profile. Please try logging in again.
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => router.push('/login')}
              className="w-full mt-4"
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      {/* H2: Offline banner */}
      {!isOnline && (
        <div className="mb-0 bg-red-600 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2 -mt-8 mb-8">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          No internet connection — profile changes cannot be saved. Please reconnect.
        </div>
      )}
      <div className="container mx-auto px-4 max-w-4xl">
        {profile.profile_completed && (
          <Button
            variant="ghost"
            className="mb-6 pl-0 hover:bg-transparent hover:text-indigo-600 transition-colors"
            onClick={() => router.push('/student/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        )}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">My Profile</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">Complete your profile to access all features</p>
          </div>
          <Badge
            variant={profile.profile_completed ? "default" : "secondary"}
            className={profile.profile_completed ? "bg-green-100 text-green-800 whitespace-nowrap" : "bg-yellow-100 text-yellow-800 whitespace-nowrap"}
          >
            {profile.profile_completed ? (
              <>
                <CheckCircle className="w-4 h-4 mr-1" />
                Profile Complete
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 mr-1" />
                Profile Incomplete
              </>
            )}
          </Badge>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-8 md:grid-cols-2">
          {/* Profile Setup Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Setup
              </CardTitle>
              <p className="text-sm text-gray-600">
                Complete this section to unlock full access to the application
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="studentId">Student ID</Label>
                  <Input
                    id="studentId"
                    value={profile.student_id}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-500">This field is managed by admin</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">
                    Username <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Enter your username"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    This will appear on your report cards
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email Address <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => {
                        setFormData({ ...formData, email: e.target.value })
                        if (e.target.value) {
                          setError('Note: Your test reports will be sent to this email address. Please fill carefully.')
                          setTimeout(() => setError(''), 5000)
                        }
                      }}
                      placeholder="Enter your email address"
                      className="pl-10"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    This email will receive your report card soft copy after completing all 5 tests
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Profile
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Password Change Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Change Password
              </CardTitle>
              <p className="text-sm text-gray-600">
                Optional: Change your password at any time
              </p>
            </CardHeader>
            <CardContent>
              {passwordError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}

              {passwordSuccess && (
                <Alert className="mb-4 bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">{passwordSuccess}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      placeholder="Enter current password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform"
                      title={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? "🐵" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform"
                      title={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? "🐵" : "🙈"}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      placeholder="Confirm new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:scale-110 transition-transform"
                      title={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? "🐵" : "🙈"}
                    </button>
                  </div>
                </div>

                {/* H4: Disabled during request to prevent double-submit */}
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={passwordSaving}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {passwordSaving ? 'Changing…' : 'Change Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {!profile.profile_completed && (
          <Alert className="mt-8 bg-yellow-50 border-yellow-200">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              Please complete the Profile Setup section above to unlock full access to the application.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}