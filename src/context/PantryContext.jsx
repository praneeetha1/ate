import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { canonicalItem, isStaple, varietalHead } from '../utils/ingredients'
import { nextPantryState } from '../utils/pantry'
import { describeError } from '../utils/errors'

/**
 * What's in the user's kitchen.
 *
 * Deliberately its own provider rather than another slice of AppContext: that
 * file is already 939 lines, and `shoppingList` alone reaches into eleven
 * places in it (hydrate, persist, guest snapshot, upload, server-load
 * fallback, mutators, cascade delete, provider value). A twelfth data type
 * inline would make it unownable.
 *
 * Signed-in only, also deliberately. A local slice would need the whole
 * guest→account merge path, and a pantry is a long-lived thing you want on
 * your phone *and* your laptop, so it wants the server anyway. Signed out, the
 * context reports every item as unknown and every write is a no-op, which is
 * what keeps the pantry UI out of the way entirely for guests.
 */
const PantryContext = createContext(null)

/** What a consumer sees with no provider above it, or nobody signed in. */
const ABSENT = {
  pantry:         new Map(),
  pantryState:    () => 'unknown',
  isAssumed:      () => false,
  setPantryState: () => {},
  cyclePantry:    () => {},
  pantryReady:    false,
  pantryEnabled:  false,
}

// Least available wins when two old names now mean one item: telling someone
// they have what they'd marked as run out is the worse mistake.
const SCARCITY = { out: 3, low: 2, have: 1 }

/**
 * Saved rows keyed by today's canonical names.
 * Returns the map, the rows to write under their new names, and the old names to delete.
 */
export function normalizePantryRows(rows) {
  const next = new Map()
  const stale = []
  for (const r of rows) {
    const item = canonicalItem(r.item) || r.item
    if (item !== r.item) stale.push(r.item)
    const prev = next.get(item)
    if (!prev || (SCARCITY[r.state] || 0) > (SCARCITY[prev] || 0)) next.set(item, r.state)
  }
  const renamed = new Set(rows.filter(r => stale.includes(r.item)).map(r => canonicalItem(r.item)))
  return { next, stale, migrate: [...renamed].map(item => [item, next.get(item)]) }
}

export function PantryProvider({ children }) {
  const { user } = useAuth()
  const { showError } = useToast()

  const uid = user?.id ?? null

  // canonical item -> 'have' | 'low' | 'out'. A Map rather than an object so a
  // recipe listing an ingredient called "constructor" can't reach through to
  // Object.prototype.
  const [pantry, setPantry] = useState(() => new Map())
  const [ready,  setReady]  = useState(false)

  // Writes need the current state but a handler's closure can be a render
  // behind — the same reason AppContext keeps a dataRef.
  const pantryRef = useRef(pantry)
  const commit = useCallback(updater => {
    setPantry(prev => {
      const next = updater(prev)
      pantryRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    if (!uid) {
      // Signing out must clear the previous identity's pantry from memory, not
      // just stop reading it.
      pantryRef.current = new Map()
      setPantry(new Map())
      setReady(false)
      return
    }

    let cancelled = false
    setReady(false)

    Promise.resolve(supabase.from('pantry').select('item, state').eq('user_id', uid))
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Could not load pantry:', error)
          showError(describeError(error, 'Could not load your pantry.'))
          setReady(true)
          return
        }
        const { next, migrate, stale } = normalizePantryRows(data || [])
        // Rows saved under a name the matcher has since renamed ("cornflour"
        // is now "cornstarch") are moved to the current name, so reads find
        // them and a later change or removal reaches them. Best-effort: if it
        // fails, the next load just does it again.
        if (stale.length) {
          Promise.resolve(supabase.from('pantry').upsert(
            migrate.map(([item, state]) => ({ user_id: uid, item, state, updated_at: new Date().toISOString() })),
            { onConflict: 'user_id,item' },
          ))
            .then(() => supabase.from('pantry').delete().eq('user_id', uid).in('item', stale))
            .catch(err => console.error('Could not migrate pantry names:', err))
        }
        pantryRef.current = next
        setPantry(next)
        setReady(true)
      })
      .catch(err => {
        if (cancelled) return
        console.error('Could not load pantry:', err)
        showError(describeError(err, 'Could not load your pantry.'))
        setReady(true)
      })

    return () => { cancelled = true }
  }, [uid, showError])

  /**
   * The state of one ingredient, given its raw recipe text.
   *
   * Falls back to `have` for a staple: assuming salt and oil are present is
   * what keeps 31% of the catalog's ingredient lines out of the pantry
   * entirely. An explicit row always wins, so marking salt `out` sticks.
   */
  const pantryState = useCallback(raw => {
    const item = canonicalItem(raw)
    if (!item) return 'unknown'
    if (pantry.has(item)) return pantry.get(item)

    // Falling back to the generic: having "mushrooms" answers for a recipe
    // asking for button mushrooms, and "chicken" for chicken breast. Scoped to
    // the heads where the varietal is a cultivar or a cut rather than a
    // different purchase — see VARIETAL_HEADS. An exact row always wins, so
    // marking "button mushroom" out still sticks for that one specifically.
    const head = varietalHead(item)
    if (head && pantry.has(head)) return pantry.get(head)

    return uid && isStaple(item) ? 'have' : 'unknown'
  }, [pantry, uid])

  const setPantryState = useCallback((raw, state) => {
    const item = canonicalItem(raw)
    if (!item || !uid) return

    if (state === 'unknown') {
      commit(prev => {
        if (!prev.has(item)) return prev
        const next = new Map(prev)
        next.delete(item)
        return next
      })
      Promise.resolve(supabase.from('pantry').delete().match({ user_id: uid, item }))
        .then(({ error }) => {
          if (error) {
            console.error('Could not update pantry:', error)
            showError(describeError(error, 'Could not update your pantry.'))
          }
        })
        .catch(err => {
          console.error('Could not update pantry:', err)
          showError(describeError(err, 'Could not update your pantry.'))
        })
      return
    }

    commit(prev => new Map(prev).set(item, state))
    Promise.resolve(supabase.from('pantry').upsert(
      { user_id: uid, item, state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,item' },
    ))
      .then(({ error }) => {
        if (error) {
          console.error('Could not update pantry:', error)
          showError(describeError(error, 'Could not update your pantry.'))
        }
      })
      .catch(err => {
        console.error('Could not update pantry:', err)
        showError(describeError(err, 'Could not update your pantry.'))
      })
  }, [uid, commit, showError])

  /**
   * True when this item only counts as present because it's an assumed
   * staple — nobody has actually confirmed it.
   *
   * The readiness line used to say "You have all 6" when four of the six were
   * assumptions about flour, eggs and spices. That reads as a checked fact and
   * isn't one, so the count can now be split.
   */
  const isAssumed = useCallback(raw => {
    const item = canonicalItem(raw)
    if (!item || !uid) return false
    if (pantry.has(item)) return false
    const head = varietalHead(item)
    if (head && pantry.has(head)) return false
    return isStaple(item)
  }, [pantry, uid])

  /** One tap: have -> low -> out -> (unknown, or back to have for a staple). */
  const cyclePantry = useCallback(raw => {
    const item = canonicalItem(raw)
    if (!item || !uid) return
    const current = pantryRef.current.has(item)
      ? pantryRef.current.get(item)
      : (isStaple(item) ? 'have' : 'unknown')
    setPantryState(item, nextPantryState(current, isStaple(item)))
  }, [uid, setPantryState])

  return (
    <PantryContext.Provider value={{
      pantry,
      pantryState,
      isAssumed,
      setPantryState,
      cyclePantry,
      pantryReady:   ready,
      pantryEnabled: !!uid,
    }}>
      {children}
    </PantryContext.Provider>
  )
}

/**
 * Safe without a provider: the components that read this are also rendered by
 * tests and pages that have no reason to mount a pantry, and an absent pantry
 * is a meaningful state (a signed-out visitor) rather than a bug.
 */
export function usePantry() {
  return useContext(PantryContext) ?? ABSENT
}
