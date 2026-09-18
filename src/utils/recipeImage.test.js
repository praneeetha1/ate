import { describe, it, expect } from 'vitest'
import { wrapText } from './recipeImage'

/**
 * The only part of the card with logic worth guarding. It takes a measuring
 * function rather than a canvas context precisely so it can be tested here —
 * jsdom has no 2D context, so the drawing itself can't be.
 *
 * These use a stub where every character is 10 units wide, so "maxWidth 100"
 * means "10 characters".
 */
const measure = t => t.length * 10

describe('wrapText', () => {
  it('breaks at the last word that fits', () => {
    expect(wrapText('one two three four', 100, measure))
      .toEqual(['one two', 'three four'])
  })

  it('keeps a line that fits exactly', () => {
    expect(wrapText('abcde fghi', 100, measure)).toEqual(['abcde fghi'])
  })

  /**
   * Overflowing is better than losing an ingredient: a word longer than the
   * line still gets drawn rather than silently dropped.
   */
  it('gives an over-long word its own line rather than dropping it', () => {
    const lines = wrapText('a supercalifragilistic b', 100, measure)
    expect(lines).toContain('supercalifragilistic')
    expect(lines.join(' ')).toContain('a')
    expect(lines.join(' ')).toContain('b')
  })

  it('collapses whitespace rather than emitting blank lines', () => {
    expect(wrapText('  one   two  ', 1000, measure)).toEqual(['one two'])
  })

  it('has nothing to say about nothing', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(wrapText(empty, 100, measure)).toEqual([])
    }
  })

  // Every word survives the wrap, whatever the width.
  it('never loses a word', () => {
    const text = 'fold the rice through the tempered spices and lemon juice'
    for (const width of [40, 90, 150, 400]) {
      expect(wrapText(text, width, measure).join(' ').split(' ').filter(Boolean))
        .toEqual(text.split(' '))
    }
  })
})
