import RECIPES from '../data/recipes.json'
import { parseFrac, fmtFrac } from './fractions'

// Keyed by the slug that tagKey() produces. Previously these keys were built
// by hand ("Soup--Stew"), but tagKey turned "Soup & Stew" into "Soup---Stew" —
// so every category containing "&" silently fell through to the fallback swatch.
export const TAG_COLORS = {
  'main-dish':         'bg-[#4EC6B0] text-[#0F332C]',
  'breakfast':         'bg-[#FFD166] text-[#5A3D00]',
  'dessert':           'bg-[#FFA6C1] text-[#6E1636]',
  'side-dish':         'bg-[#8ED2F0] text-[#0E3D57]',
  'soup-stew':         'bg-[#FFB27A] text-[#6B2E05]',
  'salad':             'bg-[#A8E06A] text-[#2C4A0C]',
  'quick-meal':        'bg-[#C9A7F5] text-[#3F1470]',
  'vegetarian':        'bg-[#7FE0B0] text-[#0D4A2E]',
  'snack-appetizer':   'bg-[#FFE066] text-[#5E4600]',
  'drink':             'bg-[#8FB8FF] text-[#12295E]',
  'bread-baking':      'bg-[#E8C48F] text-[#5A3A10]',
  'pasta-noodles':     'bg-[#FF9E7A] text-[#6E2A0C]',
}

/** Slugifies a category name: "Soup & Stew" -> "soup-stew". */
export function tagKey(cat) {
  return String(cat || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function tagStyles(cat) {
  // Every tag carries the ink outline; only the fill varies by category.
  const fill = TAG_COLORS[tagKey(cat)] || 'bg-warm-tan text-ink'
  return `border-2 border-ink ${fill}`
}

/**
 * The catalog as it should be offered, paired with each recipe's real key.
 *
 * A retired recipe is flagged `hidden` rather than deleted, because a catalog
 * key *is* the array index and seven tables store it as plain text with no
 * foreign key — favourites, ratings, notes, shopping_list, list_items,
 * activity and lists. Splicing one out would slide every later index down by
 * one and silently repoint every saved row at the neighbouring recipe. So the
 * array is append-only and the views filter instead.
 *
 * resolveRecipe() deliberately still resolves a hidden recipe: an old rating,
 * a shared link or a shopping-list row from before it was retired should keep
 * working. `hidden` only means "stop offering this", never "this is gone".
 */
export const VISIBLE_CATALOG = RECIPES
  .map((r, i) => ({ r, i }))
  .filter(({ r }) => !r.hidden)

/**
 * The categories a user may pick when creating a recipe.
 *
 * Derived from the catalog so a user recipe always lands in a real category —
 * the hardcoded list this replaced offered 'Appetizer' / 'Soup' / 'Snack' /
 * 'Sauce', none of which exist in the catalog, so those recipes fell through
 * tagStyles() to the generic swatch and never matched a catalog section.
 */
export const CATALOG_CATEGORIES =
  [...new Set(VISIBLE_CATALOG.map(({ r }) => r.category))].sort()

// ── recipe keys ──────────────────────────────────────────────
// A recipe is addressed by a "key": the catalog index as a number (5) for a
// built-in recipe, or the string "u_<uuid>" for a user-created one. The DB
// stores both as text; the UI keeps catalog keys numeric so `RECIPES[key]`
// works directly.

/** DB text form of a key. */
export function keyToText(key) {
  return String(key)
}

/** UI form of a DB text key: numeric for catalog recipes, string otherwise. */
export function keyFromText(text) {
  return /^\d+$/.test(String(text)) ? parseInt(text, 10) : text
}

export function isUserRecipeKey(key) {
  return typeof key === 'string' && key.startsWith('u_')
}

export function isCatalogKey(key) {
  return /^\d+$/.test(String(key))
}

/** The user_recipes UUID behind a "u_<uuid>" key. */
export function userRecipeId(key) {
  return String(key).slice(2)
}

const CATALOG_INDEX_BY_NAME = new Map(RECIPES.map((r, i) => [r.name.toLowerCase(), i]))

/**
 * Resolve a recipe name to a key.
 *
 * Only used to migrate ratings/notes that were keyed by name before keys
 * existed. Catalog names are unique (verified: 0 duplicates across all 300),
 * so this is unambiguous for built-in recipes; user recipes are matched by name
 * against the caller's own recipes as a fallback.
 */
export function keyForName(name, userRecipes = []) {
  if (!name) return null
  const idx = CATALOG_INDEX_BY_NAME.get(String(name).toLowerCase())
  if (idx !== undefined) return idx
  const own = userRecipes.find(r => r.name?.toLowerCase() === String(name).toLowerCase())
  return own ? 'u_' + own.id : null
}

/** Resolve a key to a recipe object, given the caller's own user recipes. */
export function resolveRecipe(key, userRecipes = []) {
  if (key === null || key === undefined) return null
  if (isCatalogKey(key)) return RECIPES[Number(key)] ?? null
  if (isUserRecipeKey(key)) {
    return userRecipes.find(r => String(r.id) === userRecipeId(key)) ?? null
  }
  return null
}

// ── display ──────────────────────────────────────────────────

export function ingredientLabel(ing, scale = 1) {
  const n   = parseFrac(ing.amount)
  const amt = n != null ? fmtFrac(n * scale) : ing.amount
  return {
    measure: [amt, ing.unit].filter(Boolean).join(' '),
    item:    ing.item,
  }
}

export function applyFilters(pairs, dietFilter, timeFilter) {
  return pairs.filter(({ r }) => {
    if (dietFilter && !(r.dietary || []).includes(dietFilter)) return false
    if (timeFilter && (!r.timeMinutes || r.timeMinutes > Number(timeFilter))) return false
    return true
  })
}

/** DB rows use snake_case time_minutes; the UI uses camelCase timeMinutes. */
export function normalizeUserRecipe(r) {
  return { ...r, timeMinutes: r.time_minutes }
}

/**
 * Strip UI-only and server-owned fields so the object is safe to INSERT.
 *
 * `timeMinutes` in particular is added by normalizeUserRecipe and is NOT a
 * column — leaving it in made every offline-created recipe fail to upload with
 * a PGRST204 error.
 */
export function toUserRecipeRow(recipe) {
  const {
    id: _id, user_id: _uid, created_at: _created, updated_at: _updated,
    timeMinutes: _tm, ...row
  } = recipe
  return row
}
