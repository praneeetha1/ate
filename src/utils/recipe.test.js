import { describe, it, expect } from 'vitest'
import RECIPES from '../data/recipes.json'
import {
  keyToText, keyFromText, isUserRecipeKey, isCatalogKey, userRecipeId,
  keyForName, resolveRecipe, toUserRecipeRow, normalizeUserRecipe,
  tagStyles, applyFilters, ingredientLabel, CATALOG_CATEGORIES, VISIBLE_CATALOG,
} from './recipe'
import { parseFrac } from './fractions'

describe('recipe keys', () => {
  it('round-trips a catalog key through text form', () => {
    expect(keyFromText(keyToText(5))).toBe(5)
    expect(keyFromText('0')).toBe(0)
  })

  it('keeps user-recipe keys as strings', () => {
    const key = 'u_1f8b0c2e-0000-4000-8000-000000000000'
    expect(keyFromText(keyToText(key))).toBe(key)
    expect(isUserRecipeKey(key)).toBe(true)
    expect(isCatalogKey(key)).toBe(false)
    expect(userRecipeId(key)).toBe('1f8b0c2e-0000-4000-8000-000000000000')
  })

  it('classifies catalog keys given as either number or string', () => {
    expect(isCatalogKey(12)).toBe(true)
    expect(isCatalogKey('12')).toBe(true)
    expect(isCatalogKey('legacy:Soup')).toBe(false)
  })
})

describe('resolveRecipe', () => {
  it('resolves a catalog index', () => {
    expect(resolveRecipe(0)).toBe(RECIPES[0])
  })

  // Regression: UserProfile passed the raw DB string "5" straight to onOpen,
  // which fell through the numeric branch and never opened the modal.
  it('resolves a catalog key supplied as a string', () => {
    expect(resolveRecipe('5')).toBe(RECIPES[5])
  })

  it('resolves a user recipe from the supplied list', () => {
    const own = [{ id: 'abc', name: 'Mine' }]
    expect(resolveRecipe('u_abc', own)).toBe(own[0])
  })

  it('returns null for keys that no longer resolve', () => {
    expect(resolveRecipe('u_gone', [])).toBeNull()
    expect(resolveRecipe(RECIPES.length + 100)).toBeNull()
    expect(resolveRecipe(null)).toBeNull()
  })
})

describe('toUserRecipeRow', () => {
  // Regression: the offline upload stripped only id/user_id/created_at, so the
  // UI-only `timeMinutes` field reached the INSERT and Postgres rejected it.
  it('strips UI-only and server-owned fields', () => {
    const local = normalizeUserRecipe({
      id: 'local_123',
      user_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      name: 'Test',
      category: 'Dessert',
      time_minutes: 30,
      ingredients: [],
      steps: [],
    })
    expect(local.timeMinutes).toBe(30)

    const row = toUserRecipeRow(local)
    expect(row).not.toHaveProperty('timeMinutes')
    expect(row).not.toHaveProperty('id')
    expect(row).not.toHaveProperty('user_id')
    expect(row).not.toHaveProperty('created_at')
    expect(row).not.toHaveProperty('updated_at')
    expect(row.time_minutes).toBe(30)
    expect(row.name).toBe('Test')
  })
})

describe('keyForName', () => {
  it('maps a catalog recipe name to its index', () => {
    const idx = 7
    expect(keyForName(RECIPES[idx].name)).toBe(idx)
  })

  it('is case-insensitive', () => {
    expect(keyForName(RECIPES[3].name.toUpperCase())).toBe(3)
  })

  it('falls back to the caller’s own recipes', () => {
    expect(keyForName('Nanna Pasta', [{ id: 'x1', name: 'Nanna Pasta' }])).toBe('u_x1')
  })

  it('returns null for an unknown name', () => {
    expect(keyForName('Definitely Not A Recipe', [])).toBeNull()
    expect(keyForName('')).toBeNull()
  })
})

describe('catalog data integrity', () => {
  it('has unique names, which keyForName depends on', () => {
    const names = RECIPES.map(r => r.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('every recipe has at least one ingredient and one step', () => {
    for (const r of RECIPES) {
      expect(r.ingredients.length).toBeGreaterThan(0)
      expect(r.steps.length).toBeGreaterThan(0)
    }
  })

  // Regression: the create form offered 'Appetizer'/'Soup'/'Snack'/'Sauce',
  // none of which are catalog categories, so those recipes got the fallback
  // tag colour and never matched a catalog section.
  it('offers only real catalog categories in the create form', () => {
    const real = new Set(RECIPES.map(r => r.category))
    for (const c of CATALOG_CATEGORIES) expect(real.has(c)).toBe(true)
    expect(CATALOG_CATEGORIES.length).toBe(real.size)
  })

  // Regression: 31 rows held a container size that had split across the
  // fields — amount:'1 15', unit:'oz', item:'can crushed tomatoes' — from a
  // source line reading "1 15-oz can crushed tomatoes". parseFrac() matches
  // neither fraction pattern, falls through to parseFloat and yields 1, so the
  // row rendered as "1 oz can crushed tomatoes" and scaled off the count
  // instead of the size. 6 more rows had a range leak into `item`.
  it('has no amount that parseFrac cannot read', () => {
    const unreadable = RECIPES.flatMap((r, ri) =>
      r.ingredients
        .map((ing, ii) => ({ ri, ii, ing }))
        .filter(({ ing }) => ing.amount.trim() && parseFrac(ing.amount) === null),
    )
    expect(unreadable).toEqual([])
  })

  it('has no amount holding two separate numbers', () => {
    const split = RECIPES.flatMap(r =>
      r.ingredients.filter(ing => /^\d+\s+\d+$/.test(ing.amount.trim())),
    )
    expect(split).toEqual([])
  })

  it('has no item left holding an orphaned unit or range', () => {
    const leaked = RECIPES.flatMap(r =>
      r.ingredients.filter(ing =>
        /^[-\u2013]/.test(ing.item.trim()) ||       // "-ounce salmon fillets"
        /^\s*to\s+\d/i.test(ing.item),             // "to 1/2 cup ice water"
      ),
    )
    expect(leaked).toEqual([])
  })

  it('has a tag colour for every catalog category', () => {
    // tagStyles prepends the shared ink outline, so assert on the fill half
    // only — otherwise a category falling through to the fallback swatch
    // would still differ from the bare fallback string and pass.
    for (const c of CATALOG_CATEGORIES) {
      expect(tagStyles(c)).not.toContain('bg-warm-tan')
    }
  })
})

/**
 * A catalog key *is* the array index, and seven tables store it as bare text
 * with no foreign key. So the array is append-only: retiring a recipe sets
 * `hidden` instead of splicing it out, because splicing slides every later
 * index down one and silently repoints saved ratings, notes, favourites and
 * shopping-list rows at the neighbouring recipe.
 */
describe('retired recipes', () => {
  const hidden = RECIPES.filter(r => r.hidden)

  it('has some, and leaves them out of what gets offered', () => {
    expect(hidden.length).toBeGreaterThan(0)
    expect(VISIBLE_CATALOG.length).toBe(RECIPES.length - hidden.length)
    expect(VISIBLE_CATALOG.some(({ r }) => r.hidden)).toBe(false)
  })

  // The guard that matters: an entry's key has to be its real index, or every
  // card on the home page opens the wrong recipe.
  it('pairs every visible recipe with its true catalog index', () => {
    for (const { r, i } of VISIBLE_CATALOG) expect(RECIPES[i]).toBe(r)
  })

  /**
   * Hidden means "stop offering this", never "this is gone". A rating, a
   * shared link or a shopping-list row from before a recipe was retired still
   * has to resolve to the same recipe it always did.
   */
  it('still resolves a retired recipe by its key', () => {
    const at = RECIPES.findIndex(r => r.hidden)
    expect(resolveRecipe(at)).toBe(RECIPES[at])
    expect(resolveRecipe(String(at))).toBe(RECIPES[at])
  })

  it('keeps retired recipes out of the category list', () => {
    const onlyHidden = new Set(hidden.map(r => r.category))
    for (const { r } of VISIBLE_CATALOG) onlyHidden.delete(r.category)
    for (const cat of onlyHidden) expect(CATALOG_CATEGORIES).not.toContain(cat)
  })
})

describe('applyFilters', () => {
  const pairs = [
    { r: { name: 'a', dietary: ['vegetarian'], timeMinutes: 20 } },
    { r: { name: 'b', dietary: [], timeMinutes: 90 } },
    { r: { name: 'c', dietary: ['vegetarian'] } },   // no time
  ]

  it('filters by diet', () => {
    expect(applyFilters(pairs, 'vegetarian', '').map(p => p.r.name)).toEqual(['a', 'c'])
  })

  it('filters by time and excludes recipes with no time', () => {
    expect(applyFilters(pairs, '', '30').map(p => p.r.name)).toEqual(['a'])
  })

  it('combines both filters', () => {
    expect(applyFilters(pairs, 'vegetarian', '30').map(p => p.r.name)).toEqual(['a'])
  })
})

describe('ingredientLabel', () => {
  it('scales a fractional amount', () => {
    expect(ingredientLabel({ amount: '1/2', unit: 'cup', item: 'flour' }, 2))
      .toEqual({ measure: '1 cup', item: 'flour' })
  })

  it('passes through non-numeric amounts unscaled', () => {
    expect(ingredientLabel({ amount: 'a pinch', unit: '', item: 'salt' }, 3))
      .toEqual({ measure: 'a pinch', item: 'salt' })
  })

  it('omits a missing unit', () => {
    expect(ingredientLabel({ amount: '2', unit: '', item: 'eggs' }, 1).measure).toBe('2')
  })
})
