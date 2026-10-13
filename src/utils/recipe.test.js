import { describe, it, expect } from 'vitest'
import RECIPES from '../data/recipes.json'
import {
  keyToText, keyFromText, isUserRecipeKey, isCatalogKey, userRecipeId,
  keyForName, resolveRecipe, toUserRecipeRow, normalizeUserRecipe,
  tagStyles, applyFilters, ingredientLabel, scaleStep, CATALOG_CATEGORIES, VISIBLE_CATALOG,
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

  /**
   * The opposite of what this once asserted, and deliberately so. The list is
   * what a new recipe may be *filed under*, so it covers every category the
   * catalog knows — including ones only retired recipes are left in. Deriving
   * it from the visible slice meant curating the last drink out of the catalog
   * also removed Drink as something you could write.
   */
  it('still offers a category whose only recipes are retired', () => {
    const onlyHidden = new Set(hidden.map(r => r.category))
    for (const { r } of VISIBLE_CATALOG) onlyHidden.delete(r.category)
    for (const cat of onlyHidden) expect(CATALOG_CATEGORIES).toContain(cat)
  })
})

describe('applyFilters', () => {
  const ing = (...items) => items.map(item => ({ amount: '', unit: '', item }))
  const pairs = [
    { r: { name: 'a', dietary: ['vegetarian'], timeMinutes: 20, ingredients: ing('paneer') } },
    { r: { name: 'b', dietary: [], timeMinutes: 90, ingredients: ing('chicken thighs') } },
    { r: { name: 'c', dietary: ['vegetarian'], ingredients: ing('flour') } },   // no time
    { r: { name: 'd', dietary: ['vegetarian'], timeMinutes: 40, ingredients: ing('2 eggs', 'flour') } },
  ]

  it('filters by diet the Indian way: veg has no egg, egg is veg plus egg', () => {
    expect(applyFilters(pairs, 'veg', '').map(p => p.r.name)).toEqual(['a', 'c'])
    expect(applyFilters(pairs, 'egg', '').map(p => p.r.name)).toEqual(['a', 'c', 'd'])
    expect(applyFilters(pairs, 'non-veg', '').map(p => p.r.name)).toEqual(['b'])
  })

  it('reads diet from the ingredients, not just the tag', () => {
    const kheer = { r: { name: 'Kheer', dietary: [], ingredients: ing('milk', 'rice', 'sugar') } }
    expect(applyFilters([kheer], 'veg', '')).toHaveLength(1)
  })

  it('can leave out recipes that need planning ahead', () => {
    const tikka = { r: { name: 't', ingredients: [], steps: ['Marinate for at least 24 hours.'] } }
    const quick = { r: { name: 'q', ingredients: [], steps: ['Fry for 5 minutes.'] } }
    expect(applyFilters([tikka, quick], '', '', { noPlanAhead: true }).map(p => p.r.name)).toEqual(['q'])
  })

  it('filters by time and excludes recipes with no time', () => {
    expect(applyFilters(pairs, '', '30').map(p => p.r.name)).toEqual(['a'])
  })

  it('combines both filters', () => {
    expect(applyFilters(pairs, 'veg', '30').map(p => p.r.name)).toEqual(['a'])
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

  it('keeps metric amounts as round numbers and steps up to kg / l', () => {
    expect(ingredientLabel({ amount: '675', unit: 'g', item: 'chicken' }, 2).measure).toBe('1.35 kg')
    expect(ingredientLabel({ amount: '65', unit: 'ml', item: 'sultanas' }, 3).measure).toBe('195 ml')
    expect(ingredientLabel({ amount: '1', unit: 'l', item: 'milk' }, 0.5).measure).toBe('0.5 l')
  })

  it('scales ranges at both ends instead of dropping the top', () => {
    expect(ingredientLabel({ amount: '2-3', unit: '', item: 'cloves garlic' }, 2).measure).toBe('4–6')
    expect(ingredientLabel({ amount: '800 - 1200', unit: 'g', item: 'chicken' }, 1).measure).toBe('0.8–1.2 kg')
  })

  it('reads a hyphenated mixed number as one amount', () => {
    expect(ingredientLabel({ amount: '1-1/2', unit: 'cups', item: 'flour' }, 2).measure).toBe('3 cups')
  })

  it('scales a leading conversion and an estimate, but not a per-unit size', () => {
    expect(ingredientLabel({ amount: '675', unit: 'g', item: '(1.5 lb) chicken breast' }, 2).item)
      .toBe('(3 lb) chicken breast')
    expect(ingredientLabel({ amount: '1/4', unit: '', item: 'red cabbage (about 1 1/2 cups)' }, 2).item)
      .toBe('red cabbage (about 3 cups)')
    expect(ingredientLabel({ amount: '1', unit: 'can', item: 'tomatoes (14 oz)' }, 2).item)
      .toBe('tomatoes (14 oz)')
  })

  it('leaves the text untouched at the original size', () => {
    expect(ingredientLabel({ amount: '675', unit: 'g', item: '(1.5 lb) chicken' }, 1))
      .toEqual({ measure: '675 g', item: '(1.5 lb) chicken' })
  })
})

describe('scaling never touches times, temperatures or sizes', () => {
  it('keeps "(about 5 minutes)" at every scale but scales a weight estimate', () => {
    const butter = { amount: '8', unit: 'tablespoon', item: 'unsalted butter, melted and cooled slightly (about 5 minutes)' }
    for (const s of [0.5, 2, 3]) expect(ingredientLabel(butter, s).item).toContain('(about 5 minutes)')
    expect(ingredientLabel({ amount: '1', unit: 'cup', item: 'flour (about 200 g)' }, 2).item).toBe('flour (about 400 g)')
    expect(ingredientLabel({ amount: '1', unit: '', item: '(9-inch) pie crust' }, 2).item).toBe('(9-inch) pie crust')
  })
})

describe('scaleStep', () => {
  const ings = [
    { amount: '8', unit: 'tablespoon', item: 'unsalted butter, melted' },
    { amount: '2', unit: 'tablespoon', item: 'unsalted butter, for brushing' },
  ]
  const join = segs => segs.map(s => s.text).join('')
  const step1 = 'Heat oven to 475°F. Combine buttermilk and 8 tablespoons melted butter, then bake 12 to 14 minutes in a 1/4-cup measure.'

  it('rewrites only the amount that belongs to an ingredient line', () => {
    const segs = scaleStep(step1, ings, 2)
    expect(join(segs)).toBe('Heat oven to 475°F. Combine buttermilk and 16 tablespoons melted butter, then bake 12 to 14 minutes in a 1/4-cup measure.')
    expect(segs.filter(s => s.scaled).map(s => s.line)).toEqual([0])
  })

  it('tells the two butters apart', () => {
    const segs = scaleStep('Brush with remaining 2 tablespoons melted butter.', ings, 2)
    expect(join(segs)).toBe('Brush with remaining 4 tablespoons melted butter.')
    expect(segs.find(s => s.scaled).line).toBe(1)
  })

  it('changes nothing at the original size', () => {
    expect(join(scaleStep(step1, ings, 1))).toBe(step1)
  })
})
