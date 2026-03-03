'use client'

import { useState } from 'react'
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard'

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    // Simulate refresh
    await new Promise(resolve => setTimeout(resolve, 1000))
    setLoading(false)
  }

  return (
    <div className="p-6">
      <AnalyticsDashboard refreshData={handleRefresh} isLoading={loading} />
    </div>
  )
}
