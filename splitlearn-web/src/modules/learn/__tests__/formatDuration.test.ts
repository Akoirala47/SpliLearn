import { describe, it, expect } from 'vitest'

function formatDuration(seconds?: number): string {
  if (!seconds || seconds === 0) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

describe('formatDuration', () => {
  it('returns empty string for undefined', () => {
    expect(formatDuration(undefined)).toBe('')
  })

  it('returns empty string for 0', () => {
    expect(formatDuration(0)).toBe('')
  })

  it('formats seconds correctly', () => {
    expect(formatDuration(30)).toBe('0:30')
    expect(formatDuration(45)).toBe('0:45')
  })

  it('formats minutes and seconds correctly', () => {
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('formats hours and minutes correctly', () => {
    expect(formatDuration(3600)).toBe('1h 0m')
    expect(formatDuration(3660)).toBe('1h 1m')
    expect(formatDuration(3723)).toBe('1h 2m')
    expect(formatDuration(7200)).toBe('2h 0m')
    expect(formatDuration(10800)).toBe('3h 0m')
  })

  it('handles large durations', () => {
    expect(formatDuration(86400)).toBe('24h 0m')
    expect(formatDuration(90000)).toBe('25h 0m')
  })

  it('pads seconds with zero', () => {
    expect(formatDuration(61)).toBe('1:01')
    expect(formatDuration(122)).toBe('2:02')
  })
})
