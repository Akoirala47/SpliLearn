type Props = {
  children: React.ReactNode
  className?: string
}

export function GlassCard({ children, className = '' }: Props) {
  return (
    <div className={`glass p-4 rounded-2xl shadow-lg ${className}`}>{children}</div>
  )
}


