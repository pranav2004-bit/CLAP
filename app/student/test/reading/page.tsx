'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TestTimer } from '@/components/TestTimer'
import { QuestionNav } from '@/components/QuestionNav'
import { useQuestionNavigation } from '@/hooks/useQuestionNavigation'
import { BookOpen, Clock, ChevronRight, ChevronLeft, Flag, CheckCircle } from 'lucide-react'

const readingPassages = [
  {
    id: 1,
    title: "The Impact of Artificial Intelligence on Modern Society",
    content: `Artificial intelligence (AI) has emerged as one of the most transformative technologies of the 21st century, fundamentally reshaping how we live, work, and interact with the world around us. From virtual assistants on our smartphones to sophisticated algorithms that power recommendation systems, AI has become an integral part of our daily lives, often in ways we may not even realize.

The origins of AI can be traced back to the mid-20th century when pioneers like Alan Turing and John McCarthy first explored the possibility of creating machines that could think. However, it was not until the advent of big data and powerful computing resources that AI truly began to flourish. Today, machine learning algorithms can process vast amounts of information at speeds that would have been unimaginable just a few decades ago.

In the healthcare sector, AI is revolutionizing diagnosis and treatment. Machine learning models can analyze medical images with remarkable accuracy, often detecting diseases like cancer at earlier stages than human physicians. AI-powered drug discovery is accelerating the development of new medications, potentially saving years in the research process.

The business world has also been transformed by AI technologies. Companies use predictive analytics to forecast market trends, optimize supply chains, and personalize customer experiences. Chatbots and virtual assistants handle customer service inquiries around the clock, improving efficiency while reducing costs.

However, the rapid advancement of AI also raises important ethical and societal questions. Concerns about job displacement, algorithmic bias, and privacy have sparked debates about how AI should be regulated and governed. As AI systems become more autonomous, questions about accountability and transparency become increasingly pressing.

Looking ahead, the future of AI holds both tremendous promise and significant challenges. Continued research in areas like natural language processing, computer vision, and robotics will likely lead to even more sophisticated AI systems. The key will be ensuring that these powerful technologies are developed and deployed in ways that benefit humanity while minimizing potential risks.`,
    questions: [
      {
        id: 1,
        question: "According to the passage, when did AI truly begin to flourish?",
        options: [
          "In the mid-20th century",
          "When big data and powerful computing became available",
          "After Alan Turing's research",
          "In the 21st century"
        ],
        correct: 1
      },
      {
        id: 2,
        question: "What is mentioned as a benefit of AI in healthcare?",
        options: [
          "Reducing hospital costs",
          "Training medical students",
          "Detecting diseases at earlier stages",
          "Replacing all human physicians"
        ],
        correct: 2
      },
      {
        id: 3,
        question: "Which of the following is NOT mentioned as a concern about AI?",
        options: [
          "Job displacement",
          "Algorithmic bias",
          "Environmental impact",
          "Privacy issues"
        ],
        correct: 2
      },
      {
        id: 4,
        question: "How do businesses use AI according to the passage?",
        options: [
          "Only for customer service",
          "For forecasting, supply chain optimization, and personalization",
          "Primarily for manufacturing",
          "To replace all employees"
        ],
        correct: 1
      },
      {
        id: 5,
        question: "What does the author suggest about the future of AI?",
        options: [
          "It will definitely solve all problems",
          "It should be completely banned",
          "It holds both promise and challenges",
          "It will remain unchanged"
        ],
        correct: 2
      }
    ]
  },
  {
    id: 2,
    title: "Climate Change and Global Environmental Challenges",
    content: `Climate change represents one of the most pressing challenges facing humanity in the 21st century. Scientific evidence overwhelmingly demonstrates that human activities, particularly the burning of fossil fuels, have significantly altered Earth's climate system. Rising global temperatures, changing precipitation patterns, and more frequent extreme weather events are becoming the new normal.

The primary driver of contemporary climate change is the increase in greenhouse gases, especially carbon dioxide and methane, in the atmosphere. Since the Industrial Revolution, atmospheric CO2 concentrations have risen by more than 40%, primarily due to fossil fuel combustion and deforestation. This enhanced greenhouse effect traps more heat in Earth's atmosphere, leading to global warming.

The impacts of climate change are already evident worldwide. Arctic sea ice is shrinking at an alarming rate, with summer ice coverage declining by approximately 13% per decade. Sea levels are rising due to thermal expansion of warming oceans and melting ice sheets, threatening coastal communities and island nations. Extreme weather events, including hurricanes, droughts, and heatwaves, are becoming more intense and frequent.

Scientists predict that without significant reductions in greenhouse gas emissions, global temperatures could rise by 2-4°C by the end of this century. Such warming would have catastrophic consequences, including massive ecosystem disruption, food and water insecurity, and increased frequency of climate-related disasters. Some regions may become uninhabitable, potentially displacing hundreds of millions of people.

Addressing climate change requires unprecedented international cooperation and rapid decarbonization of the global economy. Renewable energy sources like solar and wind power are becoming increasingly cost-competitive with fossil fuels. Energy efficiency improvements, sustainable transportation systems, and carbon capture technologies offer promising pathways toward a low-carbon future. Individual actions, while important, must be complemented by systemic changes in how societies produce and consume energy.`,
    questions: [
      {
        id: 6,
        question: "What is identified as the primary driver of contemporary climate change?",
        options: [
          "Natural climate cycles",
          "Volcanic eruptions",
          "Increase in greenhouse gases",
          "Solar radiation changes"
        ],
        correct: 2
      },
      {
        id: 7,
        question: "By what percentage have atmospheric CO2 concentrations risen since the Industrial Revolution?",
        options: [
          "About 20%",
          "More than 40%",
          "Approximately 30%",
          "Nearly 50%"
        ],
        correct: 1
      },
      {
        id: 8,
        question: "Which of the following is NOT mentioned as an impact of climate change?",
        options: [
          "Shrinking Arctic sea ice",
          "Rising sea levels",
          "Increased volcanic activity",
          "More frequent extreme weather events"
        ],
        correct: 2
      },
      {
        id: 9,
        question: "What temperature increase is predicted by scientists if significant emission reductions don't occur?",
        options: [
          "1-2°C by century's end",
          "2-4°C by century's end",
          "0.5-1°C by century's end",
          "4-6°C by century's end"
        ],
        correct: 1
      },
      {
        id: 10,
        question: "What solution approach is emphasized for addressing climate change?",
        options: [
          "Relocating all populations away from coasts",
          "International cooperation and rapid decarbonization",
          "Building more coal power plants",
          "Ignoring the problem entirely"
        ],
        correct: 1
      }
    ]
  }
]

export default function ReadingTestPage() {
  const router = useRouter()
  
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
    questionCount: readingPassages.reduce((total, passage) => total + passage.questions.length, 0),
    initialCurrentQuestion: 0
  })
  
  const [answers, setAnswers] = useState<{ [key: number]: number }>({})
  const [flagged, setFlagged] = useState<Set<number>>(new Set())
  const [timeLeft, setTimeLeft] = useState(30 * 60) // 30 minutes
  const [showPassage, setShowPassage] = useState(true)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const handleSubmit = () => {
    // Clean up timer state
    localStorage.removeItem('testTimer_Reading Test');
    router.push('/student/dashboard')
  }
  
  // Handle timer expiration
  const handleTimeUp = () => {
    handleSubmit();
  }
  
  // Get navigation stats
  const navStats = getStats()

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const selectAnswer = (questionIndex: number, optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: optionIndex }))
    updateAnswerStatus(questionIndex + 1, true)
  }

  const toggleFlagLocal = (index: number) => {
    setFlagged(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
    toggleFlag(index + 1)
  }

  // Get current question from all passages
  const getAllQuestions = () => {
    return readingPassages.flatMap(passage => passage.questions);
  };
  
  const allQuestions = getAllQuestions();
  const question = allQuestions[currentQuestion]
  const answeredCount = Object.keys(answers).length
  const isTimeWarning = timeLeft < 300

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Reading Test</h1>
              <p className="text-emerald-100 text-sm">Question {currentQuestion + 1} of {readingPassages.reduce((total, passage) => total + passage.questions.length, 0)}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <TestTimer 
              initialTime={30 * 60} // 30 minutes
              onTimeUp={handleTimeUp}
              testName="Reading Test"
            />
            <div className="bg-white/20 px-4 py-2 rounded-lg">
              <span className="text-sm">{answeredCount}/{readingPassages.reduce((total, passage) => total + passage.questions.length, 0)} answered</span>
            </div>
            <Button 
              onClick={handleSubmit}
              variant="outline" 
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              Submit Test
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Question Navigation */}
        <div className="flex gap-2 mb-6 justify-center flex-wrap">
          {Array.from({ length: readingPassages.reduce((total, passage) => total + passage.questions.length, 0) }).map((_, index: number) => (
            <button
              key={index}
              onClick={() => goToQuestion(index + 1)}
              className={`w-10 h-10 rounded-lg font-medium transition-all relative ${
                index === currentQuestion
                  ? 'bg-emerald-600 text-white scale-110'
                  : answers[index] !== undefined
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-white text-gray-600 hover:bg-emerald-50'
              }`}
            >
              {index + 1}
              {flagged.has(index) && (
                <Flag className="w-3 h-3 absolute -top-1 -right-1 text-orange-500 fill-orange-500" />
              )}
            </button>
          ))}
        </div>

        {/* Toggle Button for Mobile */}
        <div className="lg:hidden mb-4 flex flex-col gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowPassage(!showPassage)}
            className="w-full"
          >
            {showPassage ? 'Show Questions' : 'Show Passage'}
          </Button>
          {/* Show current passage indicator */}
          <div className="text-center text-sm text-muted-foreground">
            Passage {((): number => {
              let questionIndex = 0;
              for (let i = 0; i < readingPassages.length; i++) {
                if (currentQuestion < questionIndex + readingPassages[i].questions.length) {
                  return i + 1;
                }
                questionIndex += readingPassages[i].questions.length;
              }
              return 1;
            })()} of {readingPassages.length}
          </div>
        </div>

        {/* Main Content - Split View */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Passage */}
          <Card className={`shadow-xl border-0 ${showPassage ? 'block' : 'hidden lg:block'}`}>
            <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
              {/* Show title of current passage */}
              <CardTitle className="text-lg">
                {(() => {
                  let questionIndex = 0;
                  for (const passage of readingPassages) {
                    if (currentQuestion < questionIndex + passage.questions.length) {
                      return passage.title;
                    }
                    questionIndex += passage.questions.length;
                  }
                  return readingPassages[0]?.title || 'Reading Passage';
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 max-h-[600px] overflow-y-auto">
              <div className="prose prose-sm max-w-none">
                {/* Show content of current passage */}
                {(() => {
                  let questionIndex = 0;
                  for (const passage of readingPassages) {
                    if (currentQuestion < questionIndex + passage.questions.length) {
                      return passage.content.split('\n\n').map((paragraph: string, index: number) => (
                        <p key={index} className="mb-4 text-gray-700 leading-relaxed">
                          {paragraph}
                        </p>
                      ));
                    }
                    questionIndex += passage.questions.length;
                  }
                  return readingPassages[0]?.content.split('\n\n').map((paragraph: string, index: number) => (
                    <p key={index} className="mb-4 text-gray-700 leading-relaxed">
                      {paragraph}
                    </p>
                  )) || [];
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          <Card className={`shadow-xl border-0 ${!showPassage ? 'block' : 'hidden lg:block'}`}>
            <CardHeader className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Question {currentQuestion + 1}</CardTitle>
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
            <CardContent className="p-6">
              <p className="text-lg font-medium text-gray-800 mb-6">{question.question}</p>
              
              <div className="space-y-3">
                {question.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => selectAnswer(currentQuestion, index)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      answers[currentQuestion] === index
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                        answers[currentQuestion] === index
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span>{option}</span>
                      {answers[currentQuestion] === index && (
                        <CheckCircle className="w-5 h-5 text-emerald-500 ml-auto" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Navigation */}
              <div className="flex justify-between mt-8 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => goToPrevious()}
                  disabled={currentQuestion === 0}
                >
                  <ChevronLeft className="w-5 h-5 mr-2" />
                  Previous
                </Button>
                {currentQuestion === allQuestions.length - 1 ? (
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    Review Answers
                  </Button>
                ) : (
                  <Button
                    onClick={() => goToNext()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Next
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
