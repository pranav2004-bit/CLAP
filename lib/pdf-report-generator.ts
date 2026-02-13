// PDF Report Generation Service
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'

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
  testAttempts: TestAttemptData[]
  performanceGrade: string
  strengths: string[]
  areasForImprovement: string[]
}

interface TestAttemptData {
  testName: string
  score: number
  maxScore: number
  percentage: number
  timeTaken: string
  correctAnswers: number
  totalQuestions: number
}

export class PDFReportGenerator {
  static generateStudentReport(reportData: StudentReport): TDocumentDefinitions {
    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      content: [
        // Header
        {
          columns: [
            {
              text: 'CLAP TEST REPORT',
              style: 'header'
            },
            {
              text: `Generated: ${new Date().toLocaleDateString()}`,
              style: 'subheader',
              alignment: 'right'
            }
          ]
        },
        
        // Student Information
        {
          text: 'Student Information',
          style: 'sectionHeader',
          margin: [0, 20, 0, 10]
        },
        {
          columns: [
            {
              text: [
                { text: 'Name: ', bold: true },
                `${reportData.studentName}\n`,
                { text: 'Email: ', bold: true },
                `${reportData.email}\n`,
                { text: 'College: ', bold: true },
                `${reportData.college}\n`,
                { text: 'Completion Date: ', bold: true },
                `${new Date(reportData.completionDate).toLocaleDateString()}`
              ]
            },
            {
              alignment: 'right',
              stack: [
                {
                  text: `${reportData.overallScore}/${reportData.maxPossibleScore}`,
                  style: 'overallScore'
                },
                {
                  text: `${reportData.overallPercentage}%`,
                  style: 'percentage'
                },
                {
                  text: reportData.performanceGrade,
                  style: 'grade'
                }
              ]
            }
          ]
        },

        // Test Performance Breakdown
        {
          text: 'Test Performance Breakdown',
          style: 'sectionHeader',
          margin: [0, 25, 0, 15],
          tocItem: true
        },
        ...this.generateTestTables(reportData.testAttempts),

        // Performance Analysis
        {
          text: 'Performance Analysis',
          style: 'sectionHeader',
          margin: [0, 25, 0, 15],
          tocItem: true
        },
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: 'Strengths', style: 'subsectionHeader' },
                ...reportData.strengths.map((strength: string) => ({
                  text: `• ${strength}`,
                  margin: [0, 5, 0, 5] as [number, number, number, number],
                  tocItem: false
                }))
              ]
            },
            {
              width: '*',
              stack: [
                { text: 'Areas for Improvement', style: 'subsectionHeader' },
                ...reportData.areasForImprovement.map((area: string) => ({
                  text: `• ${area}`,
                  margin: [0, 5, 0, 5] as [number, number, number, number],
                  tocItem: false
                }))
              ]
            }
          ]
        },

        // Summary Statistics
        {
          text: 'Summary Statistics',
          style: 'sectionHeader',
          margin: [0, 25, 0, 15],
          tocItem: true
        },
        {
          columns: [
            this.createStatBox('Tests Completed', reportData.testsCompleted.toString(), '#3b82f6'),
            this.createStatBox('Average Score', `${Math.round(reportData.testAttempts.reduce((acc: number, test: TestAttemptData) => acc + test.percentage, 0) / reportData.testAttempts.length)}%`, '#10b981'),
            this.createStatBox('High Scores', reportData.testAttempts.filter((t: TestAttemptData) => t.percentage >= 80).length.toString(), '#8b5cf6'),
            this.createStatBox('Total Time', reportData.totalTimeTaken, '#f59e0b')
          ]
        }
      ],
      
      styles: {
        header: {
          fontSize: 24,
          bold: true,
          color: '#1e40af'
        },
        subheader: {
          fontSize: 12,
          color: '#6b7280'
        },
        sectionHeader: {
          fontSize: 18,
          bold: true,
          color: '#1f2937'
        },
        subsectionHeader: {
          fontSize: 14,
          bold: true,
          color: '#374151',
          margin: [0, 0, 0, 10]
        },
        overallScore: {
          fontSize: 32,
          bold: true,
          color: '#1e40af'
        },
        percentage: {
          fontSize: 20,
          color: '#6b7280'
        },
        grade: {
          fontSize: 16,
          bold: true,
          color: '#10b981'
        }
      },
      
      defaultStyle: {
        fontSize: 11,
        color: '#374151'
      }
    }

    return docDefinition
  }

  private static generateTestTables(testAttempts: TestAttemptData[]): Content[] {
    const tableBody = [
      [
        { text: 'Test Name', style: 'tableHeader' },
        { text: 'Score', style: 'tableHeader' },
        { text: 'Percentage', style: 'tableHeader' },
        { text: 'Time Taken', style: 'tableHeader' },
        { text: 'Accuracy', style: 'tableHeader' }
      ],
      ...testAttempts.map(attempt => [
        { text: attempt.testName, bold: true },
        { text: `${attempt.score}/${attempt.maxScore}` },
        { 
          text: `${attempt.percentage}%`,
          color: attempt.percentage >= 80 ? '#10b981' : attempt.percentage >= 60 ? '#f59e0b' : '#ef4444'
        },
        { text: attempt.timeTaken },
        { text: `${attempt.correctAnswers}/${attempt.totalQuestions}` }
      ])
    ]

    return [
      {
        table: {
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: tableBody
        },
        layout: {
          fillColor: (rowIndex: number) => rowIndex === 0 ? '#f3f4f6' : null,
          hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 2 : 1,
          vLineWidth: () => 1,
          hLineColor: () => '#e5e7eb',
          vLineColor: () => '#e5e7eb'
        }
      }
    ]
  }

  private static createStatBox(title: string, value: string, color: string): Content {
    return {
      stack: [
        {
          text: value,
          style: 'statValue',
          color: color
        },
        {
          text: title,
          style: 'statTitle'
        }
      ],
      alignment: 'center',
      margin: [0, 0, 15, 0]
    }
  }

  static async downloadReport(reportData: StudentReport, filename?: string): Promise<void> {
    try {
      // Simple blob-based approach for now
      const content = this.generateSimpleReportContent(reportData)
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `CLAP_Report_${reportData.studentName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error generating report:', error)
      throw new Error('Failed to generate report')
    }
  }

  static async printReport(reportData: StudentReport): Promise<void> {
    try {
      const content = this.generateSimpleReportContent(reportData)
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>CLAP Test Report</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .section { margin-bottom: 20px; }
                .test-table { width: 100%; border-collapse: collapse; }
                .test-table th, .test-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                .test-table th { background-color: #f2f2f2; }
              </style>
            </head>
            <body>
              ${content}
            </body>
          </html>
        `)
        printWindow.document.close()
        printWindow.print()
      }
    } catch (error) {
      console.error('Error printing report:', error)
      throw new Error('Failed to print report')
    }
  }

  private static generateSimpleReportContent(reportData: StudentReport): string {
    let content = `<div class="header">
      <h1>CLAP TEST REPORT</h1>
      <p>Generated: ${new Date().toLocaleDateString()}</p>
    </div>
    
    <div class="section">
      <h2>Student Information</h2>
      <p><strong>Name:</strong> ${reportData.studentName}</p>
      <p><strong>Email:</strong> ${reportData.email}</p>
      <p><strong>College:</strong> ${reportData.college}</p>
      <p><strong>Completion Date:</strong> ${new Date(reportData.completionDate).toLocaleDateString()}</p>
      <p><strong>Overall Score:</strong> ${reportData.overallScore}/${reportData.maxPossibleScore} (${reportData.overallPercentage}%)</p>
      <p><strong>Performance Grade:</strong> ${reportData.performanceGrade}</p>
    </div>
    
    <div class="section">
      <h2>Test Performance Breakdown</h2>
      <table class="test-table">
        <tr>
          <th>Test Name</th>
          <th>Score</th>
          <th>Percentage</th>
          <th>Time Taken</th>
          <th>Accuracy</th>
        </tr>`
    
    reportData.testAttempts.forEach(attempt => {
      content += `
        <tr>
          <td><strong>${attempt.testName}</strong></td>
          <td>${attempt.score}/${attempt.maxScore}</td>
          <td>${attempt.percentage}%</td>
          <td>${attempt.timeTaken}</td>
          <td>${attempt.correctAnswers}/${attempt.totalQuestions}</td>
        </tr>`
    })
    
    content += `</table></div>
    
    <div class="section">
      <h2>Performance Analysis</h2>
      <div style="display: flex; gap: 40px;">
        <div>
          <h3>Strengths</h3>
          <ul>`
    
    reportData.strengths.forEach(strength => {
      content += `<li>${strength}</li>`
    })
    
    content += `</ul></div>
        <div>
          <h3>Areas for Improvement</h3>
          <ul>`
    
    reportData.areasForImprovement.forEach(area => {
      content += `<li>${area}</li>`
    })
    
    content += `</ul></div></div></div>
    
    <div class="section">
      <h2>Summary Statistics</h2>
      <p><strong>Tests Completed:</strong> ${reportData.testsCompleted}/${reportData.totalTests}</p>
      <p><strong>Average Score:</strong> ${Math.round(reportData.testAttempts.reduce((acc, test) => acc + test.percentage, 0) / reportData.testAttempts.length)}%</p>
      <p><strong>High Scores (80%+):</strong> ${reportData.testAttempts.filter(t => t.percentage >= 80).length}</p>
      <p><strong>Total Time:</strong> ${reportData.totalTimeTaken}</p>
    </div>`
    
    return content
  }
}