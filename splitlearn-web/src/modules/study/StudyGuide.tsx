import { useState } from 'react'
import { useTopicsByExam } from './hooks'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { Play, Clock, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type Video = {
  id: string
  youtube_id: string
  title: string
  thumbnail_url: string
  duration?: number
  subpoint_index?: number | null
}

type VideoCompletion = {
  video_id: string
  is_manually_completed?: boolean
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds === 0) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function StudyGuide({ examId }: { examId: string }) {
  const { data: topics } = useTopicsByExam(examId)
  const { user } = useAuth()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Fetch videos for all topics with subpoint_index
  const topicIds = topics?.map(t => t.id) || []
  const videoIds: string[] = []
  const { data: videosByTopic } = useQuery<Record<string, Video[]>>({
    queryKey: ['videos-by-topics', topicIds.sort().join(',')],
    enabled: topicIds.length > 0,
    queryFn: async () => {
      if (topicIds.length === 0) return {}
      const { data, error } = await supabase
        .from('videos')
        .select('id, youtube_id, title, thumbnail_url, duration, topic_id, subpoint_index')
        .in('topic_id', topicIds)
        .order('subpoint_index', { ascending: true, nullsFirst: false })
      
      if (error) throw error
      
      // Group videos by topic_id and subpoint_index
      const grouped: Record<string, Video[]> = {}
      for (const video of (data || [])) {
        const topicId = (video as any).topic_id
        if (!grouped[topicId]) grouped[topicId] = []
        const vid: Video = {
          id: video.id,
          youtube_id: video.youtube_id,
          title: video.title || '',
          thumbnail_url: video.thumbnail_url || '',
          duration: video.duration || undefined,
          subpoint_index: (video as any).subpoint_index,
        }
        grouped[topicId].push(vid)
        videoIds.push(video.id)
      }
      return grouped
    },
  })

  // Fetch completion status for all videos
  const { data: completions } = useQuery<Record<string, VideoCompletion>>({
    queryKey: ['video-completions', examId, user?.id, videoIds.sort().join(',')],
    enabled: !!user && !!examId && videoIds.length > 0,
    queryFn: async () => {
      if (!user || videoIds.length === 0) return {}
      const { data, error } = await supabase
        .from('video_completions')
        .select('video_id, is_manually_completed')
        .eq('user_id', user.id)
        .eq('exam_id', examId)
        .in('video_id', videoIds)
      
      if (error) throw error
      
      const completionMap: Record<string, VideoCompletion> = {}
      for (const comp of (data || [])) {
        completionMap[comp.video_id] = comp
      }
      return completionMap
    },
  })

  // Toggle completion mutation
  const toggleCompletion = useMutation({
    mutationFn: async ({ videoId, completed }: { videoId: string; completed: boolean }) => {
      if (!user || !examId) throw new Error('User or exam ID missing')
      
      if (completed) {
        const { error } = await supabase
          .from('video_completions')
          .upsert({
            user_id: user.id,
            video_id: videoId,
            exam_id: examId,
            is_manually_completed: true,
          }, {
            onConflict: 'user_id,video_id'
          })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('video_completions')
          .delete()
          .eq('user_id', user.id)
          .eq('video_id', videoId)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video-completions'] })
      qc.invalidateQueries({ queryKey: ['exam-progress'] })
    },
  })

  if (!topics || topics.length === 0) return <div className="text-sm text-muted">No topics yet</div>

  return (
    <div className="space-y-3">
      {topics.map(t => {
        const isOpen = expanded[t.id]
        const videos = videosByTopic?.[t.id] || []
        return (
          <div key={t.id} className="glass p-4 rounded-2xl">
            <button className="w-full text-left flex items-center justify-between" onClick={() => setExpanded(s => ({ ...s, [t.id]: !isOpen }))}>
              <div className="text-white font-medium">{t.title}</div>
              <div className="text-white/70 flex items-center gap-2">
                {videos.length > 0 && (
                  <span className="text-xs opacity-60">{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
                )}
                {isOpen ? '▴' : '▾'}
              </div>
            </button>
            {isOpen ? (
              <div className="mt-3 space-y-3">
                {/* Show subpoints with associated videos and checkmarks */}
                <div className="space-y-3">
                  {(t.subpoints_json || []).map((sp, subpointIdx) => {
                    // Find video for this subpoint index (exact match - backend creates one per subpoint)
                    const videoForSubpoint = videos.find(v => v.subpoint_index === subpointIdx)
                    
                    const isCompleted = videoForSubpoint ? completions?.[videoForSubpoint.id] : false
                    
                    // Check if this video (by youtube_id) is shared with other subpoints
                    const sharedSubpoints = videoForSubpoint 
                      ? videos
                          .filter(v => 
                            v.youtube_id === videoForSubpoint.youtube_id && 
                            v.subpoint_index !== null && 
                            v.subpoint_index !== subpointIdx
                          )
                          .map(v => v.subpoint_index)
                          .filter((idx): idx is number => idx !== null && idx !== undefined)
                          .sort((a, b) => a - b)
                      : []
                    
                    return (
                      <div key={subpointIdx} className="flex items-start gap-3">
                        {/* Checkmark or bullet */}
                        <button
                          onClick={() => {
                            if (videoForSubpoint && user) {
                              toggleCompletion.mutate({
                                videoId: videoForSubpoint.id,
                                completed: !isCompleted
                              })
                            }
                          }}
                          disabled={!videoForSubpoint || !user || toggleCompletion.isPending}
                          className={`mt-0.5 shrink-0 ${isCompleted ? 'text-green-400' : 'text-white/40'} hover:text-green-400 transition-colors disabled:opacity-50`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 size={18} fill="currentColor" />
                          ) : (
                            <span className="text-lg">•</span>
                          )}
                        </button>
                        
                        {/* Subpoint text and video */}
                        <div className="flex-1 space-y-2">
                          <div className="text-sm text-white/90">
                            {sp}
                            {sharedSubpoints.length > 0 && (
                              <span className="ml-2 text-xs text-muted opacity-60">
                                (shared video with {sharedSubpoints.map(i => `#${i + 1}`).join(', ')})
                              </span>
                            )}
                          </div>
                          
                          {videoForSubpoint ? (
                            <Link
                              to={`/exams/${examId}/learn?topicId=${t.id}&videoId=${videoForSubpoint.id}`}
                              className="group glass p-2 rounded-lg hover:bg-white/5 transition-all flex items-center gap-2"
                            >
                              <div className="relative shrink-0 w-20 h-12 rounded overflow-hidden bg-black/20">
                                <img 
                                  src={videoForSubpoint.thumbnail_url} 
                                  alt={videoForSubpoint.title}
                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                />
                                <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="h-6 w-6 rounded-full bg-white/20 backdrop-blur-sm grid place-items-center">
                                    <Play fill="white" className="ml-0.5" size={10} />
                                  </div>
                                </div>
                                {videoForSubpoint.duration && (
                                  <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] text-white flex items-center gap-0.5">
                                    <Clock size={8} />
                                    {formatDuration(videoForSubpoint.duration)}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-white line-clamp-2 group-hover:text-white/90 transition-colors">
                                  {videoForSubpoint.title}
                                </div>
                              </div>
                            </Link>
                          ) : (
                            <div className="text-xs text-muted italic">No video available for this subpoint</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}


