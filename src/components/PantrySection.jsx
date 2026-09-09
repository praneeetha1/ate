import { useMemo, useRef, useState } from 'react'
import RECIPES from '../data/recipes.json'
import { usePantry } from '../context/PantryContext'
import { PANTRY_STAPLES, canonicalItem, isNeverShopped } from '../utils/ingredients'
import { PANTRY_LABELS } from '../utils/pantry'
import Icon from './Icon'

/**
 * Every ingredient the catalogue knows about, canonically, for the add box's
 * suggestions — 300 recipes reduce to 790 distinct kitchen items.
 *
 * Built on first use, not at module load. App.jsx imports the /pantry route
 * eagerly, so doing this at import cost every cold start ~7ms locally (more on
 * a slow phone) to populate a datalist most sessions never open. Cached after
 * the first call, since the catalogue can't change at runtime.
 */
let cachedItems = null
function knownItems() {
  if (!cachedItems) {
    const seen = new Set()
    for (const r of RECIPES) {
      for (const ing of r.ingredients) {
        if (!ing.item || isNeverShopped(ing.item)) continue
        const c = canonicalItem(ing.item)
        if (c.length > 1) seen.add(c)
      }
    }
    cachedItems = [...seen].sort()
  }
  return cachedItems
}

/**
 * The user's kitchen: the one place it is both read and edited.
 *
 * Recipes only ever *report* pantry state (see PantryMark) — a row that both
 * showed and changed what you had left it unclear which it was doing. All the
 * managing lives here instead: add, change state, stop tracking.
 *
 * Grouped by state rather than listed alphabetically, because the useful
 * questions are "what am I out of" and "what needs restocking", not "do I own
 * oregano".
 */

const GROUPS = [
  { state: 'have', title: 'In your kitchen', chip: 'bg-accent border-ink text-ink' },
  { state: 'low',  title: 'Running low',     chip: 'bg-sun border-ink text-ink' },
  { state: 'out',  title: 'Out',             chip: 'bg-card border-heart text-heart' },
]

/** The same marker shape used on ingredient rows, so the two surfaces agree. */
function StateDot({ state }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid place-items-center w-[15px] h-[15px] rounded-full border-2 border-ink overflow-hidden align-[-3px] ${
        state === 'have' ? 'bg-accent' : 'bg-card'
      }`}
    >
      {state === 'have' && <Icon name="check" size={9} strokeWidth={3} />}
      {state === 'out'  && <Icon name="close" size={8} strokeWidth={3} />}
      {state === 'low'  && <span className="absolute inset-x-0 bottom-0 h-1/2 bg-accent" />}
    </span>
  )
}

export default function PantrySection({ headingId = 'pantry-heading' }) {
  const { pantry, setPantryState, cyclePantry, pantryEnabled, pantryReady } = usePantry()
  const [draft, setDraft] = useState('')
  const [note,  setNote]  = useState('')
  const inputRef = useRef(null)

  /**
   * Adding is only possible here now that recipe rows are read-only, so this
   * box is the pantry's front door and has to accept anything — a name from
   * the catalogue or something the user just bought that no recipe mentions.
   */
  function addItem(e) {
    e.preventDefault()
    const item = canonicalItem(draft)
    if (!item) { inputRef.current?.focus(); return }
    if (isNeverShopped(draft)) {
      setNote('No need to track water.')
      setDraft('')
      return
    }
    if (pantry.has(item)) {
      setNote(`${item} is already on the list.`)
      return
    }
    setPantryState(item, 'have')
    setDraft('')
    setNote('')
    inputRef.current?.focus()
  }

  const grouped = useMemo(() => {
    const out = { have: [], low: [], out: [] }
    for (const [item, state] of pantry.entries()) {
      if (out[state]) out[state].push(item)
    }
    for (const list of Object.values(out)) list.sort()
    return out
  }, [pantry])

  // A staple the user has explicitly contradicted appears in its real group
  // above, so the assumed line must not claim it as well.
  const assumedStaples = useMemo(
    () => [...PANTRY_STAPLES].filter(s => !pantry.has(s)).sort(),
    [pantry],
  )

  if (!pantryEnabled) {
    return (
      <section aria-labelledby={headingId}>
        <Heading id={headingId} />
        <p className="text-center py-[40px] px-5 text-[0.85rem] text-muted italic">
          Sign in to keep track of what’s in your kitchen.
        </p>
      </section>
    )
  }

  const tracked = pantry.size

  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} count={tracked} />

      {!pantryReady ? (
        <p className="px-5 pb-5 text-[0.82rem] text-muted italic">Loading…</p>
      ) : (
        <div className="px-4 pb-4">
          <form onSubmit={addItem} className="flex gap-2 mb-4">
            <input
              ref={inputRef}
              value={draft}
              onChange={e => { setDraft(e.target.value); setNote('') }}
              list="pantry-items"
              placeholder="Add something you have…"
              aria-label="Add an item to your pantry"
              maxLength={80}
              className="flex-1 min-w-0 text-[0.85rem] border-2 border-ink rounded-xl px-3 py-2 bg-card outline-none focus:border-accent text-ink placeholder:text-muted"
            />
            <datalist id="pantry-items">
              {knownItems().map(i => <option key={i} value={i} />)}
            </datalist>
            <button
              type="submit"
              className="bg-accent text-ink border-2 border-ink shadow-pop press rounded-xl px-4 text-[0.8rem] font-bold whitespace-nowrap hover:bg-accent-dk transition-colors"
            >Add</button>
          </form>
          {note && (
            <p role="status" className="text-[0.78rem] text-muted italic mb-3 -mt-2">{note}</p>
          )}

          {tracked === 0 && (
            <p className="text-[0.82rem] text-muted italic border-2 border-dashed border-rim rounded-xl px-4 py-3 mb-3.5">
              Nothing here yet. Add what’s in your kitchen above, then use
              <span className="font-bold not-italic text-ink"> What can I make </span>
              on the home page to see what you’re closest to cooking. Ticking
              things off your shopping list adds them here too.
            </p>
          )}

          {GROUPS.map(({ state, title, chip }) => {
            const items = grouped[state]
            if (!items.length) return null
            return (
              <div key={state} className="mb-3.5 last:mb-0">
                <h3 className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted mb-2 flex items-center gap-1.5">
                  <StateDot state={state} />{title}
                  <span className="text-warm-tan font-normal">({items.length})</span>
                </h3>
                <ul className="flex flex-wrap gap-1.5 list-none">
                  {items.map(item => (
                    // Two sibling buttons styled as one chip. Nesting the
                    // remove control inside the cycle button would make every
                    // tap on it do both things.
                    <li
                      key={item}
                      className={`inline-flex items-center border-2 rounded-full overflow-hidden ${chip}`}
                    >
                      <button
                        type="button"
                        onClick={() => cyclePantry(item)}
                        aria-label={`${item}: ${PANTRY_LABELS[state]}. Change what you have.`}
                        title="Change what you have"
                        className="pl-3 pr-2 py-[3px] text-[0.8rem] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPantryState(item, 'unknown')}
                        aria-label={`Stop tracking ${item}`}
                        title={`Stop tracking ${item}`}
                        className="grid place-items-center w-[19px] h-[19px] mr-1 rounded-full opacity-55 hover:opacity-100 hover:bg-paper transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Icon name="close" size={11} strokeWidth={3} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {assumedStaples.length > 4 && (
            <p className="text-[0.76rem] text-muted mt-3.5 pt-3 border-t border-dashed border-rim">
              <span className="font-bold">Assumed present:</span>{' '}
              {assumedStaples.slice(0, 4).join(', ')} and {assumedStaples.length - 4} other
              {assumedStaples.length - 4 === 1 ? '' : 's'}. Staples aren’t worth
              tracking one by one, so they count as present until you add one
              here and mark it <em className="not-italic font-bold">out</em>.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function Heading({ id, count }) {
  return (
    <div className="flex items-center justify-between px-5 py-[18px] pb-3">
      <h2 id={id} className="font-display text-[1.15rem] font-semibold text-ink flex items-center gap-2">
        <Icon name="fridge" size={19} />Fridge / Pantry
      </h2>
      {count > 0 && <span className="text-[0.72rem] text-muted">{count} tracked</span>}
    </div>
  )
}
