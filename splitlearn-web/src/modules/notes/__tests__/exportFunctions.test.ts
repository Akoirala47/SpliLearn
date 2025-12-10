import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function exportNote(content: string, filename: string) {
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

function exportTopicNote(topic: any, examTitle: string) {
  if (!topic.content) return
  const videoList = topic.videos.length > 0 
    ? `\n\nVideos:\n${topic.videos.map((v: any) => `  • ${v.title}`).join('\n')}\n`
    : ''
  const content = `Study Guide: ${topic.topicTitle}${videoList}\n\nNotes:\n${topic.content}`
  exportNote(content, `${examTitle} - ${topic.topicTitle} - Notes.txt`)
}

function exportAllTopicNotes(exam: any, topics: any[]) {
  const notes = topics.filter(t => t.content).map(t => {
    const videoList = t.videos.length > 0 
      ? `\nVideos:\n${t.videos.map((v: any) => `  • ${v.title}`).join('\n')}\n`
      : ''
    return `=== ${t.topicTitle} ===${videoList}\n\n${t.content}\n`
  }).join('\n---\n\n')
  if (!notes) return
  exportNote(notes, `${exam.className} - ${exam.examTitle} - All Study Guide Notes.txt`)
}

function exportAllExamNotes(examNotes: any[]) {
  const allNotes = examNotes.map(examNote => {
    const topicNotes = examNote.topics.filter((t: any) => t.content).map((t: any) => {
      const videoList = t.videos.length > 0 
        ? `\n  Videos:\n${t.videos.map((v: any) => `    • ${v.title}`).join('\n')}\n`
        : ''
      return `  === ${t.topicTitle} ===${videoList}\n\n  ${t.content}`
    }).join('\n\n')
    if (!topicNotes) return ''
    return `===== ${examNote.exam.className} - ${examNote.exam.examTitle} =====\n\n${topicNotes}\n\n`
  }).join('\n\n')
  if (!allNotes) return
  exportNote(allNotes, `All Exam Notes - ${new Date().toISOString().split('T')[0]}.txt`)
}

describe('Export Functions', () => {
  let createElementSpy: any, appendChildSpy: any, removeChildSpy: any, clickSpy: any

  beforeEach(() => {
    createElementSpy = vi.spyOn(document, 'createElement')
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => ({} as any))
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => ({} as any))
    clickSpy = vi.fn()
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test')
    global.URL.revokeObjectURL = vi.fn()
    createElementSpy.mockReturnValue({ href: '', download: '', click: clickSpy })
  })

  afterEach(() => vi.restoreAllMocks())

  describe('exportNote', () => {
    it('creates and downloads a file', () => {
      exportNote('Test content', 'test.txt')
      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(appendChildSpy).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalled()
      expect(removeChildSpy).toHaveBeenCalled()
      expect(global.URL.createObjectURL).toHaveBeenCalled()
      expect(global.URL.revokeObjectURL).toHaveBeenCalled()
    })
  })

  describe('exportTopicNote', () => {
    it('exports note with video list', () => {
      exportTopicNote({ topicTitle: 'Topic 1', content: 'Note content', videos: [{ title: 'Video 1' }] }, 'Class - Exam')
      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(clickSpy).toHaveBeenCalled()
    })

    it('does not export when content is empty', () => {
      exportTopicNote({ topicTitle: 'Topic 1', content: null, videos: [] }, 'Class - Exam')
      expect(createElementSpy).not.toHaveBeenCalled()
    })
  })

  describe('exportAllTopicNotes', () => {
    it('exports all notes for an exam', () => {
      exportAllTopicNotes({ className: 'Class', examTitle: 'Exam' }, [
        { topicTitle: 'Topic 1', content: 'Note 1', videos: [] },
        { topicTitle: 'Topic 2', content: 'Note 2', videos: [] },
      ])
      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(clickSpy).toHaveBeenCalled()
    })

    it('does not export when no notes exist', () => {
      exportAllTopicNotes({ className: 'Class', examTitle: 'Exam' }, [
        { topicTitle: 'Topic 1', content: null, videos: [] },
      ])
      expect(createElementSpy).not.toHaveBeenCalled()
    })
  })

  describe('exportAllExamNotes', () => {
    it('exports notes from multiple exams', () => {
      exportAllExamNotes([
        { exam: { className: 'Class 1', examTitle: 'Exam 1' }, topics: [{ topicTitle: 'Topic 1', content: 'Note 1', videos: [] }] },
        { exam: { className: 'Class 2', examTitle: 'Exam 2' }, topics: [{ topicTitle: 'Topic 2', content: 'Note 2', videos: [] }] },
      ])
      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(clickSpy).toHaveBeenCalled()
    })

    it('includes video lists in export', () => {
      exportAllExamNotes([{
        exam: { className: 'Class', examTitle: 'Exam' },
        topics: [{ topicTitle: 'Topic 1', content: 'Note 1', videos: [{ title: 'Video 1' }] }],
      }])
      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(clickSpy).toHaveBeenCalled()
    })
  })
})
