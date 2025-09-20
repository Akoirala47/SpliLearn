import { useState } from 'react'
import { useTopicsByExam } from './hooks'

export function StudyGuide({ examId }: { examId: string }) {
  const { data: topics } = useTopicsByExam(examId)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (!topics || topics.length === 0) return <div className="text-sm text-muted">No topics yet</div>

  return (
    <div className="space-y-3">
      {topics.map(t => {
        const isOpen = expanded[t.id]
        return (
          <div key={t.id} className="glass p-4 rounded-2xl">
            <button className="w-full text-left flex items-center justify-between" onClick={() => setExpanded(s => ({ ...s, [t.id]: !isOpen }))}>
              <div className="text-white font-medium">{t.title}</div>
              <div className="text-white/70">{isOpen ? '▴' : '▾'}</div>
            </button>
            {isOpen ? (
              <div className="mt-3 space-y-2">
                {(t.subpoints_json || []).map((sp, i) => (
                  <div key={i} className="text-sm text-white/90">• {sp}</div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}


