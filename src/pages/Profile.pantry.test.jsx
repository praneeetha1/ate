import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: Profile } = await import('./Profile')
const { AppProvider }      = await import('../context/AppContext')
const { PantryProvider }   = await import('../context/PantryContext')
const { AuthProvider }     = await import('../context/AuthContext')
const { ToastProvider }    = await import('../context/ToastContext')

vi.mock('react-router-dom', async orig => ({
  ...(await orig()),
  useNavigate: () => () => {},
  Link: ({ children }) => children,
}))

// Catalog index 5 is Marinara Sauce: garlic, olive oil, italian seasoning,
// a can of crushed tomatoes, salt and pepper.
const MARINARA = 5

function renderProfile({ pantry = [] } = {}) {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true }],
    __session: fakeSession('user-1'),
    shopping_list: [{ user_id: 'user-1', recipe_key: String(MARINARA), checked: [] }],
    pantry,
  })
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <PantryProvider><Profile onOpen={() => {}} /></PantryProvider>
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

beforeEach(() => { localStorage.clear() })

describe('ticking a shopping item', () => {
  /**
   * Scoped to the shopping list: the Fridge / Pantry section sits on the same
   * page now, so an item can legitimately appear twice — once as something you
   * have, once as something you're buying.
   */
  const shoppingRow = async name => {
    const section = await screen.findByRole('region', { name: /shopping list/i })
    // The rows arrive once AppContext has loaded the list, so this has to wait.
    const label = (await within(section).findByText(name)).closest('label')
    return label.querySelector('input[type="checkbox"]')
  }

  it('records it as in the kitchen', async () => {
    const user = userEvent.setup()
    renderProfile()

    // The row renders the shopping name, not the recipe's "garlic, minced".
    const box = await shoppingRow('garlic')

    await user.click(box)

    // Stored canonically, so the same item from any other recipe reads back.
    await waitFor(() => expect(h.client.__db.pantry).toEqual([
      expect.objectContaining({ user_id: 'user-1', item: 'garlic', state: 'have' }),
    ]))
  })

  // Unticking is how you undo a mis-tap. Treating it as "I'm out of this"
  // would put a wrong answer into the pantry on every fumbled tap.
  it('writes nothing when unticked', async () => {
    const user = userEvent.setup()
    renderProfile({ pantry: [{ user_id: 'user-1', item: 'garlic', state: 'have' }] })

    const box = await shoppingRow('garlic')

    await user.click(box)          // tick
    await waitFor(() => expect(box).toBeChecked())
    const after = h.client.__callsTo('pantry').length

    await user.click(box)          // untick

    await waitFor(() => expect(box).not.toBeChecked())
    expect(h.client.__callsTo('pantry')).toHaveLength(after)
    expect(h.client.__db.pantry).toEqual([
      expect.objectContaining({ item: 'garlic', state: 'have' }),
    ])
  })

  it('still ticks the item off the shopping list itself', async () => {
    const user = userEvent.setup()
    renderProfile()

    const box = await shoppingRow('garlic')
    await user.click(box)

    await waitFor(() => {
      const saved = h.client.__db.shopping_list.find(s => s.recipe_key === String(MARINARA))
      expect(saved.checked.length).toBe(1)
    })
  })
})
