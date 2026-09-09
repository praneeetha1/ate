import { canonicalItem, shoppingName, isNeverShopped } from './ingredients'

/**
 * Pantry state.
 *
 * Three states and no quantities, deliberately. A quarter of the catalog's
 * ingredient lines carry no unit at all, converting cups to grams needs a
 * density per ingredient, and nobody re-measures the rice after cooking — so a
 * numeric inventory would drift wrong within a week, and a pantry you don't
 * trust is worse than no pantry. "Enough / nearly out / none" is what actually
 * gets used when deciding whether to cook something.
 *
 * `unknown` is the absence of an answer rather than a fourth state: it is
 * never stored, and staples report `have` instead of it.
 */
export const PANTRY_STATES = ['have', 'low', 'out']

export const PANTRY_LABELS = {
  unknown: 'not tracked',
  have:    'in your kitchen',
  low:     'running low',
  out:     'out',
}

/**
 * The state one tap after `current`.
 *
 * Non-staples cycle through all four (…→ out → unknown → have …) so a row can
 * be put back to "don't ask me about this". A staple has no unknown to return
 * to — its default *is* have — so it cycles through three.
 */
export function nextPantryState(current, staple = false) {
  const at = PANTRY_STATES.indexOf(current)
  if (at === -1) return 'have'                        // from unknown
  if (at === PANTRY_STATES.length - 1) {              // from out
    return staple ? 'have' : 'unknown'
  }
  return PANTRY_STATES[at + 1]
}

/** Worse states win when the same item appears twice in one recipe. */
const RANK = { have: 0, low: 1, unknown: 2, out: 3 }

/**
 * How close a recipe is to being cookable, given a pantry.
 *
 * `low` counts as present but is reported separately — "you have it, but only
 * just" is different from "you have it", and worth knowing before you commit.
 * `out` and `unknown` both count as missing: an ingredient nobody has answered
 * for still has to be bought.
 *
 * Deduped by canonical item, so a recipe asking for both "Parmigiano-Reggiano"
 * and "parmesan cheese" counts them once. Things you never buy — water, ice —
 * are left out of the reckoning entirely rather than counted as present: you
 * cannot be short of tap water, and listing it as owned is just as misleading
 * as listing it as missing.
 */
export function pantryFit(recipe, pantryState) {
  const seen = new Map()

  for (const ing of recipe?.ingredients || []) {
    if (!ing?.item || isNeverShopped(ing.item)) continue
    const key   = canonicalItem(ing.item)
    if (!key) continue
    const state = pantryState(ing.item)
    const prev  = seen.get(key)
    if (!prev || RANK[state] > RANK[prev.state]) {
      seen.set(key, { state, name: shoppingName(ing.item) })
    }
  }

  const missing = [], low = [], have = []
  for (const { state, name } of seen.values()) {
    if (state === 'have') have.push(name)
    else if (state === 'low') low.push(name)
    else missing.push(name)
  }

  return { missing, low, have, total: seen.size }
}

/**
 * Closest-to-cookable first.
 *
 * Never a filter, only an order: a pantry is always incomplete, and with a
 * realistically stocked kitchen only 2 of the catalog's 300 recipes come out
 * fully makeable — so gating on "makeable" shows an empty screen, while
 * ranking surfaces the dozens that are one or two items away.
 */
export function compareFit(a, b) {
  if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length
  if (a.low.length !== b.low.length) return a.low.length - b.low.length
  return a.total - b.total
}
