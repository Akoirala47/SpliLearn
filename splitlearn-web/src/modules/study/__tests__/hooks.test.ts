import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import React from 'react'
import { useTopicsByExam, useNotesMap, useUpsertNote } from '../hooks'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthContext'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useTopicsByExam', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when examId is undefined', () => {
    const { result } = renderHook(() => useTopicsByExam(undefined), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(false)
  })

  it('fetches topics for an exam', async () => {
    const mockSlides = [{ id: 'slide-1' }]
    const mockTopics = [{ id: 'topic-1', slide_id: 'slide-1', title: 'Topic 1', subpoints_json: ['point 1'], created_at: '2024-01-01' }]
    ;(supabase.from as any)
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: mockSlides, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockTopics, error: null })) })) })) })
    const { result } = renderHook(() => useTopicsByExam('exam-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeDefined()
  })

  it('returns empty array when no slides exist', async () => {
    ;(supabase.from as any).mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })
    const { result } = renderHook(() => useTopicsByExam('exam-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useNotesMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 'user-1' } })
  })

  it('does not fetch when user is not authenticated', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    const { result } = renderHook(() => useNotesMap(['topic-1']), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(false)
  })

  it('does not fetch when topicIds is empty', () => {
    const { result } = renderHook(() => useNotesMap([]), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(false)
  })

  it('fetches notes map for topics', async () => {
    const mockNotes = [{ id: 'note-1', topic_id: 'topic-1', user_id: 'user-1', content: 'Note content', source: 'study_guide', last_updated: '2024-01-01' }]
    ;(supabase.from as any).mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockNotes, error: null })) })) })),
    })
    const { result } = renderHook(() => useNotesMap(['topic-1']), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.['topic-1']).toBeDefined()
  })
})

describe('useUpsertNote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 'user-1' } })
  })

  it('upserts a note', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
    ;(supabase.from as any).mockReturnValue({ upsert: vi.fn(() => Promise.resolve({ data: null, error: null })) })
    const { result } = renderHook(() => useUpsertNote(), { wrapper })
    result.current.mutate({ topicId: 'topic-1', content: 'New note' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('notes')
  })
})
