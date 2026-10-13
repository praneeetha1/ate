import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
const { default: WelcomeCard, resetWelcome } = await import('./WelcomeCard')

const show = (props = {}) => render(<MemoryRouter><WelcomeCard onNewRecipe={() => {}} {...props} /></MemoryRouter>)

beforeEach(() => { localStorage.clear(); auth.user = null })

describe('the welcome card', () => {
  it('greets a first-time guest, with a way to sign in for the pantry', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Welcome to ate.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=/pantry')
  })

  it('points a signed-in cook at the Fridge', () => {
    auth.user = { id: 'u1' }
    show()
    expect(screen.getByRole('link', { name: 'Open Fridge' })).toHaveAttribute('href', '/pantry')
  })

  it('stays gone once dismissed, across a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = show()
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('heading', { name: 'Welcome to ate.' })).toBeNull()
    unmount()
    show()
    expect(screen.queryByRole('heading', { name: 'Welcome to ate.' })).toBeNull()
  })

  it('does not greet again after a guest who dismissed it signs in', async () => {
    const user = userEvent.setup()
    const { unmount } = show()
    await user.click(screen.getByRole('button', { name: 'Hide these tips' }))
    unmount()
    auth.user = { id: 'u1' }
    show()
    expect(screen.queryByRole('heading', { name: 'Welcome to ate.' })).toBeNull()
  })

  it('comes back from "Show tips again"', async () => {
    auth.user = { id: 'u1' }
    const user = userEvent.setup()
    const { unmount } = show()
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    unmount()
    resetWelcome('u1')
    show()
    expect(screen.getByRole('heading', { name: 'Welcome to ate.' })).toBeInTheDocument()
  })

  it('opens the new-recipe form from its tip', async () => {
    const onNewRecipe = vi.fn()
    const user = userEvent.setup()
    show({ onNewRecipe })
    await user.click(screen.getByRole('button', { name: 'Add a recipe' }))
    expect(onNewRecipe).toHaveBeenCalled()
  })
})
