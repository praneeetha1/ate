import { BY_ID, lineId, resolveIngredient, standIns, isKindOf } from './registry'
import { isNeverShopped, MAIN_INGREDIENTS } from './ingredients'

/**
 * "Can I make this?" — the one evaluator every screen uses.
 *
 * Search, Home, the recipe view and the shopping list used to each have their
 * own idea of what "have" meant. They now all ask this, so the same recipe and
 * pantry give the same answer everywhere, with the reason for it.
 *
 * `stateOf(id)` comes from the pantry: { state: 'have' | 'low' | 'out' |
 * 'unknown', assumed: bool } for that exact id and nothing else. Everything
 * about what can stand in for what is decided here, from the registry.
 */

// Better first. Confirmed beats low beats assumed: an assumption is a guess.
const RANK = { have: 0, low: 1, assumed: 2, missing: 3 }
const better = (a, b) => (RANK[a.status] <= RANK[b.status] ? a : b)

function direct(id, stateOf) {
  const s = stateOf(id)
  if (s.state === 'have') return { status: s.assumed ? 'assumed' : 'have', via: 'exact', using: id }
  if (s.state === 'low') return { status: 'low', via: 'exact', using: id }
  return { status: 'missing', via: s.state === 'out' ? 'out' : 'none', using: id }
}

/**
 * How one ingredient id stands in this pantry: { status, via, using }.
 *   status  'have' | 'low' | 'assumed' | 'missing'
 *   via     'exact' | 'kind' | 'generic' | 'covers' | 'swap' | 'made' | 'out' | 'none'
 *   using   the id actually found, when it isn't the one asked for
 * An explicit Out on the exact item is final: marking salt out means no salt,
 * whatever else is in the cupboard.
 */
export function matchIngredient(id, stateOf, seen = new Set()) {
  const own = direct(id, stateOf)
  if (own.status !== 'missing' || own.via === 'out') return own
  if (seen.has(id)) return own
  seen.add(id)

  let best = own
  for (const s of standIns(id)) {
    const m = direct(s.id, stateOf)
    if (m.status !== 'missing') best = better(best, { ...m, via: s.via, using: s.id })
  }
  const made = BY_ID.get(id)?.madeFrom
  if (made?.length && best.status !== 'have') {
    const parts = made.map(p => matchIngredient(p, stateOf, seen))
    if (parts.every(p => p.status !== 'missing')) {
      const worst = parts.reduce((a, b) => (RANK[a.status] >= RANK[b.status] ? a : b))
      best = better(best, { status: worst.status, via: 'made', using: made.join(' + ') })
    }
  }
  return best
}

/** Every requirement a recipe makes, one per distinct need, with what can meet it. */
export function requirements(recipe) {
  const byKey = new Map()
  const add = (options, optional, line) => {
    const key = options.join('|')
    const prev = byKey.get(key)
    if (prev) { prev.optional = prev.optional && optional; prev.lines.push(line); return }
    byKey.set(key, { id: options[0], options, optional, lines: [line], known: options.every(o => BY_ID.has(o)) })
  }
  ;(recipe?.ingredients || []).forEach((ing, line) => {
    if (!ing?.item && !ing?.id) return
    const id = lineId(ing)
    if (!id || BY_ID.get(id)?.never || isNeverShopped(ing.item)) return
    // A line without a reviewed id still says "optional" in its own words.
    const optional = !!ing.optional || (!ing.id && /\boptional\b/i.test(ing.item || ''))
    add([id, ...(ing.alternatives || [])], optional, line)
    for (const also of ing.alsoNeeds || []) add([also], optional, line)
    // Text-only "salt and pepper" (user recipes) is still two things.
    if (!ing.id && resolveIngredient(ing.item).id === 'salt and pepper') add(['black pepper'], optional, line)
  })
  for (const r of byKey.values()) if (r.id === 'salt and pepper') { r.id = 'salt'; r.options = ['salt']; r.known = true }
  return [...byKey.values()]
}

const MAIN = new Set(MAIN_INGREDIENTS)
const isMain = id => MAIN.has(id) || [...MAIN].some(m => isKindOf(id, m))

/**
 * The whole picture for one recipe.
 *
 *   needs    [{ id, options, optional, known, status, via, using, chosen }]
 *   have / low / assumed / missing / optionalMissing   needs grouped by status
 *   missingMain   missing needs that are a main ingredient (chicken, dal, rice…)
 *   ready    nothing required is missing
 *
 * A recipe that lists alternatives is satisfied by any of them; the best one
 * found is `chosen`, and `via: 'alternative'` when it isn't the first listed.
 */
export function evaluateRecipe(recipe, stateOf) {
  const needs = requirements(recipe).map(r => {
    let best = null
    r.options.forEach((opt, i) => {
      const m = { ...matchIngredient(opt, stateOf), chosen: opt, alternative: i > 0 }
      best = best ? better(best, m) : m
    })
    const via = best.alternative && best.status !== 'missing' ? 'alternative' : best.via
    const status = best.status === 'missing' && r.optional ? 'optional' : best.status
    return { ...r, ...best, via, status }
  })
  const of = s => needs.filter(n => n.status === s)
  const missing = of('missing')
  return {
    needs,
    have: of('have'),
    low: of('low'),
    assumed: of('assumed'),
    missing,
    optionalMissing: of('optional'),
    missingMain: missing.filter(n => isMain(n.id)),
    required: needs.filter(n => !n.optional).length,
    ready: missing.length === 0,
  }
}

/**
 * Closest-to-cookable first.
 *
 * Missing a main ingredient is worse than missing a garnish, whatever the
 * percentages say — so: fewest missing mains, then fewest missing anything,
 * then least uncertainty (low or only assumed), then least hands-on time.
 * Optional extras never affect the order.
 */
export function compareReadiness(a, b, minutesA = 0, minutesB = 0) {
  return (a.missingMain.length - b.missingMain.length)
    || (a.missing.length - b.missing.length)
    || ((a.low.length + a.assumed.length) - (b.low.length + b.assumed.length))
    || (minutesA - minutesB)
}

/** The ids a recipe uses, alternatives included — for "recipes with X". */
export function recipeIds(recipe) {
  return [...new Set(requirements(recipe).flatMap(r => r.options))]
}

/**
 * Whether a recipe uses something you picked: the food itself or a kind of it.
 * "tomato" finds cherry tomatoes, not tomato paste; "urad dal" finds the
 * skinless white urad dal in idli.
 */
export function recipeUses(recipe, picked) {
  const want = resolveIngredient(picked).id
  return recipeIds(recipe).some(id => isKindOf(id, want))
}
