import { usePantry } from '../context/PantryContext'
import { shoppingName, isNeverShopped } from '../utils/ingredients'
import { PANTRY_LABELS } from '../utils/pantry'
import { Stencil } from './Icon'

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
export default function PantryMark({ item, need, className = '' }) {
  const { pantryState, isAssumed, pantryEnabled } = usePantry()

  if (!pantryEnabled || isNeverShopped(item)) return null

  // From the recipe's evaluation when there is one — it knows about listed
  // alternatives and stand-ins — else from this one ingredient on its own.
  const state = need
    ? (need.status === 'have' || need.status === 'assumed' ? 'have'
      : need.status === 'low' ? 'low' : need.via === 'out' ? 'out' : 'unknown')
    : pantryState(item)
  // The short name, not the recipe's prep text: a screen reader announcing
  // "pecorino, grated, thinly sliced: not tracked" buries the useful half.
  const name = shoppingName(item)

  // A staple reads as `have` without the user having said so. Showing that at
  // full strength would claim knowledge we don't have, so an assumed state is
  // dimmed and an explicit one isn't.
  const assumed = need ? need.status === 'assumed' : isAssumed(item)

  // The drawn dots: full, half, empty. Out is the empty dot with a cross.
  const dot = state === 'have' ? 'dot-have' : state === 'low' ? 'dot-low' : 'dot-empty'

  return (
    <span
      // role="img" with a label: a screen reader should read the state once,
      // not announce a button that can't usefully be pressed.
      role="img"
      aria-label={`${name}: ${PANTRY_LABELS[state]}`}
      title={PANTRY_LABELS[state]}
      className={`relative shrink-0 w-[19px] h-[19px] grid place-items-center
        ${state === 'out' ? 'text-heart' : 'text-ink'} ${assumed ? 'opacity-45' : ''} ${className}`}
    >
      <Stencil file={dot} width={19} height={19} className="absolute inset-0" />
      {state === 'out' && <Stencil file="close" width={10} height={10} className="relative" />}
      {/* `unknown` stays an empty outline. It holds the row's alignment and
          reads as "not tracked", which is a different claim from "you don't
          have this". */}
    </span>
  )
}
