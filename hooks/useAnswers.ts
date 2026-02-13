'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { saveAnswer, saveMultipleAnswers, getAttemptAnswers, submitAnswers, clearAnswer } from '@/lib/api/answers'

interface UseAnswersProps {
  attemptId: string
  autoSaveInterval?: number // in milliseconds (default: 30 seconds)
}

interface AnswerState {
  [questionId: string]: {
    answer: string | number | string[]
    timestamp: string
    isSaving?: boolean
    isSaved?: boolean
    error?: string
  }
}

export function useAnswers({ attemptId, autoSaveInterval = 30000 }: UseAnswersProps) {
  const [answers, setAnswers] = useState<AnswerState>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Refs to track pending saves and prevent race conditions
  const pendingSaves = useRef<Set<string>>(new Set())
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const hasUnsavedChanges = useRef(false)

  // Load existing answers when attemptId changes
  useEffect(() => {
    if (!attemptId) return

    const loadAnswers = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const existingAnswers = await getAttemptAnswers(attemptId)
        const formattedAnswers: AnswerState = {}
        
        Object.entries(existingAnswers).forEach(([questionId, answerData]) => {
          formattedAnswers[questionId] = {
            answer: answerData.answer,
            timestamp: answerData.timestamp,
            isSaved: true
          }
        })
        
        setAnswers(formattedAnswers)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load answers')
        console.error('Error loading answers:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadAnswers()
  }, [attemptId])

  // Auto-save functionality
  useEffect(() => {
    if (!attemptId || autoSaveInterval <= 0) return

    const scheduleAutoSave = () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }

      autoSaveTimer.current = setTimeout(async () => {
        if (hasUnsavedChanges.current) {
          await triggerAutoSave()
        }
        scheduleAutoSave() // Schedule next auto-save
      }, autoSaveInterval)
    }

    if (hasUnsavedChanges.current) {
      scheduleAutoSave()
    }

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [attemptId, autoSaveInterval])

  // Trigger auto-save for all unsaved answers
  const triggerAutoSave = useCallback(async () => {
    const unsavedAnswers: Record<string, string | number | string[]> = {}
    
    Object.entries(answers).forEach(([questionId, answerState]) => {
      if (!answerState.isSaved && !pendingSaves.current.has(questionId)) {
        unsavedAnswers[questionId] = answerState.answer
        pendingSaves.current.add(questionId)
      }
    })

    if (Object.keys(unsavedAnswers).length === 0) {
      hasUnsavedChanges.current = false
      return
    }

    try {
      await saveMultipleAnswers(attemptId, unsavedAnswers)
      
      // Update state to mark answers as saved
      setAnswers(prev => {
        const updated = { ...prev }
        Object.keys(unsavedAnswers).forEach(questionId => {
          if (updated[questionId]) {
            updated[questionId] = {
              ...updated[questionId],
              isSaved: true,
              isSaving: false,
              error: undefined
            }
          }
        }
        )
        return updated
      })
      
      hasUnsavedChanges.current = false
    } catch (err) {
      // Update state to show error
      setAnswers(prev => {
        const updated = { ...prev }
        Object.keys(unsavedAnswers).forEach(questionId => {
          if (updated[questionId]) {
            updated[questionId] = {
              ...updated[questionId],
              isSaving: false,
              error: err instanceof Error ? err.message : 'Failed to save'
            }
          }
        })
        return updated
      })
    } finally {
      // Clear pending saves
      Object.keys(unsavedAnswers).forEach(questionId => {
        pendingSaves.current.delete(questionId)
      })
    }
  }, [answers, attemptId])

  // Save individual answer with optimistic update
  const saveSingleAnswer = useCallback(async (
    questionId: string, 
    answer: string | number | string[]
  ) => {
    // Optimistic update
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        answer,
        timestamp: new Date().toISOString(),
        isSaving: true,
        isSaved: false,
        error: undefined
      }
    }))

    hasUnsavedChanges.current = true
    pendingSaves.current.add(questionId)

    try {
      await saveAnswer(attemptId, questionId, answer)
      
      // Mark as saved
      setAnswers(prev => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          isSaving: false,
          isSaved: true,
          error: undefined
        }
      }))
    } catch (err) {
      // Show error
      setAnswers(prev => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          isSaving: false,
          isSaved: false,
          error: err instanceof Error ? err.message : 'Failed to save'
        }
      }))
    } finally {
      pendingSaves.current.delete(questionId)
    }
  }, [attemptId])

  // Clear answer
  const clearSingleAnswer = useCallback(async (questionId: string) => {
    try {
      await clearAnswer(attemptId, questionId)
      
      setAnswers(prev => {
        const updated = { ...prev }
        delete updated[questionId]
        return updated
      })
      
      hasUnsavedChanges.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear answer')
      console.error('Error clearing answer:', err)
    }
  }, [attemptId])

  // Submit all answers (final submission)
  const submitAllAnswers = useCallback(async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      
      // Trigger final auto-save for any remaining unsaved changes
      if (hasUnsavedChanges.current) {
        await triggerAutoSave()
      }
      
      // Submit the attempt
      await submitAnswers(attemptId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answers')
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }, [attemptId, triggerAutoSave])

  // Get answer for a specific question
  const getAnswer = useCallback((questionId: string) => {
    return answers[questionId]?.answer
  }, [answers])

  // Check if question has answer
  const hasAnswer = useCallback((questionId: string) => {
    return questionId in answers && answers[questionId].answer !== undefined
  }, [answers])

  // Get answer status
  const getAnswerStatus = useCallback((questionId: string) => {
    const answerState = answers[questionId]
    if (!answerState) return { hasAnswer: false }
    
    return {
      hasAnswer: answerState.answer !== undefined,
      isSaving: answerState.isSaving,
      isSaved: answerState.isSaved,
      error: answerState.error
    }
  }, [answers])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [])

  return {
    // State
    answers,
    isLoading,
    error,
    isSubmitting,
    
    // Actions
    saveAnswer: saveSingleAnswer,
    clearAnswer: clearSingleAnswer,
    submitAnswers: submitAllAnswers,
    triggerAutoSave,
    
    // Helpers
    getAnswer,
    hasAnswer,
    getAnswerStatus,
    
    // Derived state
    hasUnsavedChanges: hasUnsavedChanges.current,
    unsavedCount: Object.values(answers).filter(a => !a.isSaved).length
  }
}