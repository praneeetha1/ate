import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'
import { canonicalItem, isStaple } from '../utils/ingredients'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: PantrySection } = await import('./PantrySection')
const { PantryProvider }         = await import('../context/PantryContext')
const { AuthProvider }           = await import('../context/AuthContext')
const { ToastProvider }          = await import('../context/ToastContext')

function renderSection({ signedIn = true, pantry = [] } = {}) {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true }],
    ...(signedIn ? { __session: fakeSession('user-1') } : {}),
    pantry,
  })
  return render(
    <ToastProvider>
      <AuthProvider>
        <PantryProvider><PantrySection /></PantryProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

// Non-staples throughout: staples have their own group and are deliberately
// excluded from these, so a staple here would test nothing.
const ROWS = [
  { user_id: 'user-1', item: 'garlic',    state: 'have' },
  { user_id: 'user-1', item: 'carrot',    state: 'have' },
  { user_id: 'user-1', item: 'basil',     state: 'low'  },
  { user_id: 'user-1', item: 'pecorino',  state: 'out'  },
]

beforeEach(() => { localStorage.clear() })

describe('Fridge / Pantry section', () => {
  it('groups what you have by state', async () => {
    renderSection({ pantry: ROWS })

    expect(await screen.findByRole('heading', { name: /in your kitchen/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /running low/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^out/i })).toBeInTheDocument()
    expect(screen.getByText('4 tracked')).toBeInTheDocument()
  })

  it('leaves out a group nobody has anything in', async () => {
    renderSection({ pantry: [ROWS[0]] })

    await waitFor(() => expect(screen.getByRole('heading', { name: /in your kitchen/i })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /running low/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^out/i })).toBeNull()
  })

  it('cycles an item from its chip', async () => {
    const user = userEvent.setup()
    renderSection({ pantry: [ROWS[0]] })

    const chip = await screen.findByRole('button', { name: /^garlic: in your kitchen/i })
    await user.click(chip)

    await waitFor(() => expect(h.client.__db.pantry[0]).toEqual(
      expect.objectContaining({ item: 'garlic', state: 'low' }),
    ))
  })

  it('stops tracking an item without cycling it', async () => {
    const user = userEvent.setup()
    renderSection({ pantry: [ROWS[0]] })

    const remove = await screen.findByRole('button', { name: /stop tracking garlic/i })
    await user.click(remove)

    // Regression guard: the remove control used to sit inside the cycle
    // button, so one tap did both.
    await waitFor(() => expect(h.client.__db.pantry).toEqual([]))
    expect(screen.queryByRole('button', { name: /^garlic:/i })).toBeNull()
  })

  it('says what to do when nothing is listed', async () => {
    renderSection()
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument()
  })

  describe('the assumed-present staples', () => {
    const staple = name => screen.getByRole('button', { name: new RegExp(`^${name}: `, 'i') })

    it('lists them as chips, already selected', async () => {
      renderSection()
      expect(await screen.findByRole('heading', { name: /assumed present/i })).toBeInTheDocument()
      expect(staple('salt')).toHaveAttribute('aria-pressed', 'true')
      expect(staple('olive oil')).toHaveAttribute('aria-pressed', 'true')
      expect(staple('baking powder')).toHaveAttribute('aria-pressed', 'true')
    })

    // You can't run out of tap water, and 'salt and pepper' is a matching
    // artefact for the pair rather than a third thing to own.
    it('leaves out water, ice and the salt-and-pepper compound', async () => {
      renderSection()
      await screen.findByRole('heading', { name: /assumed present/i })
      for (const skipped of ['water', 'ice', 'salt and pepper']) {
        expect(screen.queryByRole('button', { name: new RegExp(`^${skipped}: `, 'i') })).toBeNull()
      }
    })

    it('marks one out when unselected', async () => {
      const user = userEvent.setup()
      renderSection()
      await user.click(await screen.findByRole('button', { name: /^salt: assumed present/i }))

      await waitFor(() => expect(h.client.__db.pantry).toEqual([
        expect.objectContaining({ item: 'salt', state: 'out' }),
      ]))
      expect(staple('salt')).toHaveAttribute('aria-pressed', 'false')
    })

    /**
     * Absent means assumed-present, so restoring a staple deletes the row
     * rather than writing an explicit 'have' that only repeats the default.
     */
    it('restores one by removing the row, not by storing have', async () => {
      const user = userEvent.setup()
      renderSection({ pantry: [{ user_id: 'user-1', item: 'salt', state: 'out' }] })

      await user.click(await screen.findByRole('button', { name: /^salt: out/i }))

      await waitFor(() => expect(h.client.__db.pantry).toEqual([]))
      expect(staple('salt')).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows a staple in one place only, never twice', async () => {
      renderSection({ pantry: [{ user_id: 'user-1', item: 'olive oil', state: 'out' }] })
      await screen.findByRole('heading', { name: /assumed present/i })

      // It reads as unselected among the staples...
      expect(staple('olive oil')).toHaveAttribute('aria-pressed', 'false')
      // ...and does not also appear as a tracked chip in an Out group.
      expect(screen.queryByRole('heading', { name: /^out/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /olive oil: out\. change/i })).toBeNull()
    })

    it('keeps an explicitly tracked staple out of the kitchen list', async () => {
      renderSection({ pantry: [
        { user_id: 'user-1', item: 'milk',    state: 'have' },
        { user_id: 'user-1', item: 'chicken', state: 'have' },
      ] })
      const kitchen = await screen.findByRole('heading', { name: /in your kitchen/i })

      // Only the non-staple is counted there; milk belongs to the staples group.
      expect(kitchen.textContent).toMatch(/\(1\)/)
      expect(screen.queryByRole('button', { name: /^milk: in your kitchen/i })).toBeNull()
      expect(staple('milk')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('adding an item', () => {
    // Recipe rows are read-only now, so this box is the pantry's only front
    // door besides ticking things off the shopping list.
    it('adds what you type as in-your-kitchen', async () => {
      const user = userEvent.setup()
      renderSection()
      const box = await screen.findByLabelText(/add an item to your pantry/i)

      await user.type(box, 'pecorino')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      await waitFor(() => expect(h.client.__db.pantry).toEqual([
        expect.objectContaining({ item: 'pecorino', state: 'have' }),
      ]))
      expect(box).toHaveValue('')
    })

    it('stores it canonically, however it was typed', async () => {
      const user = userEvent.setup()
      renderSection()
      const box = await screen.findByLabelText(/add an item to your pantry/i)

      await user.type(box, 'Parmigiano-Reggiano, grated')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      await waitFor(() => expect(h.client.__db.pantry).toEqual([
        expect.objectContaining({ item: 'parmesan', state: 'have' }),
      ]))
    })

    it('says so rather than duplicating an item already listed', async () => {
      const user = userEvent.setup()
      renderSection({ pantry: [ROWS[0]] })
      const box = await screen.findByLabelText(/add an item to your pantry/i)

      await user.type(box, 'garlic')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      expect(await screen.findByRole('status')).toHaveTextContent(/already on the list/i)
      expect(h.client.__db.pantry).toHaveLength(1)
    })

    it('declines water instead of tracking it', async () => {
      const user = userEvent.setup()
      renderSection()
      const box = await screen.findByLabelText(/add an item to your pantry/i)

      await user.type(box, 'cold water')
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      expect(await screen.findByRole('status')).toHaveTextContent(/no need to track water/i)
      expect(h.client.__db.pantry).toEqual([])
    })

    it('does nothing on an empty submit', async () => {
      const user = userEvent.setup()
      renderSection()
      await screen.findByLabelText(/add an item to your pantry/i)

      await user.click(screen.getByRole('button', { name: /^add$/i }))

      expect(h.client.__db.pantry).toEqual([])
    })

    it('offers the catalogue as suggestions', async () => {
      renderSection()
      await screen.findByLabelText(/add an item to your pantry/i)
      const options = document.querySelectorAll('#pantry-items option')
      expect(options.length).toBeGreaterThan(500)
    })
  })

  describe('the quick-add grid', () => {
    const chip = name => screen.getByRole('button', { name: `Add ${name}` })

    it('offers a grouped set of common household items', async () => {
      renderSection()
      expect(await screen.findByRole('heading', { name: /quick add/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Produce' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Dairy & Eggs' })).toBeInTheDocument()
      expect(chip('garlic')).toBeInTheDocument()
    })

    // The whole point: staples are already assumed, so tapping one here would
    // only ever undo that assumption for free.
    it('never offers an assumed staple', async () => {
      renderSection()
      await screen.findByRole('heading', { name: /quick add/i })
      for (const staple of ['salt', 'water', 'sugar', 'egg', 'milk', 'butter']) {
        expect(screen.queryByRole('button', { name: `Add ${staple}` })).toBeNull()
      }
    })

    it('adds an item in one tap', async () => {
      const user = userEvent.setup()
      renderSection()
      await user.click(await screen.findByRole('button', { name: 'Add garlic' }))

      await waitFor(() => expect(h.client.__db.pantry).toEqual([
        expect.objectContaining({ item: 'garlic', state: 'have' }),
      ]))
    })

    /**
     * The grid is a source to draw from, not a second display of state. Once
     * an item is answered for it belongs to the lists above — leaving it here
     * too put the same chip on screen twice saying the same thing.
     */
    it('drops an item from the grid once it is added', async () => {
      const user = userEvent.setup()
      renderSection()
      await user.click(await screen.findByRole('button', { name: 'Add garlic' }))

      await waitFor(() => expect(screen.queryByRole('button', { name: 'Add garlic' })).toBeNull())
      // ...and it turns up in the kitchen list instead.
      expect(screen.getByRole('button', { name: /^garlic: in your kitchen/i })).toBeInTheDocument()
    })

    it('does not offer anything already tracked, in any state', async () => {
      renderSection({ pantry: [
        { user_id: 'user-1', item: 'garlic', state: 'have' },
        { user_id: 'user-1', item: 'tomato', state: 'out' },
        { user_id: 'user-1', item: 'basil',  state: 'low' },
      ] })
      await screen.findByRole('heading', { name: /quick add/i })

      for (const item of ['garlic', 'tomato', 'basil']) {
        expect(screen.queryByRole('button', { name: `Add ${item}` })).toBeNull()
      }
      // Untouched ones are still on offer.
      expect(chip('onion')).toBeInTheDocument()
    })

    it('hides a category once everything in it is tracked', async () => {
      renderSection({ pantry: ['rice', 'pasta', 'bread', 'tortilla'].map(item => (
        { user_id: 'user-1', item, state: 'have' }
      )) })
      await screen.findByRole('heading', { name: /quick add/i })

      expect(screen.queryByRole('heading', { name: 'Grains & Bread' })).toBeNull()
      expect(screen.getByRole('heading', { name: 'Produce' })).toBeInTheDocument()
    })

    // Guards the promise in the module's doc comment: the label you tap is
    // exactly what gets stored, with no canonicalisation surprise in between.
    it('labels every chip with its own canonical name', async () => {
      renderSection()
      await screen.findByRole('heading', { name: /quick add/i })

      const labels = screen.getAllByRole('button', { name: /^Add / })
        .map(b => b.getAttribute('aria-label').replace(/^Add /, ''))
      expect(labels.length).toBeGreaterThan(25)
      for (const label of labels) {
        expect(canonicalItem(label)).toBe(label)
        expect(isStaple(label)).toBe(false)
      }
    })
  })

  it('asks a guest to sign in instead of showing an empty kitchen', async () => {
    renderSection({ signedIn: false })
    expect(await screen.findByText(/sign in to keep track/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing marked yet/i)).toBeNull()
  })
})
