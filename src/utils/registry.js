import REGISTRY from '../data/ingredientRegistry'
import { canonicalItem } from './ingredients'

/**
 * Lookups over the ingredient registry, and the one way to turn text into an id.
 *
 * Matching everywhere (pantry, search, shopping, readiness) goes through ids
 * from here, so the same ingredient gets the same answer on every screen.
 */

export const BY_ID = new Map(REGISTRY.map(e => [e.id, e]))

const ALIAS = new Map()
for (const e of REGISTRY) for (const a of e.aliases || []) ALIAS.set(a, e.id)

/** Every id and alias, for suggestion lists. */
export const REGISTRY_NAMES = [...BY_ID.keys()].sort()

/**
 * { id, known } for a line of ingredient text, or for an id already resolved.
 *
 * `known` is false when the registry has never heard of it: the id is then
 * just the matcher's best reading of the text, and the line should be shown
 * as unconfirmed rather than silently counted as present or absent.
 */
export function resolveIngredient(text) {
  const raw = String(text || '').trim()
  if (!raw) return { id: '', known: false }
  if (BY_ID.has(raw)) return { id: raw, known: true }
  const c = canonicalItem(raw)
  if (BY_ID.has(c)) return { id: c, known: true }
  if (ALIAS.has(c)) return { id: ALIAS.get(c), known: true }
  const lower = raw.toLowerCase()
  if (ALIAS.has(lower)) return { id: ALIAS.get(lower), known: true }
  return { id: c, known: false }
}

/** The id of one recipe line: its stored id when it has one, else read from its text. */
export const lineId = ing => (ing?.id && BY_ID.has(ing.id) ? ing.id : resolveIngredient(ing?.item).id)

/** This id and everything it's a kind of: red bell pepper → bell pepper. */
export function ancestors(id) {
  const out = []
  let e = BY_ID.get(id)
  const seen = new Set()
  while (e?.parent && !seen.has(e.parent)) { seen.add(e.parent); out.push(e.parent); e = BY_ID.get(e.parent) }
  return out
}

/** True when `id` is `of` or a kind of it — for search: tomato finds cherry tomato, not tomato paste. */
export const isKindOf = (id, of) => id === of || ancestors(id).includes(of)

/**
 * The other ids that can stand in for `id`, and how: [{ id, via }].
 *   'kind'    a more specific food: you have basmati, the recipe says rice
 *   'generic' the general food, where the registry allows it: onion for red onion
 *   'covers'  a food that includes it: whole egg for a yolk
 *   'swap'    a listed stand-in: oil for cooking spray
 * Never anything the registry doesn't say.
 */
export function standIns(id) {
  const out = []
  for (const e of REGISTRY) {
    if (e.id === id) continue
    if (ancestors(e.id).includes(id)) out.push({ id: e.id, via: 'kind' })
    if ((e.satisfies || []).includes(id)) out.push({ id: e.id, via: 'covers' })
  }
  const self = BY_ID.get(id)
  if (self?.genericOk && self.parent) out.push({ id: self.parent, via: 'generic' })
  for (const s of self?.orUse || []) out.push({ id: s, via: 'swap' })
  return out
}

/** Registry problems, for the test suite: dangling references and doubled names. */
export function registryProblems() {
  const problems = []
  const names = new Map()
  for (const e of REGISTRY) {
    for (const n of [e.id, ...(e.aliases || [])]) {
      if (names.has(n)) problems.push(`"${n}" is used by both ${names.get(n)} and ${e.id}`)
      names.set(n, e.id)
    }
    for (const ref of [e.parent, ...(e.satisfies || []), ...(e.madeFrom || []), ...(e.orUse || [])].filter(Boolean)) {
      if (!BY_ID.has(ref)) problems.push(`${e.id} refers to unknown "${ref}"`)
    }
  }
  return problems
}
