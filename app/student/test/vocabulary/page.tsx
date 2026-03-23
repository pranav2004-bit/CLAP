'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookA, Clock, ChevronRight, ChevronLeft, Flag, CheckCircle, HelpCircle } from 'lucide-react'

type Question = {
  id: number
  type: 'mcq' | 'fill_blank'
  question: string
  options?: string[]
  correctAnswer: string | number
  blank?: string
}

const vocabularyQuestions: Question[] = [
  {
    id: 1,
    type: 'mcq',
    question: "Choose the word that best completes the sentence: The scientist's ___ discovery changed our understanding of the universe.",
    options: ['mundane', 'groundbreaking', 'trivial', 'ordinary'],
    correctAnswer: 1
  },
  {
    id: 2,
    type: 'fill_blank',
    question: "Complete the sentence with the correct form of the word in brackets:",
    blank: "The company's profits have increased ___ (significant) over the past year.",
    correctAnswer: 'significantly'
  },
  {
    id: 3,
    type: 'mcq',
    question: "Which word is a synonym for 'ubiquitous'?",
    options: ['rare', 'omnipresent', 'unique', 'scarce'],
    correctAnswer: 1
  },
  {
    id: 4,
    type: 'fill_blank',
    question: "Fill in the blank with the appropriate word:",
    blank: "Despite the ___ weather, the outdoor concert was a huge success. (adverse/averse)",
    correctAnswer: 'adverse'
  },
  {
    id: 5,
    type: 'mcq',
    question: "Select the correct meaning of 'ephemeral':",
    options: [
      'Long-lasting and permanent',
      'Short-lived or temporary',
      'Extremely valuable',
      'Easily forgotten'
    ],
    correctAnswer: 1
  },
  {
    id: 6,
    type: 'fill_blank',
    question: "Complete with the correct preposition:",
    blank: "She has a talent ___ languages and can speak five fluently.",
    correctAnswer: 'for'
  },
  {
    id: 7,
    type: 'mcq',
    question: "Which sentence uses 'affect' correctly?",
    options: [
      'The new policy will have a positive affect on sales.',
      'How did the news affect your decision?',
      'We need to affect these changes immediately.',
      'The affect of climate change is visible.'
    ],
    correctAnswer: 1
  },
  {
    id: 8,
    type: 'fill_blank',
    question: "Choose the correct word:",
    blank: "The professor's lecture was so ___ that many students fell asleep. (bored/boring)",
    correctAnswer: 'boring'
  },
  {
    id: 9,
    type: 'mcq',
    question: "What does 'pragmatic' mean?",
    options: [
      'Idealistic and visionary',
      'Practical and realistic',
      'Pessimistic and negative',
      'Artistic and creative'
    ],
    correctAnswer: 1
  },
  {
    id: 10,
    type: 'fill_blank',
    question: "Fill in with the correct verb form:",
    blank: "By next month, they ___ (complete) the construction of the new building.",
    correctAnswer: 'will have completed'
  }
]

export default function VocabularyTestPage() {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<{ [key: number]: string | number }>({})
  const [flagged, setFlagged] = useState<Set<number>>(new Set())
  const [timeLeft, setTimeLeft] = useState(20 * 60) // 20 minutes
  const [fillBlankInputs, setFillBlankInputs] = useState<{ [key: number]: string }>({})
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const selectMCQAnswer = (questionIndex: number, optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: optionIndex }))
  }

  const handleFillBlankChange = (questionIndex: number, value: string) => {
    setFillBlankInputs(prev => ({ ...prev, [questionIndex]: value }))
    if (value.trim()) {
      setAnswers(prev => ({ ...prev, [questionIndex]: value.trim() }))
    } else {
      setAnswers(prev => {
        const updated = { ...prev }
        delete updated[questionIndex]
        return updated
      })
    }
  }

  const toggleFlag = (index: number) => {
    setFlagged(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const question = vocabularyQuestions[currentQuestion]
  const answeredCount = Object.keys(answers).length
  const isTimeWarning = timeLeft < 180

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-sky-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-6 py-4 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <BookA className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Verbal Ability Test</h1>
              <p className="text-indigo-100 text-sm">Question {currentQuestion + 1} of {vocabularyQuestions.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${isTimeWarning ? 'bg-red-500 animate-pulse' : 'bg-white/20'}`}>
              <Clock className="w-4 h-4" />
              <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
            </div>
            <div className="bg-white/20 px-4 py-2 rounded-lg">
              <span className="text-sm">{answeredCount}/{vocabularyQuestions.length} answered</span>
            </div>
            <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
              Submit Test
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {/* Question Navigation */}
        <div className="flex gap-2 mb-6 justify-center flex-wrap">
          {vocabularyQuestions.map((q, index) => (
            <button
              key={index}
              onClick={() => setCurrentQuestion(index)}
              className={`w-10 h-10 rounded-lg font-medium transition-all relative ${
                index === currentQuestion
                  ? 'bg-indigo-600 text-white scale-110'
                  : answers[index] !== undefined
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-white text-gray-600 hover:bg-indigo-50'
              }`}
            >
              {index + 1}
              {flagged.has(index) && (
                <Flag className="w-3 h-3 absolute -top-1 -right-1 text-orange-500 fill-orange-500" />
              )}
              {q.type === 'fill_blank' && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-purple-500" />
              )}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mb-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-indigo-100" />
            <span>Answered</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-white border" />
            <span>Unanswered</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span>Fill-in-blank</span>
          </div>
        </div>

        {/* Question Card */}
        <Card className="shadow-xl border-0">
          <CardHeader className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {question.type === 'mcq' ? (
                  <HelpCircle className="w-5 h-5" />
                ) : (
                  <BookA className="w-5 h-5" />
                )}
                Question {currentQuestion + 1}
                <span className="text-sm font-normal bg-white/20 px-2 py-1 rounded ml-2">
                  {question.type === 'mcq' ? 'Multiple Choice' : 'Fill in the Blank'}
                </span>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleFlag(currentQuestion)}
                className={`text-white hover:bg-white/20 ${flagged.has(currentQuestion) ? 'bg-white/20' : ''}`}
              >
                <Flag className={`w-4 h-4 mr-2 ${flagged.has(currentQuestion) ? 'fill-white' : ''}`} />
                {flagged.has(currentQuestion) ? 'Flagged' : 'Flag'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {/* Question Text */}
            <p className="text-lg font-medium text-gray-800 mb-6">{question.question}</p>

            {/* MCQ Options */}
            {question.type === 'mcq' && question.options && (
              <div className="space-y-3">
                {question.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => selectMCQAnswer(currentQuestion, index)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      answers[currentQuestion] === index
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                        answers[currentQuestion] === index
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span>{option}</span>
                      {answers[currentQuestion] === index && (
                        <CheckCircle className="w-5 h-5 text-indigo-500 ml-auto" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Fill in the Blank */}
            {question.type === 'fill_blank' && question.blank && (
              <div className="space-y-6">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
                  <p className="text-lg text-gray-800 leading-relaxed">{question.blank}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Answer:
                  </label>
                  <input
                    type="text"
                    value={fillBlankInputs[currentQuestion] || ''}
                    onChange={(e) => handleFillBlankChange(currentQuestion, e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-lg"
                  />
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                disabled={currentQuestion === 0}
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Previous
              </Button>
              {currentQuestion === vocabularyQuestions.length - 1 ? (
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-8">
                  Review Answers
                </Button>
              ) : (
                <Button
                  onClick={() => setCurrentQuestion(currentQuestion + 1)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Next
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress Summary */}
        <div className="mt-6 bg-white rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Progress:</span>
            <span className="font-medium text-indigo-600">{answeredCount} of {vocabularyQuestions.length} questions answered</span>
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 transition-all"
              style={{ width: `${(answeredCount / vocabularyQuestions.length) * 100}%` }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
