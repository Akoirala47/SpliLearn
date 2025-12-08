import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useExams, useCreateExam, useDeleteExam, useUpdateExam } from './hooks'
import { useClasses } from '../classes/hooks'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { ChevronDown, ChevronRight, BookOpen, Calendar, Upload } from 'lucide-react'
import { CountdownBar } from '../ui/CountdownBar'
import { ProgressBar } from '../ui/ProgressBar'
import { useAuth } from '../auth/AuthContext'

type TopicRow = { id: string; slide_id: string; title: string; subpoints_json: string[] | null }

function useTopicsByExams(examIds: string[]) {
  return useQuery({
    queryKey: ['topics-by-exams', examIds.sort().join(',')],
    enabled: examIds.length > 0,
    queryFn: async (): Promise<Record<string, TopicRow[]>> => {
      if (examIds.length === 0) return {}
      
      // Get all slides for these exams
      const { data: slides, error: slidesErr } = await supabase
        .from('slides')
        .select('id, exam_id')
        .in('exam_id', examIds)
      if (slidesErr) throw slidesErr
      if (!slides || slides.length === 0) return {}
      
      const slideIds = slides.map(s => s.id)
      const examIdBySlideId: Record<string, string> = {}
      for (const slide of slides) {
        examIdBySlideId[slide.id] = slide.exam_id
      }
      
      // Get all topics for these slides
      const { data: topics, error: topicsErr } = await supabase
        .from('topics')
        .select('id, slide_id, title, subpoints_json, created_at')
        .in('slide_id', slideIds)
        .order('created_at', { ascending: true })
      if (topicsErr) throw topicsErr
      
      // Group topics by exam_id
      const grouped: Record<string, TopicRow[]> = {}
      for (const topic of (topics || [])) {
        const examId = examIdBySlideId[topic.slide_id]
        if (examId) {
          if (!grouped[examId]) grouped[examId] = []
          grouped[examId].push(topic)
        }
      }
      
      return grouped
    },
  })
}

type TopicProgress = {
  topicId: string
  totalVideos: number
  completedVideos: number
  progressPercentage: number
}

function useTopicProgress(examIds: string[], userId?: string) {
  return useQuery<Record<string, TopicProgress[]>>({
    queryKey: ['topic-progress', examIds.sort().join(','), userId],
    enabled: examIds.length > 0 && !!userId,
    queryFn: async () => {
      if (!userId || examIds.length === 0) return {}
      
      // Get all topics for these exams
      const { data: slides } = await supabase
        .from('slides')
        .select('id, exam_id')
        .in('exam_id', examIds)
      
      if (!slides || slides.length === 0) return {}
      
      const slideIds = slides.map(s => s.id)
      const { data: topics } = await supabase
        .from('topics')
        .select('id, slide_id')
        .in('slide_id', slideIds)
      
      if (!topics || topics.length === 0) return {}
      
      const topicIds = topics.map(t => t.id)
      const examIdBySlideId: Record<string, string> = {}
      for (const slide of slides) {
        examIdBySlideId[slide.id] = slide.exam_id
      }
      
      // Get all videos for these topics
      const { data: videos } = await supabase
        .from('videos')
        .select('id, topic_id')
        .in('topic_id', topicIds)
      
      if (!videos || videos.length === 0) return {}
      
      // Group videos by topic_id
      const videosByTopic: Record<string, string[]> = {}
      for (const video of videos) {
        if (!videosByTopic[video.topic_id]) videosByTopic[video.topic_id] = []
        videosByTopic[video.topic_id].push(video.id)
      }
      
      // Get all video IDs
      const allVideoIds = Object.values(videosByTopic).flat()
      
      // Get completions for this user and these exams
      const { data: completions } = await supabase
        .from('video_completions')
        .select('video_id, exam_id')
        .eq('user_id', userId)
        .in('exam_id', examIds)
        .in('video_id', allVideoIds)
      
      // Group completions by video_id
      const completedVideoIds = new Set((completions || []).map(c => c.video_id))
      
      // Calculate progress per topic, grouped by exam
      const progressByExam: Record<string, TopicProgress[]> = {}
      
      for (const topic of topics) {
        const examId = examIdBySlideId[topic.slide_id]
        if (!examId) continue
        
        const topicVideoIds = videosByTopic[topic.id] || []
        const completedCount = topicVideoIds.filter(vid => completedVideoIds.has(vid)).length
        const totalCount = topicVideoIds.length
        const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
        
        if (!progressByExam[examId]) progressByExam[examId] = []
        progressByExam[examId].push({
          topicId: topic.id,
          totalVideos: totalCount,
          completedVideos: completedCount,
          progressPercentage,
        })
      }
      
      return progressByExam
    },
  })
}

export function ExamsPage() {
  const { user } = useAuth()
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
  const [newDate, setNewDate] = useState('')
  const [expandedExams, setExpandedExams] = useState<Record<string, boolean>>({})
  const canCreate = useMemo(() => !!(newTitle.trim() && selectedClassId && newDate), [newTitle, selectedClassId, newDate])
  
  const examIds = (exams || []).map(e => e.id)
  const { data: topicsByExam } = useTopicsByExams(examIds)
  const { data: topicProgressByExam } = useTopicProgress(examIds, user?.id)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
        Exams
      </h1>
      <div className="glass p-4 rounded-2xl space-y-3 max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select className="appearance-none bg-transparent text-white pr-8 pl-3 py-1 rounded-md focus-ring" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
              {(classes || []).map(c => <option className="text-black" key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/70">▾</span>
          </div>
          <input 
            className="flex-1 bg-transparent outline-none text-white placeholder:opacity-60" 
            placeholder="New exam title" 
            value={newTitle} 
            onChange={(e) => setNewTitle(e.target.value)} 
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 flex items-center gap-2">
            <Calendar size={18} className="opacity-60" />
            <input
              type="date"
              required
              className="flex-1 bg-transparent outline-none text-white placeholder:opacity-60 border-b border-white/20 pb-1 focus:border-white/40 transition-colors"
              placeholder="Exam date *"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            <span className="text-xs text-red-400">*</span>
          </div>
          <button 
            className="btn-pill disabled:opacity-40" 
            disabled={!canCreate} 
            onClick={() => { 
              if (canCreate && newDate) { 
                createExam.mutate({ 
                  title: newTitle.trim(), 
                  date: newDate 
                }); 
                setNewTitle(''); 
                setNewDate(''); 
              } 
            }}
          >
            Add
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {(exams || []).map((e) => {
          const isOptimistic = e.id.startsWith('optimistic-')
          const topics = topicsByExam?.[e.id] || []
          const isExpanded = expandedExams[e.id]
          
          return (
            <div key={e.id} className="glass p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  {!isOptimistic && (
                    <button
                      onClick={() => setExpandedExams(prev => ({ ...prev, [e.id]: !isExpanded }))}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                      disabled={topics.length === 0}
                    >
                      {topics.length > 0 ? (
                        isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                      ) : null}
                    </button>
                  )}
                  <input
                    className="flex-1 bg-transparent outline-none text-white text-lg font-medium"
                    value={e.title}
                    onChange={(ev) => { ev.preventDefault(); ev.stopPropagation(); updateExam.mutate({ id: e.id, title: ev.target.value }) }}
                    disabled={isOptimistic}
                    onClick={(ev) => ev.stopPropagation()}
                  />
                  {!isOptimistic && topics.length > 0 && (
                    <span className="text-sm text-muted">({topics.length} topic{topics.length !== 1 ? 's' : ''})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isOptimistic && e.date && (
                    <div className="text-sm opacity-70 flex items-center gap-1">
                      <Calendar size={14} />
                      {new Date(e.date).toLocaleDateString()}
                    </div>
                  )}
                  {!isOptimistic && (
                    <Link
                      to={`/exams/${e.id}`}
                      className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5 text-sm"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <Upload size={14} />
                      Study Guide
                    </Link>
                  )}
                  <button 
                    className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors" 
                    onClick={(ev) => { ev.preventDefault(); if (!isOptimistic) deleteExam.mutate(e.id) }} 
                    disabled={isOptimistic}
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              {!isOptimistic && e.date && (
                <CountdownBar examDate={e.date} />
              )}
              
              {!isOptimistic && isExpanded && topics.length > 0 && (
                <div className="ml-7 space-y-2 border-l-2 border-white/10 pl-4">
                  <div className="text-xs text-muted mb-2 font-medium">Study Guide Topics:</div>
                  {topics.map((topic) => {
                    const progress = topicProgressByExam?.[e.id]?.find(p => p.topicId === topic.id)
                    return (
                      <Link
                        key={topic.id}
                        to={`/exams/${e.id}/learn`}
                        className="block glass p-3 rounded-xl hover:bg-white/5 transition-colors space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen size={16} className="opacity-60" />
                          <div className="flex-1">
                            <div className="text-white font-medium text-sm">{topic.title}</div>
                            <div className="text-xs text-muted">
                              {topic.subpoints_json?.length || 0} key point{topic.subpoints_json?.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        {progress && progress.totalVideos > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted">Video Progress</span>
                              <span className="text-white/70 font-medium">
                                {progress.completedVideos}/{progress.totalVideos} ({progress.progressPercentage}%)
                              </span>
                            </div>
                            <ProgressBar value={progress.progressPercentage} />
                          </div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


