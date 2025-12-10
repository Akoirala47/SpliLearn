import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export type ClassRow = { id: string; user_id: string; title: string; created_at: string }

export function useClasses() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['classes', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ClassRow[]> => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// create class with optimistic update
export function useCreateClass() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (title: string) => {
      const optimistic: ClassRow = { id: crypto.randomUUID(), user_id: user!.id, title, created_at: new Date().toISOString() }
      return optimistic
    },
    onMutate: async (title) => {
      // optimistic update adds class immediately before server confirms
      await qc.cancelQueries({ queryKey: ['classes', user?.id] })
      const prev = qc.getQueryData<ClassRow[]>(['classes', user?.id]) || []
      const optimistic: ClassRow = { id: 'optimistic-' + Date.now(), user_id: user!.id, title, created_at: new Date().toISOString() }
      qc.setQueryData(['classes', user?.id], [optimistic, ...prev])
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['classes', user?.id], ctx.prev)
    },
    onSettled: async (_data, _err, title) => {
      const { error } = await supabase.from('classes').insert({ title, user_id: user!.id })
      if (error) console.error(error)
      qc.invalidateQueries({ queryKey: ['classes', user?.id] })
    },
  })
}

export function useUpdateClass() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { id: string; title: string }) => input,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['classes', user?.id] })
      const prev = qc.getQueryData<ClassRow[]>(['classes', user?.id]) || []
      if (input) {
        qc.setQueryData(['classes', user?.id], prev.map(c => c.id === input.id ? { ...c, title: input.title } : c))
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['classes', user?.id], ctx.prev) },
    onSettled: async (input) => {
      if (input) {
        const { error } = await supabase.from('classes').update({ title: input.title }).eq('id', input.id)
        if (error) console.error(error)
      }
      qc.invalidateQueries({ queryKey: ['classes', user?.id] })
    },
  })
}

export function useDeleteClass() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => id,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['classes', user?.id] })
      const prev = qc.getQueryData<ClassRow[]>(['classes', user?.id]) || []
      qc.setQueryData(['classes', user?.id], prev.filter(c => c.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['classes', user?.id], ctx.prev) },
    onSettled: async (id) => {
      const { error } = await supabase.from('classes').delete().eq('id', id)
      if (error) console.error(error)
      qc.invalidateQueries({ queryKey: ['classes', user?.id] })
    },
  })
}


