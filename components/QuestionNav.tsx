'use client'

import { useState } from 'react'
import { Flag, CheckCircle, Circle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface QuestionStatus {
  id: number
  answered: boolean
  flagged: boolean
  isCurrent: boolean
}

interface QuestionNavProps {
  questions: QuestionStatus[]
  currentQuestion: number
  onQuestionSelect: (questionId: number) => void
  onToggleFlag: (questionId: number) => void
  showSummary?: boolean
}

export function QuestionNav({
  questions,
  currentQuestion,
  onQuestionSelect,
  onToggleFlag,
  showSummary = true
}: QuestionNavProps) {
  const answeredCount = questions.filter(q => q.answered).length
  const flaggedCount = questions.filter(q => q.flagged).length
  const unansweredCount = questions.length - answeredCount

  const getStatusColor = (question: QuestionStatus) => {
    if (question.isCurrent) return 'bg-primary text-primary-foreground hover:bg-primary/90'
    if (question.answered) return 'bg-success/20 text-success border border-success/30 hover:bg-success/30'
    if (question.flagged) return 'bg-warning/20 text-warning border border-warning/30 hover:bg-warning/30'
    return 'bg-secondary hover:bg-secondary/80'
  }

  const getStatusIcon = (question: QuestionStatus) => {
    if (question.isCurrent) return null
    if (question.answered) return <CheckCircle className="w-3 h-3" />
    if (question.flagged) return <AlertCircle className="w-3 h-3" />
    return <Circle className="w-3 h-3" />
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Questions</span>
          <Badge variant="secondary">{questions.length} Total</Badge>
        </CardTitle>
        
        {showSummary && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{answeredCount}</div>
              <div className="text-xs text-muted-foreground">Answered</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">{flaggedCount}</div>
              <div className="text-xs text-muted-foreground">Flagged</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">{unansweredCount}</div>
              <div className="text-xs text-muted-foreground">Unanswered</div>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {questions.map((question) => (
            <div key={question.id} className="relative">
              <button
                onClick={() => onQuestionSelect(question.id)}
                className={`w-10 h-10 rounded-lg font-medium text-sm transition-all flex items-center justify-center relative ${getStatusColor(question)}`}
              >
                {getStatusIcon(question)}
                <span className={question.isCurrent ? 'font-bold' : ''}>
                  {question.id}
                </span>
                
                {question.flagged && !question.isCurrent && (
                  <Flag className="w-3 h-3 absolute -top-1 -right-1 text-warning fill-warning" />
                )}
              </button>
            </div>
          ))}
        </div>
        
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-primary"></div>
              <span>Current</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-success" />
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-warning" />
              <span>Unanswered</span>
            </div>
            <div className="flex items-center gap-1">
              <Flag className="w-3 h-3 text-warning" />
              <span>Flagged</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Compact version for sidebar use
export function QuestionNavCompact({
  questions,
  currentQuestion,
  onQuestionSelect,
  onToggleFlag
}: QuestionNavProps) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-sm font-medium mb-2 flex items-center justify-between">
        <span>Questions</span>
        <Badge variant="secondary" className="text-xs">
          {questions.length}
        </Badge>
      </div>
      
      <div className="grid grid-cols-5 gap-1">
        {questions.map((question) => (
          <button
            key={question.id}
            onClick={() => onQuestionSelect(question.id)}
            onDoubleClick={() => onToggleFlag(question.id)}
            title={question.flagged ? "Unflag question" : "Flag question (double-click)"}
            className={`w-8 h-8 rounded text-xs transition-all flex items-center justify-center relative ${
              question.isCurrent 
                ? 'bg-primary text-primary-foreground' 
                : question.answered
                  ? 'bg-success/20 text-success border border-success/30'
                  : question.flagged
                    ? 'bg-warning/20 text-warning border border-warning/30'
                    : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            {question.isCurrent ? (
              <span className="font-bold">{question.id}</span>
            ) : question.answered ? (
              <CheckCircle className="w-3 h-3" />
            ) : (
              <span>{question.id}</span>
            )}
            
            {question.flagged && !question.isCurrent && (
              <Flag className="w-2.5 h-2.5 absolute -top-0.5 -right-0.5 text-warning fill-warning" />
            )}
          </button>
        ))}
      </div>
      
      <div className="mt-2 pt-2 border-t border-border text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Answered:</span>
          <span className="font-medium">{questions.filter(q => q.answered).length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Flagged:</span>
          <span className="font-medium text-warning">{questions.filter(q => q.flagged).length}</span>
        </div>
      </div>
    </div>
  )
}