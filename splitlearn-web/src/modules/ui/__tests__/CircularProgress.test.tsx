import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { CircularProgress } from '../CircularProgress'

describe('CircularProgress', () => {
  it('renders with default size and value', () => {
    const { container } = render(<CircularProgress value={50} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '120')
    expect(svg).toHaveAttribute('height', '120')
  })

  it('renders with custom size', () => {
    const { container } = render(<CircularProgress value={50} size={200} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '200')
    expect(svg).toHaveAttribute('height', '200')
  })

  it('renders children in center', () => {
    render(<CircularProgress value={75}><div>75%</div></CircularProgress>)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<CircularProgress value={50} className="custom-class" />)
    expect((container.firstChild as HTMLElement).className).toContain('custom-class')
  })

  it('calculates correct stroke offset for 0%', () => {
    const { container } = render(<CircularProgress value={0} />)
    expect(container.querySelector('circle:last-of-type')?.getAttribute('stroke-dashoffset')).toBeTruthy()
  })

  it('calculates correct stroke offset for 100%', () => {
    const { container } = render(<CircularProgress value={100} />)
    expect(container.querySelector('circle:last-of-type')?.getAttribute('stroke-dashoffset')).toBe('0')
  })

  it('clamps value to 0-100 range', () => {
    const { container, rerender } = render(<CircularProgress value={150} />)
    expect(container.querySelector('circle:last-of-type')?.getAttribute('stroke-dashoffset')).toBe('0')
    rerender(<CircularProgress value={-10} />)
    const circumference = 2 * Math.PI * ((120 - 8) / 2)
    expect(container.querySelector('circle:last-of-type')?.getAttribute('stroke-dashoffset')).toBe(String(circumference))
  })
})
