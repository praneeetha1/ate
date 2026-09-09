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

function renderApp({ route = '/', signedIn = true, pantry = [] } = {}) {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true, is_private: false }],
    ...(signedIn ? { __session: fakeSession('user-1') } : {}),
    pantry,
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

const fridgeIcon = () => screen.getByRole('link', { name: /fridge and pantry/i })

beforeEach(() => { localStorage.clear() })

describe('the fridge icon in the header', () => {
  it('is there for a signed-in cook', async () => {
    renderApp()
    await waitFor(() => expect(fridgeIcon()).toBeInTheDocument())
  })

  it('is not there for a guest', async () => {
    renderApp({ signedIn: false })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Main Dish' })).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /fridge and pantry/i })).toBeNull()
  })

  it('opens the Fridge / Pantry page', async () => {
    const user = userEvent.setup()
    renderApp({ pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'out' }] })
    await waitFor(() => expect(fridgeIcon()).toBeInTheDocument())

    await user.click(fridgeIcon())

    expect(await screen.findByRole('heading', { name: /fridge \/ pantry/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^pecorino: out/i })).toBeInTheDocument()
  })

  it('serves /pantry directly', async () => {
    renderApp({ route: '/pantry' })
    expect(await screen.findByRole('heading', { name: /fridge \/ pantry/i })).toBeInTheDocument()
  })

  // The wordmark has to stay centred, so the icon is positioned out of flow
  // rather than sitting beside it in a row.
  it('leaves the wordmark in place', async () => {
    renderApp()
    await waitFor(() => expect(fridgeIcon()).toBeInTheDocument())
    expect(fridgeIcon().className).toMatch(/absolute/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ate')
  })
})
