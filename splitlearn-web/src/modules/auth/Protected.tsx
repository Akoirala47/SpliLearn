import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-6">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}


