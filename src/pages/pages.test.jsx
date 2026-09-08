import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: Profile }     = await import('./Profile')
const { default: UserProfile } = await import('./UserProfile')
const { default: Saved }       = await import('./Saved')
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

describe('Profile — shopping list', () => {
  // Regression: only numeric catalog keys were resolved here, so adding a user
  // recipe to the shopping list persisted but rendered nothing at all.
  it('renders the ingredients of a user recipe added to the list', async () => {
    h.client = createMockSupabase(seed({
      user_recipes:  [USER_RECIPE],
      shopping_list: [{ id: 1, user_id: 'user-1', recipe_key: 'u_ur-1', checked: [1] }],
    }))

    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    expect(await screen.findByText('toor dal')).toBeTruthy()
    expect(screen.getByText('cumin')).toBeTruthy()
    expect(screen.getByText('1 cup')).toBeTruthy()

    // The persisted `checked` array drives the checkboxes.
    const boxes = screen.getAllByRole('checkbox', { checked: true })
    expect(boxes.length).toBeGreaterThanOrEqual(1)
    expect(api.isShopItemChecked('u_ur-1', 1)).toBe(true)
    expect(api.isShopItemChecked('u_ur-1', 0)).toBe(false)
  })

  it('persists a newly ticked ingredient to the database', async () => {
    h.client = createMockSupabase(seed({
      user_recipes:  [USER_RECIPE],
      shopping_list: [{ id: 1, user_id: 'user-1', recipe_key: 'u_ur-1', checked: [] }],
    }))

    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))
    await screen.findByText('toor dal')

    await act(async () => { api.toggleShopItem('u_ur-1', 0) })

    await waitFor(() => {
      expect(h.client.__db.shopping_list[0].checked).toEqual([0])
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

  it('toggles the private-profile flag', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    const box = await screen.findByRole('checkbox', { name: /Private profile/ })
    expect(box.checked).toBe(false)
    await act(async () => { box.click() })

    await waitFor(() => expect(h.client.__db.profiles[0].is_private).toBe(true))
  })
})

describe('UserProfile', () => {
  const other = {
    profiles: [
      { id: 'user-1', username: 'cook',  username_set: true, is_private: false },
      { id: 'user-2', username: 'chandu', username_set: true, is_private: false, bio: 'Bakes daily' },
    ],
    user_recipes: [{ ...USER_RECIPE, id: 'ur-9', user_id: 'user-2', name: 'Chandu Cake' }],
    favorites: [
      { id: 1, user_id: 'user-2', recipe_key: '5' },
      { id: 2, user_id: 'user-2', recipe_key: 'u_ur-9' },
    ],
    activity: [
      { id: 'ac-1', user_id: 'user-2', type: 'created', recipe_key: 'u_ur-9', recipe_name: 'Chandu Cake', created_at: new Date().toISOString() },
    ],
  }

  function renderUserProfile(username, onOpen = () => {}) {
    return render(
      <MemoryRouter initialEntries={[`/user/${username}`]}>
        <ToastProvider>
          <AuthProvider>
            <AppProvider>
              <Expose />
              <Routes>
                <Route path="/user/:username" element={<UserProfile onOpen={onOpen} />} />
              </Routes>
            </AppProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    )
  }

  it('finds a profile regardless of the URL’s casing', async () => {
    // Regression: usernames are stored lowercase, so /user/Chandu 404'd.
    h.client = createMockSupabase(other)
    renderUserProfile('Chandu')
    expect(await screen.findByRole('heading', { name: '@chandu' })).toBeTruthy()
    expect(screen.getByText('Bakes daily')).toBeTruthy()
  })

  it('reports a genuinely missing user as not found', async () => {
    h.client = createMockSupabase(other)
    renderUserProfile('nobody')
    expect(await screen.findByText('User not found')).toBeTruthy()
  })

  // Regression: the raw DB string "5" was handed to onOpen, fell through the
  // numeric branch in App, resolved to nothing, and the modal never opened.
  it('opens a saved catalog recipe with a numeric key', async () => {
    const onOpen = vi.fn()
    h.client = createMockSupabase(other)
    renderUserProfile('chandu', onOpen)
    await screen.findByRole('heading', { name: '@chandu' })

    await act(async () => { screen.getByRole('tab', { name: /Saved/ }).click() })
    const rows = screen.getAllByRole('button').filter(b => b.textContent.includes('♥'))
    await act(async () => { rows[0].click() })

    expect(onOpen).toHaveBeenCalled()
    expect(typeof onOpen.mock.calls[0][0]).toBe('number')
    expect(onOpen.mock.calls[0][0]).toBe(5)
  })

  it('passes the recipe object when opening someone else’s user recipe', async () => {
    const onOpen = vi.fn()
    h.client = createMockSupabase(other)
    renderUserProfile('chandu', onOpen)
    await screen.findByRole('heading', { name: '@chandu' })

    await act(async () => { screen.getByRole('tab', { name: /Recipes/ }).click() })
    await act(async () => { screen.getByText('Chandu Cake').closest('button').click() })

    // The viewer doesn't own it, so it can't be resolved from `userRecipes`.
    expect(onOpen).toHaveBeenCalledWith('u_ur-9', expect.objectContaining({ name: 'Chandu Cake' }))
  })

  it('shows a preview card for a user recipe in the activity feed', async () => {
    h.client = createMockSupabase(other)
    renderUserProfile('chandu')
    await screen.findByRole('heading', { name: '@chandu' })
    // Regression: activity rows for user recipes returned null and rendered no card.
    expect(await screen.findByText(/created/)).toBeTruthy()
    expect(screen.getAllByText('Chandu Cake').length).toBeGreaterThan(0)
  })

  it('follows and unfollows, adjusting the count', async () => {
    h.client = createMockSupabase(other)
    renderUserProfile('chandu')
    await screen.findByRole('heading', { name: '@chandu' })
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })

    const follow = await screen.findByRole('button', { name: 'Follow' })
    await act(async () => { follow.click() })

    await waitFor(() => expect(h.client.__db.follows).toHaveLength(1))
    expect(h.client.__db.follows[0]).toMatchObject({ follower_id: 'user-1', following_id: 'user-2' })

    await act(async () => { screen.getByRole('button', { name: 'Following' }).click() })
    await waitFor(() => expect(h.client.__db.follows).toHaveLength(0))
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

  // This is the reported symptom: clicking "+ Create" appeared to do nothing.
  // The handler bailed on an empty name while the button still looked live.
  it('disables + Create until a name is typed', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await openLists()

    const button = screen.getByRole('button', { name: '+ Create' })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'Weeknights' } })
    expect(button).toBeEnabled()

    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: '   ' } })
    expect(button).toBeDisabled()
  })

  it('explains itself when submitted empty instead of doing nothing', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Saved onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await openLists()

    // Enter in the field submits the form even though the button is disabled.
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('New list name').closest('form'))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Give the list a name first.')
    expect(api.lists).toHaveLength(0)
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

    const box = await screen.findByRole('checkbox', { name: /Private profile/ })
    expect(box).toBeDisabled()
    expect(screen.getByText(/006_hardening\.sql/)).toBeTruthy()
  })

  it('enables the toggle once the column exists', async () => {
    h.client = createMockSupabase(seed())   // seed() includes is_private: false
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    const box = await screen.findByRole('checkbox', { name: /Private profile/ })
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
    const box = await screen.findByRole('checkbox', { name: /Private profile/ })
    await act(async () => { box.click() })

    expect(await screen.findByRole('alert')).toHaveTextContent(/migration may not have been applied/)
  })

  it('confirms the change when it succeeds', async () => {
    h.client = createMockSupabase(seed())
    renderPage(<Profile onOpen={() => {}} />)
    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    const box = await screen.findByRole('checkbox', { name: /Private profile/ })
    await act(async () => { box.click() })

    await waitFor(() => expect(h.client.__db.profiles[0].is_private).toBe(true))
    expect(await screen.findByRole('status', { name: '' })).toBeTruthy()
    expect(screen.getByText('Your profile is now private.')).toBeTruthy()
  })
})
