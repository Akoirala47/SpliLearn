import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useToast } from '../ui/Toast'
import { StudyGuide } from '../study/StudyGuide'

export function ExamDetailPage() {
  const { examId } = useParams()

  const qc = useQueryClient()
  type SlideRow = { id: string; file_url: string; ai_summary_json: { status?: 'processing' | 'done' | 'error';[k: string]: unknown } | null; created_at: string }
  const { data: slides } = useQuery<SlideRow[]>({
    queryKey: ['slides', examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slides')
        .select('id, file_url, ai_summary_json, created_at')
        .eq('exam_id', examId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SlideRow[]
    },
  })
  // Extracted texts progress
  const { data: extracted } = useQuery<{ slide_id: string }[]>({
    queryKey: ['slide_texts', examId, (slides || []).map(s => s.id).join(',')],
    enabled: !!examId && (slides || []).length > 0,
    queryFn: async () => {
      const ids = (slides || []).map(s => s.id)
      const { data, error } = await supabase
        .from('slide_texts')
        .select('slide_id')
        .in('slide_id', ids)
      if (error) throw error
      return data as { slide_id: string }[]
    },
  })
  // Auto-refresh while any slide is processing
  useEffect(() => {
    if (!examId) return
    const isProcessing = (slides || []).some(s => s.ai_summary_json?.status === 'processing')
    if (!isProcessing) return
    const t = setInterval(() => qc.invalidateQueries({ queryKey: ['slides', examId] }), 2000)
    return () => clearInterval(t)
  }, [slides, examId, qc])
  const { push } = useToast()
  type PendingUpload = { id: string; name: string; status: 'uploading' | 'error'; error?: string }
  const [pending, setPending] = useState<PendingUpload[]>([])
  const maxSlides = 10
  const stats = useMemo(() => {
    const list = slides || []
    const done = list.filter(s => s.ai_summary_json?.status === 'done').length
    const processing = list.filter(s => s.ai_summary_json?.status === 'processing').length
    const total = list.length
    return { done, processing, total }
  }, [slides])
  const extractedCount = useMemo(() => (extracted ? extracted.length : 0), [extracted])
  const extractionPct = stats.total > 0 ? Math.min(100, Math.round((extractedCount / stats.total) * 100)) : 0
  const hasAllExtracted = stats.total > 0 && extractedCount === stats.total
  const [batchProcessing, setBatchProcessing] = useState(false)

  const handleProcessAll = async () => {
    if (!slides || slides.length === 0) return
    setBatchProcessing(true)
    qc.setQueryData(['slides', examId], (cur: SlideRow[] | undefined) => (cur || []).map((s) => ({ ...s, ai_summary_json: { status: 'processing' } })))
    const { error, data } = await supabase.functions.invoke('process-exam', { body: { examId } })
    let topicsInserted = (data as any)?.topicsInserted ?? 0
    if (error) {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-exam`
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ examId }) })
        if (!r.ok) { const txt = await r.text(); push({ title: 'Process failed', description: txt || r.statusText, variant: 'error' }) }
        else { const j = await r.json().catch(() => ({})); topicsInserted = (j as any)?.topicsInserted ?? 0 }
      } catch (e: unknown) {
        const msg: string = e instanceof Error ? e.message : String(e)
        push({ title: 'Process failed', description: msg, variant: 'error' })
      }
    }
    qc.invalidateQueries({ queryKey: ['slides', examId] })
    qc.invalidateQueries({ queryKey: ['topics-by-exam', examId] })
    setBatchProcessing(false)
    if (topicsInserted > 0) {
      push({ title: 'Processing complete', description: `${topicsInserted} topics added`, variant: 'success' })
    } else {
      push({ title: 'No topics returned', description: 'Try again or check slides content', variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
          Exam {examId}
        </h1>
        <Link to={`/exams/${examId}/learn`} className="px-4 py-2 rounded-full text-white brand-gradient">
          Let’s Learn
        </Link>
      </div>
      <div className="glass p-4 rounded-2xl">
        <div className="text-sm opacity-70">Study Guide</div>
        <div className="mt-2">
          {examId ? <StudyGuide examId={examId} /> : null}
        </div>
      </div>
      <div className="glass p-4 rounded-2xl max-w-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">Slides</div>
          <div className="text-xs text-muted">{stats.done}/{stats.total} processed</div>
        </div>
        {batchProcessing ? (
          <div className="h-2 rounded-full bg-white/10 overflow-hidden" aria-label="Processing all slides">
            <div className="h-2 w-1/2 rounded-full" style={{ backgroundImage: 'var(--gradient)', animation: 'progressIndeterminate 1.2s linear infinite' }} />
          </div>
        ) : (!hasAllExtracted ? (
          <div className="h-2 rounded-full bg-white/10 overflow-hidden" aria-label="Extracting slide text">
            <div className="h-2 rounded-full" style={{ width: `${extractionPct}%`, backgroundImage: 'var(--gradient)' }} />
          </div>
        ) : null)}
        <div className="flex items-center gap-2">
          <input className="block" type="file" multiple accept=".pdf,.ppt,.pptx" onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files || !examId) return
            const existing = (slides?.length ?? 0) + pending.length
            const available = Math.max(0, maxSlides - existing)
            const chosen = Array.from(files).slice(0, available)
            if (chosen.length < files.length) {
              push({ title: `Limit ${maxSlides} slides`, description: 'Only the first files were queued.', variant: 'info' })
            }
            let successCount = 0
            for (const file of chosen) {
              const tempId = crypto.randomUUID()
              setPending((p: PendingUpload[]) => [...p, { id: tempId, name: file.name, status: 'uploading' }])
              const key = `${examId}/${Date.now()}-${file.name}`
              const { data, error } = await supabase.storage.from('slides').upload(key, file)
              if (error) {
                setPending((p: PendingUpload[]) => p.map((x: PendingUpload) => x.id === tempId ? { ...x, status: 'error', error: error.message } : x))
                push({ title: 'Upload failed', description: error.message, variant: 'error' })
                continue
              }
              const fileUrl = data?.path
              const { data: inserted, error: insertErr } = await supabase.from('slides').insert({ exam_id: examId, file_url: fileUrl }).select('id').single()
              if (insertErr) {
                setPending((p: PendingUpload[]) => p.map((x: PendingUpload) => x.id === tempId ? { ...x, status: 'error', error: insertErr.message } : x))
                push({ title: 'Save failed', description: insertErr.message, variant: 'error' })
              } else {
                setPending((p: PendingUpload[]) => p.filter((x) => x.id !== tempId))
                push({ title: 'Uploaded', description: file.name, variant: 'success' })
                qc.invalidateQueries({ queryKey: ['slides', examId] })
                successCount++
              }
            }
            e.currentTarget.value = ''

            // Auto-process if at least one file was uploaded successfully
            if (successCount > 0) {
              // Small delay to ensure state updates settle, though not strictly necessary with async/await
              setTimeout(() => handleProcessAll(), 500)
            }
          }} />
          <button className="btn-pill disabled:opacity-40" disabled={!slides || slides.length === 0} onClick={handleProcessAll}>Process All</button>
        </div>
        <div className="space-y-2">
          {pending.map((u: PendingUpload) => (
            <div key={u.id} className="flex items-center justify-between glass p-3 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-white/10 grid place-items-center">📄</div>
                <div>
                  <div className="text-sm">{u.name}</div>
                  <div className="text-xs text-muted">Uploading…</div>
                </div>
              </div>
              <div className="flex-1 mx-4">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-2 w-1/2 rounded-full" style={{ backgroundImage: 'var(--gradient)', animation: 'progressIndeterminate 1.2s linear infinite' }} />
                </div>
              </div>
              {u.status === 'error' ? (
                <div className="px-2 py-1 rounded-md bg-[--color-danger] text-white text-xs">Error</div>
              ) : null}
            </div>
          ))}
          {(slides || []).map((s) => (
            <div key={s.id} className="flex items-center justify-between glass p-3 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-white/10 grid place-items-center">📄</div>
                <div>
                  <div className="text-sm">{s.file_url.split('/').pop()}</div>
                  <div className="text-xs text-muted">{new Date(s.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 rounded-md bg-white/10" onClick={async () => {
                  const { data, error } = await supabase.storage.from('slides').createSignedUrl(s.file_url, 60)
                  if (error) { push({ title: 'Link error', description: error.message, variant: 'error' }); return }
                  window.open(data.signedUrl, '_blank')
                }}>Download</button>
                <button className="px-3 py-1 rounded-md bg-white/10" onClick={async () => {
                  await supabase.storage.from('slides').remove([s.file_url])
                  await supabase.from('slides').delete().eq('id', s.id)
                  push({ title: 'Deleted', variant: 'success' })
                  qc.invalidateQueries({ queryKey: ['slides', examId] })
                }}>Delete</button>
                {/* Row status pills removed per request; rely on top progress bar and completion toast */}
              </div>
            </div>
          ))}
          {(!slides || slides.length === 0) ? <div className="text-sm text-muted">No slides yet</div> : null}
        </div>
      </div>
    </div>
  )
}


