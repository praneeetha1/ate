import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

function renderModal({ signedIn = true, seed = {}, recipe = RECIPE } = {}) {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true }],
    ...(signedIn ? { __session: fakeSession('user-1') } : {}),
    ...seed,
  })
  return render(
    <MemoryRouter>
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <PantryProvider>
            <RecipeModal recipe={recipe} recipeKey={3} onClose={() => {}} />
          </PantryProvider>
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
    </MemoryRouter>
  )
}

/** The marker for one ingredient, found by the state spelled out in its label. */
const mark = name => screen.getByRole('img', { name: new RegExp(`^${name}:`, 'i') })

beforeEach(() => { localStorage.clear() })

describe('PantryMark in a recipe', () => {
  it('shows a marker per ingredient once signed in', async () => {
    renderModal()
    // Labelled by the shopping name, so the prep text doesn't get announced.
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())
    expect(mark('Kosher salt')).toBeInTheDocument()
  })

  it('shows nothing at all for a guest', async () => {
    renderModal({ signedIn: false })
    await screen.findByText('Test Carbonara')
    expect(screen.queryByRole('img', { name: /in your kitchen|not tracked/i })).toBeNull()
  })

  it('shows a staple as assumed-present and an unknown item as untracked', async () => {
    renderModal()
    await waitFor(() => expect(mark('Kosher salt')).toHaveAccessibleName(/in your kitchen/i))
    expect(mark('pecorino')).toHaveAccessibleName(/not tracked/i)
  })

  it('reflects a stored row on open', async () => {
    renderModal({ seed: { pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'low' }] } })
    await waitFor(() => expect(mark('pecorino')).toHaveAccessibleName(/running low/i))
  })

  it('reflects out as well', async () => {
    renderModal({ seed: { pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'out' }] } })
    await waitFor(() => expect(mark('pecorino')).toHaveAccessibleName(/^pecorino: out/i))
  })

  /**
   * The recipe reports, it doesn't edit. Managing the pantry from here made it
   * unclear whether the marker was showing state or setting it, so there is
   * deliberately nothing to press.
   */
  it('is not a control', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())

    // No button, and clicking it changes nothing.
    expect(screen.queryByRole('button', { name: /^pecorino:/i })).toBeNull()
    await user.click(mark('pecorino'))

    expect(h.client.__db.pantry).toEqual([])
    expect(mark('pecorino')).toHaveAccessibleName(/not tracked/i)
  })

  it('never marks water', async () => {
    renderModal({ recipe: {
      name: 'Test Carbonara', category: 'Pasta & Noodles', servings: 2, dietary: [],
      ingredients: [{ amount: '1', unit: 'cup', item: 'water' }, { amount: '', unit: '', item: 'pecorino' }],
      steps: ['Boil'],
    } })
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())
    expect(screen.queryByRole('img', { name: /^water:/i })).toBeNull()
  })
})

describe('the ingredient list', () => {
  // Ticking ingredients off belongs to cook mode now; a tick beside the
  // pantry dot read as "I have this".
  it('has no tick boxes, only the pantry dot and the cart', async () => {
    renderModal()
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())
    expect(screen.queryAllByRole('checkbox')).toEqual([])
  })
})

describe('the summary above the ingredient list', () => {
  it('says what is missing', async () => {
    renderModal()

    // Salt is an assumed staple, pecorino is unknown -> 1 of 2 to hand.
    expect(await screen.findByText(/you have/i)).toHaveTextContent('1 of 2')
    expect(screen.getByText(/missing/i)).toHaveTextContent('pecorino')
  })

  it('says so when the kitchen covers the whole recipe', async () => {
    renderModal({ seed: { pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'have' }] } })
    expect(await screen.findByText(/you have everything/i)).toBeInTheDocument()
  })

  it('flags a low item without calling it missing', async () => {
    renderModal({ seed: { pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'low' }] } })

    expect(await screen.findByText(/you have everything/i)).toBeInTheDocument()
    expect(screen.getByText(/low on pecorino/i)).toBeInTheDocument()
  })

  it('is absent for a guest', async () => {
    renderModal({ signedIn: false })
    await screen.findByText('Test Carbonara')
    expect(screen.queryByText(/you have/i)).toBeNull()
  })
})

describe('the summary names its assumptions', () => {
  it('says which staples it only assumed', async () => {
    renderModal({ seed: { pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'have' }] } })
    expect(await screen.findByText(/you have everything/i)).toBeInTheDocument()
    expect(screen.getByText(/assumed: kosher salt/i)).toBeInTheDocument()
  })
})

describe('adding the recipe to the shopping list', () => {
  const items = () => (h.client.__db.shopping_items || []).map(r => r.item).sort()

  it('adds what you lack in one tap when there is nothing to decide, leaving assumed salt off', async () => {
    const user = userEvent.setup()
    renderModal()
    await waitFor(() => expect(mark('pecorino')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /add to shopping list/i }))
    expect(screen.queryByRole('dialog', { name: /add to shopping list/i })).toBeNull()
    expect(await screen.findByText('Added 1 to your shopping list')).toBeInTheDocument()
    await waitFor(() => expect(items()).toEqual(['pecorino']))
  })

  it('asks about a running-low item, and Undo puts the list back', async () => {
    const user = userEvent.setup()
    renderModal({ seed: { pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'low' }] } })
    await waitFor(() => expect(mark('pecorino')).toHaveAccessibleName(/running low/i))
    await user.click(screen.getByRole('button', { name: /add to shopping list/i }))

    const sheet = await screen.findByRole('dialog', { name: /add to shopping list/i })
    expect(sheet).toHaveTextContent('Running low')
    const box = screen.getByRole('checkbox', { name: /pecorino/i })
    expect(box).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Nothing selected' })).toBeDisabled()

    await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Add 1 to shopping list' }))
    await waitFor(() => expect(items()).toEqual(['pecorino']))

    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(items()).toEqual([]))
  })
})
