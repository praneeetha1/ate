import { usePantry } from '../context/PantryContext'
import { canonicalItem, shoppingName, isNeverShopped } from '../utils/ingredients'
import { PANTRY_LABELS } from '../utils/pantry'
import Icon from './Icon'

/**
 * The have / low / out marker on one ingredient row.
 *
 * Sits at the end of the row it describes — the cheapest place to record
 * pantry state is the ingredient list the user is already reading to decide
 * whether to cook something, so the control lives there rather than on a
 * separate screen you'd have to remember to visit.
 *
 * Renders nothing at all when nobody is signed in: the pantry is server-backed
 * (see PantryContext), so for a guest this would be a button that silently
 * does nothing.
 */
export default function PantryMark({ item, className = '' }) {
  const { pantry, pantryState, cyclePantry, pantryEnabled } = usePantry()

  // No dot on water or ice: offering to track something nobody buys is the
  // same clutter the shopping list already drops.
  if (!pantryEnabled || isNeverShopped(item)) return null

  const state = pantryState(item)
  // The short name, not the recipe's prep text: a screen reader announcing
  // "pecorino, grated, thinly sliced: not tracked" buries the useful half.
  const name = shoppingName(item)

  // A staple reads as `have` without the user having said so. Showing that at
  // full strength would claim knowledge we don't have, so an assumed state is
  // dimmed and an explicit one isn't.
  const assumed = state !== 'unknown' && !pantry.has(canonicalItem(item))

  const fill =
    state === 'have' ? 'bg-accent text-ink' :
    state === 'out'  ? 'bg-card text-heart' :
    state === 'low'  ? 'bg-card text-ink'   :
                       'bg-card text-warm-tan'

  return (
    <button
      type="button"
      onClick={() => cyclePantry(item)}
      // Not aria-pressed: that's a two-state idiom and this has four, so the
      // current one is spelled out instead.
      aria-label={`${name}: ${PANTRY_LABELS[state]}. Change what you have.`}
      title={`In your kitchen: ${PANTRY_LABELS[state]}`}
      className={`relative shrink-0 w-[19px] h-[19px] rounded-full border-2 border-ink
        flex items-center justify-center overflow-hidden transition-all
        hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
        ${fill} ${assumed ? 'opacity-45' : ''} ${className}`}
    >
      {state === 'have' && <Icon name="check" size={11} strokeWidth={3} />}
      {state === 'out'  && <Icon name="close" size={10} strokeWidth={3} />}
      {state === 'low'  && <span className="absolute inset-x-0 bottom-0 h-1/2 bg-accent" />}
      {state === 'unknown' && <Icon name="plus" size={10} strokeWidth={3} />}
    </button>
  )
}
