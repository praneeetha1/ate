import { describe, it, expect } from 'vitest'
import { looksLikeUrl, findDuplicate } from './importRecipe'

/**
 * Decides whether the import box sends what you pasted as a link to fetch or
 * as the recipe text itself. Getting it wrong is cheap but confusing: a
 * YouTube description sent as a URL fails, and a URL sent as text asks the
 * model to read a recipe out of forty characters.
 */
describe('looksLikeUrl', () => {
  it('accepts a link', () => {
    for (const s of [
      'https://example.com/recipes/dal',
      'http://example.co.uk/a/b?c=d',
      '  https://example.com/x  ',
    ]) expect(looksLikeUrl(s)).toBe(true)
  })

  // Anything with a space is prose, even when it contains a link.
  it('treats pasted text as text', () => {
    for (const s of [
      'Ingredients: 2 cups rice, 1 onion',
      'Recipe here https://example.com/x',
      'example.com/no-scheme',
      'https://',
      '',
      null,
      undefined,
    ]) expect(looksLikeUrl(s)).toBe(false)
  })
})

describe('findDuplicate', () => {
  const mine = [
    { id: 'a', name: 'Paneer Butter Masala', source_url: 'https://www.example.com/paneer-butter-masala/?utm_source=ig' },
    { id: 'b', name: 'Dal tadka', source_url: 'https://www.youtube.com/watch?v=abc123&t=30s' },
  ]

  it('matches the same page however the link is dressed up', () => {
    expect(findDuplicate({ name: 'x', sourceUrl: 'http://example.com/paneer-butter-masala' }, mine))
      .toMatchObject({ recipe: { id: 'a' }, reason: 'link' })
    expect(findDuplicate({ name: 'x', sourceUrl: 'https://m.youtube.com/watch?v=abc123' }, mine))
      .toMatchObject({ recipe: { id: 'b' }, reason: 'link' })
  })

  it('tells different videos apart', () => {
    expect(findDuplicate({ name: 'x', sourceUrl: 'https://www.youtube.com/watch?v=zzz' }, mine)).toBeNull()
  })

  it('falls back to the name, ignoring case, punctuation and "recipe"', () => {
    expect(findDuplicate({ name: 'Paneer butter masala recipe (restaurant style)!' }, mine))
      .toMatchObject({ recipe: { id: 'a' }, reason: 'name' })
  })

  it('finds nothing new as nothing', () => {
    expect(findDuplicate({ name: 'Rajma', sourceUrl: 'https://example.com/rajma' }, mine)).toBeNull()
  })
})
