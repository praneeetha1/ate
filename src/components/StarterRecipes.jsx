import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../hooks/useDialog'
import { loadSlice, saveSlice, scopeFor } from '../utils/storage'
import { VISIBLE_CATALOG } from '../utils/recipe'
import Icon from './Icon'

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

/** The first-visit question: keep every starter recipe, or pick some. */
export function StarterChoice() {
  const { save } = useStarterRecipes()
  const [picking, setPicking] = useState(false)
  return (
    <section aria-labelledby="starter-heading" className="mx-5 mt-4 border-[2.5px] border-ink rounded-2xl bg-card shadow-warm px-4 py-3">
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
      {picking && <StarterPicker onClose={() => setPicking(false)} />}
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
      <div className="bg-card border-[3px] border-ink rounded-t-2xl sm:rounded-2xl shadow-warm-xl w-full max-w-[520px] max-h-[90vh] flex flex-col" {...panelProps}>
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
          <button onClick={done} className="flex-1 min-h-[48px] rounded-xl border-[2.5px] border-ink bg-accent text-ink font-display font-semibold text-[1rem] shadow-pop press">
            {keep.size ? `Keep ${keep.size} recipe${keep.size === 1 ? '' : 's'}` : 'Start with none'}
          </button>
        </div>
      </div>
    </div>
  )
}
