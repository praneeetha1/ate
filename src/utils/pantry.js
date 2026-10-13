import { shoppingName } from './ingredients'
import { evaluateRecipe, compareReadiness } from './readiness'

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

/**
 * How close a recipe is to being cookable, as the cards and the recipe view
 * show it — a thin wrapper over evaluateRecipe() (readiness.js), which every
 * screen now shares.
 *
 * Names, not ids, because these are read: "Missing 1 of 8 — pecorino".
 *   missing / low / have      required needs by status (have includes assumed)
 *   assumed / assumedNames    how many of `have` are only assumed staples
 *   optionalMissing           extras you don't have; never count as missing
 *   missingMain               missing needs that are a main ingredient
 *   total                     required needs, deduped, water left out
 */
export function pantryFit(recipe, stateOf) {
  const ev = evaluateRecipe(recipe, stateOf)
  const name = n => {
    const ing = recipe?.ingredients?.[n.lines[0]]
    return (ing?.item && shoppingName(ing.item)) || n.id
  }
  const names = list => list.map(name)
  return {
    missing:         names(ev.missing),
    low:             names(ev.low),
    have:            names([...ev.have, ...ev.assumed]),
    assumed:         ev.assumed.length,
    assumedNames:    names(ev.assumed),
    optionalMissing: names(ev.optionalMissing),
    missingMain:     names(ev.missingMain),
    total:           ev.required,
    ready:           ev.ready,
    minutes:         recipe?.activeMinutes || recipe?.timeMinutes || 0,
    needs:           ev.needs,
  }
}

/**
 * Closest-to-cookable first. Never a filter, only an order: a pantry is always
 * incomplete, so gating on "makeable" shows an empty screen while ranking
 * surfaces what's one or two items away. See compareReadiness() for the order.
 */
export function compareFit(a, b) {
  return compareReadiness(
    { missingMain: a.missingMain || [], missing: a.missing, low: a.low, assumed: { length: a.assumed || 0 } },
    { missingMain: b.missingMain || [], missing: b.missing, low: b.low, assumed: { length: b.assumed || 0 } },
    a.minutes || 0, b.minutes || 0,
  )
}
