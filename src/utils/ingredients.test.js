import { describe, it, expect } from 'vitest'
import {
  shoppingName, canonicalItem, isNeverShopped, isStaple, varietalHead,
  PANTRY_STAPLES, MAIN_INGREDIENTS, KNOWN_INGREDIENTS,
} from './ingredients'
import RECIPES from '../data/recipes.json'

describe('shoppingName', () => {
  it('drops prep that follows the item', () => {
    expect(shoppingName('garlic, minced')).toBe('garlic')
    expect(shoppingName('fresh parsley, chopped')).toBe('parsley')
    expect(shoppingName('red bell pepper, seeded and finely chopped')).toBe('red bell pepper')
  })

  it('drops parentheticals and cook-facing asides', () => {
    expect(shoppingName('extra-virgin olive oil, for brushing')).toBe('extra-virgin olive oil')
    expect(shoppingName('broccoli (1 bunch ≈ 11/2lbs)')).toBe('broccoli')
    expect(shoppingName('unsalted butter, softened at room temperature')).toBe('unsalted butter')
  })

  it('drops leading words that do not change the purchase', () => {
    expect(shoppingName('medium carrot, julienned')).toBe('carrot')
    expect(shoppingName('large shrimp, peeled, deveined, and tails removed')).toBe('shrimp')
    expect(shoppingName('small red onion, cut into 1/2-inch wedges')).toBe('red onion')
  })

  // The whole point of the conservative/aggressive split: display must never
  // lose a word that changes what you'd put in the basket.
  it('keeps words that DO change the purchase', () => {
    expect(shoppingName('ground beef')).toBe('ground beef')
    expect(shoppingName('red onion')).toBe('red onion')
    expect(shoppingName('whole-milk ricotta cheese')).toBe('whole-milk ricotta cheese')
    expect(shoppingName('pickled jalapeno')).toBe('pickled jalapeno')
  })

  it('collapses the catalog\'s worst rows', () => {
    expect(shoppingName(
      'mixed mushrooms, such as cremini, shiitake, and oyster, trimmed and sliced 1/8-inch thick (about 10 cups)',
    )).toBe('mixed mushrooms')
    expect(shoppingName(
      'medium leeks (about 1 pound), white and pale-green parts only, finely chopped and rinsed well',
    )).toBe('leeks')
  })

  it('falls back to the raw string rather than rendering an empty row', () => {
    expect(shoppingName('chopped')).toBe('chopped')
    expect(shoppingName('')).toBe('')
    expect(shoppingName(null)).toBe('')
  })
})

describe('canonicalItem', () => {
  it('folds salt, oil and sugar synonyms', () => {
    for (const s of ['Kosher salt', 'coarse salt', 'sea salt', 'Salt, to taste']) {
      expect(canonicalItem(s)).toBe('salt')
    }
    expect(canonicalItem('extra-virgin olive oil')).toBe('olive oil')
    expect(canonicalItem('vegetable oil')).toBe('neutral oil')
    expect(canonicalItem('granulated sugar')).toBe('sugar')
  })

  it('folds plurals, egg parts and cheese names', () => {
    expect(canonicalItem('eggs')).toBe('egg')
    expect(canonicalItem('large egg yolk, beaten')).toBe('egg')
    expect(canonicalItem('Parmigiano-Reggiano, grated')).toBe('parmesan')
    expect(canonicalItem('scallions, thinly sliced')).toBe('green onion')
  })

  it('strips packaging and counting words', () => {
    expect(canonicalItem('garlic cloves')).toBe('garlic')
    expect(canonicalItem('3 cloves garlic')).toBe('garlic')
    expect(canonicalItem('1/2 bunch parsley')).toBe('parsley')
    expect(canonicalItem('2 cans whole tomatoes')).toBe('tomato')
  })

  it('collapses "ground" for spices but not for meat', () => {
    expect(canonicalItem('ground cinnamon')).toBe('cinnamon')
    expect(canonicalItem('freshly ground black pepper')).toBe('pepper')
    expect(canonicalItem('ground beef')).toBe('ground beef')
    expect(canonicalItem('ground lamb')).toBe('ground lamb')
  })

  it('singularises without mangling stems', () => {
    expect(canonicalItem('potatoes')).toBe('potato')
    expect(canonicalItem('olives')).toBe('olive')
    expect(canonicalItem('bay leaves')).toBe('bay leaf')
    expect(canonicalItem('berries')).toBe('berry')
  })

  it('treats state differences as the same pantry slot', () => {
    expect(canonicalItem('unsalted butter')).toBe(canonicalItem('butter'))
    expect(canonicalItem('frozen peas')).toBe(canonicalItem('peas'))
    expect(canonicalItem('yellow onion')).toBe(canonicalItem('onion'))
  })
})

describe('salt and pepper', () => {
  // The catalog writes this ten different ways, across 68 lines. Folding them
  // stops the pantry offering to track each phrasing as its own item.
  it('folds every phrasing into one item', () => {
    for (const s of [
      'salt and pepper', 'Kosher salt and freshly ground black pepper',
      'coarse salt and pepper', 'course salt and pepper',
      'salt and freshly ground black pepper', 'salt and black pepper',
      'coarse salt and freshly ground pepper',
    ]) {
      expect(canonicalItem(s)).toBe('salt and pepper')
    }
  })

  it('leaves a dish that merely starts that way alone', () => {
    expect(canonicalItem('salt and pepper shrimp')).toBe('salt and pepper shrimp')
  })
})

describe('isStaple', () => {
  it('covers the things nobody wants to tick off', () => {
    for (const s of ['Kosher salt', 'freshly ground black pepper', 'water',
                     'extra-virgin olive oil', 'vegetable oil', 'eggs',
                     'unsalted butter', 'granulated sugar', 'all-purpose flour',
                     'Kosher salt and freshly ground black pepper']) {
      expect(isStaple(s)).toBe(true)
    }
  })

  it('does not claim the things a recipe is actually about', () => {
    for (const s of ['pecorino', 'guanciale', 'shiitake mushrooms',
                     'heavy cream', 'garlic', 'onion']) {
      expect(isStaple(s)).toBe(false)
    }
  })

  it('is stated in canonical form, so every entry can be reached', () => {
    for (const item of PANTRY_STAPLES) {
      expect(canonicalItem(item)).toBe(item)
    }
  })
})

describe('isNeverShopped', () => {
  it('catches plain water however it is written', () => {
    for (const s of ['water', 'Cold water', 'warm water', 'Boiling water',
                     'lukewarm water', 'water, for glaze', 'Hot water, as needed', 'ice water']) {
      expect(isNeverShopped(s)).toBe(true)
    }
  })

  // The reason canonicalItem() matches whole names and not substrings: these
  // are all things you genuinely put in a basket.
  it('leaves anything you would actually buy alone', () => {
    for (const s of ['coconut water', 'water crackers', 'sparkling water',
                     'rose water', 'chicken broth, or water', 'watercress']) {
      expect(isNeverShopped(s)).toBe(false)
    }
  })
})

/**
 * Indian recipe writing names the same jar three ways — the Hindi word, the
 * British spelling, and "X powder" where this catalog says "ground X" — so
 * these all have to land on one pantry slot or the pantry is useless for half
 * the catalog.
 */
describe('the Indian vocabulary', () => {
  it('folds the Hindi name onto the English one', () => {
    expect(canonicalItem('haldi')).toBe('turmeric')
    expect(canonicalItem('jeera')).toBe('cumin')
    expect(canonicalItem('hing')).toBe('asafoetida')
    expect(canonicalItem('besan')).toBe('gram flour')
    expect(canonicalItem('rajma')).toBe('kidney bean')
    expect(canonicalItem('imli')).toBe('tamarind')
  })

  // Word-wise rather than whole-string, so a modifier survives the swap.
  it('keeps the modifier when substituting a word', () => {
    expect(canonicalItem('red capsicum')).toBe('red bell pepper')
    expect(canonicalItem('green chillies, slit')).toBe('green chili')
  })

  it('treats the British spelling as the same word', () => {
    for (const s of ['green chillies', 'green chilies', 'green chiles']) {
      expect(canonicalItem(s)).toBe('green chili')
    }
    expect(canonicalItem('yoghurt')).toBe('yogurt')
    expect(canonicalItem('brinjal')).toBe('eggplant')
  })

  it('matches "X powder" to the ground spice the catalog already lists', () => {
    expect(canonicalItem('cumin powder')).toBe(canonicalItem('ground cumin'))
    expect(canonicalItem('Turmeric Powder')).toBe('turmeric')
    expect(canonicalItem('dhania powder')).toBe('coriander')
    expect(canonicalItem('asafoetida powder')).toBe('asafoetida')
  })

  /**
   * The reason the powder rule is an allowlist and not a suffix rule: for most
   * of the catalog "X powder" is emphatically not X.
   */
  it('never strips powder from something that is not a spice', () => {
    for (const s of ['baking powder', 'garlic powder', 'onion powder',
                     'cocoa powder', 'milk powder', 'coconut milk powder',
                     'curry powder', 'protein powder']) {
      expect(canonicalItem(s)).toBe(s)
    }
  })

  // Amchur is dried mango powder; a jar of it and a bowl of fruit are not one
  // pantry slot, so this one is aliased rather than left to the powder rule.
  it('keeps mango powder apart from mango', () => {
    expect(canonicalItem('dry mango powder')).toBe('amchur')
    expect(canonicalItem('mango powder')).toBe('amchur')
    expect(canonicalItem('mango')).toBe('mango')
  })

  // Whole spices and ground spices are two things to own: a kitchen can be out
  // of cumin powder while holding a jar of seeds for tempering.
  it('keeps a whole spice apart from its ground form', () => {
    expect(canonicalItem('cumin seeds')).toBe('cumin seed')
    expect(canonicalItem('cumin seeds')).not.toBe(canonicalItem('cumin powder'))
  })

  it('folds the dals, and towards English where the catalog has the word', () => {
    expect(canonicalItem('arhar dal')).toBe('toor dal')
    expect(canonicalItem('masoor dal')).toBe(canonicalItem('red lentils'))
    expect(canonicalItem('chole')).toBe(canonicalItem('chickpeas'))
  })

  // "curd" means yogurt in an Indian recipe but bean curd is tofu, which is
  // why these are whole-string aliases and not word substitutions.
  it('reads curd as yogurt without touching bean curd', () => {
    expect(canonicalItem('curd')).toBe('yogurt')
    expect(canonicalItem('hung curd')).toBe('yogurt')
    expect(canonicalItem('bean curd')).toBe('bean curd')
  })

  it('assumes the spices a kitchen buys once a year', () => {
    for (const s of ['turmeric powder', 'jeera', 'garam masala', 'haldi',
                     'red chilli powder', 'ghee', 'bay leaves', 'elaichi']) {
      expect(isStaple(s)).toBe(true)
    }
  })

  // The optional half. Assuming these would claim a kitchen has things most
  // kitchens genuinely don't.
  it('does not assume the specialist ones', () => {
    for (const s of ['asafoetida', 'curry leaves', 'kasuri methi', 'saffron',
                     'chaat masala', 'paneer', 'toor dal', 'jaggery']) {
      expect(isStaple(s)).toBe(false)
    }
  })
})

/**
 * The imported recipes are CC-BY-SA, which is only satisfied while the
 * attribution travels with them. Losing these fields in a refactor would make
 * the catalog a licence violation rather than a bug, so it's guarded here.
 * See LICENSE-DATA.md.
 */
describe('licensed recipes keep their attribution', () => {
  const licensed = RECIPES.filter(r => r.license)

  it('has the imported recipes, still marked', () => {
    expect(licensed.length).toBeGreaterThan(150)
  })

  it('names a source, a URL and a licence on every one', () => {
    for (const r of licensed) {
      expect(r.source).toBeTruthy()
      expect(r.license).toBe('CC-BY-SA-4.0')
      expect(r.sourceUrl).toMatch(/^https:\/\/en\.wikibooks\.org\/wiki\/Cookbook:/)
    }
  })
})

/**
 * Having the generic answers for the varietal — "I have mushrooms" should
 * satisfy a recipe wanting button mushrooms. Matching only; the shopping list
 * still names the specific thing you'd buy.
 */
describe('varietalHead', () => {
  const head = s => varietalHead(canonicalItem(s))

  // Modifier first, generic last.
  it('folds a cultivar onto its generic', () => {
    expect(head('button mushrooms')).toBe('mushroom')
    expect(head('cremini mushrooms')).toBe('mushroom')
    expect(head('red onion')).toBe('onion')
    expect(head('cherry tomatoes')).toBe('tomato')
  })

  // Generic first, cut last — the opposite order, which is why both ends
  // have to be read.
  it('folds a cut onto its animal', () => {
    expect(head('boneless chicken breast')).toBe('chicken')
    expect(head('chicken thighs')).toBe('chicken')
    expect(head('lamb shoulder')).toBe('lamb')
  })

  /**
   * The trap that makes reading the front unconditionally wrong: these all
   * lead with a generic and none of them is one. Only an actual cut after it
   * licenses the fold.
   */
  it('does not fold a product that merely starts with a generic', () => {
    for (const s of ['tomato sauce', 'tomato paste', 'chicken stock',
                     'chicken broth', 'mushroom soup', 'onion powder']) {
      expect(head(s)).toBe('')
    }
  })

  // Swapping these changes the dish, so they stay exact — the same call
  // canonicalItem() already makes in refusing to fold ground beef into beef.
  it('leaves flours, rices and meat products alone', () => {
    for (const s of ['basmati rice', 'bread flour', 'ground beef',
                     'whole milk', 'pork belly']) {
      expect(head(s)).toBe('')
    }
  })

  it('returns nothing for a generic that is already one word', () => {
    expect(varietalHead('mushroom')).toBe('')
  })
})

/**
 * Prep can stack, and stripping only the last participle used to leave a
 * stranded adverb or connective — which then matched nothing at all.
 */
describe('stacked prep', () => {
  it('strips every trailing prep phrase, not just the last', () => {
    expect(canonicalItem('mushrooms roughly chopped')).toBe('mushroom')
    expect(canonicalItem('mushrooms cleaned and sliced')).toBe('mushroom')
    expect(canonicalItem('onions thinly sliced and rinsed')).toBe('onion')
  })

  it('reaches the item through a quantity fused to its unit', () => {
    expect(canonicalItem('200g mushrooms')).toBe('mushroom')
    expect(canonicalItem('2kg onions')).toBe('onion')
  })

  it('still keeps the words that change the purchase', () => {
    expect(canonicalItem('ground beef')).toBe('ground beef')
    expect(shoppingName('cut oats')).toBe('cut oats')
    expect(canonicalItem('sun-dried tomatoes')).toBe('sun-dried tomato')
  })
})

/**
 * A line offering a substitute is still one thing to buy. Keeping both halves
 * gave a shopping row that read like a sentence and matched no pantry item.
 */
describe('substitutes', () => {
  it('takes the first alternative', () => {
    expect(canonicalItem('paneer or chenna')).toBe('paneer')
    expect(canonicalItem('tomato paste or 4 medium ripe tomatoes')).toBe('tomato paste')
    expect(canonicalItem('active dry yeast OR 1 tsp baking soda')).toBe('active dry yeast')
  })

  // Word-bounded, or every one of these would lose its tail.
  it('leaves words that merely contain "or" alone', () => {
    for (const s of ['orange', 'oregano', 'orange juice', 'cream of tartar']) {
      expect(canonicalItem(s)).toBe(s)
    }
  })
})

/**
 * The suggestion vocabulary used to be built from the catalog alone, so
 * curating it to 33 recipes silently made 37 known ingredients unsearchable —
 * you could tap "paneer" in the quick-add grid but never find it by typing.
 */
describe('KNOWN_INGREDIENTS', () => {
  it('covers everything the app can name, catalog or not', () => {
    const known = new Set(KNOWN_INGREDIENTS)
    for (const i of ['shrimp', 'paneer', 'lamb', 'fish', 'tofu', 'toor dal', 'asafoetida']) {
      expect(known.has(i)).toBe(true)
    }
  })

  it('includes the staples and the mains', () => {
    const known = new Set(KNOWN_INGREDIENTS)
    for (const i of MAIN_INGREDIENTS) expect(known.has(i)).toBe(true)
    for (const i of PANTRY_STAPLES) {
      if (!isNeverShopped(i)) expect(known.has(i)).toBe(true)
    }
  })

  // Suggesting water would only ever lead to "no need to track water".
  it('leaves out what nobody buys', () => {
    for (const i of KNOWN_INGREDIENTS) expect(isNeverShopped(i)).toBe(false)
  })

  // Every entry is its own canonical form, so tapping a suggestion stores
  // exactly what was shown — the same promise the quick-add grid makes.
  it('is canonical throughout', () => {
    for (const i of KNOWN_INGREDIENTS) expect(canonicalItem(i)).toBe(i)
  })
})

// These guard the properties the shopping list and the future pantry rely on,
// across every ingredient line in the catalog rather than hand-picked cases.
describe('the whole catalog', () => {
  const lines = RECIPES.flatMap(r => r.ingredients)

  it('never yields an empty name for a non-empty item', () => {
    const bad = lines.filter(i => i.item && (!shoppingName(i.item) || !canonicalItem(i.item)))
    expect(bad).toEqual([])
  })

  it('shortens rows enough to read in a shop', () => {
    const items = [...new Set(lines.map(i => i.item))]
    const long  = items.filter(i => shoppingName(i).length > 40)
    // 419 of the raw strings exceed 40 chars; what's left is genuinely long
    // product names ("King Arthur Gluten-Free Multi-Purpose Flour") and a
    // handful of imported lines that were written as prose.
    expect(long.length).toBeLessThan(30)
  })

  it('suppresses only water rows from the shopping list', () => {
    const suppressed = lines.filter(i => isNeverShopped(i.item))
    expect(suppressed.length).toBeGreaterThan(40)
    expect(suppressed.every(i => /water|ice/i.test(i.item))).toBe(true)
  })

  // The pantry's whole premise: most of a recipe's lines are staples the user
  // is never asked about, leaving a handful that actually need an answer.
  it('leaves few enough items per recipe to be worth tracking', () => {
    const perRecipe = RECIPES.map(r => {
      const items = new Set(r.ingredients.map(i => canonicalItem(i.item)))
      return [...items].filter(i => !PANTRY_STAPLES.has(i)).length
    })
    const median = perRecipe.sort((a, b) => a - b)[Math.floor(perRecipe.length / 2)]
    expect(median).toBeLessThanOrEqual(8)

    const stapleLines = lines.filter(i => isStaple(i.item)).length
    expect(stapleLines / lines.length).toBeGreaterThan(0.25)
  })

  // Asserted as a ratio, not a count: the catalog grows, and an absolute cap
  // just has to be raised each time, which tests nothing about the collapsing.
  it('collapses the vocabulary enough for pantry matching to be possible', () => {
    const raw   = new Set(lines.map(i => i.item.trim().toLowerCase()))
    const canon = new Set(lines.map(i => canonicalItem(i.item)))
    expect(raw.size).toBeGreaterThan(1500)
    expect(canon.size / raw.size).toBeLessThan(0.55)
  })

  // An item that canonicalises to nothing matches no pantry row and no other
  // recipe, so it silently drops out of every count the pantry reports.
  it('never canonicalises an ingredient down to nothing', () => {
    expect(lines.filter(i => i.item && !canonicalItem(i.item))).toEqual([])
  })
})
