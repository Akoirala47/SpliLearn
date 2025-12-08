import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useState, useEffect } from 'react'
import { FileText, ArrowRight, Calendar, X, Loader2, Check } from 'lucide-react'

type NoteItem = {
    id: string
    content: string
    updated_at: string
    topic_id: string
    user_id: string
    topic: {
        id: string
        title: string
        slide: {
            exam: {
                id: string
                title: string
            }
        }
    }
}

export function NotesPage() {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null)

    const { data: notes, isLoading } = useQuery({
        queryKey: ['all-notes', user?.id],
        enabled: !!user,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('topic_notes')
                .select(`
          id,
          content,
          updated_at,
          topic_id,
          user_id,
          topic:topics!inner (
            id,
            title,
            slide:slides!inner (
              exam:exams!inner (
                id,
                title
              )
            )
          )
        `)
                .eq('user_id', user?.id)
                .order('updated_at', { ascending: false })

            if (error) throw error
            return data as unknown as NoteItem[]
        }
    })

    // Group notes by Exam
    const groupedNotes = (notes || []).reduce((acc, note) => {
        const examTitle = note.topic.slide.exam.title
        if (!acc[examTitle]) acc[examTitle] = []
        acc[examTitle].push(note)
        return acc
    }, {} as Record<string, NoteItem[]>)

    return (
        <div className="space-y-6 relative">
            <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
                Your Notes
            </h1>

            {isLoading ? (
                <div className="text-muted">Loading notes...</div>
            ) : notes?.length === 0 ? (
                <div className="glass p-8 rounded-2xl text-center text-muted">
                    <FileText className="mx-auto h-12 w-12 opacity-20 mb-4" />
                    <p>You haven't taken any notes yet.</p>
                    <p className="text-sm mt-2">Go to an exam and start learning to create notes.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {Object.entries(groupedNotes).map(([examTitle, examNotes]) => (
                        <div key={examTitle} className="space-y-4">
                            <h2 className="text-xl font-medium text-white mt-8 mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-6 rounded-full brand-gradient" />
                                {examTitle}
                            </h2>
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                {examNotes.map((note) => (
                                    <button
                                        key={note.id}
                                        onClick={() => setSelectedNote(note)}
                                        className="glass p-5 rounded-2xl group hover:bg-white/5 transition-all flex flex-col gap-3 text-left"
                                    >
                                        <div className="flex items-start justify-between gap-4 w-full">
                                            <h3 className="font-medium leading-snug line-clamp-2 text-white/90">
                                                {note.topic.title}
                                            </h3>
                                            <ArrowRight size={16} className="opacity-0 group-hover:opacity-50 -translate-x-2 group-hover:translate-x-0 transition-all shrink-0" />
                                        </div>

                                        <div className="flex-1 text-sm text-muted line-clamp-3 leading-relaxed w-full">
                                            {note.content || <span className="italic opacity-50">Empty note</span>}
                                        </div>

                                        <div className="pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-muted/60 w-full">
                                            <Calendar size={12} />
                                            {new Date(note.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Note Editor Modal */}
            {selectedNote && (
                <NoteEditorOverlay
                    note={selectedNote}
                    onClose={() => {
                        setSelectedNote(null)
                        queryClient.invalidateQueries({ queryKey: ['all-notes'] })
                    }}
                />
            )}
        </div>
    )
}

function NoteEditorOverlay({ note, onClose }: { note: NoteItem; onClose: () => void }) {
    const [content, setContent] = useState(note.content)
    const [isSaving, setIsSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState(note.content)

    // Auto-save logic
    useEffect(() => {
        if (content === lastSaved) return

        const timer = setTimeout(async () => {
            setIsSaving(true)
            await supabase.from('topic_notes').update({
                content: content,
                updated_at: new Date().toISOString()
            }).eq('id', note.id)

            setLastSaved(content)
            setIsSaving(false)
        }, 1000)

        return () => clearTimeout(timer)
    }, [content, lastSaved, note.id])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-3xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div>
                        <h3 className="font-semibold text-lg">{note.topic.title}</h3>
                        <div className="text-xs text-muted flex items-center gap-2">
                            {note.topic.slide.exam.title}
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            {isSaving ? (
                                <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving...</span>
                            ) : content !== lastSaved ? (
                                <span className="opacity-50">Unsaved</span>
                            ) : (
                                <span className="flex items-center gap-1"><Check size={10} /> Saved</span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Editor */}
                <div className="flex-1 p-6 flex flex-col">
                    <textarea
                        className="flex-1 w-full bg-transparent outline-none resize-none leading-relaxed text-lg"
                        placeholder="Start typing your notes..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    )
}
