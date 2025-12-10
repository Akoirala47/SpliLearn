import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export type TopicRow = { id: string; slide_id: string; title: string; subpoints_json: string[] | null }

export function useTopicsByExam(examId?: string) {
  return useQuery({
    queryKey: ['topics-by-exam', examId],
    enabled: !!examId,
    queryFn: async (): Promise<TopicRow[]> => {
      if (!examId) return []
      const { data: slides, error: slidesErr } = await supabase
        .from('slides')
        .select('id')
        .eq('exam_id', examId)
      if (slidesErr) throw slidesErr
      if (!slides || slides.length === 0) return []
      const ids = slides.map(s => s.id)
      const { data: topics, error: topicsErr } = await supabase
        .from('topics')
        .select('id, slide_id, title, subpoints_json, created_at')
        .in('slide_id', ids)
        .order('created_at', { ascending: true })
      if (topicsErr) throw topicsErr
      return topics as unknown as TopicRow[]
    },
  })
}

export type NoteRow = { id: string; topic_id: string; user_id: string; content: string | null; source: string | null; last_updated: string }

export function useNotesMap(topicIds: string[]) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notes-map', user?.id, topicIds.sort().join(',')],
    enabled: !!user?.id && topicIds.length > 0,
    queryFn: async (): Promise<Record<string, NoteRow>> => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user!.id)
        .in('topic_id', topicIds)
      if (error) throw error
      const map: Record<string, NoteRow> = {}
      for (const n of data as NoteRow[]) map[n.topic_id] = n
      return map
    },
  })
}

export function useUpsertNote() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { topicId: string; content: string }) => {
      const payload = { topic_id: input.topicId, user_id: user!.id, content: input.content, source: 'study_guide' }
      const { error } = await supabase
        .from('notes')
        .upsert(payload, { onConflict: 'topic_id,user_id' })
      if (error) throw error
      return payload
    },
    onSuccess: async () => {
      await qc.invalidateQueries()
    },
  })
}
