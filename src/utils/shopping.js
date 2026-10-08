import { canonicalItem, shoppingName, isNeverShopped } from './ingredients'
import { keyToText } from './recipe'
import { parseFrac, fmtFrac } from './fractions'

/**
 * Join two measures into one.
 *
 * Same unit and both amounts readable -> a real total. Anything else is kept
 * side by side rather than guessed at: "1 cup + 200 g" has no honest sum
 * without a density, and a wrong number on a shopping list is worse than two
 * right ones.
 */
function combineMeasure(a, b) {
  const sameUnit = (a.unit || '').trim().toLowerCase() === (b.unit || '').trim().toLowerCase()
  const na = parseFrac(a.amount)
  const nb = parseFrac(b.amount)
  if (sameUnit && na != null && nb != null) {
    return { amount: fmtFrac(na + nb), unit: a.unit || b.unit }
  }
  const text = [a, b]
    .map(m => [m.amount, m.unit].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join(' + ')
  return { amount: text, unit: '' }
}

/**
 * The shopping list, keyed by ingredient rather than by recipe.
 *
 * One row per thing you'd pick up, no matter how many recipes want it — which
 * is what a shopping list is when you're actually in a shop. The per-recipe
 * contributions ride along in `sources` so the row can still say where it came
 * from and how much each recipe wanted, without anyone having to convert cups
 * to grams to add them up.
 *
 *   { item: 'onion', display: 'red onions', checked: false,
 *     sources: [{ key: '12', name: 'Lemon Rice', amount: '1', unit: '' }] }
 *
 * An empty `sources` means you typed it in yourself. That's also what stops a
 * hand-added item disappearing when you drop the recipe that happened to want
 * the same thing.
 */

/**
 * A recipe's ingredients, canonicalised and deduped.
 *
 * Deduped because a recipe can name the same item twice ("2 tbsp oil" for the
 * tempering, "1 tbsp oil" to finish) and that's still one thing to buy. Water
 * and ice are dropped — you can't be short of tap water.
 */
export function shoppableIngredients(recipe) {
  const out = new Map()
  for (const ing of recipe?.ingredients || []) {
    if (!ing?.item || isNeverShopped(ing.item)) continue
    const item = canonicalItem(ing.item)
    if (!item) continue

    const entry = { amount: ing.amount || '', unit: ing.unit || '' }
    const existing = out.get(item)
    if (existing) {
      // Still one row — but its quantity is now both lines, not just the
      // first. Skipping the later line meant Puliyodarai's "1 tbsp + 2 tbsp"
      // of split peas was shopped as 1 tbsp: the list told you to buy less
      // than the recipe needs.
      const merged = combineMeasure(existing, entry)
      existing.amount = merged.amount
      existing.unit   = merged.unit
      continue
    }
    out.set(item, {
      item,
      display: shoppingName(ing.item) || ing.item,
      ...entry,
    })
  }
  return [...out.values()]
}

/**
 * Fold one contribution into the row that's already there, if any.
 *
 * Re-adding the same recipe replaces its old contribution rather than stacking
 * a second one, so adding a recipe twice can't make the list read "1 + 1".
 * `checked` is deliberately reset: a row you'd ticked off is worth buying
 * again the moment another recipe asks for it.
 */
export function mergeItem(existing, entry, source) {
  const sources = (existing?.sources || []).filter(s => s.key !== source?.key)
  if (source) {
    sources.push({
      key:    source.key,
      name:   source.name,
      amount: entry.amount || '',
      unit:   entry.unit || '',
    })
  }
  return {
    item:    entry.item,
    // Keep the first display name: the one you saw when you added it.
    display: existing?.display || entry.display,
    sources,
    checked: existing ? (source ? false : existing.checked) : false,
  }
}

/**
 * The row with one recipe's contribution taken out, or null if nothing is left
 * wanting it.
 *
 * A hand-added row (no sources to begin with) always survives — it was never
 * the recipe's to remove.
 */
export function withoutRecipe(row, recipeKey) {
  const key = keyToText(recipeKey)
  if (!row.sources.length) return row
  const sources = row.sources.filter(s => s.key !== key)
  if (!sources.length) return null
  return { ...row, sources }
}

/** True when any row still lists this recipe as a reason to buy something. */
export function recipeInShopping(items, recipeKey) {
  const key = keyToText(recipeKey)
  for (const row of items.values()) {
    if (row.sources.some(s => s.key === key)) return true
  }
  return false
}

/**
 * How much, across every recipe wanting it: "1 + 2 cup".
 *
 * Joined rather than summed. Two recipes wanting "1 cup" and "200 g" of the
 * same thing have no honest total without a density per ingredient, and a
 * wrong number on a shopping list is worse than two right ones.
 */
export function measureLabel(row) {
  const sources = (row.sources || []).filter(s => s.amount || s.unit)
  if (!sources.length) return ''

  /*
   * Summed per unit, never deduplicated.
   *
   * The old version collapsed identical strings through a Set and then tried
   * Number() on the amount. Both steps lost food: two half-cups became "1/2
   * cup" because Number('1/2') is NaN and the Set had already thrown the
   * duplicate away, and "1 1/2" + "1 1/2" became "2 1/2 cup" because only the
   * first space-separated token was multiplied.
   */
  const totals = new Map()      // unit key -> { unit, total }
  const unsummable = []

  for (const s of sources) {
    const n = parseFrac(s.amount)
    const measure = [s.amount, s.unit].filter(Boolean).join(' ').trim()
    if (n == null) { unsummable.push(measure); continue }
    const key = (s.unit || '').trim().toLowerCase()
    const at = totals.get(key)
    if (at) at.total += n
    else totals.set(key, { unit: s.unit || '', total: n })
  }

  const summed = [...totals.values()]
    .map(({ unit, total }) => [fmtFrac(total), unit].filter(Boolean).join(' ').trim())
    .filter(Boolean)

  return [...summed, ...unsummable].join(' + ')
}

/** Rows as stored locally and on the server. */
export function itemsToRows(items) {
  return [...items.values()].map(r => ({
    item: r.item, display: r.display, sources: r.sources, checked: r.checked,
  }))
}

export function rowsToItems(rows) {
  return new Map((rows || []).map(r => [r.item, {
    item:    r.item,
    display: r.display || r.item,
    sources: Array.isArray(r.sources) ? r.sources : [],
    checked: !!r.checked,
  }]))
}
