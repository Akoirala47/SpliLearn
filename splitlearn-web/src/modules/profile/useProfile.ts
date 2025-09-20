import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

type Profile = { email: string | null; name: string | null }

export function useProfile() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('email,name')
        .eq('id', user.id)
        .maybeSingle()
      if (error) throw error
      return {
        email: data?.email ?? user.email ?? null,
        name: data?.name ?? null,
      }
    },
  })

  const rawEmail = query.data?.email ?? ''
  const rawName = (query.data?.name ?? '').trim()
  const displayName = rawName || (rawEmail ? rawEmail.split('@')[0] : 'there')
  const firstName = displayName.split(' ')[0] || displayName

  return {
    profile: query.data,
    isLoading: query.isLoading,
    displayName,
    firstName,
  }
}


