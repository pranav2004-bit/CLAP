'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mic, Square, Play, Pause, RotateCcw, ChevronRight, ChevronLeft, Clock, Volume2 } from 'lucide-react'

const speakingQuestions = [
  {
    id: 1,
    prompt: "Describe your favorite place to visit and explain why you enjoy going there.",
    prepTime: 30,
    responseTime: 60,
  },
  {
    id: 2,
    prompt: "Talk about a person who has influenced your life. What did they teach you?",
    prepTime: 30,
    responseTime: 60,
  },
  {
    id: 3,
    prompt: "Describe a challenging situation you faced and how you overcame it.",
    prepTime: 30,
    responseTime: 90,
  },
  {
    id: 4,
    prompt: "What are the advantages and disadvantages of social media? Give your opinion.",
    prepTime: 45,
    responseTime: 90,
  },
]

export default function SpeakingTestPage() {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [phase, setPhase] = useState<'prep' | 'recording' | 'review'>('prep')
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [prepTime, setPrepTime] = useState(speakingQuestions[0].prepTime)
  const [recordTime, setRecordTime] = useState(0)
  const [recordings, setRecordings] = useState<{ [key: number]: string }>({})
  const [audioLevel, setAudioLevel] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  const question = speakingQuestions[currentQuestion]
  const maxRecordTime = question.responseTime

  useEffect(() => {
    if (phase === 'prep' && prepTime > 0) {
      timerRef.current = setInterval(() => {
        setPrepTime(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            setPhase('recording')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase, prepTime])

  useEffect(() => {
    if (isRecording && !isPaused && recordTime < maxRecordTime) {
      timerRef.current = setInterval(() => {
        setRecordTime(prev => {
          if (prev >= maxRecordTime - 1) {
            stopRecording()
            return maxRecordTime
          }
          return prev + 1
        })
        // Simulate audio level
        setAudioLevel(Math.random() * 100)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isPaused, recordTime, maxRecordTime])

  const startRecording = () => {
    setIsRecording(true)
    setIsPaused(false)
    setPhase('recording')
  }

  const stopRecording = () => {
    setIsRecording(false)
    setIsPaused(false)
    setAudioLevel(0)
    if (timerRef.current) clearInterval(timerRef.current)
    // Simulate saving recording
    setRecordings(prev => ({ ...prev, [currentQuestion]: `recording_${currentQuestion + 1}.webm` }))
    setPhase('review')
  }

  const resetRecording = () => {
    setRecordTime(0)
    setRecordings(prev => {
      const updated = { ...prev }
      delete updated[currentQuestion]
      return updated
    })
    setPrepTime(question.prepTime)
    setPhase('prep')
  }

  const goToQuestion = (index: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setCurrentQuestion(index)
    setPhase('prep')
    setPrepTime(speakingQuestions[index].prepTime)
    setRecordTime(0)
    setIsRecording(false)
    setIsPaused(false)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const completedCount = Object.keys(recordings).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-orange-600 to-amber-600 text-white px-6 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Speaking Test</h1>
              <p className="text-orange-100 text-sm">Question {currentQuestion + 1} of {speakingQuestions.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white/20 px-4 py-2 rounded-lg">
              <span className="text-sm">Completed: {completedCount}/{speakingQuestions.length}</span>
            </div>
            <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
              End Test
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Question Navigation */}
        <div className="flex gap-2 mb-6 justify-center">
          {speakingQuestions.map((_, index) => (
            <button
              key={index}
              onClick={() => goToQuestion(index)}
              className={`w-10 h-10 rounded-full font-medium transition-all ${
                index === currentQuestion
                  ? 'bg-orange-600 text-white scale-110'
                  : recordings[index]
                  ? 'bg-green-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-orange-100'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {/* Main Card */}
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Question {currentQuestion + 1}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            {/* Question Prompt */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-8">
              <p className="text-lg text-gray-800 leading-relaxed">{question.prompt}</p>
            </div>

            {/* Phase Indicator */}
            <div className="flex justify-center mb-8">
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${phase === 'prep' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">Prepare</span>
                </div>
                <div className="w-8 h-0.5 bg-gray-300" />
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${phase === 'recording' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                  <Mic className="w-4 h-4" />
                  <span className="font-medium">Record</span>
                </div>
                <div className="w-8 h-0.5 bg-gray-300" />
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${phase === 'review' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  <Play className="w-4 h-4" />
                  <span className="font-medium">Review</span>
                </div>
              </div>
            </div>

            {/* Preparation Phase */}
            {phase === 'prep' && (
              <div className="text-center">
                <div className="mb-6">
                  <div className="text-6xl font-bold text-orange-600 mb-2">{formatTime(prepTime)}</div>
                  <p className="text-gray-600">Preparation time remaining</p>
                </div>
                <p className="text-gray-500 mb-6">Use this time to organize your thoughts before recording.</p>
                <Button 
                  onClick={startRecording}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-3"
                >
                  <Mic className="w-5 h-5 mr-2" />
                  Start Recording Early
                </Button>
              </div>
            )}

            {/* Recording Phase */}
            {phase === 'recording' && (
              <div className="text-center">
                {/* Audio Visualizer */}
                <div className="mb-6">
                  <div className="flex items-center justify-center gap-1 h-20 mb-4">
                    {[...Array(20)].map((_, i) => (
                      <div
                        key={i}
                        className="w-2 bg-orange-500 rounded-full transition-all duration-100"
                        style={{
                          height: isRecording && !isPaused 
                            ? `${Math.max(10, Math.sin((i + audioLevel) * 0.5) * 40 + 40)}px`
                            : '10px'
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-red-600">
                    <div className={`w-3 h-3 rounded-full bg-red-600 ${isRecording && !isPaused ? 'animate-pulse' : ''}`} />
                    <span className="font-medium">{isRecording && !isPaused ? 'Recording...' : 'Paused'}</span>
                  </div>
                </div>

                {/* Timer */}
                <div className="mb-6">
                  <div className="text-5xl font-bold text-gray-800 mb-2">{formatTime(recordTime)}</div>
                  <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-orange-600 h-2 rounded-full transition-all"
                      style={{ width: `${(recordTime / maxRecordTime) * 100}%` }}
                    />
                  </div>
                  <p className="text-gray-500 mt-2">Maximum: {formatTime(maxRecordTime)}</p>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsPaused(!isPaused)}
                    className="px-6"
                  >
                    {isPaused ? <Play className="w-5 h-5 mr-2" /> : <Pause className="w-5 h-5 mr-2" />}
                    {isPaused ? 'Resume' : 'Pause'}
                  </Button>
                  <Button
                    onClick={stopRecording}
                    className="bg-red-600 hover:bg-red-700 text-white px-8"
                  >
                    <Square className="w-5 h-5 mr-2" />
                    Stop Recording
                  </Button>
                </div>
              </div>
            )}

            {/* Review Phase */}
            {phase === 'review' && (
              <div className="text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Play className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Recording Complete</h3>
                <p className="text-gray-600 mb-6">Duration: {formatTime(recordTime)}</p>
                
                {/* Playback (simulated) */}
                <div className="bg-gray-100 rounded-xl p-4 max-w-md mx-auto mb-6">
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" className="rounded-full">
                      <Play className="w-5 h-5" />
                    </Button>
                    <div className="flex-1">
                      <div className="bg-gray-300 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full w-0" />
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">{formatTime(recordTime)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button variant="outline" onClick={resetRecording}>
                    <RotateCcw className="w-5 h-5 mr-2" />
                    Re-record
                  </Button>
                  {currentQuestion < speakingQuestions.length - 1 && (
                    <Button 
                      onClick={() => goToQuestion(currentQuestion + 1)}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      Next Question
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => goToQuestion(Math.max(0, currentQuestion - 1))}
            disabled={currentQuestion === 0}
          >
            <ChevronLeft className="w-5 h-5 mr-2" />
            Previous
          </Button>
          {completedCount === speakingQuestions.length && (
            <Button className="bg-green-600 hover:bg-green-700 text-white px-8">
              Submit All Recordings
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => goToQuestion(Math.min(speakingQuestions.length - 1, currentQuestion + 1))}
            disabled={currentQuestion === speakingQuestions.length - 1}
          >
            Next
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  )
}
