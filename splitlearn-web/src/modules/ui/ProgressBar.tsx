type Props = {
  value: number
}

export function ProgressBar({ value }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundImage: 'var(--gradient)' }} />
    </div>
  )
}


