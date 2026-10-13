import { describe, it, expect } from 'vitest'
import RECIPES from '../data/recipes.json'
import { evaluateRecipe, matchIngredient, compareReadiness, recipeUses } from './readiness'

/** A pantry: { id: state }, with `assumed` ids counted present but unconfirmed. */
const pantry = (rows = {}, assumed = []) => id =>
  id in rows ? { state: rows[id], assumed: false }
    : assumed.includes(id) ? { state: 'have', assumed: true }
      : { state: 'unknown', assumed: false }
const recipe = name => RECIPES.find(r => !r.hidden && r.name.startsWith(name))
const status = (id, rows, assumed) => matchIngredient(id, pantry(rows, assumed)).status

describe('different foods never stand in for each other', () => {
  it('black pepper is not a bell pepper, cayenne or poblano', () => {
    for (const id of ['red bell pepper', 'cayenne pepper', 'poblano pepper'])
      expect(status(id, { 'black pepper': 'have' })).toBe('missing')
  })
  it('potato is not sweet potato, fresh basil is not dried', () => {
    expect(status('sweet potato', { potato: 'have' })).toBe('missing')
    expect(status('dried basil', { basil: 'have' })).toBe('missing')
  })
  it('a yolk is not an egg, but an egg gives a yolk', () => {
    expect(status('egg', { 'egg yolk': 'have' })).toBe('missing')
    expect(matchIngredient('egg yolk', pantry({ egg: 'have' }))).toMatchObject({ status: 'have', via: 'covers' })
  })
})

describe('what does count', () => {
  it('a kind, the general food where allowed, things you make, listed swaps', () => {
    expect(matchIngredient('rice', pantry({ 'basmati rice': 'have' }))).toMatchObject({ status: 'have', via: 'kind' })
    expect(matchIngredient('red onion', pantry({ onion: 'have' }))).toMatchObject({ status: 'have', via: 'generic' })
    expect(matchIngredient('ginger paste', pantry({ ginger: 'low' }))).toMatchObject({ status: 'low', via: 'made' })
    expect(matchIngredient('neutral oil', pantry({}, ['neutral oil'])).status).toBe('assumed')
  })
  it('an explicit Out is final', () => {
    expect(status('salt', { salt: 'out' }, ['salt'])).toBe('missing')
  })
})

describe('evaluating real catalog recipes', () => {
  it('idli: urad dal in the pantry answers it, and water is never a purchase', () => {
    const fit = evaluateRecipe(recipe('Idli'), pantry({ 'urad dal': 'have', rice: 'have', 'fenugreek seed': 'have' }, ['salt']))
    expect(fit.missing.map(n => n.id)).toEqual([])
    expect(fit.needs.map(n => n.id)).not.toContain('water')
    expect(fit.optionalMissing.map(n => n.id)).toEqual(['fermentation starter'])
    expect(fit.ready).toBe(true)
  })

  it('optional cayenne never makes the chili unready', () => {
    const fit = evaluateRecipe(recipe('Butternut squash chili'), pantry({}))
    expect(fit.missing.map(n => n.id)).not.toContain('cayenne pepper')
    expect(fit.optionalMissing.map(n => n.id)).toContain('cayenne pepper')
  })

  it('yogurt satisfies the applesauce / sour cream / yogurt choice', () => {
    const need = evaluateRecipe(recipe('Carrot Cake'), pantry({ yogurt: 'have' }))
      .needs.find(n => n.id === 'unsweetened applesauce')
    expect(need).toMatchObject({ status: 'have', via: 'alternative', chosen: 'yogurt' })
  })

  it('salt and pepper is two needs, so salt being out shows', () => {
    const fit = evaluateRecipe(recipe('Spicy Rice Casserole'), pantry({ salt: 'out' }, ['black pepper']))
    expect(fit.missing.map(n => n.id)).toContain('salt')
    expect(fit.assumed.map(n => n.id)).toContain('black pepper')
  })

  it('reports assumptions separately from confirmed stock', () => {
    const fit = evaluateRecipe(recipe('Kheer'), pantry({ milk: 'have' }, ['sugar']))
    expect(fit.have.map(n => n.id)).toEqual(['milk'])
    expect(fit.assumed.map(n => n.id)).toEqual(['sugar'])
  })
})

describe('ranking and search', () => {
  it('a missing main is worse than a missing garnish', () => {
    const missingChicken = { missingMain: [1], missing: [1], low: [], assumed: [] }
    const missingTwoSmall = { missingMain: [], missing: [1, 2], low: [], assumed: [] }
    expect(compareReadiness(missingTwoSmall, missingChicken)).toBeLessThan(0)
  })

  it('finds kinds of what you picked, not things sharing a word', () => {
    expect(recipeUses(recipe('Gyoza bento'), 'tomato')).toBe(true)          // grape tomatoes
    expect(recipeUses(recipe('Chicken Tikka'), 'tomato')).toBe(false)       // tomato paste only
    expect(recipeUses(recipe('Idli'), 'urad dal')).toBe(true)
  })
})
