import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useExams, useCreateExam, useDeleteExam, useUpdateExam } from './hooks'
import { useClasses } from '../classes/hooks'

export function ExamsPage() {
  const { data: classes } = useClasses()
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!selectedClassId && classes && classes.length > 0) {
      setSelectedClassId(classes[0].id)
    }
  }, [classes, selectedClassId])
  const { data: exams } = useExams(selectedClassId)
  const createExam = useCreateExam(selectedClassId ?? '')
  const updateExam = useUpdateExam(selectedClassId ?? '')
  const deleteExam = useDeleteExam(selectedClassId ?? '')
  const [newTitle, setNewTitle] = useState('')
  const canCreate = useMemo(() => !!(newTitle.trim() && selectedClassId), [newTitle, selectedClassId])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
        Exams
      </h1>
      <div className="glass p-3 rounded-2xl flex items-center gap-3 max-w-xl">
        <div className="relative">
          <select className="appearance-none bg-transparent text-white pr-8 pl-3 py-1 rounded-md focus-ring" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
            {(classes || []).map(c => <option className="text-black" key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/70">▾</span>
        </div>
        <input className="flex-1 bg-transparent outline-none text-white placeholder:opacity-60" placeholder="New exam title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button className="btn-pill disabled:opacity-40" disabled={!canCreate} onClick={() => { if (canCreate) { createExam.mutate(newTitle.trim()); setNewTitle('') } }}>Add</button>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {(exams || []).map((e) => (
          <Link key={e.id} to={`/exams/${e.id}`} className="glass p-4 rounded-2xl block">
            <input className="w-full bg-transparent outline-none text-white text-lg font-medium" value={e.title} onChange={(ev) => { ev.preventDefault(); updateExam.mutate({ id: e.id, title: ev.target.value }) }} />
            <div className="text-sm opacity-70">{e.date ?? 'No date'}</div>
            <div className="mt-2 flex justify-end"><button className="px-3 py-1 rounded-md bg-white/10" onClick={(ev) => { ev.preventDefault(); deleteExam.mutate(e.id) }}>Delete</button></div>
          </Link>
        ))}
      </div>
    </div>
  )
}


