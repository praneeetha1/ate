import { useMemo, useRef, useState } from 'react'
import RECIPES from '../data/recipes.json'
import { usePantry } from '../context/PantryContext'
import { PANTRY_STAPLES, canonicalItem, isNeverShopped } from '../utils/ingredients'
import { PANTRY_LABELS } from '../utils/pantry'
import Icon from './Icon'

/**
 * A quick-tap grid for the household items people almost always have on hand,
 * as an alternative to typing every one into the add box.
 *
 * Deliberately not "the most common catalogue ingredients" — that list is
 * garlic, onion, lemon juice, parmesan… which is really "what recipes call
 * for", not "what's usually in a kitchen". Bread, chicken, and rice barely
 * appear in the catalogue's own ingredient lines (they're often the recipe
 * itself, not an ingredient of it) but are exactly the kind of thing this grid
 * exists for. So this list is hand-picked for real-world commonness, not
 * derived from ingredient frequency.
 *
 * Excludes anything in PANTRY_STAPLES — those are already assumed present,
 * so a tap here would only ever be undoing that assumption for free, which
 * isn't the job of a fast-add grid.
 *
 * Every label is verified (in PantrySection.test.jsx) to be its own
 * canonicalItem() output, so what the user taps is exactly what gets stored —
 * no surprise relabelling between the button and the chip it produces.
 */
const QUICK_ADD_GROUPS = [
  { title: 'Produce',            items: ['garlic', 'onion', 'tomato', 'potato', 'carrot', 'bell pepper', 'spinach', 'cucumber', 'lemon', 'avocado'] },
  { title: 'Dairy & Eggs',       items: ['cheddar cheese', 'mozzarella cheese', 'parmesan', 'yogurt', 'sour cream', 'cream cheese'] },
  { title: 'Meat & Seafood',     items: ['chicken', 'ground beef', 'bacon', 'shrimp'] },
  { title: 'Grains & Bread',     items: ['rice', 'pasta', 'bread', 'tortilla'] },
  { title: 'Herbs & Condiments', items: ['basil', 'cilantro', 'parsley', 'ginger', 'ketchup', 'mustard', 'mayonnaise'] },
]

/**
 * The staples shown as chips, in rough order of how universal they are.
 *
 * Not the whole PANTRY_STAPLES set: water and ice are dropped because you
 * can't run out of tap water, and 'salt and pepper' is dropped because it's a
 * matching artefact for the ten ways the catalogue writes that pair, not a
 * third thing to own alongside salt and pepper.
 */
const SHOWN_STAPLES = [...PANTRY_STAPLES].filter(
  s => !isNeverShopped(s) && s !== 'salt and pepper',
)

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

  /**
   * One tap from the quick-add grid. Purely additive: the tapped item moves up
   * into your kitchen and leaves the grid.
   *
   * Not a toggle, so the grid never doubles as a second display of state. It
   * offers only what you haven't answered for, and the list above is the one
   * place that shows and edits what you have — otherwise the same item sat on
   * screen twice, saying the same thing in two different controls.
   */
  function quickAdd(item) {
    setPantryState(item, 'have')
    setNote('')
  }

  /**
   * The grid minus anything already answered for, so it shrinks as the kitchen
   * fills up and never repeats a chip shown in the lists below.
   */
  const quickAddGroups = useMemo(
    () => QUICK_ADD_GROUPS
      .map(g => ({ ...g, items: g.items.filter(i => !pantry.has(i)) }))
      .filter(g => g.items.length > 0),
    [pantry],
  )

  /**
   * Tracked items by state, staples excluded — they have their own group
   * below, and listing them in both put the same chip on screen twice.
   */
  const grouped = useMemo(() => {
    const out = { have: [], low: [], out: [] }
    for (const [item, state] of pantry.entries()) {
      if (out[state] && !PANTRY_STAPLES.has(item)) out[state].push(item)
    }
    for (const list of Object.values(out)) list.sort()
    return out
  }, [pantry])

  /**
   * A staple counts as present unless the user has said otherwise, so the
   * chips start selected and a tap is how you say "actually, I'm out".
   *
   * Tapping an already-out staple removes the row rather than writing an
   * explicit 'have': absent means assumed-present, so there's no reason to
   * store a row that says what the default already says.
   */
  function toggleStaple(item) {
    setPantryState(item, pantry.get(item) === 'out' ? 'unknown' : 'out')
  }

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

          {/* Quick add sits at the bottom, below what you already have: it's a
              shortcut for filling the lists above, so it reads as a source to
              draw from rather than part of the kitchen itself. */}
          {quickAddGroups.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-dashed border-rim">
              <h3 className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted mb-2.5 flex items-center gap-1.5">
                <Icon name="plus" size={13} strokeWidth={3} />Quick add
              </h3>
              {quickAddGroups.map(({ title, items }) => (
                <div key={title} className="mb-2.5 last:mb-0">
                  <h4 className="text-[0.68rem] font-bold uppercase tracking-[0.07em] text-warm-tan mb-1.5">
                    {title}
                  </h4>
                  <ul className="flex flex-wrap gap-1.5 list-none">
                    {items.map(item => (
                      <li key={item}>
                        <button
                          type="button"
                          onClick={() => quickAdd(item)}
                          aria-label={`Add ${item}`}
                          className="inline-flex items-center gap-1 border-2 border-ink rounded-full px-3 py-[3px] text-[0.8rem] font-bold bg-card text-ink hover:bg-accent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <Icon name="plus" size={10} strokeWidth={3} />{item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Staples, pre-selected. They're assumed present rather than
              tracked one by one, so the useful interaction is the exception:
              tap one to say you've actually run out. */}
          <div className="mt-3.5 pt-3.5 border-t border-dashed border-rim">
            <h3 className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted mb-1 flex items-center gap-1.5">
              <StateDot state="have" />Assumed present
            </h3>
            <p className="text-[0.74rem] text-muted mb-2">
              Counted as present without being tracked. Tap one if you’ve run out.
            </p>
            <ul className="flex flex-wrap gap-1.5 list-none">
              {SHOWN_STAPLES.map(item => {
                const isOut = pantry.get(item) === 'out'
                return (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => toggleStaple(item)}
                      aria-pressed={!isOut}
                      aria-label={`${item}: ${isOut ? 'out' : 'assumed present'}`}
                      title={isOut ? 'Out — tap to restore' : 'Tap if you’ve run out'}
                      className={`inline-flex items-center gap-1 border-2 rounded-full px-3 py-[3px] text-[0.8rem] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        isOut
                          ? 'bg-card border-heart text-heart line-through decoration-2'
                          : 'bg-accent border-ink text-ink opacity-70 hover:opacity-100'
                      }`}
                    >
                      {isOut
                        ? <Icon name="close" size={10} strokeWidth={3} />
                        : <Icon name="check" size={11} strokeWidth={3} />}
                      {item}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
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
