// Frontend utilities for AI evaluation
import { SpeakingEvaluation, WritingEvaluation } from '@/lib/openai'

export interface AIEvaluationResult {
  success: boolean
  transcript?: string
  evaluation?: SpeakingEvaluation | WritingEvaluation
  error?: string
}

// Submit speaking test for AI evaluation
export async function submitSpeakingForEvaluation(
  audioBlob: Blob,
  prompt: string,
  attemptId: string
): Promise<AIEvaluationResult> {
  try {
    const formData = new FormData()
    formData.append('audio', audioBlob, 'recording.mp3')
    formData.append('prompt', prompt)
    formData.append('attemptId', attemptId)

    const response = await fetch('/api/evaluate/speaking', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to evaluate speaking test'
      }
    }

    return {
      success: true,
      transcript: result.transcript,
      evaluation: result.evaluation as SpeakingEvaluation
    }
  } catch (error) {
    console.error('Speaking evaluation submission error:', error)
    return {
      success: false,
      error: 'Network error during evaluation submission'
    }
  }
}

// Submit writing test for AI evaluation
export async function submitWritingForEvaluation(
  essay: string,
  prompt: string,
  attemptId: string
): Promise<AIEvaluationResult> {
  try {
    const response = await fetch('/api/evaluate/writing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        essay,
        prompt,
        attemptId
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to evaluate writing test'
      }
    }

    return {
      success: true,
      evaluation: result.evaluation as WritingEvaluation
    }
  } catch (error) {
    console.error('Writing evaluation submission error:', error)
    return {
      success: false,
      error: 'Network error during evaluation submission'
    }
  }
}

// Format evaluation results for display
export function formatEvaluationFeedback(evaluation: SpeakingEvaluation | WritingEvaluation): string {
  let feedback = `**Overall Score: ${evaluation.score}/${evaluation.maxScore}**\n\n`
  
  feedback += '**Detailed Breakdown:**\n'
  
  Object.entries(evaluation.breakdown).forEach(([criterion, details]) => {
    const displayName = criterion
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
    
    feedback += `\n**${displayName}**: ${details.score}/${details.maxScore}\n`
    feedback += `${details.feedback}\n`
  })
  
  feedback += `\n**Overall Feedback**:\n${evaluation.feedback}`
  
  return feedback
}

// Get evaluation status for an attempt
export async function getEvaluationStatus(attemptId: string): Promise<{
  isEvaluated: boolean
  score?: number
  maxScore?: number
  aiEvaluation?: any
}> {
  try {
    // This would typically fetch from your API/database
    // For now, returning a mock response
    return {
      isEvaluated: false
    }
  } catch (error) {
    console.error('Error fetching evaluation status:', error)
    return {
      isEvaluated: false
    }
  }
}

// Poll for evaluation completion
export async function pollForEvaluation(
  attemptId: string,
  onProgress?: (progress: number) => void,
  interval: number = 5000,
  maxAttempts: number = 24 // 2 minutes max
): Promise<{
  isComplete: boolean
  evaluation?: SpeakingEvaluation | WritingEvaluation
  error?: string
}> {
  let attempts = 0
  
  return new Promise((resolve) => {
    const poll = async () => {
      attempts++
      
      if (onProgress) {
        onProgress(Math.min((attempts / maxAttempts) * 100, 100))
      }
      
      const status = await getEvaluationStatus(attemptId)
      
      if (status.isEvaluated) {
        resolve({
          isComplete: true,
          evaluation: status.aiEvaluation
        })
        return
      }
      
      if (attempts >= maxAttempts) {
        resolve({
          isComplete: false,
          error: 'Evaluation timed out. Please try again.'
        })
        return
      }
      
      setTimeout(poll, interval)
    }
    
    poll()
  })
}