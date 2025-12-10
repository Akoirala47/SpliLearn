import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import React from 'react'
import { useExams, useCreateExam, useUpdateExam, useDeleteExam } from '../hooks'
import { supabase } from '../../lib/supabaseClient'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useExams', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not fetch when classId is undefined', () => {
    const { result } = renderHook(() => useExams(undefined), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(false)
  })

  it('fetches exams for a given classId', async () => {
    const mockExams = [{ id: 'exam-1', class_id: 'class-1', title: 'Exam 1', date: '2024-12-31', created_at: '2024-01-01' }]
    ;(supabase.from as any).mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockExams, error: null })) })) })),
    })
    const { result } = renderHook(() => useExams('class-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockExams)
  })

  it('handles errors correctly', async () => {
    ;(supabase.from as any).mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Error' } })) })) })),
    })
    const { result } = renderHook(() => useExams('class-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useCreateExam', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates exam optimistically', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
    ;(supabase.from as any).mockReturnValue({ insert: vi.fn(() => Promise.resolve({ data: null, error: null })) })
    const { result } = renderHook(() => useCreateExam('class-1'), { wrapper })
    result.current.mutate({ title: 'New Exam', date: '2024-12-31' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('exams')
  })
})

describe('useUpdateExam', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates exam title', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    queryClient.setQueryData(['exams', 'class-1'], [{ id: 'exam-1', class_id: 'class-1', title: 'Old Title', date: null, created_at: '2024-01-01' }])
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
    ;(supabase.from as any).mockReturnValue({ update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })
    const { result } = renderHook(() => useUpdateExam('class-1'), { wrapper })
    result.current.mutate({ id: 'exam-1', title: 'New Title' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('exams')
  })
})

describe('useDeleteExam', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes exam', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    queryClient.setQueryData(['exams', 'class-1'], [{ id: 'exam-1', class_id: 'class-1', title: 'Exam', date: null, created_at: '2024-01-01' }])
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
    ;(supabase.from as any).mockReturnValue({ delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })
    const { result } = renderHook(() => useDeleteExam('class-1'), { wrapper })
    result.current.mutate('exam-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('exams')
  })
})
