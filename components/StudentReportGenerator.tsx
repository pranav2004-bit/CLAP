'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PDFReportGenerator } from '@/lib/pdf-report-generator'
import { 
  FileText, 
  Download, 
  Printer,
  Award,
  Trophy,
  Star,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  User,
  School,
  TrendingUp,
  Headphones,
  BookOpen,
  Brain,
  PenTool,
  Mic,
  X
} from 'lucide-react'

interface TestAttempt {
  id: string
  testName: string
  testType: string
  score: number
  maxScore: number
  percentage: number
  status: 'completed' | 'in_progress' | 'not_started'
  startedAt: string
  completedAt: string
  timeTaken: string
  questionsAttempted: number
  correctAnswers: number
  totalQuestions: number
}

interface StudentReport {
  studentId: string
  studentName: string
  email: string
  college: string
  overallScore: number
  maxPossibleScore: number
  overallPercentage: number
  completionDate: string
  totalTimeTaken: string
  testsCompleted: number
  totalTests: number
  testAttempts: TestAttempt[]
  performanceGrade: 'Excellent' | 'Good' | 'Average' | 'Needs Improvement'
  strengths: string[]
  areasForImprovement: string[]
}

interface StudentReportGeneratorProps {
  studentId: string
  onClose: () => void
}

export function StudentReportGenerator({ studentId, onClose }: StudentReportGeneratorProps) {
  const [reportData, setReportData] = useState<StudentReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate fetching detailed student report data
    const fetchStudentReport = async () => {
      setIsLoading(true)
      
      // Mock data - in real implementation, this would come from API
      const mockReport: StudentReport = {
        studentId: studentId,
        studentName: 'Emma Davis',
        email: 'emma.davis@student.edu',
        college: 'Sample University',
        overallScore: 42,
        maxPossibleScore: 50,
        overallPercentage: 84,
        completionDate: '2024-02-07',
        totalTimeTaken: '2h 15m',
        testsCompleted: 5,
        totalTests: 5,
        performanceGrade: 'Excellent',
        strengths: ['Strong vocabulary skills', 'Good reading comprehension', 'Consistent performance'],
        areasForImprovement: ['Speaking fluency needs practice', 'Writing structure could be improved'],
        testAttempts: [
          {
            id: '1',
            testName: 'Listening Test',
            testType: 'listening',
            score: 9,
            maxScore: 10,
            percentage: 90,
            status: 'completed',
            startedAt: '2024-02-07T10:00:00Z',
            completedAt: '2024-02-07T10:25:00Z',
            timeTaken: '25:00',
            questionsAttempted: 10,
            correctAnswers: 9,
            totalQuestions: 10
          },
          {
            id: '2',
            testName: 'Reading Test',
            testType: 'reading',
            score: 8,
            maxScore: 10,
            percentage: 80,
            status: 'completed',
            startedAt: '2024-02-07T10:30:00Z',
            completedAt: '2024-02-07T11:00:00Z',
            timeTaken: '30:00',
            questionsAttempted: 10,
            correctAnswers: 8,
            totalQuestions: 10
          },
          {
            id: '3',
            testName: 'Vocabulary Test',
            testType: 'vocabulary',
            score: 10,
            maxScore: 10,
            percentage: 100,
            status: 'completed',
            startedAt: '2024-02-07T11:05:00Z',
            completedAt: '2024-02-07T11:20:00Z',
            timeTaken: '15:00',
            questionsAttempted: 10,
            correctAnswers: 10,
            totalQuestions: 10
          },
          {
            id: '4',
            testName: 'Writing Test',
            testType: 'writing',
            score: 7,
            maxScore: 10,
            percentage: 70,
            status: 'completed',
            startedAt: '2024-02-07T11:25:00Z',
            completedAt: '2024-02-07T12:10:00Z',
            timeTaken: '45:00',
            questionsAttempted: 1,
            correctAnswers: 1,
            totalQuestions: 1
          },
          {
            id: '5',
            testName: 'Speaking Test',
            testType: 'speaking',
            score: 8,
            maxScore: 10,
            percentage: 80,
            status: 'completed',
            startedAt: '2024-02-07T12:15:00Z',
            completedAt: '2024-02-07T12:35:00Z',
            timeTaken: '20:00',
            questionsAttempted: 1,
            correctAnswers: 1,
            totalQuestions: 1
          }
        ]
      }

      // Simulate API delay
      setTimeout(() => {
        setReportData(mockReport)
        setIsLoading(false)
      }, 800)
    }

    fetchStudentReport()
  }, [studentId])

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'Excellent': return 'text-green-600 bg-green-100'
      case 'Good': return 'text-blue-600 bg-blue-100'
      case 'Average': return 'text-yellow-600 bg-yellow-100'
      case 'Needs Improvement': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getTestIcon = (testType: string) => {
    switch (testType) {
      case 'listening': return <Headphones className="w-5 h-5" />
      case 'reading': return <BookOpen className="w-5 h-5" />
      case 'vocabulary': return <Brain className="w-5 h-5" />
      case 'writing': return <PenTool className="w-5 h-5" />
      case 'speaking': return <Mic className="w-5 h-5" />
      default: return <FileText className="w-5 h-5" />
    }
  }

  const exportReport = async (format: 'pdf' | 'excel' | 'print') => {
    try {
      if (format === 'print') {
        await PDFReportGenerator.printReport(reportData!)
      } else {
        await PDFReportGenerator.downloadReport(reportData!, `CLAP_Report_${reportData!.studentName.replace(/\s+/g, '_')}.txt`)
      }
    } catch (error) {
      console.error(`Error exporting report as ${format}:`, error)
    }
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Generating student report...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!reportData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Unable to generate report</p>
            <Button onClick={onClose} className="mt-4">Close</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Award className="w-6 h-6 text-primary" />
                Student Performance Report
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Detailed assessment results for {reportData.studentName}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportReport('pdf')}>
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportReport('excel')}>
                <FileText className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportReport('print')}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {/* Student Information */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Student Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{reportData.studentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{reportData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">College:</span>
                  <span className="font-medium">{reportData.college}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completion Date:</span>
                  <span className="font-medium">{new Date(reportData.completionDate).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  Overall Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">
                  {reportData.overallScore}<span className="text-2xl text-muted-foreground">/{reportData.maxPossibleScore}</span>
                </div>
                <div className="text-2xl font-semibold mb-3">{reportData.overallPercentage}%</div>
                <Badge className={`${getGradeColor(reportData.performanceGrade)} text-lg px-4 py-2`}>
                  {reportData.performanceGrade}
                </Badge>
                <div className="mt-3 text-sm text-muted-foreground">
                  Completed in {reportData.totalTimeTaken}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Test Performance Breakdown */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Test Performance Breakdown
            </h3>
            <div className="grid gap-4">
              {reportData.testAttempts.map((attempt) => (
                <Card key={attempt.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          {getTestIcon(attempt.testType)}
                        </div>
                        <div>
                          <h4 className="font-semibold">{attempt.testName}</h4>
                          <p className="text-sm text-muted-foreground">
                            {attempt.timeTaken} • {attempt.questionsAttempted}/{attempt.totalQuestions} questions
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold">
                          {attempt.score}<span className="text-muted-foreground">/{attempt.maxScore}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">{attempt.percentage}%</div>
                        <Badge variant="secondary" className="mt-1">
                          {attempt.correctAnswers} correct
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${attempt.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Performance Analysis */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-green-600" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {reportData.strengths.map((strength, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {reportData.areasForImprovement.map((area, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-blue-600" />
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Summary Statistics */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Summary Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-primary/5 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{reportData.testsCompleted}</div>
                  <div className="text-sm text-muted-foreground">Tests Completed</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(reportData.testAttempts.reduce((acc, test) => acc + test.percentage, 0) / reportData.testAttempts.length)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Average Score</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {reportData.testAttempts.filter(t => t.percentage >= 80).length}
                  </div>
                  <div className="text-sm text-muted-foreground">High Scores (80%+)</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {Math.round((reportData.testAttempts.reduce((acc, test) => acc + parseInt(test.timeTaken.split(':')[0]), 0) / reportData.testAttempts.length) * 60 +
                    reportData.testAttempts.reduce((acc, test) => acc + parseInt(test.timeTaken.split(':')[1]), 0) / reportData.testAttempts.length)}m
                  </div>
                  <div className="text-sm text-muted-foreground">Avg. Time per Test</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}