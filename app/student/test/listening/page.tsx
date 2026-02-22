'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TestTimer } from '@/components/TestTimer'
import { QuestionNav } from '@/components/QuestionNav'
import { TestInstructions } from '@/components/TestInstructions'
import { LoadingSpinner, ErrorMessage } from '@/components/LoadingSpinner'
import { useQuestionNavigation } from '@/hooks/useQuestionNavigation'
import { useTestAttemptActions } from '@/hooks/useTestData'
import { useTestInstructions } from '@/hooks/useTestInstructions'
import { useAnswers } from '@/hooks/useAnswers'
import { AudioPlayer, formatAudioTime, generateConversationScript } from '@/lib/audio-utils'
import { 
  Headphones, 
  Play, 
  Pause, 
  RotateCcw,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Send,
  Volume2,
  Timer,
  X
} from 'lucide-react'

const mockQuestions = [
  // Audio Clip 1: University Admission Process (Questions 1-5)
  {
    id: 1,
    audioId: 1,
    timestamp: 0, // Start of audio clip 1
    question: "What is the main topic of the first conversation?",
    options: [
      "A job interview discussion",
      "A university admission process",
      "A travel planning session",
      "A medical appointment"
    ],
    correctAnswer: 1
  },
  {
    id: 2,
    audioId: 1,
    timestamp: 45000, // 45 seconds
    question: "According to the speaker in the first clip, what is the most important quality for success?",
    options: [
      "Technical skills",
      "Communication ability",
      "Persistence and dedication",
      "Financial resources"
    ],
    correctAnswer: 2
  },
  {
    id: 3,
    audioId: 1,
    timestamp: 90000, // 1:30 minutes
    question: "How long has the university program been running according to the first clip?",
    options: [
      "Five years",
      "Ten years",
      "Fifteen years",
      "Twenty years"
    ],
    correctAnswer: 1
  },
  {
    id: 4,
    audioId: 1,
    timestamp: 135000, // 2:15 minutes
    question: "What does the speaker recommend doing first in the application process from clip 1?",
    options: [
      "Submit an application",
      "Attend an orientation",
      "Complete the online assessment",
      "Schedule a consultation"
    ],
    correctAnswer: 0
  },
  {
    id: 5,
    audioId: 1,
    timestamp: 180000, // 3:00 minutes
    question: "When is the deadline mentioned in the first audio clip?",
    options: [
      "End of this week",
      "End of this month",
      "Next Monday",
      "In two weeks"
    ],
    correctAnswer: 1
  },
  // Audio Clip 2: Technology Conference Discussion (Questions 6-10)
  {
    id: 6,
    audioId: 2,
    timestamp: 0, // Start of audio clip 2
    question: "What is the main topic of the second conversation?",
    options: [
      "A product launch announcement",
      "A technology conference discussion",
      "A software development meeting",
      "A company merger negotiation"
    ],
    correctAnswer: 1
  },
  {
    id: 7,
    audioId: 2,
    timestamp: 30000, // 30 seconds
    question: "According to the speakers in the second clip, what is the biggest challenge facing AI development?",
    options: [
      "Computational power limitations",
      "Ethical considerations and regulation",
      "Lack of funding",
      "Insufficient data"
    ],
    correctAnswer: 1
  },
  {
    id: 8,
    audioId: 2,
    timestamp: 75000, // 1:15 minutes
    question: "What industry application is mentioned as benefiting most from AI in the second clip?",
    options: [
      "Entertainment and gaming",
      "Healthcare and medicine",
      "Retail and e-commerce",
      "Transportation and logistics"
    ],
    correctAnswer: 1
  },
  {
    id: 9,
    audioId: 2,
    timestamp: 120000, // 2:00 minutes
    question: "What timeframe do the speakers mention for widespread AI adoption in clip 2?",
    options: [
      "Within 2 years",
      "Within 5 years",
      "Within 10 years",
      "It's unpredictable"
    ],
    correctAnswer: 2
  },
  {
    id: 10,
    audioId: 2,
    timestamp: 165000, // 2:45 minutes
    question: "What skill do the speakers emphasize as most important for future tech professionals in clip 2?",
    options: [
      "Programming languages",
      "Data analysis",
      "Adaptability and continuous learning",
      "Project management"
    ],
    correctAnswer: 2
  }
]

// Audio durations for both clips
const AUDIO_DURATIONS = {
  1: 225000, // 3:45 minutes for first clip (university admission)
  2: 210000  // 3:30 minutes for second clip (technology discussion)
};
const TOTAL_TEST_DURATION = 450000; // Combined duration: 7:30 minutes
const MAX_PLAYS = 2;

export default function ListeningTestPage() {
  const router = useRouter()
  
  // Test data fetching
  const [testData, setTestData] = useState<any>(null)
  const [questionsData, setQuestionsData] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  
  // Test attempt actions
  const { createAttempt, updateAttempt } = useTestAttemptActions()
  
  // Current attempt state
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null)
  
  // Answer management
  const {
    answers: savedAnswers,
    isLoading: isAnswersLoading,
    error: answersError,
    saveAnswer,
    submitAnswers,
    getAnswer,
    hasAnswer,
    getAnswerStatus
  } = useAnswers({
    attemptId: currentAttemptId || '',
    autoSaveInterval: 30000 // Auto-save every 30 seconds
  })
  
  // Test instructions hook
  const {
    showInstructions,
    handleStartTest,
    handleClose
  } = useTestInstructions({
    testType: 'listening',
    onComplete: () => {
      // Test starts after instructions are accepted
    }
  })
  
  // Question navigation hook
  const {
    currentQuestion,
    goToQuestion,
    goToNext,
    goToPrevious,
    toggleFlag,
    updateAnswerStatus,
    getQuestionStatus,
    getStats
  } = useQuestionNavigation({
    questionCount: questionsData.length || mockQuestions.length,
    initialCurrentQuestion: 0
  })
  
  // Fetch test data
  useEffect(() => {
    const fetchTestData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // In real implementation, this would fetch from API
        // For now, we'll use mock data but simulate API call
        await new Promise(resolve => setTimeout(resolve, 800)) // Simulate network delay
        
        // Use mock data for now
        setTestData({
          id: '1',
          name: 'Listening Test',
          type: 'listening',
          duration_minutes: 25, // Extended for 2 clips
          total_questions: 10,  // Updated to 10 questions
          instructions: 'You will hear TWO audio recordings. Each audio clip can be played a maximum of 2 times. Questions will appear at specific timestamps during each clip.'
        })
        
        setQuestionsData([
          {
            id: '1',
            question_text: "What is the main topic of the conversation?",
            question_type: 'mcq',
            options: [
              "A job interview discussion",
              "A university admission process",
              "A travel planning session",
              "A medical appointment"
            ],
            correct_answer: "1",
            points: 1,
            order_index: 1,
            timestamp: 0
          },
          {
            id: '2',
            question_text: "According to the speaker, what is the most important quality for success?",
            question_type: 'mcq',
            options: [
              "Technical skills",
              "Communication ability",
              "Persistence and dedication",
              "Financial resources"
            ],
            correct_answer: "2",
            points: 1,
            order_index: 2,
            timestamp: 45000
          }
        ])
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test data')
      } finally {
        setLoading(false)
      }
    }
    
    fetchTestData()
  }, [])
  
  // Create attempt when test starts
  const startTest = async () => {
    try {
      const result = await createAttempt({
        user_id: 'current-user-id', // This would come from auth context
        test_id: testData?.id || '1',
        status: 'in_progress'
      })
      
      if (result.error) {
        console.error('Failed to create attempt:', result.error)
        // Continue anyway for demo purposes
      } else {
        setCurrentAttemptId(result.data?.id)
      }
      
      handleStartTest()
      setTestStarted(true)
    } catch (err) {
      console.error('Error starting test:', err)
      // Continue anyway for demo purposes
      handleStartTest()
      setTestStarted(true)
    }
  }
  
  const [timeRemaining, setTimeRemaining] = useState(20 * 60) // 20 minutes in seconds
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState(95 * 60) // 95 minutes
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [playCount, setPlayCount] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [testStarted, setTestStarted] = useState(false)
  
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  
  // Initialize audio player
  useEffect(() => {
    audioPlayerRef.current = new AudioPlayer();
    
    // Set up time update callback
    audioPlayerRef.current.setOnTimeUpdate((current, duration) => {
      setCurrentTime(current);
      
      // Check if we should show questions based on timestamp
      const currentQuestionData = mockQuestions[currentQuestion];
      if (current >= currentQuestionData.timestamp && 
          !answers[currentQuestionData.id]) {
        // Question becomes active at its timestamp
      }
    });
    
    // Set up ended callback
    audioPlayerRef.current.setOnEnded(() => {
      setIsPlaying(false);
    });
    
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.destroy();
      }
    };
  }, [currentQuestion, answers]);
  
  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 0) {
          clearInterval(timer)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
      setSessionTimeRemaining(prev => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tab visibility detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (tabSwitchCount === 0) {
          setShowTabWarning(true)
          setTabSwitchCount(1)
        } else {
          // Second tab switch - auto submit
          handleSubmit()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabSwitchCount])

  // Disable right-click
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatSessionTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleAnswerSelect = async (questionId: string, answerIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: answerIndex }))
    updateAnswerStatus(parseInt(questionId), true)
    
    // Save answer using the new answer management system
    try {
      await saveAnswer(questionId, answerIndex)
    } catch (error) {
      console.error('Failed to save answer:', error)
    }
  }

  const handlePlayAudio = async () => {
    if (!audioPlayerRef.current) return;
    
    if (isPlaying) {
      // Pause playback
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      // Start or resume playback
      if (playCount < MAX_PLAYS) {
        if (playCount === 0) {
          setPlayCount(1);
        }
        
        // Determine current audio clip based on current question
        const currentQuestionData = mockQuestions[currentQuestion];
        const currentAudioId = (currentQuestionData?.audioId as keyof typeof AUDIO_DURATIONS) || 1;
        
        setIsPlaying(true);
        await audioPlayerRef.current.play(AUDIO_DURATIONS[currentAudioId]);
        setIsPlaying(false);
      }
    }
  }
  
  const handleReplay = () => {
    if (!audioPlayerRef.current || playCount >= MAX_PLAYS) return;
    
    setPlayCount(prev => prev + 1);
    setCurrentTime(0);
    // Determine current audio clip based on current question
    const currentQuestionData = mockQuestions[currentQuestion];
    const currentAudioId = (currentQuestionData?.audioId as keyof typeof AUDIO_DURATIONS) || 1;
    
    setIsPlaying(true);
    audioPlayerRef.current.stop();
    audioPlayerRef.current.play(AUDIO_DURATIONS[currentAudioId]);
  }

  const handleSubmit = () => {
    // Clean up timer state
    localStorage.removeItem('testTimer_Listening Test')
    // In real implementation, this would send answers to the server
    router.push('/student/dashboard')
  }
  
  // Handle timer expiration
  const handleTimeUp = async () => {
    await handleSubmitFinal()
  }
    
  // Submit test
  const handleSubmitFinal = async () => {
    try {
      // Update attempt with final data
      if (currentAttemptId) {
        await updateAttempt(currentAttemptId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          answers,
          score: Object.keys(answers).length // Simple scoring for demo
        })
      }
        
      // Clean up timer state
      localStorage.removeItem('testTimer_Listening Test')
      router.push('/student/dashboard')
    } catch (err) {
      console.error('Error submitting test:', err)
      // Still navigate to dashboard
      router.push('/student/dashboard')
    }
  }

  const isTimeLow = timeRemaining <= 120 // 2 minutes
  const answeredCount = Object.keys(answers).length
  const progress = (answeredCount / mockQuestions.length) * 100
  
  // Check if current question should be active based on audio timestamp
  const currentQuestionData = mockQuestions[currentQuestion];
  const isQuestionActive = currentTime >= currentQuestionData.timestamp || playCount === 0;
  const canReplay = playCount < MAX_PLAYS;

  return (
    <div className="min-h-screen bg-background">
      {/* Tab Switch Warning Modal */}
      {showTabWarning && (
        <div className="fixed inset-0 z-50 bg-foreground/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-destructive">
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle className="text-center text-xl">Warning: Tab Switch Detected</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                You have switched tabs or windows. This is not allowed during the test. 
                Switching tabs again will result in automatic test termination and submission with current answers.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => setShowTabWarning(false)} className="w-full">
                  Return to Test
                </Button>
                <Button variant="destructive" onClick={handleSubmit} className="w-full">
                  End Test Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Submit Test?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                You have answered {answeredCount} out of {mockQuestions.length} questions.
                {answeredCount < mockQuestions.length && (
                  <span className="block text-warning mt-2">
                    Unanswered questions will be marked as 0.
                  </span>
                )}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowSubmitConfirm(false)} className="flex-1">
                  Continue Test
                </Button>
                <Button onClick={handleSubmit} className="flex-1">
                  Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-40 glass border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Headphones className="w-5 h-5 text-listening" />
                <span className="font-semibold">Listening Test</span>
              </div>
              <Badge variant="listening">10 marks</Badge>
            </div>

            <div className="flex items-center gap-6">
              {/* Test Timer */}
              <div className="flex items-center gap-6">
                <TestTimer 
                  initialTime={20 * 60} // 20 minutes
                  onTimeUp={handleTimeUp}
                  testName="Listening Test"
                />
              </div>
              
              {/* Session Timer */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary">
                <Timer className="w-4 h-4" />
                <div>
                  <p className="text-xs text-muted-foreground">Session</p>
                  <p className="font-mono font-semibold">{formatSessionTime(sessionTimeRemaining)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-32 container mx-auto px-4 max-w-4xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Progress</span>
            <span className="text-sm font-medium">{answeredCount}/{questionsData.length} answered</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Audio Player */}
        <Card className="mb-8 border-2 border-listening/20 bg-listening/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <button
                onClick={handlePlayAudio}
                disabled={!canReplay && !isPlaying}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-primary-foreground transition-all ${canReplay || isPlaying ? 'bg-listening hover:bg-listening/90' : 'bg-muted cursor-not-allowed'}`}
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-4 h-4 text-listening" />
                  <span className="font-medium">University Orientation Audio</span>
                  <Badge variant="secondary" className="text-xs">{playCount}/{MAX_PLAYS} plays</Badge>
                </div>
                <div className="h-2 bg-listening/20 rounded-full overflow-hidden mb-2">
                  {/* Determine current audio duration based on current question */}
                  <div 
                    className="h-full bg-listening transition-all duration-300" 
                    style={{ 
                      width: `${(currentTime / (
                        mockQuestions[currentQuestion]?.audioId ? 
                        AUDIO_DURATIONS[mockQuestions[currentQuestion].audioId as keyof typeof AUDIO_DURATIONS] : 
                        AUDIO_DURATIONS[1]
                      )) * 100}%` 
                    }} 
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatAudioTime(currentTime)}</span>
                  <span>{
                    formatAudioTime(
                      mockQuestions[currentQuestion]?.audioId ? 
                      AUDIO_DURATIONS[mockQuestions[currentQuestion].audioId as keyof typeof AUDIO_DURATIONS] : 
                      AUDIO_DURATIONS[1]
                    )
                  }</span>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleReplay}
                disabled={!canReplay}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Replay ({MAX_PLAYS - playCount} left)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Question */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">Question {currentQuestion + 1} of {mockQuestions.length}</Badge>
                  {answers[mockQuestions[currentQuestion].id] !== undefined && (
                    <Badge variant="success">Answered</Badge>
                  )}
                  {!isQuestionActive && playCount > 0 && (
                    <Badge variant="secondary">Waiting for audio timestamp</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Appears at {formatAudioTime(currentQuestionData.timestamp)} in audio
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold">{currentQuestionData.question}</h2>
                </div>
                <div className="space-y-3">
                  {currentQuestionData.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(currentQuestionData.id.toString(), index)}
                      disabled={!isQuestionActive}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                        answers[currentQuestionData.id] === index
                          ? 'border-primary bg-primary/5'
                          : isQuestionActive
                            ? 'border-border hover:border-primary/50 hover:bg-secondary/50'
                            : 'border-border opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          answers[currentQuestionData.id] === index
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground'
                        }`}>
                          {answers[currentQuestionData.id] === index && (
                            <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                          )}
                        </div>
                        <span className={answers[currentQuestionData.id] === index ? 'font-medium' : ''}>
                          {option}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Question Navigation Sidebar */}
          <div className="lg:col-span-1">
            <QuestionNav
              questions={getQuestionStatus()}
              currentQuestion={currentQuestion}
              onQuestionSelect={goToQuestion}
              onToggleFlag={toggleFlag}
              showSummary={true}
            />
          </div>
        </div>

        {/* Question Navigation (Mobile) */}
        <div className="lg:hidden mt-6">
          <QuestionNav
            questions={getQuestionStatus()}
            currentQuestion={currentQuestion}
            onQuestionSelect={goToQuestion}
            onToggleFlag={toggleFlag}
            showSummary={true}
          />
        </div>
      </main>

      {/* Fixed Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex h-20 items-center justify-between">
            <Button
              variant="outline"
              onClick={goToPrevious}
              disabled={getStats().isFirst}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
      
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {getStats().answered} of {getStats().total} questions answered
              </p>
            </div>
      
            <div className="flex items-center gap-3">
              {!getStats().isLast ? (
                <Button onClick={goToNext}>
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button variant="hero" onClick={() => setShowSubmitConfirm(true)}>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Test
                </Button>
              )
            }</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
