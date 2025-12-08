import { useState } from 'react'
import { useClasses, useCreateClass, useDeleteClass, useUpdateClass } from './hooks'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { CountdownBar } from '../ui/CountdownBar'

type ExamRow = { id: string; class_id: string; title: string; date: string | null; created_at: string }

function useExamsByClasses(classIds: string[]) {
  return useQuery({
    queryKey: ['exams-by-classes', classIds.sort().join(',')],
    enabled: classIds.length > 0,
    queryFn: async (): Promise<Record<string, ExamRow[]>> => {
      if (classIds.length === 0) return {}
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .in('class_id', classIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      
      // Group exams by class_id
      const grouped: Record<string, ExamRow[]> = {}
      for (const exam of (data || [])) {
        if (!grouped[exam.class_id]) grouped[exam.class_id] = []
        grouped[exam.class_id].push(exam)
      }
      return grouped
    },
  })
}

export function ClassesPage() {
  const { data: classes } = useClasses()
  const createClass = useCreateClass()
  const updateClass = useUpdateClass()
  const deleteClass = useDeleteClass()
  const [newTitle, setNewTitle] = useState('')
  
  const classIds = (classes || []).map(c => c.id)
  const { data: examsByClass } = useExamsByClasses(classIds)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
        Classes
      </h1>
      <div className="glass p-3 rounded-2xl flex items-center gap-2 max-w-lg">
        <input className="flex-1 bg-transparent outline-none text-white placeholder:opacity-60" placeholder="New class title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button className="btn-pill" onClick={() => { if (newTitle.trim()) { createClass.mutate(newTitle.trim()); setNewTitle('') } }}>Add</button>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {(classes || []).map((c) => {
          const exams = examsByClass?.[c.id] || []
          
          return (
            <div key={c.id} className="glass p-4 rounded-2xl space-y-4">
              {/* Class Header */}
              <div className="flex items-center justify-between gap-2">
                <input 
                  className="flex-1 bg-transparent outline-none text-white text-lg font-medium" 
                  value={c.title} 
                  onChange={(e) => updateClass.mutate({ id: c.id, title: e.target.value })} 
                  placeholder="Class name"
                />
                <button 
                  className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-sm shrink-0" 
                  onClick={() => deleteClass.mutate(c.id)}
                >
                  Delete
                </button>
              </div>
              
              {/* Exam Count */}
              <div className="text-xs text-muted">
                {exams.length} exam{exams.length !== 1 ? 's' : ''}
              </div>
              
              {/* Exams List */}
              <div className="space-y-2">
                {exams.length > 0 ? (
                  exams.map((exam) => (
                    <Link
                      key={exam.id}
                      to={`/exams/${exam.id}`}
                      className="block glass p-3 rounded-xl hover:bg-white/5 transition-colors space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="opacity-60 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium text-sm truncate">{exam.title}</div>
                          <div className="text-xs text-muted">{exam.date ? new Date(exam.date).toLocaleDateString() : 'No date'}</div>
                        </div>
                      </div>
                      {exam.date && (
                        <CountdownBar examDate={exam.date} />
                      )}
                    </Link>
                  ))
                ) : (
                  <div className="text-sm text-muted text-center py-2">No exams yet</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


