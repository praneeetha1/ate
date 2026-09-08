import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { supabase } from '../lib/supabase'
import {
  keyToText, keyFromText, keyForName, isUserRecipeKey, userRecipeId,
  normalizeUserRecipe, toUserRecipeRow,
} from '../utils/recipe'
import {
  scopeFor, loadSlice, saveSlice, clearScope, migrateLegacyKeys,
} from '../utils/storage'
import { describeError } from '../utils/errors'

const AppContext = createContext(null)

const MY_RECIPES_LIST = 'My Recipes'

// Move pre-scoping localStorage into the guest scope once, at module load,
// before any component reads from storage.
migrateLegacyKeys()

/**
 * Rewrites a locally-stored ratings/notes map that is still keyed by recipe
 * name into one keyed by recipe key.
 *
 * Before keys existed these maps used `recipe.name` as the property. Loading
 * them as-is would make every rating and note look lost, and would then upload
 * the recipe's *name* as its recipe_key.
 */
function migrateNameKeyedMap(map, ownRecipes) {
  if (!map || typeof map !== 'object') return {}
  let changed = false
  const out = {}
  for (const [prop, value] of Object.entries(map)) {
    if (/^\d+$/.test(prop) || prop.startsWith('u_')) { out[prop] = value; continue }
    changed = true
    const key = keyForName(prop, ownRecipes)
    // A name that resolves to nothing (a recipe since deleted) is dropped.
    if (key !== null) out[keyToText(key)] = value
  }
  return changed ? out : map
}

/**
 * Normalises checked shopping-list items.
 *
 * The old shape was a flat array of "<key>-<ingredientIndex>" strings; the
 * current one is { "<key>": [ingredientIndex, …] }, matching the DB column.
 */
function migrateShopChecked(stored) {
  if (!stored) return {}
  if (!Array.isArray(stored)) return typeof stored === 'object' ? stored : {}

  const out = {}
  for (const entry of stored) {
    const str = String(entry)
    const dash = str.lastIndexOf('-')
    if (dash <= 0) continue
    const key = str.slice(0, dash)
    const idx = parseInt(str.slice(dash + 1), 10)
    if (!Number.isFinite(idx)) continue
    out[key] = [...(out[key] || []), idx].sort((a, b) => a - b)
  }
  return out
}

/**
 * Loads all locally-persisted state for one identity, tagged with its scope.
 *
 * Scope travels *with* the data rather than being tracked separately: the
 * persist effect can then never write one identity's values under another
 * identity's keys, which is what made signing out leak the previous account's
 * recipes and notes into the next session.
 */
function hydrate(scope) {
  const userRecipes = loadSlice(scope, 'user_recipes', [])
  return {
    scope,
    favorites:    new Set(loadSlice(scope, 'favs', []).map(keyFromText)),
    ratings:      migrateNameKeyedMap(loadSlice(scope, 'ratings', {}), userRecipes),
    notes:        migrateNameKeyedMap(loadSlice(scope, 'notes', {}), userRecipes),
    shoppingList: new Set(loadSlice(scope, 'shopping', []).map(keyFromText)),
    shopChecked:  migrateShopChecked(loadSlice(scope, 'shop_checked', {})),
    userRecipes,
    lists:        loadSlice(scope, 'lists', []),
  }
}

export function AppProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const { showError } = useToast()

  const uid   = user?.id ?? null
  const scope = scopeFor(uid)

  const [data,    setData]    = useState(() => hydrate(scopeFor(null)))
  const [syncing, setSyncing] = useState(false)

  const { favorites, ratings, notes, shoppingList, shopChecked, userRecipes, lists } = data

  /**
   * Always holds the most recently committed state.
   *
   * The Supabase writes below deliberately run *outside* the state updater (see
   * the note on the handlers), but several of them need to read current state
   * first — and a handler's closure can be a render behind. Creating a list and
   * immediately adding a recipe to it is the clearest case: the new list isn't
   * in the closed-over `lists` yet, so the add would silently no-op.
   */
  const dataRef = useRef(data)

  const commit = useCallback(updater => {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      dataRef.current = next
      return next
    })
  }, [])

  /**
   * Fire-and-forget Supabase write whose failure is surfaced to the user.
   *
   * `.catch` matters as much as the `error` branch: supabase-js resolves with
   * an `error` for API failures but *rejects* when the fetch itself fails, and
   * an uncaught rejection there produced no toast at all — exactly the case
   * this helper exists for.
   */
  const run = useCallback((query, message) => {
    return Promise.resolve(query)
      .then(({ error }) => {
        if (!error) return true
        console.error(message || 'Supabase write failed:', error)
        if (message) showError(message)
        return false
      })
      .catch(err => {
        console.error(message || 'Supabase write failed:', err)
        if (message) showError(message)
        return false
      })
  }, [showError])

  // ── persistence ────────────────────────────────────────────
  const lastPersisted = useRef({})

  useEffect(() => {
    const slices = {
      favs:         [...data.favorites].map(keyToText),
      ratings:      data.ratings,
      notes:        data.notes,
      shopping:     [...data.shoppingList].map(keyToText),
      shop_checked: data.shopChecked,
      user_recipes: data.userRecipes,
      lists:        data.lists,
    }
    for (const [slice, value] of Object.entries(slices)) {
      const serialized = JSON.stringify(value)
      const cacheKey   = `${data.scope}:${slice}`
      if (lastPersisted.current[cacheKey] === serialized) continue
      lastPersisted.current[cacheKey] = serialized
      saveSlice(data.scope, slice, value)
    }
  }, [data])

  // ── identity changes ───────────────────────────────────────
  useEffect(() => {
    // Wait for auth to resolve, or the first pass would treat a signed-in
    // reload as a guest session and try to upload nothing.
    if (authLoading) return
    if (data.scope === scope) return

    // Paint this identity's last-known local state immediately, then reconcile
    // with the server below.
    commit(hydrate(scope))

    if (!uid) { setSyncing(false); return }

    let cancelled = false
    setSyncing(true)
    syncWithSupabase(uid)
      .catch(err => {
        console.error('Supabase sync failed:', err)
        showError(describeError(err, 'Could not sync your data. Showing what’s saved on this device.'))
      })
      .finally(() => { if (!cancelled) setSyncing(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, authLoading])

  /**
   * Push anything created while logged out, then replace local state with the
   * server's.
   *
   * Replacing rather than unioning is deliberate: the old union-merge could
   * never represent a deletion, so unfavouriting on one device resurrected the
   * item on the next login. Uploading first means nothing is lost by the
   * replace.
   */
  async function syncWithSupabase(ownerId) {
    const guest = hydrate(scopeFor(null))
    const guestHasData =
      guest.userRecipes.length || guest.lists.length || guest.favorites.size ||
      guest.shoppingList.size || Object.keys(guest.ratings).length ||
      Object.keys(guest.notes).length

    let uploadedCleanly = true
    if (guestHasData) uploadedCleanly = await uploadGuestData(ownerId, guest)

    const fresh = await fetchAll(ownerId)
    commit({ scope: scopeFor(ownerId), ...fresh })

    // Only drop the guest copy once it is safely on the server, so a failed
    // upload can be retried on the next login instead of vanishing.
    if (guestHasData && uploadedCleanly) clearScope(scopeFor(null))
  }

  /** Returns true only if every guest write succeeded. */
  async function uploadGuestData(ownerId, guest) {
    let ok = true

    // 1. Recipes first: their new UUIDs are needed to rewrite the keys that
    //    guest favourites, lists and shopping entries point at.
    const localIdMap = new Map()
    const localRecipes = guest.userRecipes.filter(r => String(r.id).startsWith('local_'))

    if (localRecipes.length) {
      const { data: uploaded, error } = await supabase
        .from('user_recipes')
        .insert(localRecipes.map(r => ({ ...toUserRecipeRow(r), user_id: ownerId })))
        .select()

      if (error) {
        console.error('Local recipe upload failed:', error)
        showError('Some recipes made while logged out could not be uploaded.')
        ok = false
      } else if (uploaded?.length) {
        // insert().select() returns rows in the order they were supplied.
        uploaded.forEach((row, i) => {
          localIdMap.set('u_' + localRecipes[i].id, 'u_' + row.id)
        })
        for (const row of uploaded) {
          await logActivityFor(ownerId, 'created', { recipe_key: 'u_' + row.id, recipe_name: row.name })
        }
        if (!await addRecipesToMyRecipesList(ownerId, uploaded)) ok = false
      }
    }

    // Rewrites a guest key to its uploaded equivalent, dropping keys whose
    // recipe failed to upload (they'd dangle otherwise).
    const remap = key => {
      const text = keyToText(key)
      if (!isUserRecipeKey(text)) return text
      if (localIdMap.has(text)) return localIdMap.get(text)
      return userRecipeId(text).startsWith('local_') ? null : text
    }

    // 2. Favourites.
    const favRows = [...guest.favorites]
      .map(remap).filter(Boolean)
      .map(recipe_key => ({ user_id: ownerId, recipe_key }))
    if (favRows.length) {
      if (!await run(
        supabase.from('favorites').upsert(favRows, { onConflict: 'user_id,recipe_key' }),
        'Some saved recipes could not be uploaded.',
      )) ok = false
    }

    // 3. Shopping list, including which ingredients were ticked off.
    const shopRows = [...guest.shoppingList]
      .map(key => {
        const recipe_key = remap(key)
        return recipe_key
          ? { user_id: ownerId, recipe_key, checked: guest.shopChecked[keyToText(key)] || [] }
          : null
      })
      .filter(Boolean)
    if (shopRows.length) {
      if (!await run(
        supabase.from('shopping_list').upsert(shopRows, { onConflict: 'user_id,recipe_key' }),
        'Your shopping list could not be uploaded.',
      )) ok = false
    }

    // 4. Ratings and notes.
    const ratingRows = Object.entries(guest.ratings)
      .map(([key, rating]) => {
        const recipe_key = remap(key)
        return recipe_key ? { user_id: ownerId, recipe_key, rating } : null
      })
      .filter(Boolean)
    if (ratingRows.length) {
      if (!await run(
        supabase.from('ratings').upsert(ratingRows, { onConflict: 'user_id,recipe_key' }),
        'Some ratings could not be uploaded.',
      )) ok = false
    }

    const noteRows = Object.entries(guest.notes)
      .map(([key, body]) => {
        const recipe_key = remap(key)
        return recipe_key ? { user_id: ownerId, recipe_key, body } : null
      })
      .filter(Boolean)
    if (noteRows.length) {
      if (!await run(
        supabase.from('notes').upsert(noteRows, { onConflict: 'user_id,recipe_key' }),
        'Some notes could not be uploaded.',
      )) ok = false
    }

    // 5. Lists. These had no upload path at all before, so a list made while
    //    logged out was silently destroyed by the first sync.
    const localLists = guest.lists.filter(l => String(l.id).startsWith('local_'))
    for (const list of localLists) {
      const { data: created, error } = await supabase
        .from('lists')
        .insert({ name: list.name, user_id: ownerId })
        .select('id')
        .maybeSingle()

      if (error || !created) {
        console.error('Local list upload failed:', error)
        showError(`List “${list.name}” could not be uploaded.`)
        ok = false
        continue
      }

      const itemRows = list.items
        .map(remap).filter(Boolean)
        .map(recipe_key => ({ list_id: created.id, recipe_key }))
      if (itemRows.length) {
        if (!await run(
          supabase.from('list_items').upsert(itemRows, { onConflict: 'list_id,recipe_key' }),
          `Items in “${list.name}” could not be uploaded.`,
        )) ok = false
      }
    }

    return ok
  }

  /** Reads every owned slice, and repairs rows left over from older schemas. */
  async function fetchAll(ownerId) {
    const [favsRes, ratingsRes, notesRes, shopRes, recipesRes, listsRes] = await Promise.all([
      supabase.from('favorites').select('recipe_key').eq('user_id', ownerId),
      supabase.from('ratings').select('recipe_key,recipe_name,rating').eq('user_id', ownerId),
      supabase.from('notes').select('recipe_key,recipe_name,body').eq('user_id', ownerId),
      supabase.from('shopping_list').select('recipe_key,checked').eq('user_id', ownerId),
      supabase.from('user_recipes').select('*').eq('user_id', ownerId).order('created_at', { ascending: false }),
      supabase.from('lists').select('*, list_items(recipe_key)').eq('user_id', ownerId),
    ])

    // Degrade per slice rather than all-or-nothing. One failing query used to
    // throw and abandon the whole sync, so a single unapplied migration (say,
    // ratings.recipe_key not existing yet) took favourites, recipes and lists
    // down with it. Now each slice that succeeded is kept, and the first
    // failure is reported once.
    const failures = [
      ['saved recipes',  favsRes],
      ['ratings',        ratingsRes],
      ['notes',          notesRes],
      ['shopping list',  shopRes],
      ['your recipes',   recipesRes],
      ['lists',          listsRes],
    ].filter(([, res]) => res.error)

    if (failures.length) {
      for (const [label, res] of failures) {
        console.error(`Could not load ${label}:`, res.error)
      }
      const [label, res] = failures[0]
      showError(describeError(res.error, `Could not load your ${label}.`))
    }

    const fetchedRecipes = (recipesRes.data || []).map(normalizeUserRecipe)

    // Migration 006 stamped pre-existing ratings/notes with 'legacy:<name>'
    // because the catalog needed to map a name to a key and the database has no
    // access to it. Resolve those here, where the catalog is available.
    const ratingRows = ratingsRes.error ? [] : await backfillLegacyKeys('ratings', ratingsRes.data, ownerId, fetchedRecipes)
    const noteRows   = notesRes.error   ? [] : await backfillLegacyKeys('notes',   notesRes.data,   ownerId, fetchedRecipes)

    // For a slice that failed, keep the device's copy: replacing it with an
    // empty server response would look like the user's data had been deleted.
    const local = hydrate(scopeFor(ownerId))

    return {
      favorites: favsRes.error
        ? local.favorites
        : new Set((favsRes.data || []).map(f => keyFromText(f.recipe_key))),
      ratings: ratingsRes.error
        ? local.ratings
        : Object.fromEntries(ratingRows.map(r => [keyToText(r.recipe_key), r.rating])),
      notes: notesRes.error
        ? local.notes
        : Object.fromEntries(noteRows.map(n => [keyToText(n.recipe_key), n.body])),
      shoppingList: shopRes.error
        ? local.shoppingList
        : new Set((shopRes.data || []).map(s => keyFromText(s.recipe_key))),
      shopChecked: shopRes.error
        ? local.shopChecked
        : Object.fromEntries((shopRes.data || []).map(s => [keyToText(s.recipe_key), s.checked || []])),
      userRecipes: recipesRes.error ? local.userRecipes : fetchedRecipes,
      lists: listsRes.error
        ? local.lists
        : (listsRes.data || []).map(l => ({
            id: l.id,
            name: l.name,
            items: (l.list_items || []).map(li => keyFromText(li.recipe_key)),
          })),
    }
  }

  async function backfillLegacyKeys(table, rows, ownerId, ownRecipes) {
    const out = []
    for (const row of rows || []) {
      if (!String(row.recipe_key).startsWith('legacy:')) { out.push(row); continue }

      const name = row.recipe_name || String(row.recipe_key).slice('legacy:'.length)
      const key  = keyForName(name, ownRecipes)
      if (key === null) {
        // Can't be attributed to any recipe this user can see. Leave the row
        // untouched rather than deleting data we might be able to resolve later.
        console.warn(`Could not resolve legacy ${table} key for “${name}”`)
        continue
      }

      const { error } = await supabase
        .from(table)
        .update({ recipe_key: keyToText(key) })
        .match({ user_id: ownerId, recipe_key: row.recipe_key })
      if (error) { console.error(`Backfill of ${table} failed:`, error); continue }

      out.push({ ...row, recipe_key: keyToText(key) })
    }
    return out
  }

  // ── activity ───────────────────────────────────────────────
  /**
   * Records a feed event, replacing any previous event of the same kind for the
   * same recipe.
   *
   * Re-saving a recipe used to append another row every time, and un-saving
   * left the old one behind, so the feed accumulated events for actions that
   * had since been undone.
   */
  async function logActivityFor(ownerId, type, payload) {
    if (!ownerId) return
    if (payload.recipe_key) {
      await Promise.resolve(
        supabase.from('activity').delete().match({
          user_id: ownerId, type, recipe_key: keyToText(payload.recipe_key),
        })
      ).catch(err => console.error('Could not clear previous activity:', err))
    }
    await run(
      supabase.from('activity').insert({ user_id: ownerId, type, ...payload }),
      'Could not update your activity feed.',
    )
  }

  function logActivity(type, payload) {
    if (!uid) return
    logActivityFor(uid, type, payload)
  }

  function removeActivity(type, key) {
    if (!uid) return
    run(
      supabase.from('activity').delete().match({ user_id: uid, type, recipe_key: keyToText(key) }),
      null,
    )
  }

  // ── favorites ──────────────────────────────────────────────
  // Note on all the handlers below: the Supabase call and any activity logging
  // happen *outside* the setState updater. Previously they lived inside it, and
  // React 18's StrictMode double-invokes updaters — so every one of these fired
  // twice in development, duplicating activity rows.
  function toggleFav(key, recipeName) {
    const wasFav = dataRef.current.favorites.has(key)

    commit(d => {
      const next = new Set(d.favorites)
      if (wasFav) next.delete(key); else next.add(key)
      return { ...d, favorites: next }
    })

    if (!uid) return
    const recipe_key = keyToText(key)
    if (wasFav) {
      run(
        supabase.from('favorites').delete().match({ user_id: uid, recipe_key }),
        'Could not remove favorite.',
      )
      removeActivity('saved', key)
    } else {
      run(
        supabase.from('favorites').upsert({ user_id: uid, recipe_key }, { onConflict: 'user_id,recipe_key' }),
        'Could not save favorite.',
      )
      if (recipeName) logActivity('saved', { recipe_key, recipe_name: recipeName })
    }
  }

  // ── ratings ────────────────────────────────────────────────
  function setRating(key, value, recipeName) {
    const prop = keyToText(key)

    commit(d => {
      const next = { ...d.ratings }
      if (value) next[prop] = value; else delete next[prop]
      return { ...d, ratings: next }
    })

    if (!uid) return
    if (value) {
      run(
        supabase.from('ratings').upsert(
          { user_id: uid, recipe_key: prop, recipe_name: recipeName ?? null, rating: value },
          { onConflict: 'user_id,recipe_key' },
        ),
        'Could not save rating.',
      )
      if (value >= 4 && recipeName) {
        logActivity('rated', { recipe_key: prop, recipe_name: recipeName, rating: value })
      } else {
        removeActivity('rated', key)
      }
    } else {
      run(
        supabase.from('ratings').delete().match({ user_id: uid, recipe_key: prop }),
        'Could not remove rating.',
      )
      removeActivity('rated', key)
    }
  }

  // ── notes ──────────────────────────────────────────────────
  function setNote(key, value, recipeName) {
    const prop = keyToText(key)

    commit(d => {
      const next = { ...d.notes }
      if (value) next[prop] = value; else delete next[prop]
      return { ...d, notes: next }
    })

    if (!uid) return
    if (value) {
      run(
        supabase.from('notes').upsert(
          { user_id: uid, recipe_key: prop, recipe_name: recipeName ?? null, body: value },
          { onConflict: 'user_id,recipe_key' },
        ),
        'Could not save note.',
      )
    } else {
      run(
        supabase.from('notes').delete().match({ user_id: uid, recipe_key: prop }),
        'Could not remove note.',
      )
    }
  }

  // ── shopping ───────────────────────────────────────────────
  function toggleShopping(key) {
    const wasListed = dataRef.current.shoppingList.has(key)
    const prop = keyToText(key)

    commit(d => {
      const next    = new Set(d.shoppingList)
      const checked = { ...d.shopChecked }
      if (wasListed) { next.delete(key); delete checked[prop] }
      else next.add(key)
      return { ...d, shoppingList: next, shopChecked: checked }
    })

    if (!uid) return
    if (wasListed) {
      run(
        supabase.from('shopping_list').delete().match({ user_id: uid, recipe_key: prop }),
        'Could not remove from shopping list.',
      )
    } else {
      run(
        supabase.from('shopping_list').upsert(
          { user_id: uid, recipe_key: prop, checked: [] },
          { onConflict: 'user_id,recipe_key' },
        ),
        'Could not add to shopping list.',
      )
    }
  }

  /** Ticks or unticks ingredient `index` of the recipe at `key`. */
  function toggleShopItem(key, index) {
    const prop    = keyToText(key)
    const current = dataRef.current.shopChecked[prop] || []
    const next    = current.includes(index)
      ? current.filter(i => i !== index)
      : [...current, index].sort((a, b) => a - b)

    commit(d => ({ ...d, shopChecked: { ...d.shopChecked, [prop]: next } }))

    if (!uid) return
    run(
      supabase.from('shopping_list').update({ checked: next }).match({ user_id: uid, recipe_key: prop }),
      'Could not save your checked ingredients.',
    )
  }

  function isShopItemChecked(key, index) {
    return (shopChecked[keyToText(key)] || []).includes(index)
  }

  function clearShopping() {
    commit(d => ({ ...d, shoppingList: new Set(), shopChecked: {} }))
    if (!uid) return
    run(
      supabase.from('shopping_list').delete().eq('user_id', uid),
      'Could not clear shopping list.',
    )
  }

  // ── user recipes ───────────────────────────────────────────
  /** Adds recipes to the "My Recipes" system list, creating it on first use. */
  async function addRecipesToMyRecipesList(ownerId, createdRecipes) {
    try {
      let { data: myList, error: findErr } = await supabase
        .from('lists')
        .select('id')
        .eq('user_id', ownerId)
        .eq('name', MY_RECIPES_LIST)
        .maybeSingle()
      if (findErr) throw findErr

      if (!myList) {
        const { data: newList, error: listErr } = await supabase
          .from('lists')
          .insert({ name: MY_RECIPES_LIST, user_id: ownerId })
          .select('id, name')
          .single()
        if (listErr) throw listErr
        myList = newList
        commit(d => ({
          ...d,
          lists: [{ id: newList.id, name: MY_RECIPES_LIST, items: [] }, ...d.lists],
        }))
      }

      const recipeKeys = createdRecipes.map(r => 'u_' + r.id)
      const { error: itemsErr } = await supabase
        .from('list_items')
        .upsert(
          recipeKeys.map(recipe_key => ({ list_id: myList.id, recipe_key })),
          { onConflict: 'list_id,recipe_key' },
        )
      if (itemsErr) throw itemsErr

      commit(d => ({
        ...d,
        lists: d.lists.map(l =>
          l.id === myList.id
            ? { ...l, items: [...new Set([...l.items, ...recipeKeys])] }
            : l
        ),
      }))
      return true
    } catch (err) {
      console.error('Failed to add to My Recipes list:', err)
      showError('Could not add recipe to My Recipes list.')
      return false
    }
  }

  async function createUserRecipe(fields) {
    if (uid) {
      const { data: created, error } = await supabase
        .from('user_recipes')
        .insert({ ...toUserRecipeRow(fields), user_id: uid })
        .select()
        .single()
      if (error) throw error

      const normalized = normalizeUserRecipe(created)
      commit(d => ({ ...d, userRecipes: [normalized, ...d.userRecipes] }))
      logActivity('created', { recipe_key: 'u_' + created.id, recipe_name: created.name })
      await addRecipesToMyRecipesList(uid, [created])
      return normalized
    }

    const recipe = normalizeUserRecipe({
      ...fields,
      id: 'local_' + Date.now(),
      user_id: null,
      created_at: new Date().toISOString(),
    })
    commit(d => ({ ...d, userRecipes: [recipe, ...d.userRecipes] }))
    return recipe
  }

  async function updateUserRecipe(id, fields) {
    const row = toUserRecipeRow(fields)

    if (uid && !String(id).startsWith('local_')) {
      const { data: updated, error } = await supabase
        .from('user_recipes')
        .update(row)
        .match({ id, user_id: uid })
        .select()
        .single()
      if (error) throw error

      const normalized = normalizeUserRecipe(updated)
      commit(d => ({
        ...d,
        userRecipes: d.userRecipes.map(r => (r.id === id ? normalized : r)),
      }))
      return normalized
    }

    // Computed outside the updater so the updater stays pure — StrictMode
    // double-invokes it in development.
    const existing = dataRef.current.userRecipes.find(r => r.id === id)
    if (!existing) return null
    const merged = normalizeUserRecipe({ ...existing, ...row })

    commit(d => ({
      ...d,
      userRecipes: d.userRecipes.map(r => (r.id === id ? merged : r)),
    }))
    return merged
  }

  async function deleteUserRecipe(id) {
    const key  = 'u_' + id
    const prop = keyToText(key)

    // Purge every local reference. Server-side, the on_user_recipe_deleted
    // trigger does the same for favorites / shopping_list / list_items /
    // activity / ratings / notes, including other users' rows — recipe_key is
    // plain text with no foreign key, so nothing cascaded before.
    commit(d => {
      const favorites = new Set(d.favorites);    favorites.delete(key)
      const shopping  = new Set(d.shoppingList); shopping.delete(key)
      const ratings = { ...d.ratings }; delete ratings[prop]
      const notes   = { ...d.notes };   delete notes[prop]
      const checked = { ...d.shopChecked }; delete checked[prop]
      return {
        ...d,
        favorites,
        shoppingList: shopping,
        ratings,
        notes,
        shopChecked: checked,
        userRecipes: d.userRecipes.filter(r => r.id !== id),
        lists: d.lists.map(l => ({ ...l, items: l.items.filter(k => k !== key) })),
      }
    })

    if (!uid || String(id).startsWith('local_')) return
    run(
      supabase.from('user_recipes').delete().match({ id, user_id: uid }),
      'Could not delete recipe.',
    )
  }

  // ── lists ──────────────────────────────────────────────────
  async function createList(name) {
    if (uid) {
      const { data: created, error } = await supabase
        .from('lists')
        .insert({ name, user_id: uid })
        .select()
        .single()
      if (error) throw error
      const list = { id: created.id, name: created.name, items: [] }
      commit(d => ({ ...d, lists: [list, ...d.lists] }))
      return list
    }

    const list = { id: 'local_' + Date.now(), name, items: [] }
    commit(d => ({ ...d, lists: [list, ...d.lists] }))
    return list
  }

  async function deleteList(id) {
    commit(d => ({ ...d, lists: d.lists.filter(l => l.id !== id) }))
    if (!uid || String(id).startsWith('local_')) return
    run(
      supabase.from('lists').delete().match({ id, user_id: uid }),
      'Could not delete list.',
    )
  }

  async function renameList(id, name) {
    commit(d => ({ ...d, lists: d.lists.map(l => (l.id === id ? { ...l, name } : l)) }))
    if (!uid || String(id).startsWith('local_')) return
    run(
      supabase.from('lists').update({ name }).match({ id, user_id: uid }),
      'Could not rename list.',
    )
  }

  function addToList(listId, key, recipeName) {
    // Read from the ref: a list created moments ago is not in the closure yet.
    const list = dataRef.current.lists.find(l => l.id === listId)
    if (!list || list.items.includes(key)) return

    commit(d => ({
      ...d,
      lists: d.lists.map(l =>
        l.id === listId && !l.items.includes(key) ? { ...l, items: [...l.items, key] } : l
      ),
    }))

    if (!uid || String(listId).startsWith('local_')) return
    run(
      supabase.from('list_items').upsert(
        { list_id: listId, recipe_key: keyToText(key) },
        { onConflict: 'list_id,recipe_key' },
      ),
      'Could not add to list.',
    )
    if (recipeName) {
      logActivity('listed', {
        recipe_key: keyToText(key), recipe_name: recipeName, list_name: list.name,
      })
    }
  }

  function removeFromList(listId, key) {
    commit(d => ({
      ...d,
      lists: d.lists.map(l =>
        l.id === listId ? { ...l, items: l.items.filter(k => k !== key) } : l
      ),
    }))

    if (!uid || String(listId).startsWith('local_')) return
    run(
      supabase.from('list_items').delete().match({ list_id: listId, recipe_key: keyToText(key) }),
      'Could not remove from list.',
    )
  }

  return (
    <AppContext.Provider value={{
      syncing,
      favorites,    toggleFav,
      ratings,      setRating,
      notes,        setNote,
      shoppingList, toggleShopping,
      toggleShopItem, isShopItemChecked, clearShopping,
      userRecipes,  createUserRecipe, updateUserRecipe, deleteUserRecipe,
      lists,        createList, deleteList, renameList, addToList, removeFromList,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
