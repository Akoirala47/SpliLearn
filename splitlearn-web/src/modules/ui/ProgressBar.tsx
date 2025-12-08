type Props = {
  value: number
  className?: string
}

export function ProgressBar({ value, className = '' }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`h-2 rounded-full bg-white/10 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundImage: 'var(--gradient)' }} />
    </div>
  )
}


