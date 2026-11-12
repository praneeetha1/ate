import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
const { default: SettingsSheet } = await import('./SettingsSheet')

const show = (props = {}) => render(
  <MemoryRouter><SettingsSheet onClose={() => {}} onPickStarters={() => {}} {...props} /></MemoryRouter>,
)

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme })

describe('settings', () => {
  it('switches to dark, remembers it, and goes back to matching the device', async () => {
    const user = userEvent.setup()
    show()
    expect(screen.getByRole('radio', { name: 'Match device' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('ate:theme')).toBe('dark')
    await user.click(screen.getByRole('radio', { name: 'Match device' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('ate:theme')).toBeNull()
  })

  it('hands over to the starter recipe picker', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn(), onPickStarters = vi.fn()
    show({ onClose, onPickStarters })
    await user.click(screen.getByRole('button', { name: 'Choose starter recipes' }))
    expect(onClose).toHaveBeenCalled()
    expect(onPickStarters).toHaveBeenCalled()
  })
})
