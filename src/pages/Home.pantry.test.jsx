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
    expect(await screen.findByText(/nothing in your pantry yet/i)).toBeInTheDocument()
  })

  it('drops the hint once the pantry has anything in it', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    await user.click(toggle())

    await screen.findByRole('heading', { name: /closest to ready/i })
    expect(screen.queryByText(/nothing in your pantry yet/i)).toBeNull()
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

describe('the Closest to ready strip', () => {
  it('appears once the pantry knows something, without hiding the categories', async () => {
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })

    expect(await screen.findByRole('heading', { name: /closest to ready/i })).toBeInTheDocument()
    // A strip alongside the catalogue, not a replacement for it.
    expect(screen.getByRole('heading', { name: 'Main Dish' })).toBeInTheDocument()
  })

  it('stays away until something is marked', async () => {
    renderHome()
    await waitFor(() => expect(toggle()).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /closest to ready/i })).toBeNull()
  })

  it('is hidden from guests', async () => {
    renderHome({ signedIn: false, pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Main Dish' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /closest to ready/i })).toBeNull()
  })

  it('opens the full ranking from See all', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })

    await user.click(await screen.findByRole('button', { name: /see all/i }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Main Dish' })).toBeNull())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('filtering what I can make by category', () => {
  const catGroup = () => screen.getByRole('group', { name: /filter by category/i })
  const count = () => Number(screen.getByText(/\d+ recipes/).textContent.match(/\d+/)[0])
  const titles = () => [...document.querySelectorAll('.grid > div')]
    .map(d => d.querySelector('button')?.textContent.trim()).filter(Boolean)

  async function openMode(user) {
    await user.click(await screen.findByRole('button', { name: /what can i make/i }))
    await screen.findByRole('heading', { name: /closest to ready/i })
  }

  it('offers a pill per course, plus All', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await openMode(user)

    const pills = [...catGroup().querySelectorAll('button')].map(b => b.textContent.trim())
    // Not "All": the diet row already owns that label.
    expect(pills[0]).toBe('Any course')
    for (const cat of ['Breakfast', 'Drink', 'Main Dish', 'Dessert']) {
      expect(pills).toContain(cat)
    }
  })

  it('narrows the ranking to one course', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await openMode(user)
    const all = count()

    await user.click(screen.getByRole('button', { name: 'Breakfast' }))

    await waitFor(() => expect(count()).toBeLessThan(all))
    expect(screen.getByRole('button', { name: 'Breakfast' })).toHaveAttribute('aria-pressed', 'true')
  })

  // The ranking is the point of the mode, so narrowing must not reorder it.
  it('keeps closest-first order inside a course', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await openMode(user)
    await user.click(screen.getByRole('button', { name: 'Breakfast' }))

    await waitFor(() => expect(titles().length).toBeGreaterThan(2))
    const missing = [...document.querySelectorAll('.grid > div')]
      .map(d => d.textContent.match(/Missing (\d+) of/))
      .map(m => (m ? Number(m[1]) : 0))
    for (let i = 1; i < missing.length; i++) {
      expect(missing[i]).toBeGreaterThanOrEqual(missing[i - 1])
    }
  })

  it('goes back to everything on Any course', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await openMode(user)
    const all = count()

    await user.click(screen.getByRole('button', { name: 'Drink' }))
    await waitFor(() => expect(count()).toBeLessThan(all))
    await user.click(screen.getByRole('button', { name: 'Any course' }))

    await waitFor(() => expect(count()).toBe(all))
  })

  it('stacks with the diet and time filters', async () => {
    const user = userEvent.setup()
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await openMode(user)

    await user.click(screen.getByRole('button', { name: 'Main Dish' }))
    const justCourse = count()
    await user.click(screen.getByRole('button', { name: /under 30 min/i }))

    await waitFor(() => expect(count()).toBeLessThan(justCourse))
  })

  // The pills explain a narrowed list; the strip is an unnarrowed preview, so
  // showing them there would describe something that isn't happening.
  it('does not put the pills on the Closest to ready strip', async () => {
    renderHome({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })
    await screen.findByRole('heading', { name: /closest to ready/i })

    expect(screen.queryByRole('group', { name: /filter by category/i })).toBeNull()
  })
})
