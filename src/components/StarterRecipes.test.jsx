import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VISIBLE_CATALOG } from '../utils/recipe'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
const { StarterChoice, StarterPicker, useStarterRecipes } = await import('./StarterRecipes')

// Shows what Home would list, next to the choice card.
function Page() {
  const { chosen, catalog } = useStarterRecipes()
  return <>{!chosen && <StarterChoice />}<p data-testid="count">{catalog.length}</p></>
}

beforeEach(() => { localStorage.clear(); auth.user = null })

describe('a returning account', () => {
  it('is one more than a day old; a new one, or a guest, is not', async () => {
    const { isReturning } = await import('./StarterRecipes')
    expect(isReturning({ created_at: new Date(Date.now() - 3 * 864e5).toISOString() })).toBe(true)
    expect(isReturning({ created_at: new Date().toISOString() })).toBe(false)
    expect(isReturning(null)).toBe(false)
  })
})

describe('choosing starter recipes', () => {
  it('asks once, and "Keep all" keeps every starter recipe', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Page />)
    await user.click(screen.getByRole('button', { name: `Keep all ${VISIBLE_CATALOG.length}` }))
    expect(screen.queryByRole('heading', { name: 'Start with our recipes?' })).toBeNull()
    expect(screen.getByTestId('count')).toHaveTextContent(String(VISIBLE_CATALOG.length))
    unmount()
    render(<Page />)
    expect(screen.queryByRole('heading', { name: 'Start with our recipes?' })).toBeNull()
  })

  const total = VISIBLE_CATALOG.length

  /** Swipe through the first few: skip, keep, skip; then keep the rest. */
  async function swipeSome(user) {
    await user.click(screen.getByRole('button', { name: 'Pick which to keep' }))
    for (const [n, choice] of [[1, 'Skip'], [2, 'Keep'], [3, 'Skip']]) {
      await waitFor(() => expect(screen.getByText(new RegExp(`^${n} of ${total}`))).toBeInTheDocument())
      await user.click(screen.getByRole('button', { name: choice }))
    }
    await waitFor(() => expect(screen.getByText(new RegExp(`^4 of ${total}`))).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Keep the rest and finish' }))
  }

  it('swipes: skipped recipes go, kept and unseen ones stay', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await swipeSome(user)
    expect(screen.getByTestId('count')).toHaveTextContent(String(total - 2))
  })

  it('undoes the last swipe', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Pick which to keep' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(screen.getByText(new RegExp(`^2 of ${total}`))).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText(new RegExp(`^1 of ${total}`))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep the rest and finish' }))
    expect(screen.getByTestId('count')).toHaveTextContent(String(total))
  })

  it('carries a guest\'s choice to the account that signs in', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Page />)
    await swipeSome(user)
    unmount()
    auth.user = { id: 'u1' }
    render(<Page />)
    expect(screen.getByTestId('count')).toHaveTextContent(String(total - 2))
  })

  // The list picker stays for Settings, where you're editing rather than choosing.
  it('the list picker keeps only what was left ticked', async () => {
    const user = userEvent.setup()
    render(<><StarterPicker onClose={() => {}} /><Page /></>)
    await user.click(screen.getByRole('button', { name: 'Untick all' }))
    await user.click(screen.getByRole('checkbox', { name: new RegExp(VISIBLE_CATALOG[0].r.name.slice(0, 12)) }))
    await user.click(screen.getByRole('button', { name: 'Keep 1 recipe' }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('can be closed, which keeps every starter recipe', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Hide this' }))
    expect(screen.queryByRole('heading', { name: 'Start with our recipes?' })).toBeNull()
    expect(screen.getByTestId('count')).toHaveTextContent(String(VISIBLE_CATALOG.length))
  })
})
