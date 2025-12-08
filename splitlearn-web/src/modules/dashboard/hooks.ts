import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export type ExamProgress = {
  examId: string
  examTitle: string
  className: string
  examDate: string | null
  totalVideos: number
  completedVideos: number
  progressPercentage: number
}

export function useExamProgress() {
  const { user } = useAuth()
  
  return useQuery({
    queryKey: ['exam-progress', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ExamProgress[]> => {
      if (!user) return []
      
      // Get all exams with their classes and dates
      const { data: exams, error: examsError } = await supabase
        .from('exams')
        .select(`
          id,
          title,
          date,
          class:classes!inner(
            id,
            title
          )
        `)
        .order('created_at', { ascending: false })
      
      if (examsError) throw examsError
      if (!exams || exams.length === 0) return []
      
      const examIds = exams.map(e => e.id)
      
      // Get all videos for these exams
      const { data: slides, error: slidesError } = await supabase
        .from('slides')
        .select('id, exam_id')
        .in('exam_id', examIds)
      
      if (slidesError) throw slidesError
      if (!slides || slides.length === 0) return []
      
      const slideIds = slides.map(s => s.id)
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, slide_id')
        .in('slide_id', slideIds)
      
      if (topicsError) throw topicsError
      if (!topics || topics.length === 0) return []
      
      const topicIds = topics.map(t => t.id)
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('id, topic_id')
        .in('topic_id', topicIds)
      
      if (videosError) throw videosError
      
      // Group videos by exam
      const videoIds: string[] = []
      const videosByExam: Record<string, string[]> = {}
      
      for (const video of (videos || [])) {
        const topic = topics.find(t => t.id === video.topic_id)
        if (!topic) continue
        const slide = slides.find(s => s.id === topic.slide_id)
        if (!slide) continue
        const examId = slide.exam_id
        
        if (!videosByExam[examId]) videosByExam[examId] = []
        videosByExam[examId].push(video.id)
        videoIds.push(video.id)
      }
      
      // Get completions
      const { data: completions, error: completionsError } = await supabase
        .from('video_completions')
        .select('video_id, exam_id')
        .eq('user_id', user.id)
        .in('video_id', videoIds)
      
      if (completionsError) throw completionsError
      
      // Group completions by exam
      const completionsByExam: Record<string, string[]> = {}
      for (const comp of (completions || [])) {
        if (!completionsByExam[comp.exam_id]) completionsByExam[comp.exam_id] = []
        completionsByExam[comp.exam_id].push(comp.video_id)
      }
      
      // Calculate progress for each exam
      const progress: ExamProgress[] = exams.map((exam: any) => {
        const totalVideos = videosByExam[exam.id]?.length || 0
        const completedVideos = completionsByExam[exam.id]?.length || 0
        const progressPercentage = totalVideos > 0 
          ? Math.round((completedVideos / totalVideos) * 100) 
          : 0
        
        return {
          examId: exam.id,
          examTitle: exam.title,
          className: exam.class?.title || 'Unknown Class',
          examDate: (exam as any).date || null,
          totalVideos,
          completedVideos,
          progressPercentage,
        }
      })
      
      return progress
    },
  })
}

