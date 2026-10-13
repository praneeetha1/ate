import RECIPES from '../data/recipes.json'
import { parseFrac, fmtFrac } from './fractions'
import { dietKind } from './diet'
import { leadTimes } from './steps'

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
 *
 * From the whole catalog rather than the visible slice, deliberately: this is
 * the list you may *file a new recipe under*, and retiring the last visible
 * drink is no reason to stop someone writing one. Deriving it from
 * VISIBLE_CATALOG shrank the options every time the catalog was curated.
 */
export const CATALOG_CATEGORIES =
  [...new Set(RECIPES.map(r => r.category))].sort()

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

const GRAMS  = /^(g|grams?)$/i
const MILLIS = /^(ml|millilit(?:re|er)s?)$/i
const METRIC = /^(g|grams?|kg|kilograms?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?)$/i

/**
 * One scaled amount in the unit's own idiom: fractions for cups and spoons,
 * round numbers for metric. "675 g" doubled is "1.35 kg", not "1350 g", and
 * never "1350 ⅛".
 */
function scaleAmount(n, unit, scale, promote = true) {
  let v = n * scale, u = unit
  if (!METRIC.test(u || '')) return [fmtFrac(v), u]
  if (promote && GRAMS.test(u)  && v >= 1000) { v /= 1000; u = 'kg' }
  if (promote && MILLIS.test(u) && v >= 1000) { v /= 1000; u = 'l' }
  v = v >= 100 ? Math.round(v / 5) * 5 : v >= 10 ? Math.round(v) : Math.round(v * 100) / 100
  return [String(v), u]
}

// "2-3", "2 – 3", "2 to 3". parseFrac alone reads these as a bare 2.
const RANGE = /^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i

// What a number in ingredient prose can be *besides* a quantity: a time, a
// temperature or a size. "melted and cooled (about 5 minutes)" doubled is
// still five minutes, and a 7-inch tin doesn't become a 14-inch one.
const NOT_A_QUANTITY = /^\s*(?:-|–)?\s*(?:min(?:ute)?s?|h(?:ou)?rs?|hours?|sec(?:ond)?s?|°|degrees?|inch(?:es)?|in\b|cm|mm|")/i

/**
 * Numbers inside a stretch of ingredient text: "(1.5 lb)" → "(3 lb)".
 * Decimals stay decimal, everything else becomes a kitchen fraction.
 */
function scaleNumbers(text, scale) {
  return text.replace(/\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?/g, (m, offset) => {
    if (NOT_A_QUANTITY.test(text.slice(offset + m.length))) return m
    const n = parseFrac(m)
    if (n == null) return m
    return m.includes('.') ? String(Math.round(n * scale * 10) / 10) : fmtFrac(n * scale)
  })
}

/**
 * Only the parentheticals that restate the whole amount get scaled: a leading
 * conversion — "675 g (1.5 lb) chicken" — and an "(about …)" estimate. A
 * mid-line one is usually per-unit — "1 can tomatoes (14 oz)" — and two cans
 * are still 14 oz each, so it's left alone.
 */
function scaleItem(item, scale) {
  if (scale === 1 || !item) return item
  return item
    .replace(/^\(([^)]*)\)/, (_, inner) => `(${scaleNumbers(inner, scale)})`)
    .replace(/\(about ([^)]*)\)/gi, (_, inner) => `(about ${scaleNumbers(inner, scale)})`)
}

/**
 * One ingredient line at a scale, still in its parts: { amount, unit, item }.
 *
 * The shopping list takes it in parts so it can sum by unit; the recipe view
 * joins it into a label. `promote` steps 1000 g up to 1 kg — right for reading,
 * wrong for a list that has to add this line to another recipe's grams.
 */
export function scaleIngredient(ing, scale = 1, { promote = true } = {}) {
  const raw = String(ing.amount ?? '').trim()
  let amount = raw, unit = ing.unit || ''
  const range = raw.match(RANGE)
  const lo = range && parseFrac(range[1]), hi = range && parseFrac(range[2])
  if (lo != null && hi != null && hi > lo) {
    const [b, u] = scaleAmount(hi, unit, scale, promote)
    // Both ends in the top end's unit: "800–1.2 kg" reads as nonsense.
    const [a] = scaleAmount(u === unit ? lo : lo / 1000, u, scale, promote)
    amount = `${a}–${b}`; unit = u
  } else {
    // "1-1/2 cups" is a mixed number written with a hyphen, not a range.
    const n = lo != null && hi != null && hi < 1 ? lo + hi : parseFrac(raw)
    if (n != null) [amount, unit] = scaleAmount(n, unit, scale, promote)
  }
  return { amount, unit, item: scaleItem(ing.item, scale) }
}

export function ingredientLabel(ing, scale = 1) {
  const { amount, unit, item } = scaleIngredient(ing, scale)
  return { measure: [amount, unit].filter(Boolean).join(' '), item }
}

/**
 * Diet filters, Indian-menu style.
 * 'veg' excludes egg; 'egg' is veg plus egg (eggetarian); 'vegan' also needs
 * the tag, since dairy and honey can't be told apart from a veg dish otherwise.
 */
const DIET_TEST = {
  'veg':     r => dietKind(r) === 'veg',
  'egg':     r => dietKind(r) !== 'non-veg',
  'non-veg': r => dietKind(r) === 'non-veg',
  'vegan':   r => (r.dietary || []).includes('vegan') && dietKind(r) === 'veg',
}

/**
 * `timeFilter` is minutes of total time. `noPlanAhead` drops anything that
 * has to marinate, soak, ferment or chill first — "can I make this tonight".
 */
export function applyFilters(pairs, dietFilter, timeFilter, { noPlanAhead = false } = {}) {
  return pairs.filter(({ r }) => {
    if (dietFilter && !DIET_TEST[dietFilter]?.(r)) return false
    if (timeFilter && (!r.timeMinutes || r.timeMinutes > Number(timeFilter))) return false
    if (noPlanAhead && leadTimes(r).length) return false
    return true
  })
}

/** DB rows use snake_case time_minutes; the UI uses camelCase timeMinutes. */
export function normalizeUserRecipe(r) {
  return {
    ...r,
    timeMinutes: r.time_minutes,
    activeMinutes: r.active_minutes ?? r.activeMinutes,
    stepImages:  r.step_images ?? r.stepImages,
    // Catalog recipes carry `image`/`sourceUrl`; the DB spells them
    // snake_case. Mapping here means everything downstream reads one name.
    image:       r.image_url  ?? r.image,
    sourceUrl:   r.source_url ?? r.sourceUrl,
  }
}

/** Catalog recipes carry a human `source` name; copied/imported ones don't — fall back to the site's hostname. */
export function sourceLabel(sourceUrl) {
  try { return new URL(sourceUrl).hostname.replace(/^www\./, '') }
  catch { return sourceUrl }
}

/**
 * Strip UI-only and server-owned fields so the object is safe to INSERT.
 *
 * `timeMinutes` in particular is added by normalizeUserRecipe and is NOT a
 * column — leaving it in made every offline-created recipe fail to upload with
 * a PGRST204 error. `image` and `sourceUrl` are the same shape of mistake:
 * normalizeUserRecipe adds them as the camelCase reading of image_url and
 * source_url, and the columns are the snake_case ones.
 */
export function toUserRecipeRow(recipe) {
  const {
    id: _id, user_id: _uid, created_at: _created, updated_at: _updated,
    timeMinutes: _tm, activeMinutes: _am, stepImages: _si, image: _img, sourceUrl: _src, ...row
  } = recipe
  return row
}

// ── amounts inside step text ─────────────────────────────────

const UNIT_WORDS = [
  ['tbsp', 'tablespoons?|tbsps?|tbs|tbl'],
  ['tsp',  'teaspoons?|tsps?'],
  ['cup',  'cups?'],
  ['g',    'grams?|g'],
  ['kg',   'kilograms?|kgs?'],
  ['ml',   'millilit(?:re|er)s?|ml'],
  ['l',    'lit(?:re|er)s?|l'],
  ['oz',   'ounces?|oz'],
  ['lb',   'pounds?|lbs?'],
]
const unitKey = u => {
  const s = String(u || '').trim().toLowerCase().replace(/\.$/, '')
  for (const [key, rx] of UNIT_WORDS) if (new RegExp(`^(?:${rx})$`).test(s)) return key
  return null
}
const STEP_STOPWORDS = new Set(['and', 'for', 'the', 'with', 'into', 'plus'])
const STEP_MEASURE = new RegExp(
  `(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½⅓⅔¼¾⅛])\\s*(${UNIT_WORDS.map(([, rx]) => rx).join('|')})\\b`,
  'gi',
)

/**
 * A step's text at a scale, as segments: [{ text, scaled, line }].
 *
 * Only an amount the step shares with one specific ingredient line is
 * rewritten — "8 tablespoons melted butter" where the butter line is 8 tbsp.
 * Everything else stays exactly as written, so 475°F, "12 to 14 minutes" and
 * a 1/4-cup scoop never move. `line` is the ingredient index it was matched
 * to, which is also how a step that says which butter gets only that chip.
 */
export function scaleStep(step, ingredients = [], scale = 1, nameOf = i => i.item) {
  const text = String(step || '')
  const out = []
  let last = 0
  for (const m of text.matchAll(STEP_MEASURE)) {
    const n = parseFrac(m[1]), key = unitKey(m[2])
    if (n == null || !key) continue
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase()
    const line = ingredients.findIndex(ing => {
      if (parseFrac(ing.amount) !== n || unitKey(ing.unit) !== key) return false
      const words = String(nameOf(ing) || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !STEP_STOPWORDS.has(w))
      return words.some(w => after.includes(w))
    })
    if (line < 0) continue
    if (m.index > last) out.push({ text: text.slice(last, m.index), scaled: false })
    const [amount] = scaleAmount(n, key, scale, false)
    out.push({ text: scale === 1 ? m[0] : `${amount} ${m[2]}`, scaled: scale !== 1, line })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), scaled: false })
  return out
}
