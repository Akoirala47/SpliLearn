import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import React from 'react'
import { useExamProgress } from '../hooks'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthContext'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useExamProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 'user-1' } })
  })

  it('returns empty array when user is not authenticated', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    const { result } = renderHook(() => useExamProgress(), { wrapper: createWrapper() })
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches exam progress correctly', async () => {
    const mockExams = [{ id: 'exam-1', title: 'Test Exam', date: '2024-12-31', class: { id: 'class-1', title: 'Test Class' } }]
    const mockSlides = [{ id: 'slide-1', exam_id: 'exam-1' }]
    const mockTopics = [{ id: 'topic-1', slide_id: 'slide-1' }]
    const mockVideos = [{ id: 'video-1', topic_id: 'topic-1' }]
    const mockCompletions = [{ video_id: 'video-1', exam_id: 'exam-1' }]

    ;(supabase.from as any)
      .mockReturnValueOnce({ select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockExams, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockSlides, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockTopics, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockVideos, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockCompletions, error: null })) })) })) })

    const { result } = renderHook(() => useExamProgress(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].examId).toBe('exam-1')
    expect(result.current.data?.[0].progressPercentage).toBe(100)
  })

  it('calculates progress percentage correctly', async () => {
    const mockExams = [{ id: 'exam-1', title: 'Test', date: null, class: { id: 'class-1', title: 'Class' } }]
    const mockSlides = [{ id: 'slide-1', exam_id: 'exam-1' }]
    const mockTopics = [{ id: 'topic-1', slide_id: 'slide-1' }]
    const mockVideos = [{ id: 'video-1', topic_id: 'topic-1' }, { id: 'video-2', topic_id: 'topic-1' }, { id: 'video-3', topic_id: 'topic-1' }]
    const mockCompletions = [{ video_id: 'video-1', exam_id: 'exam-1' }]

    ;(supabase.from as any)
      .mockReturnValueOnce({ select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockExams, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockSlides, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockTopics, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockVideos, error: null })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: mockCompletions, error: null })) })) })) })

    const { result } = renderHook(() => useExamProgress(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].totalVideos).toBe(3)
    expect(result.current.data?.[0].completedVideos).toBe(1)
    expect(result.current.data?.[0].progressPercentage).toBe(33)
  })

  it('returns empty array when no exams exist', async () => {
    ;(supabase.from as any).mockReturnValue({ select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })
    const { result } = renderHook(() => useExamProgress(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('handles errors correctly', async () => {
    ;(supabase.from as any).mockReturnValue({ select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Database error' } })) })) })
    const { result } = renderHook(() => useExamProgress(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeDefined()
  })
})
