export function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
        Welcome back
      </h1>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <div className="glass p-4 rounded-2xl">
          <div className="text-sm opacity-70">Quick Start</div>
          <div className="mt-2">Upload slides to create an exam</div>
        </div>
        <div className="glass p-4 rounded-2xl">
          <div className="text-sm opacity-70">Recent Exams</div>
          <div className="mt-2">No exams yet</div>
        </div>
        <div className="glass p-4 rounded-2xl">
          <div className="text-sm opacity-70">Study Streak</div>
          <div className="mt-2">Start your first session</div>
        </div>
      </div>
    </div>
  )
}


