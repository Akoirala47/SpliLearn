import { useMemo } from 'react'

interface CountdownBarProps {
  examDate: string | null
  className?: string
}

export function CountdownBar({ examDate, className = '' }: CountdownBarProps) {
  // calculate days remaining, progress percentage, and status color based on exam date
  const { daysRemaining, daysPassed, percentage, isOverdue, status } = useMemo(() => {
    if (!examDate) {
      return { daysRemaining: null, daysPassed: null, percentage: 0, isOverdue: false, status: 'no-date' }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const exam = new Date(examDate)
    exam.setHours(0, 0, 0, 0)
    
    const diffTime = exam.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    const daysRemaining = diffDays
    const daysPassed = Math.max(0, 30 - daysRemaining)
    const isOverdue = diffDays < 0
    
    const maxDays = 30
    let percentage = 100
    
    if (isOverdue) {
      percentage = 0
    } else if (daysRemaining > maxDays) {
      percentage = 100
    } else {
      percentage = (daysRemaining / maxDays) * 100
    }
    
    // determine status color based on urgency
    let status: 'good' | 'warning' | 'urgent' | 'overdue' | 'no-date' = 'no-date'
    if (isOverdue) {
      status = 'overdue'
    } else if (daysRemaining <= 7) {
      status = 'urgent'
    } else if (daysRemaining <= 14) {
      status = 'warning'
    } else {
      status = 'good'
    }
    
    return { daysRemaining, daysPassed, percentage: Math.min(100, Math.max(0, percentage)), isOverdue, status }
  }, [examDate])

  if (!examDate) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1 h-2 rounded-full bg-white/10" />
        <span className="text-xs text-muted">No date set</span>
      </div>
    )
  }

  // return tailwind color class for progress bar based on status
  const getBarColor = () => {
    switch (status) {
      case 'overdue':
        return 'bg-red-500'
      case 'urgent':
        return 'bg-orange-500'
      case 'warning':
        return 'bg-yellow-500'
      case 'good':
        return 'bg-green-500'
      default:
        return 'bg-blue-500'
    }
  }

  // format days remaining text with special cases for today/tomorrow/overdue
  const getStatusText = () => {
    if (isOverdue) {
      return `${Math.abs(daysRemaining!)} day${Math.abs(daysRemaining!) !== 1 ? 's' : ''} overdue`
    }
    if (daysRemaining === 0) {
      return 'Today'
    }
    if (daysRemaining === 1) {
      return 'Tomorrow'
    }
    return `${daysRemaining} days left`
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 relative">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${getBarColor()}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="absolute inset-0 flex justify-between items-center pointer-events-none">
          {[0, 10, 20, 30].map((day) => {
            const position = ((30 - day) / 30) * 100
            return (
              <div
                key={day}
                className="h-2 w-0.5 bg-white/20"
                style={{
                  left: `${position}%`,
                  transform: 'translateX(-50%)',
                }}
              />
            )
          })}
        </div>
      </div>
      <span className={`text-xs font-medium whitespace-nowrap ${
        status === 'overdue' ? 'text-red-400' :
        status === 'urgent' ? 'text-orange-400' :
        status === 'warning' ? 'text-yellow-400' :
        'text-green-400'
      }`}>
        {getStatusText()}
      </span>
    </div>
  )
}

