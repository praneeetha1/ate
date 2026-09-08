import RECIPES from '../data/recipes.json'
import { parseFrac, fmtFrac } from './fractions'

// Keyed by the slug that tagKey() produces. Previously these keys were built
// by hand ("Soup--Stew"), but tagKey turned "Soup & Stew" into "Soup---Stew" —
// so every category containing "&" silently fell through to the fallback swatch.
export const TAG_COLORS = {
  'main-dish':         'bg-[#D5EBD8] text-[#2A6035]',
  'breakfast':         'bg-[#FDE9C5] text-[#8B5C00]',
  'dessert':           'bg-[#F9D8E0] text-[#8B2040]',
  'side-dish':         'bg-[#D8EDF5] text-[#1A5470]',
  'soup-stew':         'bg-[#F5E2CB] text-[#7A3D10]',
  'salad':             'bg-[#DFF2DA] text-[#2A5E30]',
  'quick-meal':        'bg-[#EDE2F5] text-[#5A2A80]',
  'vegetarian':        'bg-[#D8F0E5] text-[#1A6040]',
  'snack-appetizer':   'bg-[#FFF0C5] text-[#7A5A00]',
  'drink':             'bg-[#D8E8FF] text-[#1A3A80]',
  'bread-baking':      'bg-[#F0E0C8] text-[#6B4415]',
  'pasta-noodles':     'bg-[#FFE5D0] text-[#8A4520]',
}

/** Slugifies a category name: "Soup & Stew" -> "soup-stew". */
export function tagKey(cat) {
  return String(cat || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function tagStyles(cat) {
  return TAG_COLORS[tagKey(cat)] || 'bg-warm-tan text-ink'
}

/**
 * The categories a user may pick when creating a recipe.
 *
 * Derived from the catalog so a user recipe always lands in a real category —
 * the hardcoded list this replaced offered 'Appetizer' / 'Soup' / 'Snack' /
 * 'Sauce', none of which exist in the catalog, so those recipes fell through
 * tagStyles() to the generic swatch and never matched a catalog section.
 */
export const CATALOG_CATEGORIES = [...new Set(RECIPES.map(r => r.category))].sort()

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
