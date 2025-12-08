import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useState } from 'react'
import { FileText, ChevronDown, ChevronRight, BookOpen, Download, X } from 'lucide-react'

type ExamWithClass = {
  examId: string
  examTitle: string
  className: string
  classId: string
}

type Video = {
  id: string
  youtube_id: string
  title: string
  subpoint_index: number | null
}

type TopicNote = {
  topicId: string
  topicTitle: string
  videos: Video[]
  noteId: string | null
  content: string | null
  updated_at: string | null
}

type ExamNotes = {
  exam: ExamWithClass
  topics: TopicNote[]
}

export function NotesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [expandedExams, setExpandedExams] = useState<Record<string, boolean>>({})
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({})

  // Fetch all exams with classes and their topics/notes
  const { data: examNotes, isLoading } = useQuery<ExamNotes[]>({
    queryKey: ['all-exam-notes', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return []

      // Get all exams with their classes
      const { data: exams, error: examsError } = await supabase
        .from('exams')
        .select(`
          id,
          title,
          class:classes!inner(
            id,
            title
          )
        `)
        .order('created_at', { ascending: false })

      if (examsError) throw examsError
      if (!exams || exams.length === 0) return []

      const examIds = exams.map((e: any) => e.id)

      // Get all slides for these exams
      const { data: slides } = await supabase
        .from('slides')
        .select('id, exam_id')
        .in('exam_id', examIds)

      if (!slides || slides.length === 0) return []

      const slideIds = slides.map(s => s.id)

      // Get all topics for these slides with their videos
      const { data: topics } = await supabase
        .from('topics')
        .select(`
          id,
          slide_id,
          title,
          videos(
            id,
            youtube_id,
            title,
            subpoint_index
          )
        `)
        .in('slide_id', slideIds)

      if (!topics || topics.length === 0) return []

      const topicIds = topics.map(t => t.id)
      const examIdBySlideId: Record<string, string> = {}
      for (const slide of slides) {
        examIdBySlideId[slide.id] = slide.exam_id
      }

      // Get all notes for these topics
      const { data: notes } = await supabase
        .from('topic_notes')
        .select('id, topic_id, content, updated_at')
        .eq('user_id', user.id)
        .in('topic_id', topicIds)

      // Organize by exam
      const notesByTopic: Record<string, typeof notes[0]> = {}
      for (const note of (notes || [])) {
        notesByTopic[note.topic_id] = note
      }

      // Build exam notes structure
      const result: ExamNotes[] = exams.map((exam: any) => {
        const examSlides = slides.filter(s => s.exam_id === exam.id)
        const examSlideIds = examSlides.map(s => s.id)
        const examTopics = topics.filter(t => examSlideIds.includes(t.slide_id))

        const topicNotes: TopicNote[] = examTopics.map(topic => ({
          topicId: topic.id,
          topicTitle: topic.title,
          videos: ((topic as any).videos || []).sort((a: Video, b: Video) => {
            const aIdx = a.subpoint_index ?? 999
            const bIdx = b.subpoint_index ?? 999
            return aIdx - bIdx
          }),
          noteId: notesByTopic[topic.id]?.id || null,
          content: notesByTopic[topic.id]?.content || null,
          updated_at: notesByTopic[topic.id]?.updated_at || null,
        }))

        return {
          exam: {
            examId: exam.id,
            examTitle: exam.title,
            className: exam.class?.title || 'Unknown Class',
            classId: exam.class?.id || '',
          },
          topics: topicNotes,
        }
      })

      return result.filter(e => e.topics.length > 0) // Only show exams with topics
    },
  })

  // Export functions
  const exportNote = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const exportTopicNote = (topic: TopicNote, examTitle: string) => {
    if (!topic.content) return
    const videoList = topic.videos.length > 0 
      ? `\n\nVideos:\n${topic.videos.map(v => `  • ${v.title}`).join('\n')}\n`
      : ''
    const content = `Study Guide: ${topic.topicTitle}${videoList}\n\nNotes:\n${topic.content}`
    const filename = `${examTitle} - ${topic.topicTitle} - Notes.txt`
    exportNote(content, filename)
  }

  const exportAllTopicNotes = (exam: ExamWithClass, topics: TopicNote[]) => {
    const notes = topics.filter(t => t.content).map(t => {
      const videoList = t.videos.length > 0 
        ? `\nVideos:\n${t.videos.map(v => `  • ${v.title}`).join('\n')}\n`
        : ''
      return `=== ${t.topicTitle} ===${videoList}\n\n${t.content}\n`
    }).join('\n---\n\n')
    
    if (!notes) return
    
    const filename = `${exam.className} - ${exam.examTitle} - All Study Guide Notes.txt`
    exportNote(notes, filename)
  }

  const exportAllExamNotes = (examNotes: ExamNotes[]) => {
    const allNotes = examNotes.map(examNote => {
      const topicNotes = examNote.topics
        .filter(t => t.content)
        .map(t => {
          const videoList = t.videos.length > 0 
            ? `\n  Videos:\n${t.videos.map(v => `    • ${v.title}`).join('\n')}\n`
            : ''
          return `  === ${t.topicTitle} ===${videoList}\n\n  ${t.content}`
        })
        .join('\n\n')
      
      if (!topicNotes) return ''
      
      return `===== ${examNote.exam.className} - ${examNote.exam.examTitle} =====\n\n${topicNotes}\n\n`
    }).join('\n\n')

    if (!allNotes) return

    const filename = `All Exam Notes - ${new Date().toISOString().split('T')[0]}.txt`
    exportNote(allNotes, filename)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
          Your Notes
        </h1>
        <div className="text-muted">Loading notes...</div>
      </div>
    )
  }

  if (!examNotes || examNotes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
          Your Notes
        </h1>
        <div className="glass p-8 rounded-2xl text-center text-muted">
          <FileText className="mx-auto h-12 w-12 opacity-20 mb-4" />
          <p>You haven't taken any notes yet.</p>
          <p className="text-sm mt-2">Go to an exam and start learning to create notes.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
          Your Notes
        </h1>
        {examNotes.length > 0 && (
          <button
            onClick={() => exportAllExamNotes(examNotes)}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2 text-sm"
          >
            <Download size={16} />
            Export All Notes
          </button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {examNotes.map((examNote) => {
          const isExamExpanded = expandedExams[examNote.exam.examId]
          const topicsWithNotes = examNote.topics.filter(t => t.content)
          
          return (
            <div key={examNote.exam.examId} className="glass p-4 rounded-2xl space-y-3">
              {/* Exam Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => setExpandedExams(prev => ({ ...prev, [examNote.exam.examId]: !isExamExpanded }))}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    disabled={examNote.topics.length === 0}
                  >
                    {examNote.topics.length > 0 ? (
                      isExamExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                    ) : null}
                  </button>
                  <div className="flex-1">
                    <div className="text-white font-medium">{examNote.exam.className} - {examNote.exam.examTitle}</div>
                    <div className="text-xs text-muted">
                      {topicsWithNotes.length} note{topicsWithNotes.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                {topicsWithNotes.length > 0 && (
                  <button
                    onClick={() => exportAllTopicNotes(examNote.exam, examNote.topics)}
                    className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-xs"
                    title="Export all notes for this exam"
                  >
                    <Download size={14} />
                  </button>
                )}
              </div>

              {/* Topics List */}
              {isExamExpanded && (
                <div className="space-y-2 border-l-2 border-white/10 pl-4 ml-2">
                  {examNote.topics.map((topic) => {
                    const isTopicExpanded = expandedTopics[`${examNote.exam.examId}-${topic.topicId}`]
                    const hasNote = !!topic.content

                    return (
                      <div key={topic.topicId} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedTopics(prev => ({ 
                              ...prev, 
                              [`${examNote.exam.examId}-${topic.topicId}`]: !isTopicExpanded 
                            }))}
                            className="p-0.5 hover:bg-white/10 rounded transition-colors"
                          >
                            {isTopicExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <div className="flex items-center gap-2 flex-1">
                            <BookOpen size={14} className="opacity-60" />
                            <div className="flex-1 text-sm text-white/90">{topic.topicTitle}</div>
                            {hasNote && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (topic.content) {
                                    exportTopicNote(topic, `${examNote.exam.className} - ${examNote.exam.examTitle}`)
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                                title="Export this note"
                              >
                                <Download size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Videos and Note Content */}
                        {isTopicExpanded && (
                          <div className="ml-6 space-y-2">
                            {/* Videos List */}
                            {topic.videos.length > 0 && (
                              <div className="glass p-2 rounded-lg space-y-1">
                                <div className="text-xs font-medium text-muted mb-1">Videos:</div>
                                {topic.videos.map((video) => (
                                  <div key={video.id} className="text-xs text-white/70 pl-2">
                                    • {video.title}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Note Content */}
                            {hasNote ? (
                              <div className="glass p-3 rounded-lg space-y-2">
                                <div className="text-xs text-muted whitespace-pre-wrap leading-relaxed">
                                  {topic.content}
                                </div>
                                {topic.updated_at && (
                                  <div className="text-xs text-muted/60">
                                    Last updated: {new Date(topic.updated_at).toLocaleDateString(undefined, { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      hour: 'numeric', 
                                      minute: 'numeric' 
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-muted italic">No notes for this topic yet</div>
                            )}
                          </div>
                        )}
                      </div>
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
