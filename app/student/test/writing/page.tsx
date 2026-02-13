'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PenTool, Clock, Save, Send, AlertTriangle, CheckCircle, FileText } from 'lucide-react'

const writingPrompt = {
  title: "Essay Writing Task",
  topic: "The Role of Technology in Education",
  instructions: `Write an essay of 250-350 words on the following topic:

"Technology has transformed the way we learn and teach. Some argue that traditional classroom education is becoming obsolete, while others believe that technology should only supplement, not replace, conventional teaching methods."

Discuss both views and give your own opinion. Support your arguments with relevant examples and evidence.`,
  requirements: [
    "Write between 250-350 words",
    "Include an introduction, body paragraphs, and conclusion",
    "Present arguments for both sides",
    "State your own opinion clearly",
    "Use appropriate vocabulary and grammar"
  ],
  timeLimit: 45 * 60 // 45 minutes
}

export default function WritingTestPage() {
  const [essay, setEssay] = useState('')
  const [timeLeft, setTimeLeft] = useState(writingPrompt.timeLimit)
  const [wordCount, setWordCount] = useState(0)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null)

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

  useEffect(() => {
    // Auto-save every 30 seconds
    autoSaveRef.current = setInterval(() => {
      if (essay.length > 0) {
        handleSave()
      }
    }, 30000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [essay])

  useEffect(() => {
    const words = essay.trim().split(/\s+/).filter(word => word.length > 0)
    setWordCount(words.length)
  }, [essay])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSave = () => {
    setIsSaving(true)
    // Simulate save
    setTimeout(() => {
      setLastSaved(new Date())
      setIsSaving(false)
    }, 500)
  }

  const getWordCountStatus = () => {
    if (wordCount < 200) return { color: 'text-red-600', message: 'Too short' }
    if (wordCount < 250) return { color: 'text-orange-600', message: 'Almost there' }
    if (wordCount <= 350) return { color: 'text-green-600', message: 'Good length' }
    return { color: 'text-orange-600', message: 'Consider reducing' }
  }

  const wordStatus = getWordCountStatus()
  const isTimeWarning = timeLeft < 300
  const isTimeCritical = timeLeft < 60

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-violet-600 to-purple-600 text-white px-6 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Writing Test</h1>
              <p className="text-violet-100 text-sm">Essay Writing Task</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isTimeCritical ? 'bg-red-500 animate-pulse' : isTimeWarning ? 'bg-orange-500' : 'bg-white/20'
            }`}>
              <Clock className="w-4 h-4" />
              <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
            </div>
            <Button 
              variant="outline" 
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Draft
                </>
              )}
            </Button>
            <Button className="bg-white text-violet-600 hover:bg-violet-50">
              <Send className="w-4 h-4 mr-2" />
              Submit Essay
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Prompt Panel */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="shadow-xl border-0">
              <CardHeader className="bg-gradient-to-r from-violet-500 to-purple-500 text-white">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {writingPrompt.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg text-gray-800 mb-4">{writingPrompt.topic}</h3>
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 whitespace-pre-line text-sm leading-relaxed">
                    {writingPrompt.instructions}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 mb-3">Requirements:</h4>
                  <ul className="space-y-2">
                    {writingPrompt.requirements.map((req, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Word Count Card */}
            <Card className="shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Word Count:</span>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${wordStatus.color}`}>{wordCount}</span>
                    <span className="text-gray-400"> / 250-350</span>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        wordCount < 200 ? 'bg-red-500' :
                        wordCount < 250 ? 'bg-orange-500' :
                        wordCount <= 350 ? 'bg-green-500' :
                        'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min(100, (wordCount / 350) * 100)}%` }}
                    />
                  </div>
                  <p className={`text-sm mt-1 ${wordStatus.color}`}>{wordStatus.message}</p>
                </div>
              </CardContent>
            </Card>

            {/* Auto-save Status */}
            <div className="text-center text-sm text-gray-500">
              {lastSaved ? (
                <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
              ) : (
                <span>Auto-save enabled</span>
              )}
            </div>
          </div>

          {/* Editor Panel */}
          <div className="lg:col-span-2">
            <Card className="shadow-xl border-0 h-full">
              <CardHeader className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white">
                <CardTitle>Your Essay</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <textarea
                  value={essay}
                  onChange={(e) => setEssay(e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault()
                    alert('Copy-paste is disabled during the writing test.')
                  }}
                  placeholder="Start writing your essay here...

Begin with an introduction that presents the topic and your thesis statement.

Then, develop your arguments in the body paragraphs with supporting evidence.

Finally, conclude by summarizing your main points and restating your opinion."
                  className="w-full h-[500px] p-6 text-gray-800 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-inset text-base"
                  style={{ fontFamily: 'Georgia, serif' }}
                />
              </CardContent>
            </Card>

            {/* Warning Messages */}
            {timeLeft < 300 && (
              <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 ${
                timeLeft < 60 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
              }`}>
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">
                  {timeLeft < 60 
                    ? 'Less than 1 minute remaining! Submit your essay now.'
                    : 'Less than 5 minutes remaining. Consider wrapping up your essay.'}
                </span>
              </div>
            )}

            {wordCount > 0 && wordCount < 200 && (
              <div className="mt-4 p-4 rounded-xl bg-amber-100 text-amber-700 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>Your essay is below the minimum word count. Aim for at least 250 words.</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
