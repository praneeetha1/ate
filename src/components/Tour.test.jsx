import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
const { default: Tour, resetWelcome } = await import('./Tour')

// The controls the tour points at, as Home and the header mark them.
const page = (extra = null) => render(
  <>
    <button data-tour="settings">Settings</button>
    <a data-tour="cart" href="#">Bag</a>
    <button data-tour="add">+ My Recipe</button>
    <div data-tour="recipe">Idli</div>
    <a data-tour="fridge" href="#">Fridge</a>
    {extra}
    <Tour />
  </>,
)
const title = () => screen.queryByRole('heading', { level: 2 })?.textContent

beforeEach(() => {
  localStorage.clear(); auth.user = null
  // Each tour that closes steps history back on the next tick (useDialog's
  // back-button support, tested on its own). jsdom delivers those late, into
  // whichever test runs next, so they're kept out of these.
  vi.spyOn(window.history, 'back').mockImplementation(() => {})
})

describe('the tour', () => {
  it('walks a first-time visitor through each control, once', async () => {
    const user = userEvent.setup()
    const { unmount } = page()
    expect(title()).toBe('Recipes')
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
    for (const next of ['+ My Recipe', 'Fridge', 'Shopping list', 'Settings']) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(title()).toBe(next)
    }
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(title()).toBeUndefined()
    unmount()
    page()
    expect(title()).toBeUndefined()
  })

  it('can be skipped at any stop, and stays skipped', async () => {
    const user = userEvent.setup()
    const { unmount } = page()
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(title()).toBeUndefined()
    unmount()
    page()
    expect(title()).toBeUndefined()
  })

  it('restarts on the page you are on when asked to show it again', async () => {
    const user = userEvent.setup()
    page()
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    act(() => resetWelcome(null))
    expect(title()).toBe('Recipes')
  })

  it('leaves out stops whose control is not on screen', () => {
    render(<><div data-tour="recipe">Idli</div><Tour /></>)
    expect(screen.getByText('1 of 1')).toBeInTheDocument()
  })

  it('tells a guest to sign in for the Fridge, and a signed-in cook not to', async () => {
    const user = userEvent.setup()
    const { unmount } = page()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/^Sign in, mark what you have/)).toBeInTheDocument()
    unmount(); localStorage.clear(); auth.user = { id: 'u1' }
    page()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/^Mark what you have/)).toBeInTheDocument()
  })

  it('does not come back after a guest who finished it signs in', async () => {
    const user = userEvent.setup()
    const { unmount } = page()
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    unmount(); auth.user = { id: 'u1' }
    page()
    expect(title()).toBeUndefined()
  })
})
