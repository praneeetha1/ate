import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../hooks/useDialog'
import { loadSlice, saveSlice, scopeFor } from '../utils/storage'
import { VISIBLE_CATALOG } from '../utils/recipe'
import Icon from './Icon'
import DietMark from './DietMark'
import { CategoryDoodle } from './Sketch'
import { formatRecipeTime } from '../utils/formatTime'
import { lineId } from '../utils/registry'

const KEY = 'starter_removed'
const listeners = new Set()

/**
 * Which starter (catalog) recipes this person took out, as catalog keys.
 * null until they've chosen. Per account on this device, like the welcome
 * card — a guest's choice carries over to the account that signs in on it.
 * ponytail: device-local; move to a Supabase column if people switch devices.
 */
function read(uid) {
  return loadSlice(scopeFor(uid), KEY, null) ?? (uid ? loadSlice(scopeFor(null), KEY, null) : null)
}

export function useStarterRecipes() {
  const uid = useAuth().user?.id
  const [removed, setRemoved] = useState(() => read(uid))
  useEffect(() => {
    const sync = () => setRemoved(read(uid))
    sync()
    listeners.add(sync)
    return () => listeners.delete(sync)
  }, [uid])

  const gone = useMemo(() => new Set(removed ?? []), [removed])
  return {
    chosen: removed !== null,
    removed: gone,
    catalog: useMemo(() => VISIBLE_CATALOG.filter(({ i }) => !gone.has(i)), [gone]),
    save: keys => { saveSlice(scopeFor(uid), KEY, [...keys]); listeners.forEach(f => f()) },
  }
}

/**
 * An account more than a day old: someone coming back, perhaps on a new
 * phone, not a newcomer. The starter question and the tour are remembered per
 * device, so without this a returning cook was greeted like a stranger.
 */
export const isReturning = user =>
  !!user?.created_at && Date.now() - Date.parse(user.created_at) > 864e5

/** The first-visit question: keep every starter recipe, or pick some. */
export function StarterChoice() {
  const { save } = useStarterRecipes()
  const [picking, setPicking] = useState(false)
  return (
    <section aria-labelledby="starter-heading" className="mx-5 mt-4 border-2.5 border-ink rounded-2xl bg-card shadow-warm px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h2 id="starter-heading" className="font-display text-[1.15rem] font-semibold text-ink">Start with our recipes?</h2>
        {/* Closing keeps them all, the same as not answering; Settings can change it. */}
        <button onClick={() => save([])} aria-label="Hide this" className="w-11 h-11 -mt-2 -mr-2 grid place-items-center rounded-full hover:bg-paper shrink-0">
          <Icon name="close" size={16} strokeWidth={2.6} />
        </button>
      </div>
      <p className="text-[0.9rem] text-ink mt-1">
        ate. comes with {VISIBLE_CATALOG.length} starter recipes. Keep them all, or pick the ones you want. You can change this any time in Settings.
      </p>
      <div className="flex gap-2 mt-3">
        <button onClick={() => save([])} className="flex-1 min-h-[44px] rounded-xl border-2 border-ink bg-accent font-bold text-ink shadow-pop press">
          Keep all {VISIBLE_CATALOG.length}
        </button>
        <button onClick={() => setPicking(true)} className="flex-1 min-h-[44px] rounded-xl border-2 border-ink bg-card font-bold text-ink">
          Pick which to keep
        </button>
      </div>
      {picking && <StarterSwipe onClose={() => setPicking(false)} />}
    </section>
  )
}

/** Tick the starter recipes to keep. Everything starts ticked except what was taken out before. */
export function StarterPicker({ onClose }) {
  const { removed, save } = useStarterRecipes()
  const { titleId, backdropProps, panelProps } = useDialog({ onClose })
  const [keep, setKeep] = useState(() => new Set(VISIBLE_CATALOG.map(({ i }) => i).filter(i => !removed.has(i))))
  const all = keep.size === VISIBLE_CATALOG.length

  const toggle = i => setKeep(k => { const n = new Set(k); n.has(i) ? n.delete(i) : n.add(i); return n })
  function done() {
    save(VISIBLE_CATALOG.map(({ i }) => i).filter(i => !keep.has(i)))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[600] bg-[rgba(60,35,15,0.55)] flex items-end sm:items-center justify-center" {...backdropProps}>
      <div className="bg-card border-3 border-ink rounded-t-2xl sm:rounded-2xl shadow-warm-xl w-full max-w-[520px] max-h-[90vh] flex flex-col" {...panelProps}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-ink">
          <h2 id={titleId} className="font-display text-[1.2rem] font-semibold text-ink">Starter recipes</h2>
          <button
            type="button"
            onClick={() => setKeep(new Set(all ? [] : VISIBLE_CATALOG.map(({ i }) => i)))}
            className="text-[0.8rem] font-bold text-accent-dk underline underline-offset-2 min-h-[44px] px-1"
          >{all ? 'Untick all' : 'Tick all'}</button>
        </div>
        <ul className="list-none overflow-y-auto px-5 py-2">
          {VISIBLE_CATALOG.map(({ r, i }) => (
            <li key={i} className="border-b border-warm-tan last:border-0">
              <label className="flex items-center gap-3 min-h-[56px] py-1.5 cursor-pointer">
                <input type="checkbox" checked={keep.has(i)} onChange={() => toggle(i)} className="accent-ink w-5 h-5 shrink-0" />
                {r.image
                  ? <img src={r.image} alt="" loading="lazy" className="w-12 h-12 rounded-md border-2 border-ink object-cover shrink-0" />
                  : <span className="w-12 h-12 rounded-md border-2 border-ink bg-paper grid place-items-center shrink-0"><Icon name="plate" size={18} /></span>}
                <span className="min-w-0">
                  <span className="block text-[0.95rem] text-ink leading-tight">{r.name}</span>
                  <span className="block text-[0.75rem] text-muted">{r.category}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex gap-3 px-5 py-3 border-t border-ink pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button onClick={onClose} className="min-h-[48px] px-5 rounded-xl border-2 border-ink bg-card font-bold text-ink">Cancel</button>
          <button onClick={done} className="flex-1 min-h-[48px] rounded-xl border-2.5 border-ink bg-accent text-ink font-display font-semibold text-[1rem] shadow-pop press">
            {keep.size ? `Keep ${keep.size} recipe${keep.size === 1 ? '' : 's'}` : 'Start with none'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** How far a card has to travel before letting go counts as a decision. */
const THROW = 90

/**
 * The first-run picker: one starter recipe at a time, swipe right to keep it,
 * left to skip it (or use the buttons, or the arrow keys). Faster and more fun
 * than ticking down a list of 40, and you see each dish properly.
 *
 * Settings keeps the list picker, which suits changing your mind later.
 */
export function StarterSwipe({ onClose }) {
  const { save } = useStarterRecipes()
  const { titleId, backdropProps, panelProps } = useDialog({ onClose })
  const [history, setHistory] = useState([])        // [{ i, keep }] in the order decided
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(0)         // -1 skip, 1 keep, while the card flies off
  const drag = useRef(null)

  const at = history.length
  const done = at >= VISIBLE_CATALOG.length
  const kept = history.filter(h => h.keep).length

  function decide(keep) {
    if (leaving || done) return
    setLeaving(keep ? 1 : -1)
    const { i } = VISIBLE_CATALOG[at]
    setTimeout(() => {
      setHistory(h => [...h, { i, keep }])
      setLeaving(0)
      setDx(0)
    }, 220)
  }
  const undo = () => !leaving && setHistory(h => h.slice(0, -1))

  /** Skipped ones come out; anything not reached yet is kept. */
  function finish() {
    save(history.filter(h => !h.keep).map(h => h.i))
    onClose()
  }

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowRight') decide(true)
      if (e.key === 'ArrowLeft') decide(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pointer = {
    onPointerDown: e => { drag.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId) },
    onPointerMove: e => { if (drag.current !== null) setDx(e.clientX - drag.current) },
    onPointerUp: () => {
      drag.current = null
      if (Math.abs(dx) > THROW) decide(dx > 0)
      else setDx(0)
    },
    onPointerCancel: () => { drag.current = null; setDx(0) },
  }

  const card = (entry, top) => {
    const { r } = entry
    const x = top ? (leaving ? leaving * 520 : dx) : 0
    const lean = top ? Math.max(-1, Math.min(1, x / 160)) : 0
    return (
      <div
        className={`absolute inset-0 bg-card border-2 border-ink rounded-2xl shadow-warm-lg overflow-hidden flex flex-col select-none ${top ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
        style={{
          transform: top ? `translateX(${x}px) rotate(${x / 18}deg)` : 'translateY(18px) scale(0.93) rotate(2deg)',
          transition: top && drag.current !== null ? 'none' : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          zIndex: top ? 2 : 1,
        }}
        {...(top ? pointer : {})}
        aria-hidden={!top}
      >
        {r.image
          ? <img src={r.image} alt="" draggable="false" className="w-full h-[58%] object-cover border-b-2 border-ink bg-paper" />
          : <span className="w-full h-[58%] grid place-items-center bg-paper border-b-2 border-ink"><CategoryDoodle category={r.category} fallback="cat-main" size={120} className="-rotate-6" /></span>}
        <div className="p-5 flex-1 flex flex-col gap-2">
          <h3 className="font-display text-[1.5rem] font-semibold text-ink leading-tight line-clamp-2">{r.name}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] font-semibold text-muted">
            <span className="whitespace-nowrap">{r.category}</span>
            {r.timeMinutes > 0 && <span className="flex items-center gap-1 whitespace-nowrap"><Icon name="clock" size={14} />{formatRecipeTime(r)}</span>}
            <DietMark recipe={r} size={16} />
          </div>
          {/* What goes in it: the thing you'd actually decide on. */}
          {r.ingredients?.length > 0 && (
            <p className="mt-auto text-[0.85rem] text-ink leading-snug line-clamp-3">
              <span className="font-bold">{r.ingredients.length} ingredients: </span>
              {[...new Set(r.ingredients.map(lineId).filter(Boolean))].slice(0, 6).join(', ')}
              {r.ingredients.length > 6 ? '…' : ''}
            </p>
          )}
        </div>
        {top && (
          <>
            <span aria-hidden="true" style={{ opacity: Math.max(0, lean) }} className="absolute top-5 left-5 -rotate-12 px-3 py-1 rounded-lg border-2 border-ink bg-accent font-display text-[1.3rem] font-semibold text-ink">Keep</span>
            <span aria-hidden="true" style={{ opacity: Math.max(0, -lean) }} className="absolute top-5 right-5 rotate-12 px-3 py-1 rounded-lg border-2 border-heart bg-card font-display text-[1.3rem] font-semibold text-heart">Skip</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[600] bg-cream flex justify-center" {...backdropProps}>
      <div className="w-full max-w-[460px] h-full flex flex-col px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]" {...panelProps}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-display text-[1.35rem] font-semibold text-ink">Pick your recipes</h2>
            <p className="text-[0.8rem] text-muted">
              {done ? `${kept} kept` : `${at + 1} of ${VISIBLE_CATALOG.length} · swipe right to keep, left to skip`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 grid place-items-center rounded-circle border-2 border-ink bg-card shrink-0 press">
            <Icon name="close" size={16} strokeWidth={2.6} />
          </button>
        </div>

        <div className="h-1.5 mt-3 rounded-full bg-paper overflow-hidden" aria-hidden="true">
          <div className="h-full bg-accent-dk transition-[width] duration-300" style={{ width: `${(at / VISIBLE_CATALOG.length) * 100}%` }} />
        </div>

        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <CategoryDoodle category="Main Dish" size={110} />
            <p className="font-display text-[1.5rem] font-semibold text-ink">{kept ? `${kept} recipe${kept === 1 ? '' : 's'} on your shelf` : 'A clean slate'}</p>
            <p className="text-[0.9rem] text-muted max-w-[280px]">You can change these any time in Settings, and add your own from My Recipes.</p>
          </div>
        ) : (
          <div className="relative flex-1 my-5 min-h-[320px]" aria-live="polite">
            {VISIBLE_CATALOG[at + 1] && card(VISIBLE_CATALOG[at + 1], false)}
            <div key={VISIBLE_CATALOG[at].i} className="absolute inset-0">{card(VISIBLE_CATALOG[at], true)}</div>
            <p className="sr-only">{VISIBLE_CATALOG[at].r.name}</p>
          </div>
        )}

        {done ? (
          <button onClick={finish} className="w-full min-h-[52px] rounded-xl border-2 border-ink bg-accent text-ink font-display font-semibold text-[1.1rem] shadow-warm press">Done</button>
        ) : (
          <>
            <div className="flex items-center justify-center gap-5">
              <button onClick={() => decide(false)} aria-label="Skip" className="w-16 h-16 grid place-items-center rounded-circle border-2 border-heart bg-card text-heart shadow-warm press">
                <Icon name="close" size={24} strokeWidth={2.8} />
              </button>
              <button onClick={undo} disabled={!history.length} aria-label="Undo" className="w-11 h-11 grid place-items-center rounded-circle border-2 border-ink bg-card text-ink shadow-pop press disabled:opacity-30">
                <Icon name="arrowRight" size={16} className="rotate-180" />
              </button>
              <button onClick={() => decide(true)} aria-label="Keep" className="w-16 h-16 grid place-items-center rounded-circle border-2 border-ink bg-accent text-ink shadow-warm press">
                <Icon name="heart" size={26} filled />
              </button>
            </div>
            <button onClick={finish} className="mt-3 self-center min-h-[40px] px-3 text-[0.85rem] font-bold text-muted underline underline-offset-4">
              Keep the rest and finish
            </button>
          </>
        )}
      </div>
    </div>
  )
}
