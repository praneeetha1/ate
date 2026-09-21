import { describe, it, expect } from 'vitest'
import { looksLikeRecipe } from './recipeSignal'

/**
 * The gate's whole risk is false negatives — a refused import the user can't
 * argue with — so the cooking cases are the ones that matter here. The
 * non-cooking cases only need to catch the obvious, because the model is
 * still the real judge behind this.
 */

describe('letting cooking videos through', () => {
  it('passes an obvious recipe title', () => {
    expect(looksLikeRecipe('Butter Chicken Recipe | Restaurant Style')).toBe(true)
  })

  // The case that rules out judging on the title alone: nothing in the title
  // says food, and the description is a full recipe.
  it('passes a bare title carried by its description', () => {
    const text = [
      "Amma's Sunday Special",
      '',
      '500g mutton, 2 tbsp ghee, 3 onions finely chopped, 1 tsp turmeric.',
      'Marinate overnight, then pressure cook for 20 minutes.',
    ].join('\n')
    expect(looksLikeRecipe(text)).toBe(true)
  })

  it('passes a Shorts-style description with no prose', () => {
    expect(looksLikeRecipe('Quick Poha\n\n2 cups poha\n1 onion\n1 tsp mustard seeds')).toBe(true)
  })

  it('passes on the word ingredients alone', () => {
    expect(looksLikeRecipe('Ingredients below 👇')).toBe(true)
  })

  it('passes glued quantities like 200g', () => {
    expect(looksLikeRecipe('Paneer tikka: 200g paneer, 100g curd, roast 15 mins')).toBe(true)
  })

  it('passes a dish name plus a method word', () => {
    expect(looksLikeRecipe('Rajma Chawal | how I make it — soak overnight, then simmer')).toBe(true)
  })

  // Both of these were refused by the first version of this gate, which scored
  // food as one signal however many were named.
  it('passes a dish title made only of food words', () => {
    expect(looksLikeRecipe('Paneer Butter Masala')).toBe(true)
  })

  it('passes an ingredient list with no quantities and no prose', () => {
    expect(looksLikeRecipe('poha, onion, mustard seeds, turmeric, salt')).toBe(true)
  })
})

describe('turning obvious non-cooking away', () => {
  it('rejects a vlog with a boilerplate description', () => {
    const text = [
      'MY DAY IN LONDON VLOG',
      '',
      'Thanks for watching! Follow me on Instagram @someone.',
      'Shot on a Sony ZV-E10. Music by Epidemic Sound.',
    ].join('\n')
    expect(looksLikeRecipe(text)).toBe(false)
  })

  it('rejects a tech review', () => {
    expect(looksLikeRecipe('iPhone 17 Pro Review — camera test, battery life, 10 days later')).toBe(false)
  })

  it('rejects a coding tutorial', () => {
    expect(looksLikeRecipe('Learn React in 10 Minutes — useState, useEffect and props explained')).toBe(false)
  })

  it('rejects a single incidental food mention', () => {
    expect(looksLikeRecipe('We drove to Goa and ate some fish. Subscribe for more travel!')).toBe(false)
  })
})

/**
 * Known and accepted: a food video that isn't a recipe still gets through.
 * Tightening until these fail would start costing real recipes, and one wasted
 * model call is the cheaper mistake.
 */
describe('what it deliberately does not catch', () => {
  it('lets a street-food tour through to the model', () => {
    expect(looksLikeRecipe('Trying 10 street foods in Delhi — chole, samosa, dosa!')).toBe(true)
  })
})
