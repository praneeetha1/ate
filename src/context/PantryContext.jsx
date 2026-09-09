import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { canonicalItem, isStaple } from '../utils/ingredients'
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
  setPantryState: () => {},
  cyclePantry:    () => {},
  pantryReady:    false,
  pantryEnabled:  false,
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
        const next = new Map((data || []).map(r => [r.item, r.state]))
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
