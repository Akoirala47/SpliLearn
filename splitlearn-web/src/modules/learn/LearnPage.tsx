import { usePreferences } from '../state/preferences'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useState, useEffect } from 'react'
import { ArrowLeft, Play, FileText, Check, Loader2, Clock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

type Video = {
  id: string
  youtube_id: string
  title: string
  description?: string
  thumbnail_url: string
  duration?: number // in seconds
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
  const { typingPausesVideo, setTypingPausesVideo } = usePreferences()
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0)

  // Notes State
  const [noteContent, setNoteContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState('')

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
      return topicsData as unknown as Topic[]
    }
  })

  const activeTopic = topics?.find(t => t.id === activeTopicId)
  const activeVideos = activeTopic?.videos || []
  const activeVideo = activeVideos[selectedVideoIndex] || activeVideos[0]

  // Reset video selection when topic changes
  useEffect(() => {
    setSelectedVideoIndex(0)
  }, [activeTopicId])

  // Load notes when active topic changes
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

  // Auto-save logic
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


  // Resizable Split View State
  const [videoHeightPct, setVideoHeightPct] = useState(50)
  const [isDragging, setIsDragging] = useState(false)

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
        {/* Main Content */}
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
              {/* Video Selector - only show if multiple videos */}
              {activeVideos.length > 1 && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedVideoIndex}
                    onChange={(e) => setSelectedVideoIndex(parseInt(e.target.value, 10))}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                  >
                    {activeVideos.map((video, idx) => (
                      <option key={video.id} value={idx} className="bg-[#1A1A2E]">
                        Video {idx + 1}: {video.title.length > 40 ? video.title.slice(0, 40) + '...' : video.title}
                      </option>
                    ))}
                  </select>
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
              <label className="flex items-center gap-2 text-sm cursor-pointer hidden sm:flex">
                <input
                  type="checkbox"
                  checked={typingPausesVideo}
                  onChange={(e) => setTypingPausesVideo(e.target.checked)}
                  className="rounded bg-white/10 border-white/20"
                />
                Typing pauses video
              </label>
            </div>
          </div>

          <div id="split-container" className="flex-1 flex flex-col min-h-0 relative select-none">
            {/* Top Pane: Video + Description */}
            <div style={{ height: `${videoHeightPct}%` }} className="flex flex-col min-h-0 gap-4 overflow-y-auto pb-2">
              <div className="glass rounded-2xl overflow-hidden bg-black shrink-0 aspect-video w-full max-w-4xl mx-auto">
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
            </div>

            {/* Drag Handle */}
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

            {/* Bottom Pane: Notes */}
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
                    {/* Video count badge */}
                    {videoCount > 1 && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-xs text-white">
                        {videoCount} videos
                      </div>
                    )}
                    {/* Duration badge */}
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



