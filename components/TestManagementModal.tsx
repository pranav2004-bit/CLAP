'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  Edit3, 
  FileText,
  Headphones,
  Mic,
  BookOpen,
  PenTool,
  Brain,
  CheckCircle,
  Clock,
  Settings
} from 'lucide-react'

import type { TestFormData, QuestionFormData } from '@/lib/admin-api-client'

interface TestModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (testData: TestFormData) => void
  initialData?: TestFormData | null
}

const TEST_TYPES = [
  { value: 'listening', label: 'Listening', icon: Headphones },
  { value: 'reading', label: 'Reading', icon: BookOpen },
  { value: 'speaking', label: 'Speaking', icon: Mic },
  { value: 'writing', label: 'Writing', icon: PenTool },
  { value: 'vocabulary', label: 'Vocabulary', icon: Brain }
]

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'essay', label: 'Essay' }
]

export function TestManagementModal({ isOpen, onClose, onSave, initialData }: TestModalProps) {
  const [formData, setFormData] = useState<TestFormData>({
    name: '',
    type: 'listening',
    duration_minutes: 20,
    total_questions: 10,
    instructions: '',
    status: 'draft',
    questions: []
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize form with existing data or reset for new test
  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        questions: initialData.questions?.map(q => ({ ...q })) || []
      })
    } else {
      setFormData({
        name: '',
        type: 'listening',
        duration_minutes: 20,
        total_questions: 10,
        instructions: '',
        status: 'draft',
        questions: []
      })
    }
    setErrors({})
  }, [initialData, isOpen])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Test name is required'
    }

    if (formData.duration_minutes <= 0) {
      newErrors.duration = 'Duration must be greater than 0'
    }

    if (formData.total_questions <= 0) {
      newErrors.questions = 'Number of questions must be greater than 0'
    }

    if (!formData.instructions.trim()) {
      newErrors.instructions = 'Instructions are required'
    }

    // Validate questions
    formData.questions.forEach((question, index) => {
      if (!question.question_text.trim()) {
        newErrors[`question_${index}_text`] = `Question ${index + 1} text is required`
      }

      if (question.question_type === 'mcq') {
        if (!question.options || question.options.length < 2) {
          newErrors[`question_${index}_options`] = `Question ${index + 1} must have at least 2 options`
        }
        if (!question.correct_answer) {
          newErrors[`question_${index}_correct`] = `Question ${index + 1} must have a correct answer`
        }
      }

      if (question.points <= 0) {
        newErrors[`question_${index}_points`] = `Question ${index + 1} points must be greater than 0`
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        questions: formData.questions.map((q, index) => ({
          ...q,
          order_index: index + 1
        }))
      })
      onClose()
    } catch (error) {
      console.error('Error saving test:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const addQuestion = () => {
    setFormData(prev => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          question_text: '',
          question_type: 'mcq',
          options: ['', ''],
          correct_answer: '',
          points: 1,
          order_index: prev.questions.length + 1,
          test_id: formData.id
        }
      ]
    }))
  }

  const updateQuestion = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => 
        i === index ? { ...q, [field]: value } : q
      )
    }))
  }

  const addOption = (questionIndex: number) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => 
        i === questionIndex 
          ? { ...q, options: [...(q.options || []), ''] }
          : q
      )
    }))
  }

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => 
        i === questionIndex 
          ? { 
              ...q, 
              options: q.options?.map((opt, j) => j === optionIndex ? value : opt) || []
            }
          : q
      )
    }))
  }

  const removeQuestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {initialData ? 'Edit Test' : 'Create New Test'}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Test Name */}
            <div className="md:col-span-2">
              <Label htmlFor="name">Test Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
            </div>

            {/* Test Type */}
            <div>
              <Label>Test Type *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {TEST_TYPES.map(type => {
                  const Icon = type.icon
                  return (
                    <Button
                      key={type.value}
                      type="button"
                      variant={formData.type === type.value ? 'default' : 'outline'}
                      className="flex items-center gap-2"
                      onClick={() => setFormData(prev => ({ ...prev, type: type.value as any }))}
                    >
                      <Icon className="w-4 h-4" />
                      {type.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Duration and Questions */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="duration">Test Duration (minutes) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  max="180"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
                  className={errors.duration ? 'border-red-500' : ''}
                />
                <p className="text-sm text-muted-foreground mt-1">Maximum 180 minutes (3 hours)</p>
                {errors.duration && <p className="text-sm text-red-500 mt-1">{errors.duration}</p>}
              </div>
              
              <div>
                <Label htmlFor="questions">Total Questions *</Label>
                <Input
                  id="questions"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.total_questions}
                  onChange={(e) => setFormData(prev => ({ ...prev, total_questions: parseInt(e.target.value) || 0 }))}
                  className={errors.questions ? 'border-red-500' : ''}
                />
                <p className="text-sm text-muted-foreground mt-1">Maximum 100 questions per test</p>
                {errors.questions && <p className="text-sm text-red-500 mt-1">{errors.questions}</p>}
              </div>
            </div>

            {/* Status */}
            <div>
              <Label>Status</Label>
              <div className="flex gap-2 mt-2">
                {(['draft', 'published', 'archived'] as const).map(status => (
                  <Button
                    key={status}
                    type="button"
                    variant={formData.status === status ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, status }))}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="md:col-span-2">
              <Label htmlFor="instructions">Instructions *</Label>
              <Textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                rows={4}
                className={errors.instructions ? 'border-red-500' : ''}
              />
              {errors.instructions && <p className="text-sm text-red-500 mt-1">{errors.instructions}</p>}
            </div>
          </div>

          {/* Questions Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Questions</h3>
              <Button type="button" onClick={addQuestion} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Question
              </Button>
            </div>

            <div className="space-y-4">
              {formData.questions.map((question, index) => (
                <Card key={index} className="border border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium">Question {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Question Text */}
                      <div className="md:col-span-2">
                        <Label>Question Text *</Label>
                        <Textarea
                          value={question.question_text}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateQuestion(index, 'question_text', e.target.value)}
                          rows={2}
                          className={errors[`question_${index}_text`] ? 'border-red-500' : ''}
                        />
                        {errors[`question_${index}_text`] && (
                          <p className="text-sm text-red-500 mt-1">{errors[`question_${index}_text`]}</p>
                        )}
                      </div>

                      {/* Question Type */}
                      <div>
                        <Label>Question Type</Label>
                        <select
                          value={question.question_type}
                          onChange={(e) => updateQuestion(index, 'question_type', e.target.value)}
                          className="w-full p-2 border rounded-md"
                        >
                          {QUESTION_TYPES.map(type => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Points */}
                      <div>
                        <Label>Points</Label>
                        <Input
                          type="number"
                          min="1"
                          value={question.points}
                          onChange={(e) => updateQuestion(index, 'points', parseInt(e.target.value) || 0)}
                          className={errors[`question_${index}_points`] ? 'border-red-500' : ''}
                        />
                        {errors[`question_${index}_points`] && (
                          <p className="text-sm text-red-500 mt-1">{errors[`question_${index}_points`]}</p>
                        )}
                      </div>

                      {/* Options (MCQ only) */}
                      {question.question_type === 'mcq' && (
                        <div className="md:col-span-2">
                          <Label>Answer Options *</Label>
                          <div className="space-y-3 mt-2">
                            {question.options?.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex gap-3 items-start">
                                <div className="flex-1">
                                  <Input
                                    value={option}
                                    onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                                    placeholder={`Option ${optionIndex + 1}`}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant={question.correct_answer === optionIndex.toString() ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => updateQuestion(index, 'correct_answer', optionIndex.toString())}
                                  className="whitespace-nowrap min-w-[100px]"
                                >
                                  {question.correct_answer === optionIndex.toString() ? (
                                    <><CheckCircle className="w-4 h-4 mr-1" /> Correct</>
                                  ) : (
                                    'Mark Correct'
                                  )}
                                </Button>
                                {question.options && question.options.length > 2 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      // Remove option logic would go here
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addOption(index)}
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Option
                              </Button>
                              <Badge variant="secondary" className="ml-2">
                                {question.correct_answer !== undefined ? '✓ Answer Selected' : '! No Correct Answer'}
                              </Badge>
                            </div>
                            {errors[`question_${index}_options`] && (
                              <p className="text-sm text-red-500">{errors[`question_${index}_options`]}</p>
                            )}
                            {errors[`question_${index}_correct`] && (
                              <p className="text-sm text-red-500">{errors[`question_${index}_correct`]}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </CardContent>

        <div className="border-t p-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {initialData ? 'Update Test' : 'Create Test'}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}