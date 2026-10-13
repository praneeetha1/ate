import { describe, it, expect } from 'vitest'
import { normalizePantryRows } from './PantryContext'

describe('normalizePantryRows', () => {
  it('moves a renamed item to its current name', () => {
    const { next, stale, migrate } = normalizePantryRows([{ item: 'cornflour', state: 'low' }])
    expect(next.get('cornstarch')).toBe('low')
    expect(next.has('cornflour')).toBe(false)
    expect(stale).toEqual(['cornflour'])
    expect(migrate).toEqual([['cornstarch', 'low']])
  })

  it('merges an old and a new name, keeping the scarcer state', () => {
    const { next } = normalizePantryRows([
      { item: 'cornstarch', state: 'have' },
      { item: 'cornflour', state: 'out' },
    ])
    expect([...next]).toEqual([['cornstarch', 'out']])
  })

  it('leaves current names alone', () => {
    expect(normalizePantryRows([{ item: 'garlic', state: 'have' }]).stale).toEqual([])
  })
})
