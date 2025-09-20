import { useState } from 'react'
import { useClasses, useCreateClass, useDeleteClass, useUpdateClass } from './hooks'

export function ClassesPage() {
  const { data: classes } = useClasses()
  const createClass = useCreateClass()
  const updateClass = useUpdateClass()
  const deleteClass = useDeleteClass()
  const [newTitle, setNewTitle] = useState('')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
        Classes
      </h1>
      <div className="glass p-3 rounded-2xl flex items-center gap-2 max-w-lg">
        <input className="flex-1 bg-transparent outline-none text-white placeholder:opacity-60" placeholder="New class title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button className="btn-pill" onClick={() => { if (newTitle.trim()) { createClass.mutate(newTitle.trim()); setNewTitle('') } }}>Add</button>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {(classes || []).map((c) => (
          <div key={c.id} className="glass p-4 rounded-2xl space-y-2">
            <input className="w-full bg-transparent outline-none text-white text-lg font-medium" value={c.title} onChange={(e) => updateClass.mutate({ id: c.id, title: e.target.value })} />
            <div className="flex justify-end">
              <button className="px-3 py-1 rounded-md bg-white/10" onClick={() => deleteClass.mutate(c.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


