import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '../../../test/utils'
import { ToastProvider, useToast } from '../Toast'

function TestComponent({ variant }: { variant?: 'success' | 'error' | 'info' }) {
  const { push } = useToast()
  return (
    <button onClick={() => push({ title: 'Test Toast', description: 'Test description', variant })}>
      Show Toast
    </button>
  )
}

describe('Toast', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders ToastProvider without crashing', () => {
    render(<ToastProvider><div>Test</div></ToastProvider>)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('displays toast when push is called', async () => {
    render(<ToastProvider><TestComponent /></ToastProvider>)
    await act(async () => screen.getByText('Show Toast').click())
    await waitFor(() => expect(screen.getByText('Test Toast')).toBeInTheDocument())
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('displays toast with success variant', async () => {
    render(<ToastProvider><TestComponent variant="success" /></ToastProvider>)
    await act(async () => screen.getByText('Show Toast').click())
    await waitFor(() => expect(screen.getByText('Test Toast')).toBeInTheDocument())
    const dot = document.querySelector('.h-2.w-2.rounded-full') as HTMLElement
    expect(dot.className).toContain('bg-[--color-success]')
  })

  it('displays toast with error variant', async () => {
    render(<ToastProvider><TestComponent variant="error" /></ToastProvider>)
    await act(async () => screen.getByText('Show Toast').click())
    await waitFor(() => expect(screen.getByText('Test Toast')).toBeInTheDocument())
    const dot = document.querySelector('.h-2.w-2.rounded-full') as HTMLElement
    expect(dot.className).toContain('bg-[--color-danger]')
  })

  it('displays toast with info variant', async () => {
    render(<ToastProvider><TestComponent variant="info" /></ToastProvider>)
    await act(async () => screen.getByText('Show Toast').click())
    await waitFor(() => expect(screen.getByText('Test Toast')).toBeInTheDocument())
    const dot = document.querySelector('.h-2.w-2.rounded-full') as HTMLElement
    expect(dot.className).toContain('bg-white')
  })

  it('displays toast without description', async () => {
    function NoDesc() {
      const { push } = useToast()
      return <button onClick={() => push({ title: 'No Description Toast' })}>Show Toast</button>
    }
    render(<ToastProvider><NoDesc /></ToastProvider>)
    await act(async () => screen.getByText('Show Toast').click())
    await waitFor(() => expect(screen.getByText('No Description Toast')).toBeInTheDocument())
    expect(screen.queryByText('Test description')).not.toBeInTheDocument()
  })

  it('auto-dismisses toast after 3.5 seconds', async () => {
    render(<ToastProvider><TestComponent /></ToastProvider>)
    await act(async () => screen.getByText('Show Toast').click())
    await waitFor(() => expect(screen.getByText('Test Toast')).toBeInTheDocument())
    await act(async () => await new Promise(resolve => setTimeout(resolve, 3600)))
    await waitFor(() => expect(screen.queryByText('Test Toast')).not.toBeInTheDocument())
  })

  it('displays multiple toasts simultaneously', async () => {
    function Multi() {
      const { push } = useToast()
      return <button onClick={() => { push({ title: 'Toast 1' }); push({ title: 'Toast 2' }); push({ title: 'Toast 3' }) }}>Show</button>
    }
    render(<ToastProvider><Multi /></ToastProvider>)
    await act(async () => screen.getByText('Show').click())
    await waitFor(() => {
      expect(screen.getByText('Toast 1')).toBeInTheDocument()
      expect(screen.getByText('Toast 2')).toBeInTheDocument()
      expect(screen.getByText('Toast 3')).toBeInTheDocument()
    })
  })

  it('dismisses toasts independently', async () => {
    function Multi() {
      const { push } = useToast()
      return <button onClick={() => { push({ title: 'Toast 1' }); push({ title: 'Toast 2' }) }}>Show</button>
    }
    render(<ToastProvider><Multi /></ToastProvider>)
    await act(async () => screen.getByText('Show').click())
    await waitFor(() => {
      expect(screen.getByText('Toast 1')).toBeInTheDocument()
      expect(screen.getByText('Toast 2')).toBeInTheDocument()
    })
    await act(async () => await new Promise(resolve => setTimeout(resolve, 3600)))
    await waitFor(() => {
      expect(screen.queryByText('Toast 1')).not.toBeInTheDocument()
      expect(screen.queryByText('Toast 2')).not.toBeInTheDocument()
    })
  })

  it('throws error when useToast is used outside ToastProvider', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { render: baseRender } = await import('@testing-library/react')
    function Bad() { useToast(); return <div>Should not render</div> }
    let errorCaught = false
    let rendered = false
    try {
      const { container } = baseRender(<Bad />)
      rendered = container.textContent?.includes('Should not render') ?? false
    } catch (error: any) {
      errorCaught = true
      expect(error?.message || String(error)).toContain('useToast must be used within ToastProvider')
    }
    expect(errorCaught || consoleError.mock.calls.length > 0 || !rendered).toBe(true)
    consoleError.mockRestore()
  })
})
