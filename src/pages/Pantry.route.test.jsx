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

const { default: App }   = await import('../App')
const { AppProvider }    = await import('../context/AppContext')
const { PantryProvider } = await import('../context/PantryContext')
const { AuthProvider }   = await import('../context/AuthContext')
const { ToastProvider }  = await import('../context/ToastContext')

function renderApp({ route = '/', signedIn = true, pantry = [], shopping_items = [] } = {}) {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true, is_private: false }],
    ...(signedIn ? { __session: fakeSession('user-1') } : {}),
    pantry,
    shopping_items,
  })
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>
          <AppProvider>
            <PantryProvider><App /></PantryProvider>
          </AppProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

beforeEach(() => { localStorage.clear() })

/**
 * The Fridge used to be reached by an icon in the header. It has a nav tab
 * now, and two controls opening the same page is one more than the page
 * needs, so the icon is gone.
 */
describe('reaching the Fridge page', () => {
  const tab = () => screen.getByRole('link', { name: /fridge/i })

  it('opens from the Fridge tab', async () => {
    const user = userEvent.setup()
    renderApp({ pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'out' }] })
    await waitFor(() => expect(tab()).toBeInTheDocument())

    await user.click(tab())

    expect(await screen.findByRole('heading', { name: /fridge \/ pantry/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^pecorino: out/i })).toBeInTheDocument()
  })

  it('serves /pantry directly', async () => {
    renderApp({ route: '/pantry' })
    expect(await screen.findByRole('heading', { name: /fridge \/ pantry/i })).toBeInTheDocument()
  })

  // Both halves of the page live here now, so the shopping list has to come
  // with it rather than staying behind on Profile.
  it('carries the shopping list', async () => {
    renderApp({ route: '/pantry' })
    expect(await screen.findByRole('region', { name: /shopping list/i })).toBeInTheDocument()
  })

  /**
   * The old header icon was hidden from guests. The tab isn't, so the page
   * itself has to explain the sign-in rather than showing an empty kitchen.
   */
  it('asks a guest to sign in rather than showing nothing', async () => {
    renderApp({ route: '/pantry', signedIn: false })
    expect(await screen.findByText(/sign in to keep track/i)).toBeInTheDocument()
  })

  /**
   * It opens the same page as the Fridge tab, so the count is what earns it a
   * place in the header: how much is left to buy, visible from anywhere.
   */
  describe('the header shopping shortcut', () => {
    const cart = () => screen.getByRole('link', { name: /shopping list/i })
    const rows = checked => [
      { user_id: 'user-1', item: 'onion', display: 'onions', checked, sources: [] },
      { user_id: 'user-1', item: 'paneer', display: 'paneer', checked: false, sources: [] },
    ]

    it('counts only what is still to buy', async () => {
      renderApp({ shopping_items: rows(false) })
      await waitFor(() => expect(cart()).toHaveAccessibleName(/2 items to buy/i))
    })

    // A list you've ticked your way through shouldn't keep claiming there are
    // things left.
    it('drops the ticked ones from the count', async () => {
      renderApp({ shopping_items: rows(true) })
      await waitFor(() => expect(cart()).toHaveAccessibleName(/1 item to buy/i))
    })

    it('stays quiet with nothing outstanding', async () => {
      renderApp({ shopping_items: [] })
      await waitFor(() => expect(cart()).toBeInTheDocument())
      expect(cart()).toHaveAccessibleName('Shopping list')
    })

    it('opens the Fridge page', async () => {
      const user = userEvent.setup()
      renderApp({ shopping_items: rows(false) })
      await waitFor(() => expect(cart()).toBeInTheDocument())

      await user.click(cart())

      expect(await screen.findByRole('region', { name: /shopping list/i })).toBeInTheDocument()
    })
  })

  it('no longer puts a fridge icon in the header', async () => {
    renderApp()
    await waitFor(() => expect(tab()).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /fridge and pantry/i })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ate')
  })
})
