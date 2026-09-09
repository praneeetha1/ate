import Icon from './Icon'

/** How many missing items to name before falling back to a count. */
const NAME_LIMIT = 3

/**
 * A one-line summary of how close a recipe is to cookable.
 *
 * Names the missing items rather than only counting them, because the useful
 * question isn't "how short am I" but "short of what" — "missing pancetta" is
 * a decision you can act on, "missing 1" sends you into the recipe to find out
 * which.
 */
export default function PantryFit({ fit }) {
  if (!fit || !fit.total) return null

  const { missing, low, total } = fit
  const ready = missing.length === 0

  const named = missing.slice(0, NAME_LIMIT).join(', ')
  const rest  = missing.length - NAME_LIMIT

  return (
    <p
      className={`text-[0.72rem] border border-t-0 border-ink rounded-b-xl px-4 py-1.5 font-bold -mt-1 ${
        ready ? 'text-accent-dk bg-paper' : 'text-muted bg-card'
      }`}
    >
      {ready ? (
        <>
          <Icon name="check" size={13} className="inline align-[-2px] mr-1" />
          You have all {total}
        </>
      ) : (
        <>
          Missing {missing.length} of {total} — <span className="text-ink">{named}</span>
          {rest > 0 && ` +${rest} more`}
        </>
      )}
      {low.length > 0 && (
        <span className="text-muted font-normal"> · low on {low.join(', ')}</span>
      )}
    </p>
  )
}
