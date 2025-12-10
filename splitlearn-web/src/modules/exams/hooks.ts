import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export type ExamRow = { id: string; class_id: string; title: string; date: string | null; created_at: string }

export function useExams(classId?: string) {
  return useQuery({
    queryKey: ['exams', classId ?? 'all'],
    enabled: !!classId,
    queryFn: async (): Promise<ExamRow[]> => {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('class_id', classId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// create exam with optimistic update and required date
export function useCreateExam(classId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; date: string }) => input,
    onMutate: async (input) => {
      // optimistic update for instant UI feedback
      await qc.cancelQueries({ queryKey: ['exams', classId] })
      const prev = qc.getQueryData<ExamRow[]>(['exams', classId]) || []
      const optimistic: ExamRow = { 
        id: 'optimistic-' + Date.now(), 
        class_id: classId, 
        title: input.title, 
        date: input.date,
        created_at: new Date().toISOString() 
      }
      qc.setQueryData(['exams', classId], [optimistic, ...prev])
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['exams', classId], ctx.prev) },
    onSettled: async (input) => {
      if (input && input.date) {
        const { error } = await supabase.from('exams').insert({ 
          class_id: classId, 
          title: input.title,
          date: input.date
        })
        if (error) console.error(error)
      }
      qc.invalidateQueries({ queryKey: ['exams', classId] })
    },
  })
}

export function useUpdateExam(classId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; title: string }) => input,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['exams', classId] })
      const prev = qc.getQueryData<ExamRow[]>(['exams', classId]) || []
      if (input) {
        qc.setQueryData(['exams', classId], prev.map(e => e.id === input.id ? { ...e, title: input.title } : e))
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['exams', classId], ctx.prev) },
    onSettled: async (input) => {
      if (input) {
        const { error } = await supabase.from('exams').update({ title: input.title }).eq('id', input.id)
        if (error) console.error(error)
      }
      qc.invalidateQueries({ queryKey: ['exams', classId] })
    },
  })
}

export function useDeleteExam(classId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => id,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['exams', classId] })
      const prev = qc.getQueryData<ExamRow[]>(['exams', classId]) || []
      qc.setQueryData(['exams', classId], prev.filter(e => e.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['exams', classId], ctx.prev) },
    onSettled: async (id) => {
      const { error } = await supabase.from('exams').delete().eq('id', id)
      if (error) console.error(error)
      qc.invalidateQueries({ queryKey: ['exams', classId] })
    },
  })
}


