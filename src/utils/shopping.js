import { canonicalItem, shoppingName, isNeverShopped } from './ingredients'
import { keyToText } from './recipe'

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
    if (!item || out.has(item)) continue
    out.set(item, {
      item,
      display: shoppingName(ing.item) || ing.item,
      amount:  ing.amount || '',
      unit:    ing.unit || '',
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
  const parts = (row.sources || [])
    .map(s => [s.amount, s.unit].filter(Boolean).join(' ').trim())
    .filter(Boolean)
  if (!parts.length) return ''
  // Identical measures collapse: three recipes each wanting "1 clove" is
  // "3 clove", not "1 + 1 + 1".
  const unique = [...new Set(parts)]
  if (unique.length === 1 && parts.length > 1) {
    const [amount, ...rest] = unique[0].split(' ')
    const n = Number(amount)
    if (Number.isFinite(n)) return [n * parts.length, ...rest].join(' ')
  }
  return unique.join(' + ')
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
