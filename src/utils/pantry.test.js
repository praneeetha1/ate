import { describe, it, expect } from 'vitest'
import { nextPantryState, pantryFit, compareFit, PANTRY_STATES, PANTRY_LABELS } from './pantry'
import RECIPES from '../data/recipes.json'
import { PANTRY_STAPLES } from '../utils/ingredients'

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

/** A pantry stub by id: explicit rows, shelf staples assumed, everything else unknown. */
function stateFrom(rows = {}) {
  return id => id in rows ? { state: rows[id], assumed: false }
    : PANTRY_STAPLES.has(id) ? { state: 'have', assumed: true }
      : { state: 'unknown', assumed: false }
}

const RECIPE = {
  ingredients: [
    { item: 'Kosher salt' },                 // staple -> assumed
    { item: 'pecorino, grated' },            // unknown
    { item: 'guanciale, diced' },            // set below
    { item: 'water' },                       // never shopped -> excluded
    { item: 'parmesan cheese' },             // same item as the next line
    { item: 'Parmigiano-Reggiano' },
  ],
}

describe('pantryFit', () => {
  it('splits a recipe into have / low / missing, by name', () => {
    const fit = pantryFit(RECIPE, stateFrom({ guanciale: 'out', parmesan: 'low' }))
    expect(fit.have).toEqual(['Kosher salt'])
    expect(fit.assumedNames).toEqual(['Kosher salt'])
    expect(fit.low).toEqual(['parmesan cheese'])
    expect(fit.missing.sort()).toEqual(['guanciale', 'pecorino'])
  })

  it('counts a repeated item once and leaves water out', () => {
    // 6 lines, minus water, minus the duplicate parmesan = 4
    expect(pantryFit(RECIPE, stateFrom({ parmesan: 'have' })).total).toBe(4)
    expect(pantryFit({ ingredients: [{ item: 'water' }, { item: 'ice water' }] }, stateFrom()).total).toBe(0)
  })

  it('survives a recipe with no usable ingredients', () => {
    expect(pantryFit(null, stateFrom()).total).toBe(0)
    expect(pantryFit({ ingredients: [{ item: '' }, null] }, stateFrom()).total).toBe(0)
  })

  it('reports assumptions separately, and none when everything was confirmed', () => {
    const recipe = { ingredients: [{ item: 'sugar' }, { item: 'onion' }] }
    expect(pantryFit(recipe, stateFrom({ onion: 'have' })).assumed).toBe(1)
    expect(pantryFit(recipe, stateFrom({ onion: 'have', sugar: 'have' })).assumed).toBe(0)
  })
})

describe('compareFit', () => {
  const fit = (missing, extra = {}) => ({ missing, low: [], assumed: 0, missingMain: [], minutes: 0, ...extra })

  it('puts fewer missing first', () => {
    const fits = [fit(['a', 'b']), fit([]), fit(['a'])]
    expect(fits.sort(compareFit).map(f => f.missing.length)).toEqual([0, 1, 2])
  })

  it('a missing main ingredient ranks below two missing garnishes', () => {
    expect(compareFit(fit(['mint', 'lime']), fit(['chicken'], { missingMain: ['chicken'] }))).toBeLessThan(0)
  })

  it('breaks ties on uncertainty, then on hands-on time', () => {
    expect(compareFit(fit([]), fit([], { low: ['x'] }))).toBeLessThan(0)
    expect(compareFit(fit([], { minutes: 20 }), fit([], { minutes: 60 }))).toBeLessThan(0)
  })

  // The reason this is a ranking and not a filter.
  it('ranks the real catalog usefully from a small pantry', () => {
    const state = stateFrom({
      garlic: 'have', onion: 'have', carrot: 'have', tomato: 'have',
      lemon: 'have', parsley: 'have', basil: 'have', parmesan: 'low',
    })
    const ranked = RECIPES.filter(r => !r.hidden)
      .map(r => ({ name: r.name, fit: pantryFit(r, state) }))
      .sort((a, b) => compareFit(a.fit, b.fit))
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].fit.missingMain.length).toBeGreaterThanOrEqual(ranked[i - 1].fit.missingMain.length)
    }
    expect(ranked.filter(r => r.fit.missing.length === 0).length).toBeLessThan(5)
  })
})
