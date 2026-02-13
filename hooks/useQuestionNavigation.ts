'use client'

import { useState, useCallback } from 'react'

interface QuestionState {
  id: number
  answered: boolean
  flagged: boolean
}

interface UseQuestionNavigationProps {
  questionCount: number
  initialCurrentQuestion?: number
}

export function useQuestionNavigation({
  questionCount,
  initialCurrentQuestion = 0
}: UseQuestionNavigationProps) {
  const [currentQuestion, setCurrentQuestion] = useState(initialCurrentQuestion)
  const [questionStates, setQuestionStates] = useState<QuestionState[]>(
    Array.from({ length: questionCount }, (_, index) => ({
      id: index + 1,
      answered: false,
      flagged: false
    }))
  )

  // Get question status for navigation component
  const getQuestionStatus = useCallback(() => {
    return questionStates.map((question, index) => ({
      id: question.id,
      answered: question.answered,
      flagged: question.flagged,
      isCurrent: index === currentQuestion
    }))
  }, [questionStates, currentQuestion])

  // Navigate to specific question
  const goToQuestion = useCallback((questionId: number) => {
    const questionIndex = questionId - 1
    if (questionIndex >= 0 && questionIndex < questionCount) {
      setCurrentQuestion(questionIndex)
    }
  }, [questionCount])

  // Go to next question
  const goToNext = useCallback(() => {
    setCurrentQuestion(prev => Math.min(prev + 1, questionCount - 1))
  }, [questionCount])

  // Go to previous question
  const goToPrevious = useCallback(() => {
    setCurrentQuestion(prev => Math.max(prev - 1, 0))
  }, [])

  // Mark question as answered
  const markAnswered = useCallback((questionId: number) => {
    setQuestionStates(prev => 
      prev.map(question => 
        question.id === questionId 
          ? { ...question, answered: true }
          : question
      )
    )
  }, [])

  // Toggle flag status
  const toggleFlag = useCallback((questionId: number) => {
    setQuestionStates(prev => 
      prev.map(question => 
        question.id === questionId 
          ? { ...question, flagged: !question.flagged }
          : question
      )
    )
  }, [])

  // Update answer status (for when answers change)
  const updateAnswerStatus = useCallback((
    questionId: number, 
    isAnswered: boolean
  ) => {
    setQuestionStates(prev => 
      prev.map(question => 
        question.id === questionId 
          ? { ...question, answered: isAnswered }
          : question
      )
    )
  }, [])

  // Reset all question states
  const resetAll = useCallback(() => {
    setCurrentQuestion(0)
    setQuestionStates(prev => 
      prev.map(question => ({
        ...question,
        answered: false,
        flagged: false
      }))
    )
  }, [])

  // Get navigation statistics
  const getStats = useCallback(() => {
    const answered = questionStates.filter(q => q.answered).length
    const flagged = questionStates.filter(q => q.flagged).length
    const unanswered = questionCount - answered
    
    return {
      total: questionCount,
      answered,
      flagged,
      unanswered,
      currentIndex: currentQuestion,
      isFirst: currentQuestion === 0,
      isLast: currentQuestion === questionCount - 1
    }
  }, [questionStates, questionCount, currentQuestion])

  return {
    // State
    currentQuestion,
    questionStates,
    
    // Actions
    goToQuestion,
    goToNext,
    goToPrevious,
    markAnswered,
    toggleFlag,
    updateAnswerStatus,
    resetAll,
    
    // Helpers
    getQuestionStatus,
    getStats
  }
}