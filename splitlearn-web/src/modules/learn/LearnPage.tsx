import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useState, useEffect } from 'react'
import { ArrowLeft, Play, FileText, Check, Loader2, Clock, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

type Video = {
  id: string
  youtube_id: string
  title: string
  description?: string
  thumbnail_url: string
  duration?: number // in seconds
  subpoint_index?: number | null
}

type Topic = {
  id: string
  title: string
  subpoints_json: string[]
  videos: Video[]
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

export function LearnPage() {
  const { examId } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0)

  const [noteContent, setNoteContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState('')

  // fetch all topics with their associated videos for the exam
  const { data: topics } = useQuery<Topic[]>({
    queryKey: ['topics-with-videos', examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data: topicsData, error: topicsError } = await supabase
        .from('topics')
        .select('*, videos(*), slide:slides!inner(exam_id)')
        .eq('slide.exam_id', examId)
        .order('created_at', { ascending: true })

      if (topicsError) throw topicsError
      const topicsWithSortedVideos = (topicsData || []).map(topic => ({
        ...topic,
        videos: (topic.videos || []).sort((a: any, b: any) => {
          const aIdx = a.subpoint_index ?? 999
          const bIdx = b.subpoint_index ?? 999
          return aIdx - bIdx
        })
      }))
      return topicsWithSortedVideos as unknown as Topic[]
    }
  })

  const allVideoIds = topics?.flatMap(t => t.videos?.map(v => v.id) || []) || []
  const { data: completions } = useQuery<Record<string, boolean>>({
    queryKey: ['video-completions', examId, user?.id, allVideoIds.sort().join(',')],
    enabled: !!user && !!examId && allVideoIds.length > 0,
    queryFn: async () => {
      if (!user || allVideoIds.length === 0) return {}
      const { data, error } = await supabase
        .from('video_completions')
        .select('video_id')
        .eq('user_id', user.id)
        .eq('exam_id', examId)
        .in('video_id', allVideoIds)
      
      if (error) throw error
      const completionMap: Record<string, boolean> = {}
      for (const comp of (data || [])) {
        completionMap[comp.video_id] = true
      }
      return completionMap
    },
  })

  // toggle video completion status for progress tracking
  const markVideoComplete = useMutation({
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

  useEffect(() => {
    if (!topics) return
    const topicId = searchParams.get('topicId')
    const videoId = searchParams.get('videoId')
    if (topicId) {
      setActiveTopicId(topicId)
      if (videoId) {
        const topic = topics.find(t => t.id === topicId)
        if (topic) {
          const vidIdx = topic.videos.findIndex(v => v.id === videoId)
          if (vidIdx >= 0) {
            setSelectedVideoIndex(vidIdx)
          }
        }
      }
    }
  }, [searchParams, topics])

  const activeTopic = topics?.find(t => t.id === activeTopicId)
  const activeVideos = activeTopic?.videos || []

  const baseVideos = activeVideos
  const currentSelectedVideo = baseVideos[selectedVideoIndex] || baseVideos[0]

  // fetch alternative videos when a video is selected
  const { data: alternativeVideos, isLoading: loadingAlternatives } = useQuery<Video[]>({
    queryKey: ['alternative-videos', currentSelectedVideo?.youtube_id, activeTopic?.title],
    enabled: !!currentSelectedVideo && !!activeTopic,
    queryFn: async () => {
      if (!currentSelectedVideo || !activeTopic) return []
      
      // exclude videos already in the list to avoid duplicates
      const excludeIds = baseVideos.map(v => v.youtube_id)
      const { data, error } = await supabase.functions.invoke('get-alternative-videos', {
        body: {
          videoTitle: currentSelectedVideo.title,
          topicTitle: activeTopic.title,
          excludeVideoIds: excludeIds,
        },
      })
      
      if (error) {
        console.error('Failed to fetch alternative videos:', error)
        return []
      }
      
      return (data as any)?.videos || []
    },
  })

  // combine base videos with alternatives, avoiding duplicates
  const availableVideos = (() => {
    const allVideos = [...baseVideos]
    const existingIds = new Set(baseVideos.map(v => v.youtube_id))
    
    if (alternativeVideos) {
      for (const altVideo of alternativeVideos) {
        if (!existingIds.has(altVideo.youtube_id)) {
          allVideos.push({
            id: `alt-${altVideo.youtube_id}`,
            youtube_id: altVideo.youtube_id,
            title: altVideo.title,
            description: altVideo.description,
            thumbnail_url: altVideo.thumbnail_url,
            duration: altVideo.duration,
          })
        }
      }
    }
    
    return allVideos
  })()

  // reset video index if it becomes invalid
  useEffect(() => {
    if (selectedVideoIndex >= availableVideos.length && availableVideos.length > 0) {
      setSelectedVideoIndex(0)
    }
  }, [availableVideos.length, selectedVideoIndex])

  const activeVideo = availableVideos[selectedVideoIndex] || currentSelectedVideo

  // reset to first video when topic changes
  useEffect(() => {
    setSelectedVideoIndex(0)
  }, [activeTopicId])

  // load saved notes when topic changes
  useEffect(() => {
    if (!activeTopicId || !user) return

    let active = true
    async function loadNotes() {
      const { data } = await supabase
        .from('topic_notes')
        .select('content')
        .eq('topic_id', activeTopicId)
        .eq('user_id', user?.id)
        .maybeSingle()

      if (active) {
        const content = data?.content || ''
        setNoteContent(content)
        setLastSaved(content)
      }
    }
    loadNotes()
    return () => { active = false }
  }, [activeTopicId, user])

  // auto-save notes after 1 second of inactivity
  useEffect(() => {
    if (!activeTopicId || !user || noteContent === lastSaved) return

    const timer = setTimeout(async () => {
      setIsSaving(true)
      await supabase.from('topic_notes').upsert({
        topic_id: activeTopicId,
        user_id: user.id,
        content: noteContent,
        updated_at: new Date().toISOString()
      }, { onConflict: 'topic_id,user_id' })

      setLastSaved(noteContent)
      setIsSaving(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [noteContent, activeTopicId, user, lastSaved])

  const [videoHeightPct, setVideoHeightPct] = useState(50)
  const [isDragging, setIsDragging] = useState(false)

  // handle resizable split view between video and notes
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const container = document.getElementById('split-container')
      if (!container) return
      const rect = container.getBoundingClientRect()
      const relativeY = e.clientY - rect.top
      const pct = (relativeY / rect.height) * 100
      setVideoHeightPct(Math.min(80, Math.max(20, pct)))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  if (activeTopic && activeVideo) {
    return (
      <div className="h-[calc(100vh-6rem)] flex gap-4">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTopicId(null)}
                className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Topics
              </button>
              <h2 className="font-semibold truncate max-w-md">{activeTopic.title}</h2>
            </div>

            <div className="flex items-center gap-4">
              {availableVideos.length > 1 && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedVideoIndex}
                    onChange={(e) => {
                      const newIndex = parseInt(e.target.value, 10)
                      setSelectedVideoIndex(newIndex)
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                  >
                    {availableVideos.map((video, idx) => (
                      <option key={video.id || video.youtube_id} value={idx} className="bg-[#1A1A2E]">
                        {idx < activeVideos.length ? 'Video' : 'Alternative'} {idx + 1}: {video.title.length > 40 ? video.title.slice(0, 40) + '...' : video.title}
                      </option>
                    ))}
                  </select>
                  {loadingAlternatives && (
                    <Loader2 size={14} className="animate-spin opacity-60" />
                  )}
                </div>
              )}
              <div className="text-xs text-muted flex items-center gap-1.5">
                {isSaving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Saving...
                  </>
                ) : noteContent !== lastSaved ? (
                  <span className="opacity-50">Unsaved changes</span>
                ) : (
                  <>
                    <Check size={12} /> Saved
                    </>
                  )}
              </div>
              {activeVideo.id && user && (
                <button
                  onClick={() => {
                    if (activeVideo.id) {
                      const isCompleted = completions?.[activeVideo.id]
                      markVideoComplete.mutate({
                        videoId: activeVideo.id,
                        completed: !isCompleted
                      })
                    }
                  }}
                  disabled={markVideoComplete.isPending || !activeVideo.id}
                  className={`px-3 py-2 rounded-lg backdrop-blur-sm flex items-center gap-2 text-sm font-medium transition-all ${
                    completions?.[activeVideo.id!] 
                      ? 'bg-green-500/80 text-white hover:bg-green-500' 
                      : 'bg-white/10 text-white hover:bg-white/20'
                  } disabled:opacity-50`}
                >
                  {completions?.[activeVideo.id!] ? (
                    <>
                      <CheckCircle2 size={16} fill="currentColor" />
                      Completed
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Mark Complete
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div id="split-container" className="flex-1 flex flex-col min-h-0 relative select-none">
            <div style={{ height: `${videoHeightPct}%` }} className="flex flex-col min-h-0 gap-4 overflow-y-auto pb-2">
              <div className="glass rounded-2xl overflow-hidden bg-black shrink-0 aspect-video w-full max-w-4xl mx-auto relative">
                <iframe
                  src={`https://www.youtube.com/embed/${activeVideo.youtube_id}?enablejsapi=1`}
                  title={activeVideo.title}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
                />
              </div>
              {activeVideo.description && (
                <div className="glass rounded-2xl p-4 max-w-4xl mx-auto w-full shrink-0">
                  <h3 className="font-medium text-white mb-1">About this video</h3>
                  <p className="text-sm text-muted leading-relaxed">{activeVideo.description}</p>
                </div>
              )}
              
              {alternativeVideos && alternativeVideos.length > 0 && (
                <div className="glass rounded-2xl p-4 max-w-4xl mx-auto w-full shrink-0">
                  <h3 className="font-medium text-white mb-3">Alternative Videos</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {alternativeVideos.slice(0, 3).map((altVideo) => {
                      const isCurrentVideo = altVideo.youtube_id === activeVideo.youtube_id
                      const videoIndex = availableVideos.findIndex(v => v.youtube_id === altVideo.youtube_id)
                      
                      return (
                        <button
                          key={altVideo.youtube_id}
                          onClick={() => {
                            if (videoIndex >= 0) {
                              setSelectedVideoIndex(videoIndex)
                            } else {
                              const idx = availableVideos.findIndex(v => v.youtube_id === altVideo.youtube_id)
                              if (idx >= 0) {
                                setSelectedVideoIndex(idx)
                              }
                            }
                          }}
                          className={`group text-left glass p-3 rounded-xl hover:bg-white/5 transition-all ${isCurrentVideo ? 'ring-2 ring-blue-500/50' : ''}`}
                          disabled={isCurrentVideo}
                        >
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-black/20 mb-2">
                            <img 
                              src={altVideo.thumbnail_url} 
                              alt={altVideo.title}
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                            <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm grid place-items-center">
                                <Play fill="white" className="ml-0.5" size={14} />
                              </div>
                            </div>
                            {altVideo.duration && (
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-xs text-white flex items-center gap-1">
                                <Clock size={10} />
                                {formatDuration(altVideo.duration)}
                              </div>
                            )}
                            {isCurrentVideo && (
                              <div className="absolute top-1 left-1 px-2 py-0.5 rounded bg-blue-500/80 backdrop-blur-sm text-xs text-white font-medium">
                                Playing
                              </div>
                            )}
                          </div>
                          <div className="text-xs font-medium text-white line-clamp-2 group-hover:text-white/90 transition-colors">
                            {altVideo.title}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div
              className="h-4 flex items-center justify-center cursor-row-resize hover:bg-white/5 transition-colors shrink-0 -mx-4 px-4"
              onMouseDown={(e) => {
                e.preventDefault()
                setIsDragging(true)
                document.body.style.cursor = 'row-resize'
                document.body.style.userSelect = 'none'
              }}
            >
              <div className="w-16 h-1 rounded-full bg-white/20" />
            </div>

            <div style={{ height: `${100 - videoHeightPct}%` }} className="flex flex-col min-h-0 pt-2">
              <div className="glass rounded-2xl p-6 notes-paper flex flex-col flex-1 w-full max-w-4xl mx-auto relative">
                <div className="mb-4 opacity-70 text-sm font-medium flex items-center gap-2">
                  <FileText size={14} /> Notes
                </div>
                <textarea
                  className="flex-1 w-full bg-transparent outline-none resize-none leading-relaxed"
                  placeholder={`Start typing notes for "${activeTopic.title}"...`}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/exams/${examId}`} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
            Let’s Learn
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topics?.map((topic) => {
          const video = topic.videos?.[0]
          const videoCount = topic.videos?.length || 0
          return (
            <div key={topic.id} className="glass p-4 rounded-2xl group hover:bg-white/5 transition-all">
              <div className="aspect-video rounded-xl bg-black/20 mb-4 overflow-hidden relative">
                {video ? (
                  <>
                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm grid place-items-center">
                        <Play fill="white" className="ml-1" size={20} />
                      </div>
                    </div>
                    {videoCount > 1 && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-xs text-white">
                        {videoCount} videos
                      </div>
                    )}
                    {video.duration && (
                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-xs text-white flex items-center gap-1">
                        <Clock size={12} />
                        {formatDuration(video.duration)}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full grid place-items-center text-muted text-sm">
                    No video found
                  </div>
                )}
              </div>
              <h3 className="font-medium leading-snug mb-2 line-clamp-2">{topic.title}</h3>
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-muted flex items-center gap-2">
                  <span>{topic.subpoints_json?.length || 0} key points</span>
                  {videoCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{videoCount} {videoCount === 1 ? 'video' : 'videos'}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setActiveTopicId(topic.id)}
                  disabled={!video}
                  className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Start
                </button>
              </div>
            </div>
          )
        })}
        {topics?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted">
            No topics found. Process your slides first.
          </div>
        )}
      </div>
    </div>
  )
}



