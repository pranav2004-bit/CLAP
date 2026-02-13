// Mock data for API routes until Supabase is implemented

export interface Test {
  id: string
  name: string
  type: 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary'
  duration_minutes: number
  total_questions: number
  instructions: string
  created_at: string
}

export interface Question {
  id: string
  test_id: string
  question_text: string
  question_type: 'mcq' | 'fill_blank' | 'essay' | 'audio_response'
  options?: string[]
  correct_answer: string
  audio_url?: string
  image_url?: string
  points: number
  order_index: number
  created_at: string
}

export interface TestAttempt {
  id: string
  user_id: string
  test_id: string
  started_at: string
  completed_at?: string
  score?: number
  max_score?: number
  status: 'in_progress' | 'completed' | 'abandoned'
  answers?: Record<string, any>
  created_at: string
  updated_at?: string
}

// Mock tests data
export const mockTests: Test[] = [
  {
    id: '1',
    name: 'Listening Test',
    type: 'listening',
    duration_minutes: 20,
    total_questions: 5,
    instructions: 'You will hear an audio recording. Each audio clip can be played a maximum of 2 times. Questions will appear at specific timestamps.',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    name: 'Speaking Test',
    type: 'speaking',
    duration_minutes: 15,
    total_questions: 3,
    instructions: 'Record your responses to the speaking prompts. Speak clearly and at a natural pace.',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '3',
    name: 'Reading Test',
    type: 'reading',
    duration_minutes: 30,
    total_questions: 6,
    instructions: 'Read the passage and answer the comprehension questions. The passage remains visible throughout the test.',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '4',
    name: 'Writing Test',
    type: 'writing',
    duration_minutes: 45,
    total_questions: 2,
    instructions: 'Write essays in response to the prompts. Your writing will be evaluated for grammar, vocabulary, and coherence.',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '5',
    name: 'Vocabulary & Grammar Test',
    type: 'vocabulary',
    duration_minutes: 25,
    total_questions: 8,
    instructions: 'Complete the fill-in-the-blank and multiple-choice questions testing vocabulary and grammar.',
    created_at: '2024-01-01T00:00:00Z'
  }
]

// Mock questions data
export const mockQuestions: Question[] = [
  // Listening test questions
  {
    id: '1',
    test_id: '1',
    question_text: "What is the main topic of the conversation?",
    question_type: 'mcq',
    options: [
      "A job interview discussion",
      "A university admission process",
      "A travel planning session",
      "A medical appointment"
    ],
    correct_answer: "A university admission process",
    points: 1,
    order_index: 1,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    test_id: '1',
    question_text: "According to the speaker, what is the most important quality for success?",
    question_type: 'mcq',
    options: [
      "Technical skills",
      "Communication ability",
      "Persistence and dedication",
      "Financial resources"
    ],
    correct_answer: "Persistence and dedication",
    points: 1,
    order_index: 2,
    created_at: '2024-01-01T00:00:00Z'
  },
  // Reading test questions (will be expanded later)
  {
    id: '3',
    test_id: '3',
    question_text: "What is the main theme of the passage?",
    question_type: 'mcq',
    options: [
      "Technology advancement",
      "Environmental conservation",
      "Educational reform",
      "Healthcare improvement"
    ],
    correct_answer: "Technology advancement",
    points: 1,
    order_index: 1,
    created_at: '2024-01-01T00:00:00Z'
  }
]

// Mock attempts data
export const mockAttempts: TestAttempt[] = [
  {
    id: '1',
    user_id: 'user-123',
    test_id: '1',
    started_at: '2024-01-15T10:00:00Z',
    completed_at: '2024-01-15T10:18:30Z',
    score: 4,
    max_score: 5,
    status: 'completed',
    answers: {
      '1': 1,
      '2': 2
    },
    created_at: '2024-01-15T10:00:00Z'
  }
]

// Helper functions
export function getTestById(id: string): Test | undefined {
  return mockTests.find(test => test.id === id)
}

export function getQuestionsByTestId(testId: string): Question[] {
  return mockQuestions.filter(question => question.test_id === testId)
}

export function getTestWithQuestions(id: string): { test: Test; questions: Question[] } | null {
  const test = getTestById(id)
  if (!test) return null
  
  const questions = getQuestionsByTestId(id)
  return { test, questions }
}

export function getAttemptById(id: string): TestAttempt | undefined {
  return mockAttempts.find(attempt => attempt.id === id)
}

export function getUserAttempts(userId: string): TestAttempt[] {
  return mockAttempts.filter(attempt => attempt.user_id === userId)
}