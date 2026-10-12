import { describe, it, expect } from 'vitest'
import { formatDuration, formatRecipeTime } from './formatTime'

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(1345)).toBe('22 h 25 min')
    expect(formatDuration(0)).toBe('')
  })
  it('splits active and wait time', () => {
    expect(formatRecipeTime({ timeMinutes: 1345, activeMinutes: 30 })).toBe('30 min active + 21 h 55 min wait')
    expect(formatRecipeTime({ timeMinutes: 20 })).toBe('20 min')
    expect(formatRecipeTime({})).toBe('')
  })
})
