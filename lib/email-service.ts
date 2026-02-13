// Email Service Configuration using Resend
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface EmailOptions {
  from: string
  to: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
  }>
}

interface TestReportData {
  studentName: string
  studentEmail: string
  overallScore: number
  maxScore: number
  percentage: number
  completionDate: string
  testResults: Array<{
    testName: string
    score: number
    maxScore: number
    percentage: number
    timeTaken: string
  }>
  performanceGrade: string
}

export class EmailService {
  static async sendTestReport(reportData: TestReportData): Promise<boolean> {
    try {
      const htmlContent = this.generateReportHTML(reportData)
      const textContent = this.generateReportText(reportData)

      const emailOptions: EmailOptions = {
        from: process.env.FROM_EMAIL || 'noreply@clap-test.com',
        to: reportData.studentEmail,
        subject: `CLAP Test Results - ${reportData.studentName}`,
        html: htmlContent,
        text: textContent
      }

      const response = await resend.emails.send(emailOptions)
      
      if (response.error) {
        console.error('Email sending failed:', response.error)
        return false
      }

      console.log('Email sent successfully:', response.data?.id)
      return true
    } catch (error) {
      console.error('Error sending email:', error)
      return false
    }
  }

  static async sendBulkReports(reports: TestReportData[]): Promise<{ success: number; failed: number }> {
    let successCount = 0
    let failedCount = 0

    for (const report of reports) {
      const success = await this.sendTestReport(report)
      if (success) {
        successCount++
      } else {
        failedCount++
      }
    }

    return { success: successCount, failed: failedCount }
  }

  private static generateReportHTML(reportData: TestReportData): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .score-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
            .test-results { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .test-results th, .test-results td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            .test-results th { background-color: #f2f2f2; font-weight: bold; }
            .grade-${reportData.performanceGrade.toLowerCase()} { 
              color: ${reportData.performanceGrade === 'Excellent' ? '#10b981' : 
                     reportData.performanceGrade === 'Good' ? '#3b82f6' : 
                     reportData.performanceGrade === 'Average' ? '#f59e0b' : '#ef4444'};
              font-weight: bold;
            }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>CLAP Test Results</h1>
            <p>English Language Proficiency Assessment</p>
          </div>
          
          <div class="content">
            <div class="score-card">
              <h2>Student: ${reportData.studentName}</h2>
              <p><strong>Overall Score:</strong> ${reportData.overallScore}/${reportData.maxScore} (${reportData.percentage}%)</p>
              <p><strong>Performance Grade:</strong> <span class="grade-${reportData.performanceGrade.toLowerCase()}">${reportData.performanceGrade}</span></p>
              <p><strong>Completion Date:</strong> ${new Date(reportData.completionDate).toLocaleDateString()}</p>
            </div>

            <h3>Test Breakdown</h3>
            <table class="test-results">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Time Taken</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.testResults.map(test => `
                  <tr>
                    <td><strong>${test.testName}</strong></td>
                    <td>${test.score}/${test.maxScore}</td>
                    <td>${test.percentage}%</td>
                    <td>${test.timeTaken}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="score-card">
              <h3>Next Steps</h3>
              <p>Based on your performance, we recommend:</p>
              <ul>
                ${this.getRecommendations(reportData.performanceGrade)}
              </ul>
            </div>
          </div>

          <div class="footer">
            <p>This is an automated report from the CLAP Test System.</p>
            <p>If you have any questions, please contact your administrator.</p>
          </div>
        </body>
      </html>
    `
  }

  private static generateReportText(reportData: TestReportData): string {
    let text = `CLAP Test Results - ${reportData.studentName}\n`
    text += `=====================================\n\n`
    text += `Student: ${reportData.studentName}\n`
    text += `Overall Score: ${reportData.overallScore}/${reportData.maxScore} (${reportData.percentage}%)\n`
    text += `Performance Grade: ${reportData.performanceGrade}\n`
    text += `Completion Date: ${new Date(reportData.completionDate).toLocaleDateString()}\n\n`
    
    text += `Test Breakdown:\n`
    text += `--------------\n`
    reportData.testResults.forEach(test => {
      text += `${test.testName}: ${test.score}/${test.maxScore} (${test.percentage}%) - Time: ${test.timeTaken}\n`
    })
    
    text += `\nNext Steps:\n`
    text += `-----------\n`
    this.getRecommendations(reportData.performanceGrade).forEach(rec => {
      text += `- ${rec.replace(/<[^>]*>/g, '')}\n`
    })
    
    return text
  }

  private static getRecommendations(grade: string): string[] {
    switch (grade) {
      case 'Excellent':
        return [
          'Continue practicing to maintain your high level of proficiency',
          'Consider advanced English courses or certification programs',
          'Focus on specialized vocabulary in your field of interest'
        ]
      case 'Good':
        return [
          'Practice regularly to improve consistency',
          'Work on areas where you scored lower',
          'Consider joining conversation groups to boost fluency'
        ]
      case 'Average':
        return [
          'Focus on fundamentals: grammar and vocabulary building',
          'Practice daily with structured exercises',
          'Seek additional tutoring or study resources'
        ]
      default:
        return [
          'Start with basic English grammar and vocabulary',
          'Practice with simple texts and conversations',
          'Consider foundational English courses'
        ]
    }
  }

  static async sendAdminNotification(adminEmail: string, message: string, subject: string = 'CLAP System Notification'): Promise<boolean> {
    try {
      const response = await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@clap-test.com',
        to: adminEmail,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #667eea; color: white; padding: 20px; text-align: center;">
              <h2>CLAP System Notification</h2>
            </div>
            <div style="padding: 20px; background: #f8f9fa;">
              <p>${message}</p>
              <hr style="margin: 20px 0;">
              <p style="color: #666; font-size: 14px;">
                This is an automated notification from the CLAP Test System.
              </p>
            </div>
          </div>
        `,
        text: message
      })

      return !response.error
    } catch (error) {
      console.error('Error sending admin notification:', error)
      return false
    }
  }
}