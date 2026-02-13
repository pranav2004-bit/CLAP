// Idle Timeout Hook for Automatic Test Submission
import { useState, useEffect, useRef } from 'react'

interface UseIdleTimeoutOptions {
  timeoutMinutes?: number
  onTimeout?: () => void
  onWarning?: (remainingSeconds: number) => void
  resetOnActivity?: boolean
}

export function useIdleTimeout({
  timeoutMinutes = 30,
  onTimeout,
  onWarning,
  resetOnActivity = true
}: UseIdleTimeoutOptions = {}) {
  const [isActive, setIsActive] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(timeoutMinutes * 60)
  const [isWarning, setIsWarning] = useState(false)
  
  const timeoutRef = useRef<NodeJS.Timeout>()
  const warningRef = useRef<NodeJS.Timeout>()
  const startTimeRef = useRef<number>(Date.now())

  // Convert minutes to seconds
  const timeoutSeconds = timeoutMinutes * 60
  const warningThreshold = 5 * 60 // 5 minutes warning

  // Activity detection
  useEffect(() => {
    if (!resetOnActivity) return

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    
    const resetTimer = () => {
      if (isActive) {
        resetTimeout()
      }
    }

    events.forEach(event => {
      document.addEventListener(event, resetTimer, true)
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true)
      })
    }
  }, [isActive, resetOnActivity])

  // Timer logic
  useEffect(() => {
    if (!isActive) return

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const remaining = Math.max(0, timeoutSeconds - elapsed)
      
      setTimeRemaining(remaining)
      
      // Check for warning threshold
      if (remaining <= warningThreshold && remaining > warningThreshold - 1 && !isWarning) {
        setIsWarning(true)
        onWarning?.(remaining)
      }
      
      // Check for timeout
      if (remaining <= 0) {
        handleTimeout()
      }
    }

    timeoutRef.current = setInterval(tick, 1000)
    
    return () => {
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current)
      }
    }
  }, [isActive, timeoutSeconds, warningThreshold, isWarning, onWarning])

  const resetTimeout = () => {
    startTimeRef.current = Date.now()
    setTimeRemaining(timeoutSeconds)
    setIsWarning(false)
    
    // Clear existing timers
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current)
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current)
    }
  }

  const startTimeout = () => {
    if (!isActive) {
      setIsActive(true)
      startTimeRef.current = Date.now()
      setIsWarning(false)
    }
  }

  const pauseTimeout = () => {
    setIsActive(false)
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current)
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current)
    }
  }

  const resumeTimeout = () => {
    if (!isActive) {
      setIsActive(true)
      // Don't reset the timer, just resume counting
    }
  }

  const handleTimeout = () => {
    setIsActive(false)
    setIsWarning(false)
    onTimeout?.()
    
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current)
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getProgressPercentage = (): number => {
    return ((timeoutSeconds - timeRemaining) / timeoutSeconds) * 100
  }

  return {
    isActive,
    timeRemaining,
    isWarning,
    formattedTime: formatTime(timeRemaining),
    progressPercentage: getProgressPercentage(),
    startTimeout,
    pauseTimeout,
    resumeTimeout,
    resetTimeout,
    handleTimeout
  }
}
