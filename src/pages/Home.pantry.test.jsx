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

const { default: Home }  = await import('./Home')
const { AppProvider }    = await import('../context/AppContext')
const { PantryProvider } = await import('../context/PantryContext')
const { AuthProvider }   = await import('../context/AuthContext')
const { ToastProvider }  = await import('../context/ToastContext')

function renderHome({ signedIn = true, pantry = [] } = {}) {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true }],
    ...(signedIn ? { __session: fakeSession('user-1') } : {}),
    pantry,
  })
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <PantryProvider><Home onOpen={() => {}} /></PantryProvider>
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

const toggle = () => screen.getByRole('button', { name: /what can i make/i })

beforeEach(() => { localStorage.clear() })

describe('what can I make', () => {
  it('is offered only to signed-in users', async () => {
    renderHome({ signedIn: false })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Main Dish' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /what can i make/i })).toBeNull()
  })

  it('swaps the category strips for one ranked list', async () => {
    const user = userEvent.setup()
    renderHome()
    await waitFor(() => expect(toggle()).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Main Dish' })).toBeInTheDocument()

    await user.click(toggle())

    expect(await screen.findByRole('heading', { name: /closest to ready/i })).toBeInTheDocument()
    // Category headings are gone: the ranking is catalogue-wide, so keeping
    // them would bury the best answer under whichever heading it fell into.
    expect(screen.queryByRole('heading', { name: 'Main Dish' })).toBeNull()
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('goes back to the category strips when switched off', async () => {
    const user = userEvent.setup()
    renderHome()
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    await user.click(toggle())
    await screen.findByRole('heading', { name: /closest to ready/i })
    await user.click(toggle())

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Main Dish' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /closest to ready/i })).toBeNull()
  })

  it('explains itself when nothing has been marked yet', async () => {
    const user = userEvent.setup()
    renderHome()
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    await user.click(toggle())

    // Without this the ranking looks broken rather than uninformed.
    expect(await screen.findByText(/nothing marked yet/i)).toBeInTheDocument()
  })

  it('drops the hint once the pantry has anything in it', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    await user.click(toggle())

    await screen.findByRole('heading', { name: /closest to ready/i })
    expect(screen.queryByText(/nothing marked yet/i)).toBeNull()
  })

  it('ranks closest-first and says what is missing', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    await user.click(toggle())
    await screen.findByRole('heading', { name: /closest to ready/i })

    // Every card carries a verdict, and they only get worse down the list.
    const captions = await screen.findAllByText(/you have all|missing \d+ of \d+/i)
    expect(captions.length).toBeGreaterThan(10)

    const counts = captions.map(el => {
      const m = el.textContent.match(/missing (\d+) of/i)
      return m ? Number(m[1]) : 0
    })
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
    }
  })

  it('reflects a low state in the caption', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'sugar', state: 'low' }] })
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    await user.click(toggle())
    await screen.findByRole('heading', { name: /closest to ready/i })

    expect((await screen.findAllByText(/low on sugar/i)).length).toBeGreaterThan(0)
  })

  it('still honours the diet and time filters', async () => {
    const user = userEvent.setup()
    renderHome()
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    await user.click(toggle())
    const all = Number((await screen.findByText(/\d+ recipes/)).textContent.match(/\d+/)[0])

    await user.click(screen.getByRole('button', { name: /under 30 min/i }))

    await waitFor(async () => {
      const fewer = Number((await screen.findByText(/\d+ recipes/)).textContent.match(/\d+/)[0])
      expect(fewer).toBeLessThan(all)
    })
  })
})
