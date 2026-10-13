import { describe, it, expect } from 'vitest'
import { measureLabel, shoppableIngredients, mergeItem, withoutRecipe, recipeShoppingScale } from './shopping'


/**
 * Quantity loss, from a code review with reproductions. Each case undercounted
 * food on the list — the one failure a shopping list must never have.
 */
describe('quantities survive being combined', () => {
  const row = (...measures) => ({
    sources: measures.map(([amount, unit], i) => ({ key: String(i), name: 'r', amount, unit })),
  })

  it('sums two halves into a whole', () => {
    expect(measureLabel(row(['1/2', 'cup'], ['1/2', 'cup']))).toBe('1 cup')
  })

  it('keeps every contribution when some repeat', () => {
    expect(measureLabel(row(['1', 'cup'], ['1', 'cup'], ['2', 'cup']))).toBe('4 cup')
  })

  it('sums mixed numbers across both tokens', () => {
    expect(measureLabel(row(['1 1/2', 'cup'], ['1 1/2', 'cup']))).toBe('3 cup')
  })

  it('keeps incompatible units apart rather than inventing a total', () => {
    expect(measureLabel(row(['1', 'cup'], ['200', 'g']))).toBe('1 cup + 200 g')
  })

  it('passes through an amount it cannot read', () => {
    expect(measureLabel(row(['a pinch', ''], ['1', 'tsp']))).toBe('1 tsp + a pinch')
  })
})

describe('a recipe naming one ingredient twice', () => {
  const recipe = (...pairs) => ({
    ingredients: pairs.map(([amount, unit, item]) => ({ amount, unit, item })),
  })

  // Puliyodarai lists split peas twice; the second line used to be dropped.
  it('adds both lines together instead of dropping one', () => {
    const [row] = shoppableIngredients(recipe(
      ['1', 'tbsp', 'split peas'], ['2', 'tbsp', 'split peas'],
    ))
    expect(row.amount).toBe('3')
    expect(row.unit).toBe('tbsp')
  })

  it('still produces a single row', () => {
    expect(shoppableIngredients(recipe(
      ['2', '', 'dry red chillies'], ['3', '', 'dry red chillies'],
    ))).toHaveLength(1)
  })

  it('shows both measures when the units differ', () => {
    const [row] = shoppableIngredients(recipe(
      ['1', 'tbsp', 'olive oil'], ['2', 'tsp', 'olive oil'],
    ))
    expect(row.amount).toBe('1 tbsp + 2 tsp')
  })
})

describe('shopping contributions', () => {
  // Same shape as Drop biscuits: two butter lines, 8 and 2 tbsp.
  const biscuits = { name: 'Biscuits', servings: 8, ingredients: [
    { amount: '2', unit: 'cup', item: 'all-purpose flour' },
    { amount: '8', unit: 'tablespoon', item: 'unsalted butter, melted' },
    { amount: '2', unit: 'tablespoon', item: 'unsalted butter, for brushing' },
  ] }
  const src = (extra = {}) => ({ key: '151', name: 'Biscuits', ...extra })
  const add = (row, ingredients, source, scale = 1) =>
    shoppableIngredients({ ingredients }, scale).reduce((r, e) => mergeItem(r, e, source), row)
  const butter = row => measureLabel(row)

  it('scales the whole recipe to the servings picked', () => {
    const rows = shoppableIngredients(biscuits, 2)
    expect(rows.map(r => [r.item, r.amount, r.unit])).toEqual([
      ['all-purpose flour', '4', 'cup'],
      ['butter', '20', 'tablespoon'],
    ])
  })

  it('sums two lines of the same thing added one at a time, in either order, and ignores repeat taps', () => {
    const [eight, two] = [biscuits.ingredients[1], biscuits.ingredients[2]]
    let a = add(null, [eight], src({ line: 1 }))
    a = add(a, [two], src({ line: 2 }))
    a = add(a, [two], src({ line: 2 }))
    let b = add(null, [two], src({ line: 2 }))
    b = add(b, [eight], src({ line: 1 }))
    b = add(b, [eight], src({ line: 1 }))
    expect(butter(a)).toBe('10 tablespoon')
    expect(butter(b)).toBe('10 tablespoon')
  })

  it('replaces line-by-line adds with one whole-recipe contribution', () => {
    let row = add(null, [biscuits.ingredients[1]], src({ line: 1 }))
    row = mergeItem(row, shoppableIngredients(biscuits, 2)[1], src({ scale: 2 }))
    expect(row.sources).toHaveLength(1)
    expect(butter(row)).toBe('20 tablespoon')
  })

  it('keeps a hand-added item when the recipe goes, whichever came first', () => {
    const milk = { item: 'milk', display: 'milk', amount: '1', unit: 'cup' }
    const manualFirst = mergeItem(mergeItem(null, milk, null), milk, src())
    const recipeFirst = mergeItem(mergeItem(null, milk, src()), milk, null)
    expect(withoutRecipe(manualFirst, '151')).not.toBeNull()
    expect(withoutRecipe(recipeFirst, '151')).not.toBeNull()
    expect(withoutRecipe(mergeItem(null, milk, src()), '151')).toBeNull()
  })

  it('remembers the scale the recipe went on at', () => {
    const row = mergeItem(null, shoppableIngredients(biscuits, 2)[0], src({ scale: 2 }))
    expect(recipeShoppingScale(new Map([['x', row]]), 151)).toBe(2)
  })
})
