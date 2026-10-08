import { describe, it, expect } from 'vitest'
import { measureLabel, shoppableIngredients } from './shopping'


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
