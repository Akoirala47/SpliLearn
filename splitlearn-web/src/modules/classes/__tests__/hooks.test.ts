import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import React from 'react'
import { useClasses, useCreateClass, useUpdateClass, useDeleteClass } from '../hooks'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthContext'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useClasses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 'user-1' } })
  })

  it('does not fetch when user is not authenticated', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    const { result } = renderHook(() => useClasses(), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(false)
  })

  it('fetches classes for authenticated user', async () => {
    const mockClasses = [{ id: 'class-1', user_id: 'user-1', title: 'Class 1', created_at: '2024-01-01' }]
    ;(supabase.from as any).mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockClasses, error: null })) })) })),
    })
    const { result } = renderHook(() => useClasses(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockClasses)
  })
})

describe('useCreateClass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 'user-1' } })
  })

  it('creates class optimistically', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
    ;(supabase.from as any).mockReturnValue({ insert: vi.fn(() => Promise.resolve({ data: null, error: null })) })
    const { result } = renderHook(() => useCreateClass(), { wrapper })
    result.current.mutate('New Class')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('classes')
  })
})

describe('useUpdateClass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 'user-1' } })
  })

  it('updates class title', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    queryClient.setQueryData(['classes', 'user-1'], [{ id: 'class-1', user_id: 'user-1', title: 'Old Title', created_at: '2024-01-01' }])
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
    ;(supabase.from as any).mockReturnValue({ update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })
    const { result } = renderHook(() => useUpdateClass(), { wrapper })
    result.current.mutate({ id: 'class-1', title: 'New Title' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useDeleteClass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 'user-1' } })
  })

  it('deletes class', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
    queryClient.setQueryData(['classes', 'user-1'], [{ id: 'class-1', user_id: 'user-1', title: 'Class', created_at: '2024-01-01' }])
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children)
    ;(supabase.from as any).mockReturnValue({ delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })
    const { result } = renderHook(() => useDeleteClass(), { wrapper })
    result.current.mutate('class-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
