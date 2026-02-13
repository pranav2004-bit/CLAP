'use client'

import { useEffect } from 'react'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'

interface TestIdleTimeoutProps {
  onAutoSubmit: () => void
  timeoutMinutes?: number
  showWarning?: boolean
}

export function TestIdleTimeout({
  onAutoSubmit,
  timeoutMinutes = 30,
  showWarning = true
}: TestIdleTimeoutProps) {
  const {
    timeRemaining,
    isWarning,
    formattedTime,
    progressPercentage,
    startTimeout,
    pauseTimeout
  } = useIdleTimeout({
    timeoutMinutes,
    onTimeout: onAutoSubmit,
    onWarning: (remainingSeconds) => {
      if (showWarning) {
        // Could trigger a toast notification here
        console.log(`Warning: ${Math.ceil(remainingSeconds / 60)} minutes remaining`)
      }
    }
  })

  // Start the timeout when component mounts
  useEffect(() => {
    startTimeout()
    return () => pauseTimeout()
  }, [])

  if (!showWarning || !isWarning) return null

  return (
    <div className="fixed top-4 right-4 z-50 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded-lg shadow-lg max-w-sm">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
        <div>
          <p className="font-medium">Idle Warning</p>
          <p className="text-sm">Test will auto-submit in {formattedTime}</p>
        </div>
      </div>
      <div className="mt-2 w-full bg-yellow-200 rounded-full h-2">
        <div 
          className="bg-yellow-500 h-2 rounded-full transition-all duration-1000"
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>
    </div>
  )
}