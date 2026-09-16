import { describe, it, expect } from 'vitest'
import { looksLikeUrl } from './importRecipe'

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
