/**
 * Checking a recipe's dietary badges against its own ingredients.
 *
 * A wrong badge is the most serious kind of bug this app can ship: someone who
 * doesn't eat meat trusts the label and doesn't reread the list. The catalog
 * had three — "Baja fish tacos" carried a vegetarian badge over a halibut
 * fillet, a potato casserole over chicken broth, and a pilau declared both
 * vegetarian and vegan over 250 g of minced lamb.
 *
 * These are conservative, evidence-based rules over the ingredient text, which
 * is what review point 20 asks for ("tag diet by reviewed ingredient rules,
 * not just category"). They are a safety net for obvious contradictions, not a
 * certifier: they cannot see that a stock cube is beef, so a clean result
 * means "nothing obviously wrong", never "verified".
 */

const rx = w => new RegExp(`\\b(${w.join('|')})\\b`, 'i')

const MEAT = rx([
  'chicken', 'mutton', 'lamb', 'beef', 'pork', 'bacon', 'ham', 'sausages?', 'turkey', 'duck',
  'veal', 'goat', 'venison', 'prawns?', 'shrimps?', 'fish', 'salmon', 'tuna', 'cod', 'tilapia',
  'halibut', 'haddock', 'mackerel', 'sardines?', 'trout', 'bass', 'snapper', 'pollock', 'catfish',
  'herring', 'eel', 'octopus', 'squid', 'scallops?', 'anchov(y|ies)', 'crab', 'lobster', 'oysters?',
  'clams?', 'mussels?', 'gelatin', 'lard', 'steak', 'keema', 'mince', 'pepperoni', 'chorizo',
  'salami', 'pancetta', 'prosciutto', 'meat', 'fish sauce', 'worcestershire', 'oyster sauce',
])
const DAIRY = rx([
  'milk', 'butter', 'cream', 'cheese', 'paneer', 'yogh?urt', 'curd', 'ghee', 'khoya', 'malai',
  'buttermilk', 'neufchatel', 'mascarpone', 'ricotta', 'custard',
])
const EGG   = rx(['eggs?', 'egg whites?', 'egg yolks?', 'mayonnaise', 'mayo'])
const HONEY = rx(['honey'])
const GLUTEN = rx([
  'flour', 'atta', 'maida', 'breadcrumbs?', 'panko', 'pasta', 'noodles?', 'semolina', 'sooji',
  'rava', 'barley', 'rye', 'couscous', 'soy sauce', 'spaghetti', 'macaroni', 'tortillas?',
  'wheat', 'seitan', 'beer', 'phyllo', 'filo',
])

/**
 * Phrases stripped before matching, because the plain word inside them means
 * something else — an eggplant is not an egg, coconut milk is not dairy.
 *
 * Stripped first rather than used to veto a line: testing the raw text let
 * "or imitation meat" at the end of the pilau's ingredient cancel the very
 * real "250 g minced meat" at its start.
 */
const INNOCENT = new RegExp(
  '\\b(coconut milk|almond milk|soy milk|oat milk|cashew milk|peanut butter|butter beans?|' +
  'butternut|cocoa butter|nut butter|almond butter|eggplants?|eggless|almond flour|rice flour|' +
  'corn ?flour|chickpea flour|gram flour|besan|coconut flour|tapioca flour|buckwheat|' +
  'gluten[- ]free|cornstarch|rice noodles?|vegetable broth|veg(etable)? stock|imitation meat|' +
  'mock meat|meatless|meat[- ]free|fishless)\\b', 'gi')

const clean = s => String(s || '').replace(INNOCENT, ' ')

/**
 * Every dietary badge this recipe claims that its ingredients contradict.
 *
 * Returns [{ claim, evidence }]; empty means nothing obvious is wrong.
 *
 * The name is checked for meat as well as the ingredients — "Baja fish tacos"
 * says what it is in the title. Gluten and dairy are checked in the
 * ingredients only: "Idli (Steamed Rice and Black Gram Bread)" and "Dhokla
 * (Steamed Black Gram Bread)" are both gluten-free, and scanning their names
 * flagged the word "Bread" in a description of what the dish resembles.
 */
export function dietContradictions(recipe) {
  const diet = recipe?.dietary || []
  if (!diet.length) return []

  const items = (recipe.ingredients || []).map(i => i?.item || '')
  const found = []
  const add = (claim, evidence) => {
    if (!found.some(f => f.claim === claim)) found.push({ claim, evidence: evidence.trim().slice(0, 80) })
  }

  for (const raw of [...items, recipe.name || '']) {
    const isName = raw === recipe.name
    const s = clean(raw)
    if (MEAT.test(s)) {
      if (diet.includes('vegetarian')) add('vegetarian', raw)
      if (diet.includes('vegan'))      add('vegan', raw)
    }
    if (isName) continue          // name is evidence of meat only, never of dairy or gluten
    if (diet.includes('vegan') && (DAIRY.test(s) || EGG.test(s) || HONEY.test(s))) add('vegan', raw)
    if (diet.includes('gluten-free') && GLUTEN.test(s)) add('gluten-free', raw)
  }
  return found
}
