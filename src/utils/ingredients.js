/**
 * Ingredient vocabulary.
 *
 * The catalog's `item` field is a *cooking* string, not a shopping one: 62% of
 * the 2,991 ingredient lines carry prep instructions inline ("garlic, minced",
 * "radishes (with greens), thinly sliced, greens rinsed well"), and 1,293 of
 * the 1,603 distinct strings occur exactly once. Rendering that verbatim gives
 * a shopping list rows 128 characters long, and makes two recipes that both
 * want parmesan look like two unrelated things.
 *
 * Two different jobs, so two functions:
 *
 *   shoppingName()  — conservative. For display. Drops prep and packaging
 *                     noise but never a word that changes what you'd buy, so
 *                     "ground beef" and "red onion" survive intact.
 *   canonicalItem() — aggressive. For matching (pantry, dedup). Folds
 *                     everything to a lowercase identity, so "Kosher salt"
 *                     and "coarse salt" are one thing.
 *
 * Measured over the catalog: shoppingName() takes the mean length of a distinct
 * item from 27.3 to 13.8 chars, and the number over 40 chars from 298 to 14
 * (the worst single row, 128 chars, comes out at 25). canonicalItem() collapses
 * 1,603 distinct strings to 808, of which 252 account for 80% of all 2,991
 * ingredient lines.
 */

// Participles that describe what you do to an ingredient after buying it.
// Only ever stripped in trailing position — "cut" leading is part of a name
// ("cut oats"), "cut into 1-inch pieces" trailing is not.
const TRAILING_PREP = [
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'melted',
  'softened', 'beaten', 'peeled', 'deveined', 'seeded', 'rinsed', 'drained',
  'crushed', 'cubed', 'halved', 'quartered', 'julienned', 'zested', 'juiced',
  'toasted', 'trimmed', 'separated', 'cleaned', 'cored', 'stemmed', 'pitted',
  'thawed', 'warmed', 'cooled', 'packed', 'sifted', 'cut', 'torn', 'broken',
  'discarded',
].join('|')

// Leading words that never change what goes in the basket. Deliberately does
// NOT include "ground": "ground cinnamon" is a fine thing to shop for and
// "ground beef" is emphatically not the same purchase as "beef".
const LEADING_FLUFF = [
  '(?:best|good)[- ]quality', 'fresh', 'freshly', 'finely', 'thinly',
  'roughly', 'coarsely', 'large', 'medium', 'small', 'extra',
].join('|')

// Notes aimed at the cook mid-recipe rather than at the shopper.
const ASIDES = /\b(for (?:serving|garnish|brushing|drizzling|dusting|frying)|to taste|plus more.*|divided|optional|(?:at )?room temperature)\b/gi

const TRAILING_PREP_RE = new RegExp(`\\b(?:${TRAILING_PREP})\\b\\s*$`, 'i')
const LEADING_FLUFF_RE = new RegExp(`^(?:${LEADING_FLUFF})\\s+`, 'i')

/**
 * The name to show when the user is standing in a shop.
 *
 * Keeps the original casing and any distinguishing adjective; drops the prep,
 * the parentheticals and the alternatives after the first clause. Falls back
 * to the input if the rules would leave nothing behind.
 */
export function shoppingName(raw) {
  if (!raw) return ''
  const original = String(raw).trim()

  let s = original
    .replace(/\s*\([^)]*\)/g, '')  // "(about 10 cups)"
    .split(/[,;]/)[0]              // head clause only: "leeks, white parts only" -> "leeks"
    .replace(ASIDES, '')
    .replace(TRAILING_PREP_RE, '')
    .replace(LEADING_FLUFF_RE, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-.\s·]+|[-.\s·]+$/g, '')

  // A handful of catalog rows are malformed (a recipe note that leaked into the
  // item field). Better to show the raw string than an empty row.
  return s || original
}

// Deeper prep and product-state words, stripped only for matching. "unsalted
// butter" is a real shopping distinction but the same pantry slot as butter.
const MATCH_ONLY_PREP = [
  // "ground" collapses for spices (ground cinnamon *is* cinnamon) but not for
  // meat, where it's the cut: ground beef and beef are not one pantry slot.
  'ground\\b(?!\\s+(?:beef|pork|lamb|turkey|chicken|veal|sausage|meat))',
  'mixed', 'whole', 'ripe', 'dried', 'frozen', 'canned', 'cooked', 'boiling',
  'raw', 'hot', 'cold', 'warm', 'lukewarm', 'boneless', 'skinless', 'unsalted',
  'salted', 'low-fat', 'fat-free', 'nonfat', 'whole-milk', 'reduced-fat',
  'light', 'dark', 'sweet', 'plain', 'pickled',
].join('|')

// Packaging and counting words: you own "garlic", not "3 cloves garlic". The
// leading-number branch is for user-typed recipes — the catalog keeps amounts
// in `ing.amount`, but nothing stops someone writing "3 cloves garlic".
const CONTAINERS = /^(?:[\d\s/¼½¾⅓⅔⅛-]*\s*)?(?:cans?|jars?|packages?|pkgs?|bunch(?:es)?|heads?|sticks?|sprigs?|stalks?|slices?|cloves?|pieces?)\s+/i

const MATCH_PREP_RE = new RegExp(`\\b(?:${TRAILING_PREP}|${MATCH_ONLY_PREP})\\b`, 'gi')

/**
 * Synonyms the rules above can't reach, because the difference is vocabulary
 * rather than grammar. Hand-written and deliberately small — every entry here
 * is a judgement call about two names being the same kitchen item.
 */
export const INGREDIENT_ALIASES = {
  'kosher salt': 'salt', 'coarse salt': 'salt', 'sea salt': 'salt',
  'table salt': 'salt', 'flaky salt': 'salt',
  'black pepper': 'pepper', 'white pepper': 'pepper', 'peppercorn': 'pepper',
  'extra-virgin olive oil': 'olive oil', 'virgin olive oil': 'olive oil',
  'egg white': 'egg', 'egg yolk': 'egg',
  'granulated sugar': 'sugar', 'white sugar': 'sugar', 'caster sugar': 'sugar',
  'all purpose flour': 'all-purpose flour', 'plain flour': 'all-purpose flour',
  'parmigiano-reggiano': 'parmesan', 'parmesan cheese': 'parmesan',
  'parmigiano': 'parmesan',
  'garlic clove': 'garlic',
  'scallion': 'green onion', 'spring onion': 'green onion',
  'coriander leaves': 'cilantro',
  'yellow onion': 'onion', 'white onion': 'onion',
  'vegetable oil': 'neutral oil', 'canola oil': 'neutral oil',
  'sunflower oil': 'neutral oil',
}

// The -ves plurals can't be a rule: leaves -> leaf, but olives -> olive, not
// "olif". Only the words that actually appear in recipes are listed.
const IRREGULAR_PLURALS = {
  leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife',
}

/**
 * Own-property lookup. The tables below are plain objects, so a user recipe
 * with an ingredient typed as "constructor" or "toString" would otherwise get
 * back an inherited function instead of a name.
 */
function lookup(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

/** Crude singulariser — enough for ingredient nouns, no dictionary needed. */
function singularizeWord(w) {
  // Guard is 3, not 4: "eggs" has to reach "egg".
  if (w.length <= 3) return w
  const irregular = lookup(IRREGULAR_PLURALS, w)
  if (irregular)                 return irregular
  if (/ies$/.test(w))            return w.replace(/ies$/, 'y')
  if (/oes$/.test(w))            return w.replace(/oes$/, 'o')   // tomatoes, potatoes
  if (/(ch|sh|ss|x)es$/.test(w)) return w.replace(/es$/, '')
  if (/[^su]s$/.test(w))         return w.replace(/s$/, '')
  return w
}

/**
 * Only the head noun is pluralised, and it's last: "bay leaves" -> "bay leaf".
 * Singularising the whole phrase would miss the irregular map, which is keyed
 * by single words.
 */
function singularize(s) {
  const at = s.lastIndexOf(' ')
  if (at === -1) return singularizeWord(s)
  return s.slice(0, at + 1) + singularizeWord(s.slice(at + 1))
}

/**
 * The identity two ingredient strings share when they mean the same item.
 *
 * Used for pantry matching and cross-recipe dedup — never for display, since
 * it lowercases and throws away distinctions a shopper cares about.
 */
export function canonicalItem(raw) {
  if (!raw) return ''
  let s = shoppingName(raw).toLowerCase()
    .replace(MATCH_PREP_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(CONTAINERS, '')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')

  const direct = lookup(INGREDIENT_ALIASES, s)
  if (direct) return direct
  const sing = singularize(s)
  return lookup(INGREDIENT_ALIASES, sing) || sing
}

/**
 * Things a recipe lists but nobody buys.
 *
 * Water is the clear case: it appears in 64 ingredient lines, and a shopping
 * list that tells you to buy water is noise. It stays in the recipe view,
 * where the quantity genuinely matters — a dough needs 1/4 cup, not "some".
 *
 * Matched on the canonical name and never on a substring, because "coconut
 * water" and "water crackers" are real purchases. canonicalItem() keeps those
 * distinct from plain water, which is precisely why the two-function split
 * upstream exists.
 */
const NEVER_SHOPPED = new Set(['water', 'ice water', 'ice'])

/** True for an ingredient that shouldn't take up a row on a shopping list. */
export function isNeverShopped(raw) {
  return NEVER_SHOPPED.has(canonicalItem(raw))
}
