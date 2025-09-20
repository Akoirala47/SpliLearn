import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function ProfilePage() {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!user) return
      const { data } = await supabase.from('profiles').select('email, name').eq('id', user.id).maybeSingle()
      if (active && data) {
        setEmail(data.email ?? user.email ?? '')
        setName(data.name ?? '')
      } else if (active) {
        setEmail(user.email ?? '')
      }
    }
    load()
    return () => { active = false }
  }, [user])

  async function save() {
    if (!user) return
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.from('profiles').upsert({ id: user.id, email, name })
    if (error) setMessage(error.message)
    else setMessage('Saved')
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>Profile</h1>
      <div className="glass p-4 rounded-2xl max-w-lg">
        <div className="space-y-3">
          <div>
            <label className="block text-sm opacity-70 mb-1">Email</label>
            <input className="w-full px-3 py-2 rounded-md bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm opacity-70 mb-1">Name</label>
            <input className="w-full px-3 py-2 rounded-md bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {message ? <div className="text-sm opacity-80">{message}</div> : null}
          <button className="px-4 py-2 rounded-full text-white brand-gradient disabled:opacity-50" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}


