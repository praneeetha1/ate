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
 * item from 26.8 to 14.2 chars, and the number over 40 chars from 419 to 23.
 * canonicalItem() collapses 2,516 distinct strings to 1,256, of which 359
 * account for 80% of all 4,709 ingredient lines.
 *
 * canonicalItem() also carries an Indian vocabulary — the Hindi names, the
 * British spellings, and "X powder" where this catalog writes "ground X" —
 * because the same jar is written three ways and a pantry that treats those as
 * three slots is a pantry nobody keeps up to date.
 */

// Participles that describe what you do to an ingredient after buying it.
// Only ever stripped in trailing position — "cut" leading is part of a name
// ("cut oats"), "cut into 1-inch pieces" trailing is not.
const TRAILING_PREP_WORDS = [
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'melted',
  'softened', 'beaten', 'peeled', 'deveined', 'seeded', 'rinsed', 'drained',
  'crushed', 'cubed', 'halved', 'quartered', 'julienned', 'zested', 'juiced',
  'toasted', 'trimmed', 'separated', 'cleaned', 'cored', 'stemmed', 'pitted',
  'thawed', 'warmed', 'cooled', 'packed', 'sifted', 'cut', 'torn', 'broken',
  'discarded',
]
const TRAILING_PREP = TRAILING_PREP_WORDS.join('|')

// Leading words that never change what goes in the basket. Deliberately does
// NOT include "ground": "ground cinnamon" is a fine thing to shop for and
// "ground beef" is emphatically not the same purchase as "beef".
const LEADING_FLUFF_WORDS = [
  'fresh', 'freshly', 'finely', 'thinly',
  'roughly', 'coarsely', 'large', 'medium', 'small', 'extra',
]
// The "-sized" forms come first: alternation is ordered, and a bare "medium"
// would match "medium sized onion" and leave a stranded "sized".
const LEADING_FLUFF = [
  '(?:best|good)[- ]quality',
  '(?:medium|large|small)[- ]sized',
  ...LEADING_FLUFF_WORDS,
].join('|')

// Notes aimed at the cook mid-recipe rather than at the shopper.
const ASIDES = /\b(for (?:serving|garnish(?:ing)?|brushing|drizzling|dusting|greasing|decorating|(?:deep[- ]|shallow[- ]|pan[- ])?frying)|to taste|plus more.*|such as.*|divided|optional|(?:at )?room temperature)\b/gi

/**
 * A quantity written as prose instead of a number.
 *
 * "A few drops rosewater", "About 500 ml vegetable oil", "a medium sized
 * onion". These reach the item field because there's no numeral for an
 * importer to lift into `amount`, so without this they become pantry rows
 * and suggestion entries in their own right.
 */
const PROSE_QUANTITY =
  /^(?:(?:a few|a couple(?: of)?|about|approximately|around|some|enough|an?)\s+)+(?:\d+(?:\.\d+)?\s*)?/i

// A measure left stranded at the front once the prose quantity came off, as
// in "A few drops rosewater" -> "drops rosewater".
const LEADING_MEASURE =
  /^(?:ml|l|g|kg|oz|lb|cups?|tsps?|tbsps?|teaspoons?|tablespoons?|drops?|strands?|pinch(?:es)?|dash(?:es)?|handfuls?|sprigs?|cloves?|slices?|pieces?)\s+/i

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

  // Trimmed first because every clause after the head one arrives with the
  // space that followed its comma, and the rules below are anchored at ^.
  const tidy = t => t
    .trim()
    .replace(ASIDES, '')
    .replace(PROSE_QUANTITY, '')
    .replace(LEADING_MEASURE, '')
    .replace(/^of\s+/i, '')
    .replace(TRAILING_PREP_RE, '')
    .replace(LEADING_FLUFF_RE, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-.,;\s·]+|[-.,;\s·]+$/g, '')

  const whole = original.replace(/\s*\([^)]*\)/g, '')  // "(about 10 cups)"

  /**
   * The first clause that actually names something.
   *
   * Normally that's the head clause: "leeks, white parts only" -> "leeks".
   * But a line can lead with modifiers — "skinless, boneless chicken thighs"
   * — and stopping at "skinless" shops for nothing, then matches nothing once
   * canonicalItem() strips it too. Walking on to the next clause reaches the
   * chicken. Keeping the whole string instead (which is what this did first)
   * left a stranded leading comma the moment the modifiers came back out.
   */
  const clauses = whole.split(/[,;]/)
  let s = ''
  for (const clause of clauses) {
    const t = tidy(clause)
    if (t && !isAllModifiers(t)) { s = t; break }
  }
  if (!s) s = tidy(clauses[0]) || tidy(whole)

  // A handful of catalog rows are malformed (a recipe note that leaked into the
  // item field). Better to show the raw string than an empty row.
  return s || original
}

// Deeper prep and product-state words, stripped only for matching. "unsalted
// butter" is a real shopping distinction but the same pantry slot as butter.
const MATCH_ONLY_PREP_WORDS = [
  'mixed', 'whole', 'ripe', 'dried', 'frozen', 'canned', 'cooked', 'boiling',
  'raw', 'hot', 'cold', 'warm', 'lukewarm', 'boneless', 'skinless', 'unsalted',
  'salted', 'low-fat', 'fat-free', 'nonfat', 'whole-milk', 'reduced-fat',
  'light', 'dark', 'sweet', 'plain', 'pickled', 'uncooked',
]
const MATCH_ONLY_PREP = [
  // "ground" collapses for spices (ground cinnamon *is* cinnamon) but not for
  // meat, where it's the cut: ground beef and beef are not one pantry slot.
  'ground\\b(?!\\s+(?:beef|pork|lamb|turkey|chicken|veal|sausage|meat))',
  ...MATCH_ONLY_PREP_WORDS,
].join('|')

/**
 * Every word that only ever qualifies an ingredient and never names one.
 *
 * Lets shoppingName() notice a head clause with no noun in it — "skinless,
 * boneless chicken thighs" splits to "skinless", which would shop for nothing
 * and, once the matcher strips it too, match nothing at all.
 */
const MODIFIER_WORDS = new Set([
  ...TRAILING_PREP_WORDS, ...LEADING_FLUFF_WORDS, ...MATCH_ONLY_PREP_WORDS,
  'ground', 'quality', 'best', 'good',
])

function isAllModifiers(s) {
  const words = s.toLowerCase().split(/[\s-]+/).filter(Boolean)
  return words.length > 0 && words.every(w => MODIFIER_WORDS.has(w))
}

// Packaging and counting words: you own "garlic", not "3 cloves garlic". The
// leading-number branch is for user-typed recipes — the catalog keeps amounts
// in `ing.amount`, but nothing stops someone writing "3 cloves garlic".
const CONTAINERS = /^(?:[\d\s/¼½¾⅓⅔⅛-]*\s*)?(?:cans?|jars?|packages?|pkgs?|bunch(?:es)?|heads?|sticks?|sprigs?|stalks?|slices?|cloves?|pieces?)\s+/i

// The leading `(^|[^-\\w])` is a hand-rolled lookbehind: a prep word is only
// stripped when it isn't hyphen-joined to the word before it, so "sun-dried
// tomato" keeps its "dried" (it's a distinct product, and dropping it produced
// the nonsense name "sun tomato") while "dried oregano" still reduces to
// oregano. Written this way rather than with (?<!-) because lookbehind is
// still missing from older Safari.
const MATCH_PREP_RE = new RegExp(`(^|[^-\\w])(?:${TRAILING_PREP}|${MATCH_ONLY_PREP})\\b`, 'gi')

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

  // ── Indian vocabulary ──────────────────────────────────────
  // Whole-string entries only, for names a word-wise substitution would get
  // wrong. "curd" is here rather than in WORD_FORMS because bean curd is tofu,
  // and "methi" because kasuri methi is a different product from the seed.
  'curd': 'yogurt', 'dahi': 'yogurt', 'hung curd': 'yogurt',
  'methi': 'fenugreek', 'methi leaf': 'fenugreek leaf',
  'kasuri methi': 'fenugreek leaf', 'kasoori methi': 'fenugreek leaf',
  'dried fenugreek leaf': 'fenugreek leaf',
  'methi seed': 'fenugreek seed',
  // Amchur *is* dried mango powder — folding it to "mango" would claim a jar
  // of spice and a bowl of fruit are one pantry slot.
  'mango powder': 'amchur', 'dry mango powder': 'amchur', 'amchoor': 'amchur',
  'coriander leaf': 'cilantro', 'dhania leaf': 'cilantro',
  'clarified butter': 'ghee',
  // Bare "oil" is 35 of the imported lines and means whatever neutral oil is
  // to hand — the same slot the catalog already calls neutral oil.
  'oil': 'neutral oil', 'cooking oil': 'neutral oil',
  // Whole cardamom is cardamom. Black cardamom is a different spice and is
  // left alone, which is why these are whole-string keys and not a rule.
  'cardamom pod': 'cardamom', 'green cardamom': 'cardamom',
  'green cardamom pod': 'cardamom',
  // In an Indian recipe "chilli powder" is cayenne, not the American blend of
  // chilli with cumin and oregano. The catalog has two rows of the blend and
  // the imported recipes have 17 of the spice, so this folds to the spice.
  'chili powder': 'red chili powder',
  'chickpea flour': 'gram flour',
  'chapati flour': 'wheat flour',
  'arhar dal': 'toor dal', 'tuvar dal': 'toor dal', 'pigeon pea': 'toor dal',
  'mung dal': 'moong dal',
  'black gram': 'urad dal',
  // Folded towards the English name, not away from it: the catalog already
  // stocks "red lentils", and masoor dal is the same bag.
  'masoor dal': 'red lentil',
  'split chickpea': 'chana dal',
  'chole': 'chickpea', 'chana': 'chickpea', 'garbanzo bean': 'chickpea',
  'basmati': 'basmati rice',
}

/**
 * Spellings and single-word synonyms that name the same ingredient.
 *
 * Applied word-wise rather than through the table above so that a modifier
 * survives: "red capsicum" has to reach "red bell pepper", which a
 * whole-string key on "capsicum" would never see. Indian recipe writing mixes
 * British spellings, Hindi names and English ones freely — often inside a
 * single ingredient list — so "haldi", "turmeric powder" and "turmeric" all
 * have to land on one pantry slot.
 *
 * Plurals map straight to the singular, because singularizeWord() below is a
 * suffix rule and turns "chillies" into "chilly" rather than "chilli".
 */
const WORD_FORMS = {
  chilli: 'chili', chillies: 'chili', chilies: 'chili', chillis: 'chili',
  chile: 'chili', chiles: 'chili',
  yoghurt: 'yogurt',
  capsicum: 'bell pepper',
  brinjal: 'eggplant', aubergine: 'eggplant',
  bhindi: 'okra', okro: 'okra',
  courgette: 'zucchini',
  haldi: 'turmeric',
  jeera: 'cumin',
  dhania: 'coriander',
  hing: 'asafoetida',
  elaichi: 'cardamom',
  dalchini: 'cinnamon',
  laung: 'clove',
  saunf: 'fennel',
  ajwain: 'carom',
  kalonji: 'nigella',
  imli: 'tamarind',
  gur: 'jaggery', gud: 'jaggery',
  besan: 'gram flour',
  atta: 'wheat flour',
  maida: 'all-purpose flour',
  rava: 'semolina', sooji: 'semolina', suji: 'semolina', rawa: 'semolina',
  poha: 'flattened rice',
  rajma: 'kidney bean',
  nariyal: 'coconut',
  adrak: 'ginger',
  lehsun: 'garlic', lasun: 'garlic',
  pyaz: 'onion', pyaaz: 'onion',
  tamatar: 'tomato',
  aloo: 'potato',
  palak: 'spinach',
  gobi: 'cauliflower',
  matar: 'green pea', mutter: 'green pea',
  malai: 'cream',
}

const WORD_FORMS_RE = new RegExp(`\\b(?:${Object.keys(WORD_FORMS).join('|')})\\b`, 'gi')

/**
 * Spices whose ground form is the same jar as the spice itself.
 *
 * An allowlist and not a rule, because "X powder" usually is *not* X: garlic
 * powder is not garlic, milk powder is not milk, and baking powder is not
 * baking anything. Needed because Indian recipes write "cumin powder" where
 * the existing catalog writes "ground cumin" — which MATCH_ONLY_PREP already
 * folds to "cumin", so without this the same jar had two pantry slots.
 *
 * Whole spices are deliberately left out: cumin seeds for tempering and cumin
 * powder for the masala are two things to own, and a kitchen can be out of one
 * while holding the other.
 */
const POWDER_IS_THE_SPICE = [
  'cumin', 'coriander', 'turmeric', 'cardamom', 'cinnamon', 'clove',
  'fennel', 'fenugreek', 'nutmeg', 'mace', 'pepper', 'asafoetida',
].join('|')

const SPICE_POWDER_RE = new RegExp(`^(${POWDER_IS_THE_SPICE})\\s+powder$`, 'i')

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
    .replace(MATCH_PREP_RE, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(CONTAINERS, '')
    // CONTAINERS takes the count with it — "3 cloves of garlic" -> "of
    // garlic" — so the linking word has to come off on this side too, after
    // it rather than before.
    .replace(/^of\s+/, '')
    .replace(/^[-.,;\s]+|[-.,;\s]+$/g, '')

  // "Kosher salt and freshly ground black pepper" and nine other phrasings all
  // mean the same two staples. Folding them here rather than adding ten alias
  // entries also stops the pantry offering to track each variant separately.
  // Peppercorns are pepper. Done as a substitution rather than alias entries
  // because the catalogue writes it several ways ("whole black peppercorns",
  // "cracked black peppercorn") and each would otherwise need its own row.
  s = s.replace(/\bpeppercorns?\b/g, 'pepper')

  // Anchored at the end so "salt and pepper shrimp" stays its own item.
  if (/\bsalt\b[^,]*\band\b[^,]*\bpepper$/.test(s)) return 'salt and pepper'

  // Removing a prep word from the middle of a compound leaves the hyphen
  // stranded — "sun-dried tomato" became "sun- tomato". Only hyphens that now
  // sit against a space are cleaned, so "all-purpose" and "extra-virgin"
  // survive intact.
  s = s.replace(/-\s+|\s+-/g, ' ').replace(/\s+/g, ' ').trim()

  // Spelling and transliteration before the tables, so every rule and alias
  // below can be written in one vocabulary instead of once per spelling.
  s = s.replace(WORD_FORMS_RE, w => lookup(WORD_FORMS, w.toLowerCase()) ?? w)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(SPICE_POWDER_RE, '$1')

  // Stripping can leave nothing at all when the name was only modifiers. An
  // empty identity is worse than a rough one: it matches no pantry row and no
  // other recipe, so the ingredient quietly stops existing. Keep the
  // unstripped name instead.
  if (!s) s = shoppingName(raw).toLowerCase().trim()
  if (!s) return ''

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

/**
 * Items assumed to be in the kitchen unless the user says otherwise.
 *
 * These cover 1,619 of the catalog's 4,709 ingredient lines — 34% — so
 * treating them as present by default removes most of the work from keeping a
 * pantry up to date. Nobody wants to tick off "salt" or "water".
 * After this, the median recipe has just 6 items worth tracking.
 *
 * Canonical names, so they compare against canonicalItem() output directly.
 */
export const PANTRY_STAPLES = new Set([
  'salt', 'pepper', 'salt and pepper', 'water', 'ice',
  'olive oil', 'neutral oil', 'butter', 'ghee',
  'sugar', 'brown sugar', 'all-purpose flour', 'cornstarch',
  'egg', 'milk',
  'baking powder', 'baking soda', 'vanilla extract',
  'honey', 'soy sauce', 'vinegar',

  // Ground spices, and the whole ones used for tempering. Shelf-stable, bought
  // once a year, and present in any kitchen that cooks Indian food at all — the
  // same profile as salt, so the same treatment. Assuming them matters more
  // here than it looks: a biryani lists a dozen, and with none of them assumed
  // every Indian recipe reads as "missing 14 things" and sinks to the bottom
  // of the closest-first ranking for good, whatever is actually in the kitchen.
  'turmeric', 'cumin', 'coriander', 'red chili powder', 'garam masala',
  'cumin seed', 'mustard seed', 'bay leaf', 'cinnamon', 'cardamom', 'clove',
  'red chili',
])

/** True for an item the pantry assumes you have without being told. */
export function isStaple(raw) {
  return PANTRY_STAPLES.has(canonicalItem(raw))
}

/** The distinct canonical items a recipe calls for. */
export function canonicalItems(recipe) {
  const out = new Set()
  for (const ing of recipe?.ingredients || []) {
    const c = canonicalItem(ing.item)
    if (c) out.add(c)
  }
  return [...out]
}

/**
 * Whether a recipe's canonical ingredients include the one picked.
 *
 * Matched at word boundaries, which is the whole point: a plain `includes()`
 * let "egg" match a recipe whose only qualifying ingredient was "chopped
 * veggies", and "pepper" match "peppermint oil" — both real catalog rows. The
 * boundaries cost nothing in recall, because "chicken" still reaches "chicken
 * breast" and "chicken thigh": those are separate words.
 *
 * This is why picking a main ingredient can't just compare canonical names.
 * Only 8 recipes list plain "chicken"; the rest say "chicken breast" or
 * "chicken thigh", and an equality test would miss every one of them.
 */
export function matchesIngredient(canonicalIngredients, selected) {
  if (!selected) return true
  // The optional plural is for phrases canonicalItem() can't fully singularise:
  // it only singularises the head noun, which it assumes is last, so "diced
  // tomatoes in juice" keeps its plural and a bare \btomato\b would miss it.
  const escaped = selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const word = new RegExp(`\\b${escaped}(?:e?s)?\\b`)
  return canonicalIngredients.some(c => word.test(c))
}

/**
 * The names worth suggesting for what's been typed so far, best first.
 *
 * Exact match, then names starting with the query, then anything containing
 * it; shorter names win inside a band. The ordering is the point: plain
 * alphabetical with a cap made the obvious answer unreachable, because typing
 * "tomato" filled every slot with "cherry tomato", "grape tomato", "plum
 * tomato"… and never offered "tomato" itself.
 *
 * Capped hard, because these render in a dropdown under the box rather than a
 * scrolling panel — a list long enough to need scrolling is a list nobody
 * reads to the end of.
 */
export function rankSuggestions(names, query, limit = 8, exclude = []) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const skip = new Set(exclude)
  const rank = n => (n === q ? 0 : n.startsWith(q) ? 1 : 2)
  return names
    .filter(n => n.includes(q) && !skip.has(n))
    .sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b))
    .slice(0, limit)
}

/**
 * Ingredients a meal gets built around, for the "must-have" filter.
 *
 * Proteins, pulses, the substantial vegetables and the starchy bases — the
 * answer to "I've got chicken, what can I do with it". Deliberately excludes
 * the aromatics that turn up everywhere: onion is in 84 of the catalog's
 * recipes and garlic in 105, so a chip for either would filter almost nothing
 * out and just take up room in the row.
 *
 * Ordered by kind rather than alphabetically, since the row reads as groups —
 * proteins, then pulses, then vegetables, then bases. Only ever shown for
 * items the cook actually has, so the list being broad costs nothing.
 */
export const MAIN_INGREDIENTS = [
  'chicken', 'shrimp', 'prawn', 'fish', 'salmon', 'cod', 'tuna', 'crab',
  'lamb', 'mutton', 'goat', 'beef', 'ground beef', 'pork', 'bacon',
  'sausage', 'turkey', 'egg', 'paneer', 'tofu',
  'chickpea', 'kidney bean', 'black bean', 'lentil', 'red lentil',
  'toor dal', 'moong dal', 'chana dal', 'urad dal',
  'potato', 'cauliflower', 'eggplant', 'okra', 'mushroom', 'spinach',
  'cabbage', 'pumpkin',
  'rice', 'basmati rice', 'pasta', 'bread',
]
