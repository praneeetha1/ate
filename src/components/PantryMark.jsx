import { usePantry } from '../context/PantryContext'
import { canonicalItem, shoppingName, isNeverShopped } from '../utils/ingredients'
import { PANTRY_LABELS } from '../utils/pantry'
import Icon from './Icon'

/**
 * Whether you have one ingredient — read only.
 *
 * Deliberately not a control. Managing the kitchen belongs on the Fridge /
 * Pantry page, where the whole thing is visible at once; a recipe is for
 * deciding what to cook, and a marker that both reported and edited left it
 * unclear which it was doing. So this reports, and nothing else.
 *
 * Renders nothing when nobody is signed in (the pantry is server-backed), and
 * nothing for water or ice, which aren't things anyone tracks.
 */
export default function PantryMark({ item, className = '' }) {
  const { pantry, pantryState, pantryEnabled } = usePantry()

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
    state === 'have' ? 'bg-accent text-ink border-ink' :
    state === 'out'  ? 'bg-card text-heart border-heart' :
    state === 'low'  ? 'bg-card text-ink border-ink' :
                       'bg-card border-rim'

  return (
    <span
      // role="img" with a label: a screen reader should read the state once,
      // not announce a button that can't usefully be pressed.
      role="img"
      aria-label={`${name}: ${PANTRY_LABELS[state]}`}
      title={PANTRY_LABELS[state]}
      className={`relative shrink-0 w-[19px] h-[19px] rounded-full border-2
        grid place-items-center overflow-hidden
        ${fill} ${assumed ? 'opacity-45' : ''} ${className}`}
    >
      {state === 'have' && <Icon name="check" size={11} strokeWidth={3} />}
      {state === 'out'  && <Icon name="close" size={10} strokeWidth={3} />}
      {state === 'low'  && <span className="absolute inset-x-0 bottom-0 h-1/2 bg-accent" />}
      {/* `unknown` stays an empty outline. It holds the row's alignment and
          reads as "not tracked", which is a different claim from "you don't
          have this". */}
    </span>
  )
}
