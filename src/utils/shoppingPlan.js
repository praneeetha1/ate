import { shoppableIngredients } from './shopping'
import { lineId } from './registry'
import { shoppingName } from './ingredients'
import { keyToText } from './recipe'

/**
 * What adding a recipe to the shopping list would do, as rows you can review.
 *
 * Built on the shared readiness result (evaluateRecipe), so the sheet agrees
 * with the summary above the ingredient list. Sections, and whether a row
 * starts ticked:
 *   buy       not in your pantry                     ticked
 *   low       you have it, running low                not ticked
 *   optional  the recipe says optional                not ticked
 *   assumed   a staple we assume you keep (salt, oil) not ticked
 *   pantry    you said you have it                    shown, never added
 * Water and other non-purchases never appear.
 */
const SECTION = { missing: 'buy', low: 'low', optional: 'optional', assumed: 'assumed', have: 'pantry' }

/** The recipe lines to shop for one need, with `chosen` standing in where the recipe allows it. */
function linesFor(recipe, need, chosen) {
  return need.lines.map(idx => {
    const ing = recipe.ingredients[idx]
    if (chosen === lineId(ing)) return ing
    // A listed alternative ("sour cream or yogurt") takes the same amount.
    if ((ing.alternatives || []).includes(chosen)) return { ...ing, id: chosen, item: chosen }
    // An extra need riding on the line ("salt and pepper") has no amount of its own.
    return { amount: '', unit: '', item: chosen, id: chosen }
  })
}

export function planShopping(recipe, scale, evaluation, shoppingItems, recipeKey) {
  const key = keyToText(recipeKey)
  const rows = evaluation.needs.map(need => {
    const section = SECTION[need.status] ?? 'buy'
    const chosen = need.chosen ?? need.id
    const [entry] = shoppableIngredients({ ingredients: linesFor(recipe, need, chosen) }, scale)
    const onList = shoppingItems.get(chosen)
    const others = onList && !onList.checked
      ? [...new Set(onList.sources.filter(s => s.key !== key).map(s => s.name || 'something you added'))]
      : []
    return {
      id: need.id,
      need,
      section,
      checked: section === 'buy',
      options: need.options,
      chosen,
      name: need.lines.length && chosen === lineId(recipe.ingredients[need.lines[0]])
        ? shoppingName(recipe.ingredients[need.lines[0]].item) || chosen
        : chosen,
      measure: entry ? [entry.amount, entry.unit].filter(Boolean).join(' ') : '',
      alsoOnListFor: others,
    }
  })
  // Worth asking only when there's a real choice: a low item, an optional one,
  // or "this or that". Otherwise the one-tap add is the honest default.
  const needsSheet = rows.some(r =>
    r.section === 'low' || r.section === 'optional' || (r.section === 'buy' && r.options.length > 1))
  return { rows, needsSheet }
}

/** Shopping entries for the ticked rows, each at its chosen option and the picked servings. */
export function entriesFor(recipe, rows, scale) {
  const picked = rows.filter(r => r.checked && r.section !== 'pantry')
  return shoppableIngredients({ ingredients: picked.flatMap(r => linesFor(recipe, r.need, r.chosen)) }, scale)
}
