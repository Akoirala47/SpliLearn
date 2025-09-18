export function ClassesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
        Classes
      </h1>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {[1,2,3].map((i) => (
          <div key={i} className="glass p-4 rounded-2xl">
            <div className="text-lg font-medium">Class {i}</div>
            <div className="text-sm opacity-70">0 exams</div>
          </div>
        ))}
      </div>
    </div>
  )
}


