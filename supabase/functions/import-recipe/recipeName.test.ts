import { describe, it, expect } from 'vitest'
import { cleanRecipeName } from './recipeName'

describe('trimming a title to the dish', () => {
  // The one that prompted this: it rendered whole as the card heading.
  it('strips how-to, attribution and a trailing Recipe', () => {
    expect(cleanRecipeName('How To Make Macarons Recipe by Tasty')).toBe('Macarons')
  })

  it('keeps only the first pipe segment', () => {
    expect(cleanRecipeName('Paneer Butter Masala | Restaurant Style | Chef Someone'))
      .toBe('Paneer Butter Masala')
  })

  it('drops emoji', () => {
    expect(cleanRecipeName('🔥 Chicken Biryani Recipe 🔥')).toBe('Chicken Biryani')
  })

  it('handles a plain name untouched', () => {
    expect(cleanRecipeName('Rajma Chawal')).toBe('Rajma Chawal')
  })
})

describe('what it refuses to touch', () => {
  // A dash usually joins two halves of a real name rather than fencing off SEO.
  it('keeps a dashed subtitle', () => {
    expect(cleanRecipeName('Aloo Gobi - Potato and Cauliflower Curry'))
      .toBe('Aloo Gobi - Potato and Cauliflower Curry')
  })

  // "Hyderabadi" identifies the dish; no word list can tell it from "best",
  // so adjectives are left alone here and handled in the prompt.
  it('keeps a regional qualifier', () => {
    expect(cleanRecipeName('Hyderabadi Dum Biryani')).toBe('Hyderabadi Dum Biryani')
  })

  // "by" isn't always attribution.
  it('keeps a method phrase that reads like a byline', () => {
    expect(cleanRecipeName('Pasta by Hand')).toBe('Pasta by Hand')
  })

  it('never returns empty', () => {
    expect(cleanRecipeName('Recipe')).toBe('Recipe')
  })

  it('survives an empty input', () => {
    expect(cleanRecipeName('')).toBe('')
  })
})
