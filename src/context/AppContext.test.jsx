import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'

// Hoisted so the module mock below can reach it.
const h = vi.hoisted(() => ({ client: null }))

vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { AppProvider, useApp } = await import('./AppContext')
const { AuthProvider }        = await import('./AuthContext')
const { ToastProvider }       = await import('./ToastContext')

/** Exposes the context to assertions and lets tests call its actions. */
let api = null
function Probe() {
  api = useApp()
  return (
    <div>
      <span data-testid="favs">{[...api.favorites].map(String).sort().join(',')}</span>
      <span data-testid="recipes">{api.userRecipes.map(r => r.name).join(',')}</span>
      <span data-testid="lists">{api.lists.map(l => `${l.name}[${l.items.join('|')}]`).join(',')}</span>
      <span data-testid="ratings">{JSON.stringify(api.ratings)}</span>
      <span data-testid="notes">{JSON.stringify(api.notes)}</span>
      <span data-testid="shopping">{[...api.shoppingList].map(String).sort().join(',')}</span>
    </div>
  )
}

function renderApp() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider><Probe /></AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

const seedProfile = uid => ({ profiles: [{ id: uid, username: 'cook', username_set: true }] })

beforeEach(() => {
  localStorage.clear()
  api = null
})

describe('guest session', () => {
  it('keeps locally-created data without touching the database', async () => {
    h.client = createMockSupabase()
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())

    await act(async () => { await api.createUserRecipe({ name: 'Guest Loaf', category: 'Dessert', ingredients: [], steps: [] }) })
    act(() => api.toggleFav(3, 'Some Recipe'))

    expect(screen.getByTestId('recipes').textContent).toBe('Guest Loaf')
    expect(screen.getByTestId('favs').textContent).toBe('3')
    expect(h.client.__db.user_recipes).toHaveLength(0)
    expect(h.client.__db.favorites).toHaveLength(0)

    // Persisted under the guest scope, not a global key.
    expect(localStorage.getItem('ate:guest:favs')).toBe('["3"]')
    expect(localStorage.getItem('ate_favs')).toBeNull()
  })
})

describe('signing in', () => {
  it('uploads everything created while logged out, remapping local recipe keys', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())

    // Build up a guest session: a recipe, a favourite on it, a list, a rating,
    // a note and a shopping entry.
    let local
    await act(async () => {
      local = await api.createUserRecipe({
        name: 'Nanna Pasta', category: 'Main Dish',
        ingredients: [{ amount: '1', unit: 'cup', item: 'flour' }], steps: ['Mix'],
        time_minutes: 25, servings: 2,
      })
    })
    const localKey = 'u_' + local.id
    expect(local.id.startsWith('local_')).toBe(true)

    act(() => api.toggleFav(localKey, 'Nanna Pasta'))
    act(() => api.toggleFav(11, 'Catalog One'))
    act(() => api.setRating(localKey, 5, 'Nanna Pasta'))
    act(() => api.setNote(localKey, 'needs more salt', 'Nanna Pasta'))
    act(() => api.toggleShopping(localKey))
    let list
    await act(async () => { list = await api.createList('Weeknights') })
    act(() => api.addToList(list.id, localKey, 'Nanna Pasta'))

    // Now sign in.
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(h.client.__db.user_recipes).toHaveLength(1))
    await waitFor(() => expect(api.syncing).toBe(false))

    const uploaded = h.client.__db.user_recipes[0]
    expect(uploaded.user_id).toBe('user-1')
    expect(uploaded.name).toBe('Nanna Pasta')
    // Regression: the UI-only camelCase field must not reach the insert.
    expect(uploaded).not.toHaveProperty('timeMinutes')
    expect(uploaded.time_minutes).toBe(25)

    const serverKey = 'u_' + uploaded.id

    // Every reference was remapped from the local id to the real one.
    expect(h.client.__db.favorites.map(f => f.recipe_key).sort())
      .toEqual(['11', serverKey].sort())
    expect(h.client.__db.ratings[0]).toMatchObject({ recipe_key: serverKey, rating: 5 })
    expect(h.client.__db.notes[0]).toMatchObject({ recipe_key: serverKey, body: 'needs more salt' })
    expect(h.client.__db.shopping_list[0].recipe_key).toBe(serverKey)

    // Regression: lists had no upload path at all and were silently destroyed.
    const names = h.client.__db.lists.map(l => l.name)
    expect(names).toContain('Weeknights')
    expect(names).toContain('My Recipes')
    const weeknights = h.client.__db.lists.find(l => l.name === 'Weeknights')
    expect(h.client.__db.list_items.filter(i => i.list_id === weeknights.id).map(i => i.recipe_key))
      .toEqual([serverKey])

    // Guest scope cleared only after a clean upload.
    expect(localStorage.getItem('ate:guest:favs')).toBeNull()
    expect(localStorage.getItem('ate:guest:lists')).toBeNull()
  })

  it('keeps guest data for a retry when an upload fails', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => {
      await api.createUserRecipe({ name: 'Doomed', category: 'Dessert', ingredients: [], steps: [] })
    })

    h.client.__failOn('user_recipes', 'insert')

    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    // The guest copy survives so the next login can retry it.
    expect(localStorage.getItem('ate:guest:user_recipes')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('ate:guest:user_recipes'))[0].name).toBe('Doomed')
    expect(h.client.__db.user_recipes).toHaveLength(0)
  })

  it('replaces local state with the server’s rather than unioning it', async () => {
    // A favourite removed on another device must not be resurrected.
    h.client = createMockSupabase({
      ...seedProfile('user-1'),
      favorites: [{ id: 1, user_id: 'user-1', recipe_key: '7' }],
    })
    localStorage.setItem('ate:user-1:favs', JSON.stringify(['7', '42']))

    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    expect(screen.getByTestId('favs').textContent).toBe('7')
  })
})

describe('signing out', () => {
  it('does not leave the previous account’s data on screen', async () => {
    h.client = createMockSupabase({
      ...seedProfile('user-1'),
      user_recipes: [{ id: 'ur-secret', user_id: 'user-1', name: 'Private Cake', category: 'Dessert', ingredients: [], steps: [], time_minutes: 10 }],
      favorites:    [{ id: 1, user_id: 'user-1', recipe_key: '5' }],
      ratings:      [{ id: 1, user_id: 'user-1', recipe_key: '5', rating: 4 }],
      notes:        [{ id: 1, user_id: 'user-1', recipe_key: '5', body: 'secret note' }],
    })

    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(screen.getByTestId('recipes').textContent).toBe('Private Cake'))
    expect(screen.getByTestId('favs').textContent).toBe('5')

    await act(async () => { h.client.__setSession(null) })

    await waitFor(() => expect(screen.getByTestId('recipes').textContent).toBe(''))
    expect(screen.getByTestId('favs').textContent).toBe('')
    expect(screen.getByTestId('ratings').textContent).toBe('{}')
    expect(screen.getByTestId('notes').textContent).toBe('{}')

    // The data still exists under its own scope, just not in the guest session.
    expect(localStorage.getItem('ate:user-1:favs')).toBe('["5"]')
  })

  it('does not show one account’s data to the next', async () => {
    h.client = createMockSupabase({
      profiles: [
        { id: 'user-1', username: 'a', username_set: true },
        { id: 'user-2', username: 'b', username_set: true },
      ],
      user_recipes: [{ id: 'ur-1', user_id: 'user-1', name: 'A Recipe', category: 'Dessert', ingredients: [], steps: [] }],
    })

    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(screen.getByTestId('recipes').textContent).toBe('A Recipe'))

    await act(async () => { h.client.__setSession(null) })
    await act(async () => { h.client.__setSession(fakeSession('user-2')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    expect(screen.getByTestId('recipes').textContent).toBe('')
  })
})

describe('legacy local data hydration', () => {
  // The ate_* -> ate:guest:* key move is covered in storage.test.js; these seed
  // the guest scope directly and assert on the *shape* conversions hydrate does.
  it('rekeys ratings and notes that were stored by recipe name', async () => {
    localStorage.setItem('ate:guest:user_recipes', JSON.stringify([
      { id: 'local_9', name: 'Guac', category: 'Snack & Appetizer', ingredients: [], steps: [] },
    ]))
    localStorage.setItem('ate:guest:ratings', JSON.stringify({ Guac: 4, 'Not A Real Recipe': 2 }))
    localStorage.setItem('ate:guest:notes',   JSON.stringify({ Guac: 'extra lime' }))

    h.client = createMockSupabase()
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())

    // Keyed by 'u_local_9' now; the unresolvable name is dropped rather than
    // being uploaded as a recipe_key later.
    expect(JSON.parse(screen.getByTestId('ratings').textContent)).toEqual({ u_local_9: 4 })
    expect(JSON.parse(screen.getByTestId('notes').textContent)).toEqual({ u_local_9: 'extra lime' })
  })

  it('maps a legacy catalog-name rating onto its catalog index', async () => {
    const { default: RECIPES } = await import('../data/recipes.json')
    localStorage.setItem('ate:guest:ratings', JSON.stringify({ [RECIPES[12].name]: 3 }))

    h.client = createMockSupabase()
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())

    expect(JSON.parse(screen.getByTestId('ratings').textContent)).toEqual({ 12: 3 })
  })

  it('converts the old flat shop_checked array into per-recipe indices', async () => {
    localStorage.setItem('ate:guest:shopping', JSON.stringify(['5', 'u_abc']))
    localStorage.setItem('ate:guest:shop_checked', JSON.stringify(['5-0', '5-2', 'u_abc-1']))

    h.client = createMockSupabase()
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())

    expect(api.isShopItemChecked(5, 0)).toBe(true)
    expect(api.isShopItemChecked(5, 2)).toBe(true)
    expect(api.isShopItemChecked(5, 1)).toBe(false)
    expect(api.isShopItemChecked('u_abc', 1)).toBe(true)
    // Catalog key 5 must not swallow key 15's entries.
    expect(api.isShopItemChecked(15, 0)).toBe(false)
  })
})

describe('activity feed writes', () => {
  it('replaces rather than accumulates a save event, and clears it on unsave', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { api.toggleFav(4, 'Toast') })
    await waitFor(() => expect(h.client.__db.activity.filter(a => a.type === 'saved')).toHaveLength(1))

    await act(async () => { api.toggleFav(4, 'Toast') })   // unsave
    await act(async () => { api.toggleFav(4, 'Toast') })   // re-save
    await waitFor(() => expect(h.client.__db.activity.filter(a => a.type === 'saved')).toHaveLength(1))

    await act(async () => { api.toggleFav(4, 'Toast') })   // unsave again
    await waitFor(() => expect(h.client.__db.activity.filter(a => a.type === 'saved')).toHaveLength(0))
  })

  it('logs a rating only at 4+ stars and withdraws it when lowered', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { api.setRating(9, 2, 'Meh') })
    await waitFor(() => expect(h.client.__db.ratings).toHaveLength(1))
    expect(h.client.__db.activity.filter(a => a.type === 'rated')).toHaveLength(0)

    await act(async () => { api.setRating(9, 5, 'Meh') })
    await waitFor(() => expect(h.client.__db.activity.filter(a => a.type === 'rated')).toHaveLength(1))

    await act(async () => { api.setRating(9, 1, 'Meh') })
    await waitFor(() => expect(h.client.__db.activity.filter(a => a.type === 'rated')).toHaveLength(0))
  })
})

describe('ratings and notes are keyed by recipe key', () => {
  it('does not share a rating between a user recipe and a catalog recipe of the same name', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { api.setRating(2, 5, 'Carbonara') })
    await act(async () => { api.setRating('u_xyz', 1, 'Carbonara') })

    expect(api.ratings['2']).toBe(5)
    expect(api.ratings['u_xyz']).toBe(1)
    await waitFor(() => expect(h.client.__db.ratings).toHaveLength(2))
  })
})

describe('deleting a user recipe', () => {
  it('purges every local reference to it', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    let created
    await act(async () => {
      created = await api.createUserRecipe({ name: 'Doomed', category: 'Dessert', ingredients: [], steps: [] })
    })
    const key = 'u_' + created.id

    act(() => api.toggleFav(key, 'Doomed'))
    act(() => api.toggleShopping(key))
    act(() => api.setRating(key, 5, 'Doomed'))
    act(() => api.setNote(key, 'note', 'Doomed'))
    await waitFor(() => expect(api.favorites.has(key)).toBe(true))

    await act(async () => { await api.deleteUserRecipe(created.id) })

    expect(api.favorites.has(key)).toBe(false)
    expect(api.shoppingList.has(key)).toBe(false)
    expect(api.ratings[key]).toBeUndefined()
    expect(api.notes[key]).toBeUndefined()
    expect(api.userRecipes.find(r => r.id === created.id)).toBeUndefined()
    for (const l of api.lists) expect(l.items).not.toContain(key)
  })
})

describe('editing a user recipe', () => {
  it('persists the change and keeps the row shape clean', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    let created
    await act(async () => {
      created = await api.createUserRecipe({ name: 'Before', category: 'Dessert', ingredients: [], steps: ['a'], time_minutes: 5 })
    })
    await act(async () => {
      await api.updateUserRecipe(created.id, { name: 'After', category: 'Dessert', ingredients: [], steps: ['b'], time_minutes: 15 })
    })

    expect(api.userRecipes[0].name).toBe('After')
    expect(api.userRecipes[0].timeMinutes).toBe(15)
    const row = h.client.__db.user_recipes.find(r => r.id === created.id)
    expect(row.name).toBe('After')
    expect(row).not.toHaveProperty('timeMinutes')
  })
})

describe('resilience to an unapplied migration', () => {
  // This is the shape of the real-world report: migration 006 adds
  // ratings.recipe_key, and until it runs PostgREST answers 42703. That used to
  // throw out of fetchAll and abandon the whole sync, so lists / favourites /
  // recipes all silently failed to load too.
  const MISSING_COLUMN = { code: '42703', message: 'column ratings.recipe_key does not exist' }

  it('still loads lists and favourites when the ratings query fails', async () => {
    h.client = createMockSupabase({
      ...seedProfile('user-1'),
      favorites: [{ id: 1, user_id: 'user-1', recipe_key: '5' }],
      lists: [{ id: 'ls-1', user_id: 'user-1', name: 'Weeknights' }],
      user_recipes: [{ id: 'ur-1', user_id: 'user-1', name: 'Dal', category: 'Main Dish', ingredients: [], steps: [] }],
    })

    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    h.client.__failOn('ratings', 'select', MISSING_COLUMN)

    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    // The slices that worked are present...
    expect(screen.getByTestId('favs').textContent).toBe('5')
    expect(screen.getByTestId('recipes').textContent).toBe('Dal')
    expect(api.lists.map(l => l.name)).toContain('Weeknights')
    // ...and the failure is explained rather than swallowed.
    expect(await screen.findByRole('alert')).toHaveTextContent(/migration may not have been applied/)
  })

  it('creating a list still works after a partial sync', async () => {
    h.client = createMockSupabase(seedProfile('user-1'))
    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    h.client.__failOn('notes', 'select', MISSING_COLUMN)

    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { await api.createList('Made Anyway') })

    expect(api.lists.map(l => l.name)).toContain('Made Anyway')
    await waitFor(() => expect(h.client.__db.lists.map(l => l.name)).toContain('Made Anyway'))
  })

  it('keeps the device copy of a slice whose query failed', async () => {
    localStorage.setItem('ate:user-1:ratings', JSON.stringify({ 5: 4 }))
    h.client = createMockSupabase(seedProfile('user-1'))

    renderApp()
    await waitFor(() => expect(api).not.toBeNull())
    h.client.__failOn('ratings', 'select', MISSING_COLUMN)

    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    // Not wiped to {} by an empty server answer.
    expect(JSON.parse(screen.getByTestId('ratings').textContent)).toEqual({ 5: 4 })
  })
})
