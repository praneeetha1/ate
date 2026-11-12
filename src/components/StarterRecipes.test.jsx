import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VISIBLE_CATALOG } from '../utils/recipe'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
const { StarterChoice, useStarterRecipes } = await import('./StarterRecipes')

// Shows what Home would list, next to the choice card.
function Page() {
  const { chosen, catalog } = useStarterRecipes()
  return <>{!chosen && <StarterChoice />}<p data-testid="count">{catalog.length}</p></>
}

beforeEach(() => { localStorage.clear(); auth.user = null })

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

  it('keeps only what was left ticked', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Pick which to keep' }))
    await user.click(screen.getByRole('button', { name: 'Untick all' }))
    await user.click(screen.getByRole('checkbox', { name: new RegExp(VISIBLE_CATALOG[0].r.name.slice(0, 12)) }))
    await user.click(screen.getByRole('button', { name: 'Keep 1 recipe' }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('carries a guest\'s choice to the account that signs in', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Pick which to keep' }))
    await user.click(screen.getByRole('button', { name: 'Untick all' }))
    await user.click(screen.getByRole('button', { name: 'Start with none' }))
    unmount()
    auth.user = { id: 'u1' }
    render(<Page />)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('can be closed, which keeps every starter recipe', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Hide this' }))
    expect(screen.queryByRole('heading', { name: 'Start with our recipes?' })).toBeNull()
    expect(screen.getByTestId('count')).toHaveTextContent(String(VISIBLE_CATALOG.length))
  })
})
