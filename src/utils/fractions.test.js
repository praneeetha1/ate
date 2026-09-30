import { describe, it, expect } from 'vitest'
import { parseFrac, fmtFrac } from './fractions'

describe('parseFrac', () => {
  it('reads a plain number and a bare fraction', () => {
    expect(parseFrac('3')).toBe(3)
    expect(parseFrac('1/2')).toBe(0.5)
  })

  it('reads a spaced mixed number', () => {
    expect(parseFrac('1 1/2')).toBe(1.5)
  })

  /**
   * Found by importing a real Sally's Baking Addiction recipe, which writes
   * "2 and 1/4 cups all-purpose flour". This used to return 2 — the quarter
   * vanished silently and every scaled serving was wrong.
   */
  it('reads "and" as a mixed number', () => {
    expect(parseFrac('2 and 1/4')).toBe(2.25)
    expect(parseFrac('1 and 1/2')).toBe(1.5)
  })

  // fmtFrac renders these, and an edited amount hands them straight back.
  it('reads the vulgar fractions fmtFrac emits', () => {
    expect(parseFrac('¼')).toBe(0.25)
    expect(parseFrac('2 ¼')).toBe(2.25)
    expect(parseFrac('2¼')).toBe(2.25)
  })

  it('returns null for nonsense', () => {
    expect(parseFrac('a pinch')).toBeNull()
    expect(parseFrac('')).toBeNull()
  })
})

describe('round trip', () => {
  it('survives fmtFrac then parseFrac', () => {
    for (const n of [0.25, 0.5, 1.5, 2.25, 3]) {
      expect(parseFrac(fmtFrac(n))).toBeCloseTo(n, 5)
    }
  })
})
