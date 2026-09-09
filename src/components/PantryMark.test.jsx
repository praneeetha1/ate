import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: RecipeModal }  = await import('./RecipeModal')
const { AppProvider }           = await import('../context/AppContext')
const { PantryProvider }        = await import('../context/PantryContext')
const { AuthProvider }          = await import('../context/AuthContext')
const { ToastProvider }         = await import('../context/ToastContext')

const RECIPE = {
  name: 'Test Carbonara',
  category: 'Pasta & Noodles',
  timeMinutes: 25,
  servings: 2,
  dietary: [],
  ingredients: [
    { amount: '1/2', unit: 'cup', item: 'pecorino, grated' },
    { amount: '',    unit: '',    item: 'Kosher salt' },
  ],
  steps: ['Boil the pasta'],
}

function renderModal({ signedIn = true, seed = {} } = {}) {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true }],
    ...(signedIn ? { __session: fakeSession('user-1') } : {}),
    ...seed,
  })
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <PantryProvider>
            <RecipeModal recipe={RECIPE} recipeKey={3} onClose={() => {}} />
          </PantryProvider>
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

/** The marker for one ingredient, found by the state spelled out in its label. */
const mark = name => screen.getByRole('button', { name: new RegExp(`^${name}:`, 'i') })

beforeEach(() => { localStorage.clear() })

describe('PantryMark in a recipe', () => {
  it('offers a marker per ingredient once signed in', async () => {
    renderModal()
    // Labelled by the shopping name, so the prep text doesn't get announced.
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())
    expect(mark('Kosher salt')).toBeInTheDocument()
  })

  it('shows nothing at all for a guest', async () => {
    renderModal({ signedIn: false })
    await screen.findByText('Test Carbonara')
    expect(screen.queryByRole('button', { name: /in your kitchen|not tracked/i })).toBeNull()
  })

  it('starts a staple as assumed-present and an unknown item as untracked', async () => {
    renderModal()
    await waitFor(() => expect(mark('Kosher salt')).toHaveAccessibleName(/in your kitchen/i))
    expect(mark('pecorino')).toHaveAccessibleName(/not tracked/i)
  })

  it('records a tap against the canonical item', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())

    await user.click(mark('pecorino'))

    await waitFor(() => expect(mark('pecorino')).toHaveAccessibleName(/in your kitchen/i))
    // 'pecorino, grated' is stored as 'pecorino' — prep text never reaches the DB.
    expect(h.client.__db.pantry).toEqual([
      expect.objectContaining({ user_id: 'user-1', item: 'pecorino', state: 'have' }),
    ])
  })

  it('walks a non-staple have -> low -> out -> untracked', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())

    for (const label of [/in your kitchen/i, /running low/i, /out/i, /not tracked/i]) {
      await user.click(mark('pecorino'))
      await waitFor(() => expect(mark('pecorino')).toHaveAccessibleName(label))
    }
    expect(h.client.__db.pantry).toEqual([])
  })

  it('reflects a stored row on open', async () => {
    renderModal({ seed: { pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'low' }] } })
    await waitFor(() => expect(mark('pecorino')).toHaveAccessibleName(/running low/i))
  })

  // Regression: the marker began life inside the row's <label>, so tapping it
  // also toggled the cooking checkbox next to it.
  it('does not tick the ingredient checkbox', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())

    const boxes = screen.getAllByRole('checkbox')
    await user.click(mark('pecorino'))

    for (const box of boxes) expect(box).not.toBeChecked()
  })
})
