import { useId } from 'react'

type Props = {
  value: number // 0-100
  size?: number // this is the diameter in pixels
  strokeWidth?: number
  className?: string
  children?: React.ReactNode
}

export function CircularProgress({ value, size = 120, strokeWidth = 8, className = '', children }: Props) {
  const gradientId = useId()
  // calculate circle radius and stroke dash offset for progress visualization
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const pct = Math.max(0, Math.min(100, value))
  const offset = circumference - (pct / 100) * circumference
  
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-primary, #007AFF)" />
            <stop offset="100%" stopColor="var(--color-secondary, #AF52DE)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

