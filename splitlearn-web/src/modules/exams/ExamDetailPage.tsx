import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export function ExamDetailPage() {
  const { examId } = useParams()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
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
      <div className="glass p-4 rounded-2xl max-w-xl space-y-2">
        <div className="text-sm opacity-70">Slides</div>
        <input className="block" type="file" accept=".pdf,.ppt,.pptx" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file || !examId) return
          const key = `${examId}/${Date.now()}-${file.name}`
          const { data, error } = await supabase.storage.from('slides').upload(key, file)
          if (error) { console.error(error); return }
          const fileUrl = data?.path
          const { error: insertErr } = await supabase.from('slides').insert({ exam_id: examId, file_url: fileUrl })
          if (insertErr) console.error(insertErr)
        }} />
      </div>
    </div>
  )
}


