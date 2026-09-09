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

describe('the must-use filter', () => {
  const OWNED = [
    { user_id: 'user-1', item: 'chicken', state: 'have' },
    { user_id: 'user-1', item: 'shrimp',  state: 'low'  },
  ]
  const row = () => screen.getByRole('group', { name: /must-have ingredient/i })
  const chip = name => screen.getByRole('button', { name })
  const shownCount = () => {
    const m = screen.getByText(/^\d+ recipes?$/).textContent.match(/\d+/)
    return Number(m[0])
  }

  async function openRanking(pantry) {
    const user = userEvent.setup()
    renderHome({ pantry })
    await waitFor(() => expect(toggle()).toBeInTheDocument())
    await user.click(toggle())
    await screen.findByRole('heading', { name: /closest to ready/i })
    return user
  }

  it('offers a chip per main ingredient the cook has', async () => {
    await openRanking(OWNED)

    await waitFor(() => expect(row()).toBeInTheDocument())
    expect(chip('chicken')).toBeInTheDocument()
    expect(chip('shrimp')).toBeInTheDocument()
    // Not a main the cook has: no chip, even though recipes use it.
    expect(screen.queryByRole('button', { name: 'potato' })).toBeNull()
  })

  /**
   * The aromatics are excluded on purpose: onion is in 84 of the catalog's
   * recipes, so a chip for it would filter almost nothing out.
   */
  it('does not offer an aromatic as a main', async () => {
    await openRanking([...OWNED, { user_id: 'user-1', item: 'onion', state: 'have' }])

    await waitFor(() => expect(row()).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'onion' })).toBeNull()
  })

  it('narrows the ranking to recipes that use it', async () => {
    const user = await openRanking(OWNED)
    await waitFor(() => expect(row()).toBeInTheDocument())
    const all = shownCount()

    await user.click(chip('shrimp'))

    await waitFor(() => expect(shownCount()).toBeLessThan(all))
    expect(shownCount()).toBeGreaterThan(0)
    expect(chip('shrimp')).toHaveAttribute('aria-pressed', 'true')
  })

  it('goes back to everything on Anything', async () => {
    const user = await openRanking(OWNED)
    await waitFor(() => expect(row()).toBeInTheDocument())
    const all = shownCount()

    await user.click(chip('shrimp'))
    await waitFor(() => expect(shownCount()).toBeLessThan(all))
    await user.click(chip('Anything'))

    await waitFor(() => expect(shownCount()).toBe(all))
  })

  /**
   * Word boundaries, not name equality. Only 8 recipes list plain "chicken";
   * the rest say "chicken breast" or "chicken thigh", and an equality test
   * would miss every one of them.
   */
  it('counts a recipe whose chicken is a cut, not the bare word', async () => {
    const user = await openRanking([OWNED[0]])
    await waitFor(() => expect(row()).toBeInTheDocument())

    await user.click(chip('chicken'))

    // More than the handful that say exactly "chicken".
    await waitFor(() => expect(shownCount()).toBeGreaterThan(8))
  })

  // A staple is present without ever being tracked, so it qualifies too.
  it('offers a staple main the cook was never asked about', async () => {
    await openRanking([])
    await waitFor(() => expect(row()).toBeInTheDocument())
    expect(chip('egg')).toBeInTheDocument()
  })

  it('says nothing when the cook has no mains at all', async () => {
    await openRanking([{ user_id: 'user-1', item: 'egg', state: 'out' }])
    await screen.findByRole('heading', { name: /closest to ready/i })
    expect(screen.queryByRole('group', { name: /must-have ingredient/i })).toBeNull()
  })
})

describe('what can I make', () => {
  // It changes what the page shows rather than narrowing the catalogue, so it
  // leads the row instead of sitting behind diet and time.
  it('puts the toggle before the diet and time filters', async () => {
    renderHome()
    await waitFor(() => expect(toggle()).toBeInTheDocument())

    const diet = screen.getByRole('button', { name: 'All' })
    const after = toggle().compareDocumentPosition(diet) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(after).toBeTruthy()
  })

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
