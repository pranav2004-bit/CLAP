'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Info, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  BookOpen, 
  Headphones,
  Mic,
  PenLine,
  SpellCheck,
  FileText
} from 'lucide-react'

interface TestInstructionsProps {
  isOpen: boolean
  onClose: () => void
  onStartTest: () => void
  testType: 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary'
  duration: number // in minutes
  questionCount: number
  testName?: string
}

const testConfig = {
  listening: {
    icon: Headphones,
    title: 'Listening Test',
    color: 'text-listening',
    bgColor: 'bg-listening/10',
    borderColor: 'border-listening/20',
    instructions: [
      'You will hear an audio recording played through your speakers or headphones',
      'Each audio clip can be played a maximum of 2 times',
      'Questions will appear at specific timestamps during the audio',
      'Read each question carefully before the audio finishes',
      'Select the best answer for each question',
      'You can navigate between questions using the question navigator'
    ],
    rules: [
      'Do not use external devices or notes during the test',
      'Stay in the test environment - switching tabs will be detected',
      'Complete the test within the allocated time',
      'Answer all questions to the best of your ability',
      'You may flag questions to review later'
    ],
    tips: [
      'Listen carefully to the entire audio before answering',
      'Pay attention to key details and main ideas',
      'Use the replay function wisely - you only have 2 plays',
      'Manage your time effectively across all questions'
    ]
  },
  speaking: {
    icon: Mic,
    title: 'Speaking Test',
    color: 'text-speaking',
    bgColor: 'bg-speaking/10',
    borderColor: 'border-speaking/20',
    instructions: [
      'You will be presented with speaking prompts',
      'Record your responses using your microphone',
      'Each response has a specific time limit',
      'Speak clearly and at a natural pace',
      'You can listen to your recordings before submitting',
      'AI will evaluate your pronunciation, fluency, and content'
    ],
    rules: [
      'Use only English during the speaking test',
      'Speak clearly into your microphone',
      'Do not read from prepared scripts or notes',
      'Complete each recording within the time limit',
      'Ensure a quiet environment with minimal background noise'
    ],
    tips: [
      'Take a moment to organize your thoughts before speaking',
      'Speak naturally - don\'t rush or speak too slowly',
      'Use clear pronunciation and proper grammar',
      'Listen to your recordings to ensure quality'
    ]
  },
  reading: {
    icon: BookOpen,
    title: 'Reading Test',
    color: 'text-reading',
    bgColor: 'bg-reading/10',
    borderColor: 'border-reading/20',
    instructions: [
      'You will read a passage followed by comprehension questions',
      'The passage remains visible throughout the test',
      'Questions test your understanding of main ideas and details',
      'You can navigate freely between questions',
      'Highlight important information in the passage as needed',
      'Review your answers before submitting'
    ],
    rules: [
      'Do not use external dictionaries or translation tools',
      'Complete all questions within the time limit',
      'Base your answers only on the passage content',
      'Do not discuss the test content with others',
      'Answer each question honestly to reflect your true ability'
    ],
    tips: [
      'Read the passage thoroughly before answering questions',
      'Refer back to the passage when answering questions',
      'Manage your time between reading and answering',
      'Review flagged questions before final submission'
    ]
  },
  writing: {
    icon: PenLine,
    title: 'Writing Test',
    color: 'text-writing',
    bgColor: 'bg-writing/10',
    borderColor: 'border-writing/20',
    instructions: [
      'You will write essays or responses to prompts',
      'Use the built-in text editor with word count tracking',
      'Your writing will be automatically saved every 30 seconds',
      'AI will evaluate grammar, vocabulary, structure, and coherence',
      'Follow the word count requirements for each task',
      'Review and edit your work before final submission'
    ],
    rules: [
      'Write original content - plagiarism will be detected',
      'Use proper grammar, punctuation, and spelling',
      'Stay on topic and address all parts of the prompt',
      'Do not copy content from external sources',
      'Complete the writing task within the time limit'
    ],
    tips: [
      'Plan your response before writing',
      'Organize your ideas with clear paragraphs',
      'Use varied vocabulary and sentence structures',
      'Proofread for grammar and spelling errors',
      'Save your work regularly'
    ]
  },
  vocabulary: {
    icon: SpellCheck,
    title: 'Vocabulary & Grammar Test',
    color: 'text-vocabulary',
    bgColor: 'bg-vocabulary/10',
    borderColor: 'border-vocabulary/20',
    instructions: [
      'This test includes fill-in-the-blank and multiple-choice questions',
      'Questions cover grammar rules, vocabulary usage, and sentence structure',
      'Some questions may have multiple correct answers',
      'Read each question carefully before selecting answers',
      'You can change your answers anytime before submitting',
      'Review all questions before final submission'
    ],
    rules: [
      'Do not use external dictionaries or grammar checkers',
      'Answer based on your knowledge of English',
      'Complete all questions within the time limit',
      'Do not leave any questions unanswered',
      'Choose the most appropriate answer for each question'
    ],
    tips: [
      'Read questions carefully to understand what is being asked',
      'Consider all answer options before selecting',
      'Use context clues for fill-in-the-blank questions',
      'Eliminate obviously incorrect options first',
      'Review unanswered questions before time expires'
    ]
  }
}

export function TestInstructions({
  isOpen,
  onClose,
  onStartTest,
  testType,
  duration,
  questionCount,
  testName
}: TestInstructionsProps) {
  const [isChecked, setIsChecked] = useState(false)
  const config = testConfig[testType]
  const IconComponent = config.icon
  
  if (!isOpen) return null

  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60)
      const remainingMinutes = minutes % 60
      return `${hours} hour${hours > 1 ? 's' : ''}${remainingMinutes > 0 ? ` ${remainingMinutes} minutes` : ''}`
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-2">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full ${config.bgColor} ${config.borderColor} border-2`}>
                <IconComponent className={`w-6 h-6 ${config.color}`} />
              </div>
              <div>
                <CardTitle className="text-2xl">{testName || config.title}</CardTitle>
                <p className="text-muted-foreground">Test Instructions</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Test Overview */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-semibold">{formatDuration(duration)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Questions</p>
                <p className="font-semibold">{questionCount} questions</p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Test Instructions
            </h3>
            <ul className="space-y-2">
              {config.instructions.map((instruction, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-primary text-sm font-medium">{index + 1}</span>
                  </span>
                  <span className="text-muted-foreground">{instruction}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Rules */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Important Rules
            </h3>
            <ul className="space-y-2">
              {config.rules.map((rule, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tips */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Info className="w-5 h-5 text-info" />
              Helpful Tips
            </h3>
            <ul className="space-y-2">
              {config.tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-info mt-2 flex-shrink-0"></span>
                  <span className="text-muted-foreground">{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Agreement */}
          <div className="pt-4 border-t">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-muted-foreground">
                I have read and understood all instructions, rules, and guidelines. I agree to follow them during the test.
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={onStartTest} 
              disabled={!isChecked}
              className="flex-1"
            >
              Start Test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}