'use client'

import { useState, useCallback } from 'react'

interface UseTestInstructionsProps {
  testType: string
  onComplete: () => void
}

export function useTestInstructions({
  testType,
  onComplete
}: UseTestInstructionsProps) {
  const [showInstructions, setShowInstructions] = useState(true)
  
  const handleStartTest = useCallback(() => {
    setShowInstructions(false)
    onComplete()
  }, [onComplete])
  
  const handleClose = useCallback(() => {
    setShowInstructions(false)
  }, [])
  
  return {
    showInstructions,
    handleStartTest,
    handleClose
  }
}