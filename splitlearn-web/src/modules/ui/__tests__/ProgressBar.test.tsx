import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import { ProgressBar } from '../ProgressBar'

describe('ProgressBar', () => {
  it('renders with correct percentage', () => {
    render(<ProgressBar value={50} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('clamps value to 0-100 range', () => {
    const { rerender } = render(<ProgressBar value={150} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    rerender(<ProgressBar value={-10} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('applies custom className', () => {
    render(<ProgressBar value={25} className="custom-class" />)
    expect(screen.getByRole('progressbar').className).toContain('custom-class')
  })

  it('renders with 0% progress', () => {
    render(<ProgressBar value={0} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('renders with 100% progress', () => {
    render(<ProgressBar value={100} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
