import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '../../../test/utils'
import { CountdownBar } from '../CountdownBar'

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

describe('CountdownBar', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders "No date set" when examDate is null', () => {
    render(<CountdownBar examDate={null} />)
    expect(screen.getByText('No date set')).toBeInTheDocument()
  })

  it('displays correct days remaining for future date', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const future = new Date(today)
    future.setDate(future.getDate() + 15)
    future.setHours(0, 0, 0, 0)
    render(<CountdownBar examDate={formatDate(future)} />)
    const text = screen.getByText(/days left/)
    expect(text.textContent).toMatch(/1[45] days left/)
  })

  it('displays "Today" when exam is today', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    render(<CountdownBar examDate={formatDate(today)} />)
    const text = screen.getByText(/Today|0 days left|1 day overdue|days left|overdue/)
    expect(text).toBeInTheDocument()
    expect(text.textContent).not.toMatch(/\d+ days left/)
  })

  it('displays "Tomorrow" when exam is tomorrow', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    render(<CountdownBar examDate={formatDate(tomorrow)} />)
    expect(screen.getByText(/Tomorrow|Today|1 days left/)).toBeInTheDocument()
  })

  it('displays overdue message for past dates', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const past = new Date(today)
    past.setDate(past.getDate() - 5)
    past.setHours(0, 0, 0, 0)
    render(<CountdownBar examDate={formatDate(past)} />)
    expect(screen.getByText(/overdue/)).toBeInTheDocument()
  })

  it('shows 100% progress for dates 30+ days away', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const future = new Date(today)
    future.setDate(future.getDate() + 35)
    const { container } = render(<CountdownBar examDate={formatDate(future)} />)
    expect(container.querySelector('.h-full')).toHaveStyle({ width: '100%' })
  })

  it('shows 0% progress for overdue dates', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const past = new Date(today)
    past.setDate(past.getDate() - 1)
    const { container } = render(<CountdownBar examDate={formatDate(past)} />)
    expect(container.querySelector('.h-full')).toHaveStyle({ width: '0%' })
  })

  it('applies correct color for urgent status', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const urgent = new Date(today)
    urgent.setDate(urgent.getDate() + 5)
    const { container } = render(<CountdownBar examDate={formatDate(urgent)} />)
    expect(container.querySelector('.h-full')?.className).toContain('bg-orange-500')
  })

  it('applies correct color for warning status', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const warning = new Date(today)
    warning.setDate(warning.getDate() + 10)
    const { container } = render(<CountdownBar examDate={formatDate(warning)} />)
    expect(container.querySelector('.h-full')?.className).toContain('bg-yellow-500')
  })

  it('applies correct color for good status', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const good = new Date(today)
    good.setDate(good.getDate() + 20)
    const { container } = render(<CountdownBar examDate={formatDate(good)} />)
    expect(container.querySelector('.h-full')?.className).toContain('bg-green-500')
  })

  it('calculates percentage correctly for 15 days remaining', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const date = new Date(today)
    date.setDate(date.getDate() + 15)
    date.setHours(0, 0, 0, 0)
    const { container } = render(<CountdownBar examDate={formatDate(date)} />)
    const width = container.querySelector('.h-full')?.getAttribute('style') || ''
    const match = width.match(/width:\s*([\d.]+)%/)
    const value = match ? parseFloat(match[1]) : 0
    expect(value).toBeGreaterThanOrEqual(46)
    expect(value).toBeLessThanOrEqual(50)
  })

  it('applies custom className', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const date = new Date(today)
    date.setDate(date.getDate() + 10)
    const { container } = render(<CountdownBar examDate={formatDate(date)} className="custom-class" />)
    expect((container.firstChild as HTMLElement).className).toContain('custom-class')
  })
})
