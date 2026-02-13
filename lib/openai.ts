// OpenAI Client Configuration
import OpenAI from 'openai'
import { SPEAKING_EVALUATION_PROMPT, SPEAKING_USER_PROMPT_TEMPLATE } from './prompts/speaking-evaluation'
import { WRITING_EVALUATION_PROMPT, WRITING_USER_PROMPT_TEMPLATE } from './prompts/writing-evaluation'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Types for evaluation responses
export interface EvaluationResponse {
  score: number
  maxScore: number
  feedback: string
  breakdown: {
    [key: string]: {
      score: number
      maxScore: number
      feedback: string
    }
  }
}

export interface SpeakingEvaluation extends EvaluationResponse {
  breakdown: {
    fluency: { score: number; maxScore: number; feedback: string }
    pronunciation: { score: number; maxScore: number; feedback: string }
    vocabulary: { score: number; maxScore: number; feedback: string }
    grammar: { score: number; maxScore: number; feedback: string }
  }
}

export interface WritingEvaluation extends EvaluationResponse {
  breakdown: {
    taskAchievement: { score: number; maxScore: number; feedback: string }
    coherence: { score: number; maxScore: number; feedback: string }
    vocabulary: { score: number; maxScore: number; feedback: string }
    grammar: { score: number; maxScore: number; feedback: string }
  }
}

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      console.warn(`API call failed, retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return withRetry(fn, retries - 1)
    }
    throw error
  }
}

// Speaking evaluation function
export async function evaluateSpeaking(transcript: string, prompt: string): Promise<SpeakingEvaluation> {
  const userPrompt = SPEAKING_USER_PROMPT_TEMPLATE
    .replace('{{prompt}}', prompt)
    .replace('{{transcript}}', transcript)

  return withRetry(async () => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: SPEAKING_EVALUATION_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const evaluation = JSON.parse(content) as SpeakingEvaluation
    
    // Calculate total score
    const totalScore = Object.values(evaluation.breakdown).reduce((sum, criterion) => sum + criterion.score, 0)
    
    return {
      ...evaluation,
      score: totalScore,
      maxScore: 10
    }
  })
}

// Writing evaluation function
export async function evaluateWriting(essay: string, prompt: string): Promise<WritingEvaluation> {
  const userPrompt = WRITING_USER_PROMPT_TEMPLATE
    .replace('{{prompt}}', prompt)
    .replace('{{essay}}', essay)

  return withRetry(async () => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: WRITING_EVALUATION_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const evaluation = JSON.parse(content) as WritingEvaluation
    
    // Calculate total score
    const totalScore = Object.values(evaluation.breakdown).reduce((sum, criterion) => sum + criterion.score, 0)
    
    return {
      ...evaluation,
      score: totalScore,
      maxScore: 10
    }
  })
}

// Audio transcription function using Whisper
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/mp3'): Promise<string> {
  return withRetry(async () => {
    const response = await openai.audio.transcriptions.create({
      file: new File([new Uint8Array(audioBuffer)], 'recording.mp3', { type: mimeType }),
      model: 'whisper-1',
      response_format: 'text'
    })

    return response as string
  })
}

export default openai