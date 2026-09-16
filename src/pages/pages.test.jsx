import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'
import RECIPES from '../data/recipes.json'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: Profile }     = await import('./Profile')
const { default: Saved }       = await import('./Saved')
const { default: Pantry }      = await import('./Pantry')
const { AppProvider, useApp }  = await import('../context/AppContext')
const { AuthProvider }         = await import('../context/AuthContext')
const { ToastProvider }        = await import('../context/ToastContext')

let api = null
function Expose() { api = useApp(); return null }

function renderPage(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>
          <AppProvider>
            <Expose />
            {ui}
          </AppProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

const USER_RECIPE = {
  id: 'ur-1',
  user_id: 'user-1',
  name: 'Nanna Dal',
  category: 'Main Dish',
  dietary: ['vegetarian'],
  ingredients: [
    { amount: '1', unit: 'cup', item: 'toor dal' },
    { amount: '2', unit: 'tsp', item: 'cumin' },
  ],
  steps: ['Rinse', 'Boil'],
  time_minutes: 40,
  servings: 4,
}

const seed = extra => ({
  profiles: [{ id: 'user-1', username: 'cook', username_set: true, is_private: false }],
  ...extra,
})

beforeEach(() => {
  localStorage.clear()
  api = null
})

describe('Fridge — shopping list', () => {
  // One row per ingredient now, not per recipe — so a row carries its own
  // measure and names whatever wanted it.
  const dalRows = checked => [
    { id: 1, user_id: 'user-1', item: 'toor dal', display: 'toor dal', checked,
      sources: [{ key: 'u_ur-1', name: 'Nanna Dal', amount: '1', unit: 'cup' }] },
    { id: 2, user_id: 'user-1', item: 'cumin', display: 'cumin', checked: false,
      sources: [{ key: 'u_ur-1', name: 'Nanna Dal', amount: '2', unit: 'tsp' }] },
  ]

  it('renders each item with its measure and where it came from', async () => {
    h.client = createMockSupabase(seed({
      user_recipes:   [USER_RECIPE],
      shopping_items: dalRows(true),
    }))

    renderPage(<Pantry />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    expect(await screen.findByText('toor dal')).toBeTruthy()
    expect(screen.getByText('cumin')).toBeTruthy()
    expect(screen.getByText('1 cup')).toBeTruthy()
    // The recipe that wanted it, as a subtitle rather than a heading.
    expect(screen.getAllByText('Nanna Dal').length).toBeGreaterThan(0)

    // The stored flag drives the checkbox, one boolean per item.
    expect(screen.getAllByRole('checkbox', { checked: true }).length).toBe(1)
    expect(api.shoppingItems.get('toor dal').checked).toBe(true)
    expect(api.shoppingItems.get('cumin').checked).toBe(false)
  })

  it('persists a newly ticked item to the database', async () => {
    h.client = createMockSupabase(seed({
      user_recipes:   [USER_RECIPE],
      shopping_items: dalRows(false),
    }))

    renderPage(<Pantry />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))
    await screen.findByText('toor dal')

    await act(async () => { api.toggleShopItem('toor dal') })

    await waitFor(() => {
      const saved = h.client.__db.shopping_items.find(r => r.item === 'toor dal')
      expect(saved.checked).toBe(true)
    })
  })
})

describe('Profile — deleting a recipe', () => {
  it('asks for confirmation before deleting', async () => {
    h.client = createMockSupabase(seed({ user_recipes: [USER_RECIPE] }))

    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { screen.getByRole('button', { name: 'Delete Nanna Dal' }).click() })
    expect(screen.getByText(/Delete “Nanna Dal” permanently\?/)).toBeTruthy()

    // Backing out leaves it alone.
    await act(async () => { screen.getByRole('button', { name: 'Cancel' }).click() })
    expect(h.client.__db.user_recipes).toHaveLength(1)

    await act(async () => { screen.getByRole('button', { name: 'Delete Nanna Dal' }).click() })
    await act(async () => {
      const buttons = screen.getAllByRole('button', { name: 'Delete' })
      buttons[buttons.length - 1].click()
    })
    await waitFor(() => expect(h.client.__db.user_recipes).toHaveLength(0))
  })
})

describe('Profile — bio and privacy', () => {
  it('saves a bio, which previously had no editor at all', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { screen.getByRole('button', { name: 'Add bio' }).click() })
    fireEvent.change(screen.getByLabelText('Your bio'), {
      target: { value: 'I cook with too much garlic' },
    })
    await act(async () => { screen.getByRole('button', { name: 'Save bio' }).click() })

    await waitFor(() => {
      expect(h.client.__db.profiles[0].bio).toBe('I cook with too much garlic')
    })
  })

  it('toggles the private-recipes flag', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    const box = await screen.findByRole('checkbox', { name: /Private recipes/ })
    expect(box.checked).toBe(false)
    await act(async () => { box.click() })

    await waitFor(() => expect(h.client.__db.profiles[0].is_private).toBe(true))
  })
})

describe('Saved', () => {
  it('lists both catalog and user recipes, skipping keys that no longer resolve', async () => {
    h.client = createMockSupabase(seed({
      user_recipes: [USER_RECIPE],
      favorites: [
        { id: 1, user_id: 'user-1', recipe_key: '5' },
        { id: 2, user_id: 'user-1', recipe_key: 'u_ur-1' },
        { id: 3, user_id: 'user-1', recipe_key: 'u_deleted' },
      ],
    }))

    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    expect(await screen.findByText('Nanna Dal')).toBeTruthy()
    // A dangling key renders nothing rather than crashing.
    expect(screen.queryByText('u_deleted')).toBeNull()
  })

  it('confirms before deleting a list', async () => {
    h.client = createMockSupabase(seed({
      lists: [{ id: 'ls-1', user_id: 'user-1', name: 'Weeknights' }],
    }))

    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { screen.getByRole('tab', { name: /Lists/ }).click() })
    await act(async () => { screen.getByRole('button', { name: 'Delete Weeknights' }).click() })
    expect(screen.getByText(/Delete “Weeknights”\?/)).toBeTruthy()

    await act(async () => {
      const buttons = screen.getAllByRole('button', { name: 'Delete' })
      buttons[buttons.length - 1].click()
    })
    await waitFor(() => expect(h.client.__db.lists).toHaveLength(0))
  })

  it('renames a list', async () => {
    h.client = createMockSupabase(seed({
      lists: [{ id: 'ls-1', user_id: 'user-1', name: 'Weeknights' }],
    }))

    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await act(async () => { screen.getByRole('tab', { name: /Lists/ }).click() })
    await act(async () => { screen.getByRole('button', { name: 'Rename Weeknights' }).click() })

    fireEvent.change(screen.getByLabelText('Rename Weeknights'), {
      target: { value: 'Sunday Cooking' },
    })
    await act(async () => { screen.getByRole('button', { name: 'Save' }).click() })

    await waitFor(() => expect(h.client.__db.lists[0].name).toBe('Sunday Cooking'))
  })
})

describe('Saved > + Create feedback', () => {
  async function openLists() {
    await act(async () => { screen.getByRole('tab', { name: /Lists/ }).click() })
  }

  // The reported symptom, twice over: first the handler bailed silently on an
  // empty name; then I disabled the button, and a disabled button never fires a
  // click at all — so it still read as completely dead.
  it('keeps + Create clickable even with an empty field', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await openLists()

    expect(screen.getByRole('button', { name: '+ Create' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: '+ Create' })).toBeEnabled()
  })

  it('explains what is missing and focuses the field when clicked empty', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await openLists()

    await act(async () => { screen.getByRole('button', { name: '+ Create' }).click() })

    expect(screen.getByRole('alert')).toHaveTextContent('Give the list a name first.')
    expect(screen.getByLabelText('New list name')).toHaveFocus()
    expect(api.lists).toHaveLength(0)
  })

  it('does the same for whitespace only', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await openLists()

    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: '   ' } })
    await act(async () => { screen.getByRole('button', { name: '+ Create' }).click() })

    expect(screen.getByRole('alert')).toHaveTextContent('Give the list a name first.')
    expect(api.lists).toHaveLength(0)
  })

  it('clears the message as soon as the user types', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await openLists()

    await act(async () => { screen.getByRole('button', { name: '+ Create' }).click() })
    expect(screen.getByRole('alert')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'W' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('creates the list and clears the field on success', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))
    await openLists()

    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'Weeknights' } })
    await act(async () => { screen.getByRole('button', { name: '+ Create' }).click() })

    await waitFor(() => expect(h.client.__db.lists.map(l => l.name)).toContain('Weeknights'))
    expect(screen.getByLabelText('New list name').value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects a duplicate name with a reason', async () => {
    h.client = createMockSupabase(seed({
      lists: [{ id: 'ls-1', user_id: 'user-1', name: 'Weeknights' }],
    }))
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))
    await openLists()

    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'weeknights' } })
    await act(async () => { screen.getByRole('button', { name: '+ Create' }).click() })

    expect(screen.getByRole('alert')).toHaveTextContent('already have a list called')
    expect(h.client.__db.lists).toHaveLength(1)
  })

  it('names the real cause when the database rejects the insert', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))
    await openLists()

    h.client.__failOn('lists', 'insert', { code: '42501', message: 'violates row-level security policy' })
    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'Blocked' } })
    await act(async () => { screen.getByRole('button', { name: '+ Create' }).click() })

    const inline = await screen.findByRole('alert')
    expect(inline).toHaveTextContent(/row-level security/)
    expect(inline.id).toBe('create-list-error')
    // Not duplicated as a toast beside itself.
    expect(screen.getAllByText(/row-level security/)).toHaveLength(1)
  })
})

describe('Profile > privacy toggle without migration 006', () => {
  // A profiles row that predates 006 simply has no `is_private` key, because
  // PostgREST omits columns that don't exist. Reported symptom was a bare
  // "Could not change your privacy setting." toast on every click.
  const legacyProfile = { profiles: [{ id: 'user-1', username: 'praneeiitk', username_set: true }] }

  it('disables the toggle and names the missing migration', async () => {
    h.client = createMockSupabase(legacyProfile)
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    const box = await screen.findByRole('checkbox', { name: /Private recipes/ })
    expect(box).toBeDisabled()
    expect(screen.getByText(/006_hardening\.sql/)).toBeTruthy()
  })

  it('enables the toggle once the column exists', async () => {
    h.client = createMockSupabase(seed())   // seed() includes is_private: false
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    const box = await screen.findByRole('checkbox', { name: /Private recipes/ })
    expect(box).toBeEnabled()
    expect(screen.queryByText(/006_hardening\.sql/)).toBeNull()
  })

  it('names the real cause if the update is rejected anyway', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    h.client.__failOn('profiles', 'update', {
      code: '42703', message: 'column "is_private" of relation "profiles" does not exist',
    })
    const box = await screen.findByRole('checkbox', { name: /Private recipes/ })
    await act(async () => { box.click() })

    expect(await screen.findByRole('alert')).toHaveTextContent(/migration may not have been applied/)
  })

  it('confirms the change when it succeeds', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    const box = await screen.findByRole('checkbox', { name: /Private recipes/ })
    await act(async () => { box.click() })

    await waitFor(() => expect(h.client.__db.profiles[0].is_private).toBe(true))
    expect(await screen.findByRole('status', { name: '' })).toBeTruthy()
    expect(screen.getByText('Shared recipe links are now off.')).toBeTruthy()
  })
})
