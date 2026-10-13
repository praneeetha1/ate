import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { PANTRY_STAPLES } from '../utils/ingredients'
import { resolveIngredient } from '../utils/registry'
import { matchIngredient, evaluateRecipe } from '../utils/readiness'
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
  stateOf:        () => ({ state: 'unknown', assumed: false }),
  evaluate:       recipe => evaluateRecipe(recipe, () => ({ state: 'unknown', assumed: false })),
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
    const item = resolveIngredient(r.item).id || r.item
    if (item !== r.item) stale.push(r.item)
    const prev = next.get(item)
    if (!prev || (SCARCITY[r.state] || 0) > (SCARCITY[prev] || 0)) next.set(item, r.state)
  }
  const renamed = new Set(rows.filter(r => stale.includes(r.item)).map(r => resolveIngredient(r.item).id))
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
          // The old rows are deleted only once the new ones are confirmed
          // written. supabase-js reports a failed write as { error }, not a
          // rejection, so an unchecked .then deleted them regardless — losing
          // the item whenever the upsert failed. On failure nothing changes
          // and the next load tries again.
          Promise.resolve(supabase.from('pantry').upsert(
            migrate.map(([item, state]) => ({ user_id: uid, item, state, updated_at: new Date().toISOString() })),
            { onConflict: 'user_id,item' },
          ))
            .then(({ error }) => {
              if (error) throw error
              return supabase.from('pantry').delete().eq('user_id', uid).in('item', stale)
            })
            .then(res => { if (res?.error) throw res.error })
            .catch(err => console.error('Could not migrate pantry names; old rows kept:', err))
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
  /**
   * What the pantry says about one exact id, and nothing more:
   * { state: 'have' | 'low' | 'out' | 'unknown', assumed }.
   *
   * A shelf-stable staple (salt, oil, everyday spices) counts as present
   * without a row, but flagged `assumed` so nothing reports it as confirmed.
   * An explicit row always wins, so marking salt Out sticks. What can stand
   * in for what is the evaluator's job (readiness.js), not this one's.
   */
  const stateOf = useCallback(id => {
    if (pantry.has(id)) return { state: pantry.get(id), assumed: false }
    if (uid && PANTRY_STAPLES.has(id)) return { state: 'have', assumed: true }
    return { state: 'unknown', assumed: false }
  }, [pantry, uid])

  /** have / low / out / unknown for one ingredient, through everything that can stand in for it. */
  const pantryState = useCallback(raw => {
    const id = resolveIngredient(raw).id
    if (!id) return 'unknown'
    const m = matchIngredient(id, stateOf)
    if (m.status === 'have' || m.status === 'assumed') return 'have'
    if (m.status === 'low') return 'low'
    return m.via === 'out' ? 'out' : 'unknown'
  }, [stateOf])

  /** The whole readiness picture for a recipe — see evaluateRecipe(). */
  const evaluate = useCallback(recipe => evaluateRecipe(recipe, stateOf), [stateOf])

  const setPantryState = useCallback((raw, state) => {
    const item = resolveIngredient(raw).id
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
    const id = resolveIngredient(raw).id
    return !!id && matchIngredient(id, stateOf).status === 'assumed'
  }, [stateOf])

  /** One tap: have -> low -> out -> (unknown, or back to have for a staple). */
  const cyclePantry = useCallback(raw => {
    const item = resolveIngredient(raw).id
    if (!item || !uid) return
    const staple = PANTRY_STAPLES.has(item)
    const current = pantryRef.current.has(item)
      ? pantryRef.current.get(item)
      : (staple ? 'have' : 'unknown')
    setPantryState(item, nextPantryState(current, staple))
  }, [uid, setPantryState])

  return (
    <PantryContext.Provider value={{
      pantry,
      pantryState,
      stateOf,
      evaluate,
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
