import { describe, it, expect } from 'vitest'
import { shoppingName, canonicalItem, isNeverShopped, isStaple, PANTRY_STAPLES } from './ingredients'
import RECIPES from '../data/recipes.json'

describe('shoppingName', () => {
  it('drops prep that follows the item', () => {
    expect(shoppingName('garlic, minced')).toBe('garlic')
    expect(shoppingName('fresh parsley, chopped')).toBe('parsley')
    expect(shoppingName('red bell pepper, seeded and finely chopped')).toBe('red bell pepper')
  })

  it('drops parentheticals and cook-facing asides', () => {
    expect(shoppingName('extra-virgin olive oil, for brushing')).toBe('extra-virgin olive oil')
    expect(shoppingName('broccoli (1 bunch ≈ 11/2lbs)')).toBe('broccoli')
    expect(shoppingName('unsalted butter, softened at room temperature')).toBe('unsalted butter')
  })

  it('drops leading words that do not change the purchase', () => {
    expect(shoppingName('medium carrot, julienned')).toBe('carrot')
    expect(shoppingName('large shrimp, peeled, deveined, and tails removed')).toBe('shrimp')
    expect(shoppingName('small red onion, cut into 1/2-inch wedges')).toBe('red onion')
  })

  // The whole point of the conservative/aggressive split: display must never
  // lose a word that changes what you'd put in the basket.
  it('keeps words that DO change the purchase', () => {
    expect(shoppingName('ground beef')).toBe('ground beef')
    expect(shoppingName('red onion')).toBe('red onion')
    expect(shoppingName('whole-milk ricotta cheese')).toBe('whole-milk ricotta cheese')
    expect(shoppingName('pickled jalapeno')).toBe('pickled jalapeno')
  })

  it('collapses the catalog\'s worst rows', () => {
    expect(shoppingName(
      'mixed mushrooms, such as cremini, shiitake, and oyster, trimmed and sliced 1/8-inch thick (about 10 cups)',
    )).toBe('mixed mushrooms')
    expect(shoppingName(
      'medium leeks (about 1 pound), white and pale-green parts only, finely chopped and rinsed well',
    )).toBe('leeks')
  })

  it('falls back to the raw string rather than rendering an empty row', () => {
    expect(shoppingName('chopped')).toBe('chopped')
    expect(shoppingName('')).toBe('')
    expect(shoppingName(null)).toBe('')
  })
})

describe('canonicalItem', () => {
  it('folds salt, oil and sugar synonyms', () => {
    for (const s of ['Kosher salt', 'coarse salt', 'sea salt', 'Salt, to taste']) {
      expect(canonicalItem(s)).toBe('salt')
    }
    expect(canonicalItem('extra-virgin olive oil')).toBe('olive oil')
    expect(canonicalItem('vegetable oil')).toBe('neutral oil')
    expect(canonicalItem('granulated sugar')).toBe('sugar')
  })

  it('folds plurals, egg parts and cheese names', () => {
    expect(canonicalItem('eggs')).toBe('egg')
    expect(canonicalItem('large egg yolk, beaten')).toBe('egg')
    expect(canonicalItem('Parmigiano-Reggiano, grated')).toBe('parmesan')
    expect(canonicalItem('scallions, thinly sliced')).toBe('green onion')
  })

  it('strips packaging and counting words', () => {
    expect(canonicalItem('garlic cloves')).toBe('garlic')
    expect(canonicalItem('3 cloves garlic')).toBe('garlic')
    expect(canonicalItem('1/2 bunch parsley')).toBe('parsley')
    expect(canonicalItem('2 cans whole tomatoes')).toBe('tomato')
  })

  it('collapses "ground" for spices but not for meat', () => {
    expect(canonicalItem('ground cinnamon')).toBe('cinnamon')
    expect(canonicalItem('freshly ground black pepper')).toBe('pepper')
    expect(canonicalItem('ground beef')).toBe('ground beef')
    expect(canonicalItem('ground lamb')).toBe('ground lamb')
  })

  it('singularises without mangling stems', () => {
    expect(canonicalItem('potatoes')).toBe('potato')
    expect(canonicalItem('olives')).toBe('olive')
    expect(canonicalItem('bay leaves')).toBe('bay leaf')
    expect(canonicalItem('berries')).toBe('berry')
  })

  it('treats state differences as the same pantry slot', () => {
    expect(canonicalItem('unsalted butter')).toBe(canonicalItem('butter'))
    expect(canonicalItem('frozen peas')).toBe(canonicalItem('peas'))
    expect(canonicalItem('yellow onion')).toBe(canonicalItem('onion'))
  })
})

describe('salt and pepper', () => {
  // The catalog writes this ten different ways, across 68 lines. Folding them
  // stops the pantry offering to track each phrasing as its own item.
  it('folds every phrasing into one item', () => {
    for (const s of [
      'salt and pepper', 'Kosher salt and freshly ground black pepper',
      'coarse salt and pepper', 'course salt and pepper',
      'salt and freshly ground black pepper', 'salt and black pepper',
      'coarse salt and freshly ground pepper',
    ]) {
      expect(canonicalItem(s)).toBe('salt and pepper')
    }
  })

  it('leaves a dish that merely starts that way alone', () => {
    expect(canonicalItem('salt and pepper shrimp')).toBe('salt and pepper shrimp')
  })
})

describe('isStaple', () => {
  it('covers the things nobody wants to tick off', () => {
    for (const s of ['Kosher salt', 'freshly ground black pepper', 'water',
                     'extra-virgin olive oil', 'vegetable oil', 'eggs',
                     'unsalted butter', 'granulated sugar', 'all-purpose flour',
                     'Kosher salt and freshly ground black pepper']) {
      expect(isStaple(s)).toBe(true)
    }
  })

  it('does not claim the things a recipe is actually about', () => {
    for (const s of ['pecorino', 'guanciale', 'shiitake mushrooms',
                     'heavy cream', 'garlic', 'onion']) {
      expect(isStaple(s)).toBe(false)
    }
  })

  it('is stated in canonical form, so every entry can be reached', () => {
    for (const item of PANTRY_STAPLES) {
      expect(canonicalItem(item)).toBe(item)
    }
  })
})

describe('isNeverShopped', () => {
  it('catches plain water however it is written', () => {
    for (const s of ['water', 'Cold water', 'warm water', 'Boiling water',
                     'lukewarm water', 'water, for glaze', 'Hot water, as needed', 'ice water']) {
      expect(isNeverShopped(s)).toBe(true)
    }
  })

  // The reason canonicalItem() matches whole names and not substrings: these
  // are all things you genuinely put in a basket.
  it('leaves anything you would actually buy alone', () => {
    for (const s of ['coconut water', 'water crackers', 'sparkling water',
                     'rose water', 'chicken broth, or water', 'watercress']) {
      expect(isNeverShopped(s)).toBe(false)
    }
  })
})

// These guard the properties the shopping list and the future pantry rely on,
// across every ingredient line in the catalog rather than hand-picked cases.
describe('the whole catalog', () => {
  const lines = RECIPES.flatMap(r => r.ingredients)

  it('never yields an empty name for a non-empty item', () => {
    const bad = lines.filter(i => i.item && (!shoppingName(i.item) || !canonicalItem(i.item)))
    expect(bad).toEqual([])
  })

  it('shortens rows enough to read in a shop', () => {
    const items = [...new Set(lines.map(i => i.item))]
    const long  = items.filter(i => shoppingName(i).length > 40)
    // 298 of the raw strings exceed 40 chars; what's left is genuinely long
    // product names ("King Arthur Gluten-Free Multi-Purpose Flour").
    expect(long.length).toBeLessThan(25)
  })

  it('suppresses only water rows from the shopping list', () => {
    const suppressed = lines.filter(i => isNeverShopped(i.item))
    expect(suppressed.length).toBeGreaterThan(40)
    expect(suppressed.every(i => /water|ice/i.test(i.item))).toBe(true)
  })

  // The pantry's whole premise: most of a recipe's lines are staples the user
  // is never asked about, leaving a handful that actually need an answer.
  it('leaves few enough items per recipe to be worth tracking', () => {
    const perRecipe = RECIPES.map(r => {
      const items = new Set(r.ingredients.map(i => canonicalItem(i.item)))
      return [...items].filter(i => !PANTRY_STAPLES.has(i)).length
    })
    const median = perRecipe.sort((a, b) => a - b)[Math.floor(perRecipe.length / 2)]
    expect(median).toBeLessThanOrEqual(8)

    const stapleLines = lines.filter(i => isStaple(i.item)).length
    expect(stapleLines / lines.length).toBeGreaterThan(0.25)
  })

  it('collapses the vocabulary enough for pantry matching to be possible', () => {
    const raw   = new Set(lines.map(i => i.item.trim().toLowerCase()))
    const canon = new Set(lines.map(i => canonicalItem(i.item)))
    expect(raw.size).toBeGreaterThan(1500)
    expect(canon.size).toBeLessThan(900)
  })
})
