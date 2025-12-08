import { Link } from 'react-router-dom'
import { useProfile } from '../profile/useProfile'
import { GlassCard } from '../ui/GlassCard'
import { ProgressBar } from '../ui/ProgressBar'

export function DashboardPage() {
  const { firstName } = useProfile()
  return (
    <div className="space-y-6">
      <h1 className="text-3xl md:text-4xl font-semibold text-neutral-950 dark:text-white" style={{ fontFamily: 'var(--font-heading)' }}>
        Welcome back, {firstName}
      </h1>
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <GlassCard>
          <div className="text-sm text-muted">Quick Start</div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-white">Upload slides to create an exam</div>
            <Link to="/classes" className="btn-pill focus-ring">Start</Link>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="text-sm text-muted">Recent Exams</div>
          <div className="mt-2 text-white">No exams yet</div>
        </GlassCard>
        <GlassCard>
          <div className="text-sm text-muted">Study Progress</div>
          <div className="mt-2"><ProgressBar value={0} /></div>
        </GlassCard>
      </div>
    </div>
  )
}


