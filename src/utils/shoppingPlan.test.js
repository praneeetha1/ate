import { describe, it, expect } from 'vitest'
import RECIPES from '../data/recipes.json'
import { planShopping, entriesFor } from './shoppingPlan'
import { evaluateRecipe } from './readiness'

const recipe = name => RECIPES.find(r => !r.hidden && r.name.startsWith(name))
const pantry = (rows = {}, assumed = []) => id =>
  id in rows ? { state: rows[id], assumed: false }
    : assumed.includes(id) ? { state: 'have', assumed: true } : { state: 'unknown', assumed: false }
const plan = (r, rows, assumed, list = new Map(), scale = 1) =>
  planShopping(r, scale, evaluateRecipe(r, pantry(rows, assumed)), list, 999)
const section = (p, s) => p.rows.filter(r => r.section === s).map(r => r.id)

describe('planning a shopping add', () => {
  it('ticks what you lack, leaves low, optional and assumed for you to choose, never adds what you have', () => {
    const p = plan(recipe('Carrot Cake'), { egg: 'have', butter: 'low' }, ['salt', 'sugar'])
    expect(section(p, 'pantry')).toContain('egg')
    expect(section(p, 'low')).toEqual(['butter'])
    expect(section(p, 'optional')).toEqual(['walnut'])
    expect(section(p, 'assumed')).toEqual(expect.arrayContaining(['salt']))
    expect(p.rows.filter(r => r.checked).every(r => r.section === 'buy')).toBe(true)
    expect(p.needsSheet).toBe(true)
  })

  it('adds in one tap when there is nothing to decide', () => {
    const p = plan(recipe('Kheer'), {}, [])
    expect(p.needsSheet).toBe(false)
    expect(entriesFor(recipe('Kheer'), p.rows, 1).map(e => e.item)).toEqual(
      ['milk', 'long grain white rice', 'sugar', 'sultana', 'cardamom', 'almond', 'rosewater'])
  })

  it('buys the alternative you pick, at the recipe\'s amount', () => {
    const r = recipe('Carrot Cake')
    const p = plan(r, {}, [])
    const row = p.rows.find(x => x.id === 'unsweetened applesauce')
    expect(row.options).toEqual(['unsweetened applesauce', 'sour cream', 'yogurt'])
    const [entry] = entriesFor(r, [{ ...row, chosen: 'yogurt' }], 1)
    expect(entry).toMatchObject({ item: 'yogurt', amount: row.measure.split(' ')[0] })
  })

  it('adds salt and pepper as two things', () => {
    const r = recipe('Spicy Rice Casserole')
    const items = entriesFor(r, plan(r, {}, []).rows, 1).map(e => e.item)
    expect(items).toEqual(expect.arrayContaining(['salt', 'black pepper']))
  })

  it('notes when something is already on the list for another recipe', () => {
    const list = new Map([['milk', { item: 'milk', checked: false, sources: [{ key: '1', name: 'Pancakes' }] }]])
    const row = plan(recipe('Kheer'), {}, [], list).rows.find(r => r.id === 'milk')
    expect(row.alsoOnListFor).toEqual(['Pancakes'])
    expect(row.checked).toBe(true)
  })

  it('scales the amounts to the servings picked', () => {
    const row = plan(recipe('Kheer'), {}, [], new Map(), 2).rows.find(r => r.id === 'milk')
    expect(row.measure).toBe('2 l')
  })
})
