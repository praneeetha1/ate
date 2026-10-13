import { shoppingName, isNeverShopped } from './ingredients'
import { lineId, BY_ID } from './registry'
import { keyToText, scaleIngredient } from './recipe'
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
 * Typing an item in yourself adds a MANUAL source with no amount. That's what
 * stops a hand-added item disappearing when you drop a recipe that happened to
 * want the same thing — in either order. Rows saved before the marker existed
 * have empty `sources`, which still counts as hand-added.
 *
 * A recipe source is either the whole recipe (`line` absent) or one ingredient
 * line added on its own (`line` = its index), and carries the `scale` it was
 * added at so the list matches the servings you picked.
 */
export const MANUAL = 'manual'

/**
 * A recipe's ingredients, canonicalised and deduped.
 *
 * Deduped because a recipe can name the same item twice ("2 tbsp oil" for the
 * tempering, "1 tbsp oil" to finish) and that's still one thing to buy. Water
 * and ice are dropped — you can't be short of tap water.
 *
 * Scaled line by line before merging, in the recipe's own units (no g → kg
 * step-up), so the list says what the ingredient panel says.
 */
export function shoppableIngredients(recipe, scale = 1) {
  const out = new Map()
  for (const ing of recipe?.ingredients || []) {
    if (!ing?.item || isNeverShopped(ing.item)) continue
    // The reviewed registry id when the line has one, so the list, the pantry
    // and the readiness check all call it the same thing.
    const item = lineId(ing)
    if (!item || BY_ID.get(item)?.never) continue

    const { amount, unit } = scaleIngredient(ing, scale, { promote: false })
    const entry = { amount: amount || '', unit: unit || '' }
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
 * Idempotent per contribution, so repeated taps never stack:
 *   - a whole recipe replaces everything that recipe had put on this row;
 *   - one ingredient line replaces only that same line, and sums with the
 *     recipe's other lines ("8 tbsp" + "2 tbsp" butter → 10, in either order);
 *   - no source means you typed it, which adds the MANUAL marker once.
 * `checked` resets when a recipe asks for it again: a row you'd ticked off is
 * worth buying again the moment another recipe wants it.
 */
export function mergeItem(existing, entry, source) {
  let sources = existing?.sources || []

  if (!source) {
    if (!sources.some(s => s.key === MANUAL)) {
      sources = [...sources, { key: MANUAL, name: '', amount: '', unit: '' }]
    }
  } else {
    const line = source.line ?? null
    const wholeAlready = sources.some(s => s.key === source.key && s.line == null)
    // A line from a recipe whose whole list is already here is already counted.
    if (line != null && wholeAlready) return { ...existing }
    sources = sources.filter(s =>
      s.key !== source.key || (line != null && s.line != null && s.line !== line))
    sources = [...sources, {
      key:    source.key,
      name:   source.name,
      amount: entry.amount || '',
      unit:   entry.unit || '',
      ...(line != null ? { line } : {}),
      ...(source.scale && source.scale !== 1 ? { scale: source.scale } : {}),
    }]
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
 * A hand-added row survives: it carries the MANUAL source, or — saved before
 * that existed — no sources at all.
 */
export function withoutRecipe(row, recipeKey) {
  const key = keyToText(recipeKey)
  if (!row.sources.length) return row
  const sources = row.sources.filter(s => s.key !== key)
  if (sources.length === row.sources.length) return row
  if (!sources.length) return null
  return { ...row, sources }
}

/** The servings multiplier a whole recipe was added at, or null if it isn't on the list whole. */
export function recipeShoppingScale(items, recipeKey) {
  const key = keyToText(recipeKey)
  for (const row of items.values()) {
    const s = row.sources.find(x => x.key === key && x.line == null)
    if (s) return s.scale || 1
  }
  return null
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
