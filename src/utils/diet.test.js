import { describe, it, expect } from 'vitest'
import RECIPES from '../data/recipes.json'
import { dietContradictions } from './diet'

describe('dietContradictions', () => {
  it('catches meat under a vegetarian badge', () => {
    const found = dietContradictions({
      name: 'Casserole', dietary: ['vegetarian'],
      ingredients: [{ item: 'chicken broth' }],
    })
    expect(found.map(f => f.claim)).toContain('vegetarian')
  })

  // The title is evidence too — this one said what it was in its own name.
  it('reads the name for meat', () => {
    const found = dietContradictions({
      name: 'Baja fish tacos', dietary: ['vegetarian'], ingredients: [{ item: 'corn tortillas' }],
    })
    expect(found.map(f => f.claim)).toContain('vegetarian')
  })

  /**
   * The pilau's ingredient reads "250 g minced meat (lamb or mutton are most
   * common, but you could use beef or imitation meat)". Vetoing a line that
   * mentions "imitation meat" hid the 250 g of real lamb at its start.
   */
  it('is not fooled by an imitation-meat aside on the same line', () => {
    const found = dietContradictions({
      name: 'Pilau', dietary: ['vegetarian'],
      ingredients: [{ item: '250 g minced meat (lamb or mutton, or you could use imitation meat)' }],
    })
    expect(found.map(f => f.claim)).toContain('vegetarian')
  })

  it('leaves innocent lookalikes alone', () => {
    expect(dietContradictions({
      name: 'Curry', dietary: ['vegan', 'gluten-free'],
      ingredients: [{ item: 'coconut milk' }, { item: 'eggplant' }, { item: 'rice flour' }, { item: 'vegetable broth' }],
    })).toEqual([])
  })

  // Both dishes describe themselves as a "Bread" and neither contains gluten.
  it('does not read gluten from a descriptive name', () => {
    expect(dietContradictions({
      name: 'Idli (Steamed Rice and Black Gram Bread)', dietary: ['gluten-free'],
      ingredients: [{ item: 'parboiled short-grain rice' }, { item: 'skinless white urad dal' }],
    })).toEqual([])
  })

  it('reports nothing when no badge is claimed', () => {
    expect(dietContradictions({ name: 'Steak', dietary: [], ingredients: [{ item: 'beef' }] })).toEqual([])
  })
})

/**
 * The guard that matters. A badge is a promise, and the catalog is append-only
 * — this fails the build if a new or edited recipe ever contradicts its own.
 */
describe('the shipped catalog', () => {
  it('has no visible recipe whose ingredients contradict its dietary badges', () => {
    const offenders = RECIPES
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !r.hidden)
      .map(({ r, i }) => ({ i, name: r.name, found: dietContradictions(r) }))
      .filter(x => x.found.length)
      .map(x => `[${x.i}] ${x.name} claims ${x.found.map(f => f.claim).join('+')} but lists "${x.found[0].evidence}"`)

    expect(offenders).toEqual([])
  })
})
