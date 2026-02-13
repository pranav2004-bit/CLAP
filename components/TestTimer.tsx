'use client'

import { useTestTimer } from '@/hooks/useTestTimer'
import { Clock, AlertTriangle, Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface TestTimerProps {
  initialTime: number // in seconds
  onTimeUp: () => void
  onPause?: () => void
  onResume?: () => void
  showControls?: boolean
  isAdmin?: boolean
  testName?: string
}

export function TestTimer({
  initialTime,
  onTimeUp,
  onPause,
  onResume,
  showControls = false,
  isAdmin = false,
  testName = 'Test'
}: TestTimerProps) {
  const {
    timeRemaining,
    isRunning,
    isPaused,
    isCritical,
    isWarning,
    pauseTimer,
    resumeTimer,
    restoreTimer
  } = useTestTimer({ initialTime, testName, onTimeUp })

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format time with hours for longer durations
  const formatTimeWithHours = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handlePause = () => {
    if (isAdmin) {
      pauseTimer()
      onPause?.()
    }
  }

  const handleResume = () => {
    if (isAdmin) {
      resumeTimer()
      onResume?.()
    }
  }

  const handleStop = () => {
    if (isAdmin) {
      onTimeUp()
    }
  }

  return (
    <Card className={`p-4 ${isCritical ? 'border-destructive bg-destructive/10 animate-pulse' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${
            isCritical ? 'bg-destructive text-destructive-foreground' :
            isWarning ? 'bg-warning text-warning-foreground' :
            'bg-primary text-primary-foreground'
          }`}>
            <Clock className="w-5 h-5" />
          </div>
          
          <div>
            <p className="text-sm text-muted-foreground">{testName} Time Remaining</p>
            <p className={`text-2xl font-mono font-bold ${
              isCritical ? 'text-destructive' :
              isWarning ? 'text-warning' :
              'text-foreground'
            }`}>
              {initialTime >= 3600 ? formatTimeWithHours(timeRemaining) : formatTime(timeRemaining)}
            </p>
          </div>
        </div>

        {isWarning && !isCritical && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-warning/20 text-warning">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">5 min warning</span>
          </div>
        )}

        {isCritical && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-destructive text-destructive-foreground">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Time almost up!</span>
          </div>
        )}

        {showControls && isAdmin && (
          <div className="flex items-center gap-2">
            {isPaused ? (
              <Button size="sm" onClick={handleResume}>
                <Play className="w-4 h-4 mr-1" />
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handlePause}>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={handleStop}>
              <Square className="w-4 h-4 mr-1" />
              Stop
            </Button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="w-full bg-secondary rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-1000 ${
              isCritical ? 'bg-destructive' :
              isWarning ? 'bg-warning' :
              'bg-primary'
            }`}
            style={{ 
              width: `${((initialTime - timeRemaining) / initialTime) * 100}%` 
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Started</span>
          <span>{Math.round(((initialTime - timeRemaining) / initialTime) * 100)}% complete</span>
          <span>End</span>
        </div>
      </div>
    </Card>
  )
}