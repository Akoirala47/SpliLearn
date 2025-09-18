import { Link } from 'react-router-dom'

export function ExamsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
        Exams
      </h1>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {[1,2,3].map((i) => (
          <Link key={i} to={`/exams/${i}`} className="glass p-4 rounded-2xl block">
            <div className="text-lg font-medium">Exam {i}</div>
            <div className="text-sm opacity-70">0 topics</div>
          </Link>
        ))}
      </div>
    </div>
  )
}


