import { useEffect, useMemo, useRef, useState } from 'react'
import { VISIBLE_CATALOG } from '../utils/recipe'
import { usePantry } from '../context/PantryContext'
import {
  PANTRY_STAPLES, KNOWN_INGREDIENTS, COMMON_INGREDIENT_GROUPS as QUICK_ADD_GROUPS,
  isNeverShopped, rankSuggestions,
} from '../utils/ingredients'
import { PANTRY_LABELS } from '../utils/pantry'
import Highlight from './Highlight'
import Icon from './Icon'
import { resolveIngredient, lineId } from '../utils/registry'
import { Link, useNavigate } from 'react-router-dom'
import { Doodle } from './Sketch'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'


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
 * Everything the add box will suggest: what the app knows, plus whatever the
 * visible catalog happens to use.
 *
 * Seeded from KNOWN_INGREDIENTS rather than the catalog alone. Building it from
 * recipes only meant curating the catalog quietly took 37 ingredients out of
 * search — you could tap "paneer" in the grid below but never find it by
 * typing, and shrimp, lamb and fish disappeared entirely.
 *
 * Built on first use, not at module load. App.jsx imports the /pantry route
 * eagerly, so doing this at import cost every cold start ~7ms locally (more on
 * a slow phone) to populate a list most sessions never open. Cached after the
 * first call, since neither source changes at runtime.
 */
let cachedItems = null
function knownItems() {
  if (!cachedItems) {
    const seen = new Set(KNOWN_INGREDIENTS)
    for (const { r } of VISIBLE_CATALOG) {
      for (const ing of r.ingredients) {
        if (!ing.item || isNeverShopped(ing.item)) continue
        const c = lineId(ing)
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
  { state: 'low',  title: 'Running low',     chip: 'bg-card border-ink border-dashed text-ink' },
  { state: 'out',  title: 'Out',             chip: 'bg-card border-heart text-heart' },
]

/** The drawing for each quick-add group, shown beside its heading. */
const GROUP_DOODLE = {
  'Produce': 'grp-produce', 'Dairy & Eggs': 'grp-dairy', 'Meat & Seafood': 'grp-meat',
  'Grains & Bread': 'grp-grains', 'Herbs & Condiments': 'grp-herbs', 'Spices & Masalas': 'grp-spices',
  'Dals & Legumes': 'grp-dals', 'Flours & Staples': 'grp-flours',
}

const OPTIONS = [
  { state: 'have', label: 'Have' },
  { state: 'low',  label: 'Running low' },
  { state: 'out',  label: 'Out' },
]

/** The same marker shape used on ingredient rows, so the two surfaces agree. */
function StateDot({ state }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid place-items-center w-[15px] h-[15px] rounded-circle border-2 border-ink overflow-hidden align-[-3px] ${
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
  const { pantry, setPantryState, pantryEnabled, pantryReady } = usePantry()
  const [draft, setDraft] = useState('')
  const [note,  setNote]  = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  // Stocking up is a first-run job, not a daily one: open for a near-empty
  // kitchen, folded once there's something to manage. Decided once, when the
  // pantry loads, so it doesn't snap shut mid-way through quick-adding.
  const [showStock,   setShowStock]   = useState(null)
  useEffect(() => {
    if (pantryReady && showStock === null) setShowStock(pantry.size < 5)
  }, [pantryReady, showStock, pantry.size])
  // The chip whose Have / Low / Out / Remove options are showing.
  const [open, setOpen] = useState(null)
  const inputRef = useRef(null)
  const { shoppingItems, addShoppingItem, toggleShopItem } = useApp()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const onList = item => { const row = shoppingItems.get(item); return !!row && !row.checked }

  /** Out or low, so onto the list: re-opens a ticked row rather than duplicating it. */
  function addToList(items) {
    const adding = items.filter(i => !onList(i))
    for (const item of adding) {
      if (shoppingItems.has(item)) toggleShopItem(item)
      else addShoppingItem(item)
    }
    showToast(`Added ${adding.length} to your shopping list`, 'info', { actions: [
      { label: 'View', onClick: () => navigate('/shopping') },
    ] })
  }

  /** Stop tracking a whole group at once, with an undo in case it was a slip. */
  function clearGroup(items, state) {
    for (const item of items) setPantryState(item, 'unknown')
    setOpen(null)
    showToast(`Cleared ${items.length} from your kitchen`, 'info', { actions: [
      { label: 'Undo', onClick: () => items.forEach(item => setPantryState(item, state)) },
    ] })
  }

  function choose(item, state) {
    setPantryState(item, state)
    setOpen(null)
  }

  /**
   * A short, ranked list rather than the whole vocabulary.
   *
   * Eight is the cap because these sit under the box: a dropdown long enough
   * to scroll is one nobody reads to the end of. Anything already tracked is
   * left out — it's in the lists below, and offering it again would only lead
   * to the "already on the list" note.
   */
  const suggestions = useMemo(
    () => rankSuggestions(knownItems(), draft, 8, [...pantry.keys()]),
    [draft, pantry],
  )

  /** Add the item under the cursor, and leave the box ready for the next one. */
  function pickSuggestion(item) {
    setPantryState(item, 'have')
    setDraft('')
    setNote('')
    setShowSuggest(false)
    inputRef.current?.focus()
  }

  /**
   * Enter takes the top suggestion when there is one, so "chick" adds chicken
   * rather than a pantry row literally called "chick". With nothing matching,
   * it falls through to the form and adds whatever was typed — which is how
   * something the catalogue has never heard of still gets in.
   */
  function onDraftKey(e) {
    if (e.key === 'Escape') { setShowSuggest(false); return }
    if (e.key === 'Enter' && showSuggest && suggestions.length) {
      const typed = resolveIngredient(draft).id
      // Only reach for the top suggestion when what was typed isn't itself a
      // real ingredient. Typing "cream" offered "cream cheese" first and Enter
      // silently added that instead — an exact name must always win over a
      // ranked guess.
      const typedIsReal = pantry.has(typed) || knownItems().includes(typed)
      if (!typedIsReal && suggestions[0] !== typed) {
        e.preventDefault()
        pickSuggestion(suggestions[0])
      }
    }
  }

  /**
   * Adding is only possible here now that recipe rows are read-only, so this
   * box is the pantry's front door and has to accept anything — a name from
   * the catalogue or something the user just bought that no recipe mentions.
   */
  function addItem(e) {
    e.preventDefault()
    setShowSuggest(false)
    const item = resolveIngredient(draft).id
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
        <div className="text-center py-[40px] px-5">
          <p className="text-[0.85rem] text-muted italic">
            Sign in to keep track of what’s in your kitchen. Your shopping list
            works without an account, and comes with you when you sign in.
          </p>
          <Link
            to="/login?next=/pantry"
            className="inline-flex items-center mt-4 min-h-[44px] px-5 rounded-xl border-2 border-ink bg-accent text-ink font-bold shadow-pop press"
          >Sign in</Link>
        </div>
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
            {/* Relative, so the suggestion list can hang under the box.
                This used to be a native <datalist>, which the browser renders
                in its own OS-styled panel — hundreds of rows tall, in no
                useful order, and impossible to theme. */}
            <div className="flex-1 min-w-0 relative">
              <input
                ref={inputRef}
                value={draft}
                onChange={e => { setDraft(e.target.value); setNote(''); setShowSuggest(true) }}
                onKeyDown={onDraftKey}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                placeholder="Add something you have…"
                aria-label="Add an item to your pantry"
                aria-expanded={showSuggest && suggestions.length > 0}
                autoComplete="off"
                maxLength={80}
                className="w-full text-[0.85rem] border-2 border-ink rounded-xl px-3 py-2 bg-card outline-none focus:border-accent-dk text-ink placeholder:text-muted"
              />
              {showSuggest && suggestions.length > 0 && (
                <ul
                  aria-label="Matching ingredients"
                  className="absolute top-[calc(100%+4px)] left-0 right-0 bg-card border-2 border-ink rounded-xl shadow-warm-lg overflow-hidden z-50 list-none"
                >
                  {suggestions.map(name => (
                    <li key={name}>
                      <button
                        type="button"
                        onMouseDown={() => pickSuggestion(name)}
                        className="w-full text-left px-3.5 py-2 text-[0.85rem] cursor-pointer border-b border-[rgba(200,180,130,0.2)] last:border-0 hover:bg-paper transition-colors"
                      >
                        <Highlight text={name} query={draft.trim()} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
              <div key={state} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between gap-2 mb-2 min-h-[32px]">
                  <h3 className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-ink flex items-center gap-1.5">
                    <StateDot state={state} />{title}
                    <span className="text-muted font-normal">({items.length})</span>
                  </h3>
                  {state === 'have' && items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => clearGroup(items, state)}
                      className="shrink-0 inline-flex items-center gap-1 min-h-[32px] px-2 text-[0.78rem] font-bold text-muted underline underline-offset-2 hover:text-heart focus:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded"
                    >Clear all</button>
                  )}
                  {state !== 'have' && (items.some(i => !onList(i)) ? (
                    <button
                      type="button"
                      onClick={() => addToList(items)}
                      className="shrink-0 inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-full border-2 border-ink bg-card text-ink text-[0.78rem] font-bold shadow-pop press focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    ><Icon name="cart" size={14} />Add {items.every(i => !onList(i)) && items.length > 1 ? 'all' : items.filter(i => !onList(i)).length} to list</button>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[0.75rem] font-bold text-accent-dk">
                      <Icon name="check" size={13} strokeWidth={3} />On your list
                    </span>
                  ))}
                </div>
                <ul className="flex flex-wrap gap-2 list-none">
                  {items.map(item => (
                    <li key={item} className={open === item ? 'contents' : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpen(o => o === item ? null : item)}
                        aria-expanded={open === item}
                        aria-label={`${item}: ${PANTRY_LABELS[state]}. Change what you have.`}
                        className={`inline-flex items-center gap-1 min-h-[36px] pl-3 pr-2 border-2 rounded-full text-[0.82rem] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${chip} ${open === item ? 'shadow-pop -translate-y-[1px]' : ''}`}
                      >
                        {item}
                        <Icon name="chevron" size={12} strokeWidth={3} className={`opacity-60 transition-transform ${open === item ? 'rotate-180' : ''}`} />
                      </button>
                      {open === item && (
                        <div role="group" aria-label={`Change ${item}`} className="chip-options basis-full flex flex-wrap items-center gap-1.5 p-2 rounded-xl border-2 border-dashed border-ink bg-paper">
                          {OPTIONS.map(o => (
                            <button
                              key={o.state}
                              type="button"
                              onClick={() => choose(item, o.state)}
                              aria-pressed={state === o.state}
                              className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full border-2 border-ink text-[0.8rem] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${state === o.state ? 'bg-accent text-ink' : 'bg-card text-ink'}`}
                            ><StateDot state={o.state} />{o.label}</button>
                          ))}
                          <button
                            type="button"
                            onClick={() => choose(item, 'unknown')}
                            aria-label={`Stop tracking ${item}`}
                            className="ml-auto inline-flex items-center gap-1 min-h-[36px] px-3 rounded-full text-[0.8rem] font-bold text-heart hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                          ><Icon name="close" size={12} strokeWidth={3} />Remove</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* Stocking up, folded away.
              Quick add and the assumed staples are 104 chips between them —
              several phone screens — and they're setup UI: you use them when
              first filling the kitchen, then almost never again. Leaving them
              open permanently pushed everything below off the page. */}
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowStock(v => !v)}
              aria-expanded={!!showStock}
              aria-controls="stock-kitchen"
              className="w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-xl border-2 border-ink bg-card shadow-pop press focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <span className="w-8 h-8 shrink-0 grid place-items-center rounded-circle border-2 border-ink bg-accent text-ink">
                <Icon name="plus" size={14} strokeWidth={3} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[0.9rem] font-bold text-ink">Stock my kitchen</span>
                <span className="block text-[0.75rem] text-muted">Tap common things to add them, and mark staples you’re out of</span>
              </span>
              <Icon name="chevron" size={16} strokeWidth={2.6} className={`shrink-0 text-ink transition-transform ${showStock ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div id="stock-kitchen" hidden={!showStock}>
          {quickAddGroups.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-dashed border-rim">
              <h3 className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted mb-2.5 flex items-center gap-1.5">
                <Icon name="plus" size={13} strokeWidth={3} />Quick add
              </h3>
              {quickAddGroups.map(({ title, items }) => (
                <div key={title} className="mb-4 last:mb-0">
                  <h4 className="flex items-center gap-2.5 font-display text-[1.05rem] font-semibold text-ink mb-2">
                    {GROUP_DOODLE[title] && <Doodle file={GROUP_DOODLE[title]} size={44} />}
                    {title}
                  </h4>
                  <ul className="flex flex-wrap gap-1.5 list-none">
                    {items.map(item => (
                      <li key={item}>
                        <button
                          type="button"
                          onClick={() => quickAdd(item)}
                          aria-label={`Add ${item}`}
                          className="inline-flex items-center gap-1 border-2 border-ink rounded-full px-3 py-[3px] text-[0.8rem] font-bold bg-card text-ink hover:bg-accent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
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
                      className={`inline-flex items-center gap-1 border-2 rounded-full px-3 py-[3px] text-[0.8rem] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
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
