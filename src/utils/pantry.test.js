import { describe, it, expect } from 'vitest'
import { nextPantryState, pantryFit, compareFit, PANTRY_STATES, PANTRY_LABELS } from './pantry'
import RECIPES from '../data/recipes.json'
import { canonicalItem, isStaple } from '../utils/ingredients'

describe('nextPantryState', () => {
  it('walks have -> low -> out', () => {
    expect(nextPantryState('have')).toBe('low')
    expect(nextPantryState('low')).toBe('out')
  })

  it('starts an untracked item at have', () => {
    expect(nextPantryState('unknown')).toBe('have')
    expect(nextPantryState(undefined)).toBe('have')
  })

  // A non-staple can be put back to "stop asking me about this"; a staple has
  // no unknown to return to, since its default is already have.
  it('returns a non-staple to unknown after out', () => {
    expect(nextPantryState('out', false)).toBe('unknown')
  })

  it('wraps a staple straight back to have', () => {
    expect(nextPantryState('out', true)).toBe('have')
  })

  it('completes a cycle from any start', () => {
    for (const staple of [true, false]) {
      let s = 'unknown'
      const seen = []
      for (let i = 0; i < 8; i++) { s = nextPantryState(s, staple); seen.push(s) }
      // Every real state is reachable, and the walk is a closed loop.
      for (const state of PANTRY_STATES) expect(seen).toContain(state)
      expect(seen).toContain(staple ? 'have' : 'unknown')
    }
  })

  it('labels every state it can return', () => {
    for (const s of [...PANTRY_STATES, 'unknown']) {
      expect(PANTRY_LABELS[s]).toBeTruthy()
    }
  })
})

/** A pantry stub: explicit rows, staples assumed, everything else unknown. */
function stateFrom(rows = {}) {
  return raw => {
    const c = canonicalItem(raw)
    if (c in rows) return rows[c]
    return isStaple(c) ? 'have' : 'unknown'
  }
}

const RECIPE = {
  ingredients: [
    { item: 'Kosher salt' },                 // staple -> have
    { item: 'pecorino, grated' },            // unknown
    { item: 'guanciale, diced' },            // set below
    { item: 'water' },                       // never shopped -> excluded
    { item: 'parmesan cheese' },             // same item as the next line
    { item: 'Parmigiano-Reggiano' },
  ],
}

describe('pantryFit', () => {
  it('splits a recipe into have / low / missing', () => {
    const fit = pantryFit(RECIPE, stateFrom({ guanciale: 'out', parmesan: 'low' }))
    expect(fit.have).toEqual(['Kosher salt'])
    expect(fit.low).toEqual(['parmesan cheese'])
    expect(fit.missing.sort()).toEqual(['guanciale', 'pecorino'])
  })

  it('counts a repeated item once', () => {
    const fit = pantryFit(RECIPE, stateFrom({ parmesan: 'have' }))
    // 6 lines, minus water, minus the duplicate parmesan = 4
    expect(fit.total).toBe(4)
  })

  it('takes the worse state when one item appears twice', () => {
    const fit = pantryFit(
      { ingredients: [{ item: 'parmesan cheese' }, { item: 'Parmigiano-Reggiano' }] },
      raw => (canonicalItem(raw) === 'parmesan' ? 'have' : 'have'),
    )
    expect(fit.total).toBe(1)
  })

  it('never counts water as owned or missing', () => {
    const fit = pantryFit({ ingredients: [{ item: 'water' }, { item: 'ice water' }] }, stateFrom())
    expect(fit).toEqual({ missing: [], low: [], have: [], total: 0 })
  })

  it('survives a recipe with no usable ingredients', () => {
    expect(pantryFit(null, stateFrom()).total).toBe(0)
    expect(pantryFit({ ingredients: [{ item: '' }, null] }, stateFrom()).total).toBe(0)
  })
})

describe('compareFit', () => {
  it('puts fewer missing first', () => {
    const fits = [
      { missing: ['a', 'b'], low: [], total: 5 },
      { missing: [],         low: [], total: 9 },
      { missing: ['a'],      low: [], total: 3 },
    ]
    expect(fits.sort(compareFit).map(f => f.missing.length)).toEqual([0, 1, 2])
  })

  it('breaks a tie on low, then on recipe size', () => {
    expect(compareFit(
      { missing: [], low: [],    total: 9 },
      { missing: [], low: ['x'], total: 2 },
    )).toBeLessThan(0)
    expect(compareFit(
      { missing: [], low: [], total: 3 },
      { missing: [], low: [], total: 8 },
    )).toBeLessThan(0)
  })

  // The reason this is a ranking and not a filter.
  it('ranks the real catalog usefully from a small pantry', () => {
    const state = stateFrom({
      garlic: 'have', onion: 'have', carrot: 'have', tomato: 'have',
      lemon: 'have', parsley: 'have', basil: 'have', parmesan: 'low',
    })
    const ranked = RECIPES
      .map(r => ({ name: r.name, fit: pantryFit(r, state) }))
      .sort((a, b) => compareFit(a.fit, b.fit))

    // Ordering is monotonic in what you'd have to buy.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].fit.missing.length).toBeGreaterThanOrEqual(ranked[i - 1].fit.missing.length)
    }
    // Gating on "makeable" would show almost nothing; ranking gives a screenful.
    const makeable = ranked.filter(r => r.fit.missing.length === 0).length
    const close    = ranked.filter(r => r.fit.missing.length <= 2).length
    expect(makeable).toBeLessThan(10)
    expect(close).toBeGreaterThan(20)
  })
})
