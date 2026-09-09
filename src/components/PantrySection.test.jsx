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

const ROWS = [
  { user_id: 'user-1', item: 'garlic',    state: 'have' },
  { user_id: 'user-1', item: 'carrot',    state: 'have' },
  { user_id: 'user-1', item: 'sugar',     state: 'low'  },
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

  it('explains the assumed staples rather than listing 20 rows', async () => {
    renderSection({ pantry: [ROWS[0]] })

    // The match lands on the bold lead-in, so read the whole paragraph.
    const note = (await screen.findByText(/assumed present/i)).closest('p')
    // Named a few, counted the rest: 20 staples, none contradicted.
    expect(note.textContent).toMatch(/and 16 others/)
  })

  it('does not claim a staple the user has contradicted', async () => {
    renderSection({ pantry: [{ user_id: 'user-1', item: 'salt', state: 'out' }] })

    await waitFor(() => expect(screen.getByRole('button', { name: /^salt: out/i })).toBeInTheDocument())
    const note = screen.getByText(/assumed present/i).closest('p')
    // 20 staples, one of them explicitly out, so 19 remain assumed.
    expect(note.textContent).toMatch(/and 15 others/)
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

  it('asks a guest to sign in instead of showing an empty kitchen', async () => {
    renderSection({ signedIn: false })
    expect(await screen.findByText(/sign in to keep track/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing marked yet/i)).toBeNull()
  })
})
