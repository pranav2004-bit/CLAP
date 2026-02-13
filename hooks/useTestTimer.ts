'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseTestTimerProps {
  initialTime: number
  testName: string
  onTimeUp: () => void
}

interface TimerState {
  timeRemaining: number
  isRunning: boolean
  isPaused: boolean
  lastUpdate: number
}

export function useTestTimer({ initialTime, testName, onTimeUp }: UseTestTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime)
  const [isRunning, setIsRunning] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasTriggeredTimeUp = useRef(false)

  // Timer countdown logic
  useEffect(() => {
    if (isRunning && !isPaused && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current as NodeJS.Timeout)
            if (!hasTriggeredTimeUp.current) {
              hasTriggeredTimeUp.current = true
              onTimeUp()
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning, isPaused, timeRemaining, onTimeUp])

  // Persist timer state
  useEffect(() => {
    const timerState: TimerState = {
      timeRemaining,
      isRunning,
      isPaused,
      lastUpdate: Date.now()
    }
    localStorage.setItem(`testTimer_${testName}`, JSON.stringify(timerState))
  }, [timeRemaining, isRunning, isPaused, testName])

  // Restore timer state
  const restoreTimer = useCallback(() => {
    const savedState = localStorage.getItem(`testTimer_${testName}`)
    if (savedState) {
      try {
        const parsed: TimerState = JSON.parse(savedState)
        const timePassed = Math.floor((Date.now() - parsed.lastUpdate) / 1000)
        const newTimeRemaining = Math.max(0, parsed.timeRemaining - timePassed)
        
        setTimeRemaining(newTimeRemaining)
        setIsRunning(parsed.isRunning)
        setIsPaused(parsed.isPaused)
        
        // Trigger time up if time ran out while away
        if (newTimeRemaining <= 0 && parsed.isRunning && !parsed.isPaused && !hasTriggeredTimeUp.current) {
          hasTriggeredTimeUp.current = true
          onTimeUp()
        }
        
        return true
      } catch (e) {
        console.error('Failed to restore timer state:', e)
        return false
      }
    }
    return false
  }, [testName, onTimeUp])

  // Clear timer state
  const clearTimer = useCallback(() => {
    localStorage.removeItem(`testTimer_${testName}`)
    hasTriggeredTimeUp.current = false
  }, [testName])

  // Manual control functions
  const pauseTimer = useCallback(() => {
    setIsRunning(false)
    setIsPaused(true)
  }, [])

  const resumeTimer = useCallback(() => {
    setIsRunning(true)
    setIsPaused(false)
  }, [])

  const resetTimer = useCallback((newTime?: number) => {
    setTimeRemaining(newTime ?? initialTime)
    setIsRunning(true)
    setIsPaused(false)
    hasTriggeredTimeUp.current = false
    clearInterval(intervalRef.current as NodeJS.Timeout)
  }, [initialTime])

  // Check warning states
  const isCritical = timeRemaining <= 60 // 1 minute or less
  const isWarning = timeRemaining <= 300 && timeRemaining > 60 // 5 minutes or less but more than 1

  return {
    timeRemaining,
    isRunning,
    isPaused,
    isCritical,
    isWarning,
    setTimeRemaining,
    pauseTimer,
    resumeTimer,
    resetTimer,
    restoreTimer,
    clearTimer
  }
}