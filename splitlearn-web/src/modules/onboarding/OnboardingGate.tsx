import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    async function run() {
      if (!user) return
      if (active) { setReady(true); setLoading(false) }
    }
    run()
    return () => {
      active = false
    }
  }, [user])

  if (loading || !ready) return <div className="p-6">Preparing your workspace…</div>
  return <>{children}</>
}


