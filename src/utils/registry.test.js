import { describe, it, expect } from 'vitest'
import RECIPES from '../data/recipes.json'
import { registryProblems, resolveIngredient, standIns, isKindOf, BY_ID } from './registry'
import { PANTRY_STAPLES, KNOWN_INGREDIENTS, COMMON_INGREDIENT_GROUPS } from './ingredients'

describe('the registry', () => {
  it('has no doubled names or dangling references', () => {
    expect(registryProblems()).toEqual([])
  })

  it('knows every staple and every quick-add item', () => {
    const unknown = [...PANTRY_STAPLES, ...KNOWN_INGREDIENTS, ...COMMON_INGREDIENT_GROUPS.flatMap(g => g.items)]
      .filter(n => n !== 'salt and pepper' && !resolveIngredient(n).known)
    expect(unknown).toEqual([])
  })

  it('resolves every visible catalog line', () => {
    const unknown = RECIPES.filter(r => !r.hidden).flatMap(r =>
      r.ingredients.filter(i => !resolveIngredient(i.item).known && !/salt and/i.test(i.item)).map(i => `${r.name}: ${i.item}`))
    expect(unknown).toEqual([])
  })
})

describe('what can stand in for what', () => {
  const ids = id => standIns(id).map(s => s.id)

  it('never lets black pepper stand in for a bell pepper or cayenne', () => {
    expect(ids('red bell pepper')).not.toContain('black pepper')
    expect(ids('cayenne pepper')).not.toContain('black pepper')
  })

  it('lets a kind stand in for the general food, and the general food only where allowed', () => {
    expect(ids('rice')).toContain('basmati rice')
    expect(ids('red onion')).toContain('onion')
    expect(ids('sweet potato')).not.toContain('potato')
    expect(ids('potato')).not.toContain('sweet potato')
  })

  it('goes one way for eggs: whole eggs give yolks, yolks are not eggs', () => {
    expect(ids('egg yolk')).toContain('egg')
    expect(ids('egg')).not.toContain('egg yolk')
  })

  it('finds kinds for search, not things that merely share a word', () => {
    expect(isKindOf('cherry tomato', 'tomato')).toBe(true)
    expect(isKindOf('tomato paste', 'tomato')).toBe(false)
    expect(resolveIngredient('skinless white urad dal').id).toBe('urad dal')
  })
})

describe('the catalog\'s ingredient ids', () => {
  const lines = RECIPES.filter(r => !r.hidden).flatMap(r => r.ingredients.map(i => ({ r: r.name, ...i })))
  const known = id => BY_ID.has(id)

  it('gives every visible line a registry id, set once and reviewed', () => {
    expect(lines.filter(l => !known(l.id)).map(l => `${l.r}: ${l.item} → ${l.id}`)).toEqual([])
  })

  it('only offers alternatives and extra needs the registry knows', () => {
    const bad = lines.flatMap(l => [...(l.alternatives || []), ...(l.alsoNeeds || [])].filter(id => !known(id)))
    expect(bad).toEqual([])
  })

  it('keeps the reviewed decisions', () => {
    const find = (recipe, start) => lines.find(l => l.r.startsWith(recipe) && l.item.startsWith(start))
    expect(find('Idli', 'skinless white urad dal').id).toBe('urad dal')
    expect(find('Idli', 'chlorine-free water').id).toBe('water')
    expect(find('Butternut squash chili', 'cayenne').optional).toBe(true)
    expect(find('Carrot Cake', 'unsweetened applesauce').alternatives).toEqual(['sour cream', 'yogurt'])
    expect(find('Almost famous', 'sharp white').optional).toBeUndefined()
    expect(find('Yogurt Curry', 'chopped fresh coriander').id).toBe('cilantro')
  })
})
