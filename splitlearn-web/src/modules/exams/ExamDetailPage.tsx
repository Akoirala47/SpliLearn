import { Link, useParams } from 'react-router-dom'

export function ExamDetailPage() {
  const { examId } = useParams()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
          Exam {examId}
        </h1>
        <Link to={`/exams/${examId}/learn`} className="px-4 py-2 rounded-full text-white brand-gradient">
          Let’s Learn
        </Link>
      </div>
      <div className="glass p-4 rounded-2xl">
        <div className="text-sm opacity-70">Study Guide</div>
        <div className="mt-2 text-sm">No topics yet</div>
      </div>
    </div>
  )
}


