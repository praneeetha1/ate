import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: RecipeModal } = await import('./RecipeModal')
const { AppProvider, useApp }  = await import('../context/AppContext')
const { AuthProvider }         = await import('../context/AuthContext')
const { ToastProvider }        = await import('../context/ToastContext')

const RECIPE = {
  name: 'Test Carbonara',
  category: 'Pasta & Noodles',
  timeMinutes: 25,
  servings: 2,
  dietary: [],
  ingredients: [
    { amount: '1/2', unit: 'cup', item: 'pecorino' },
    { amount: '2',   unit: '',    item: 'eggs' },
  ],
  steps: ['Boil the pasta', 'Toss off the heat'],
}

let api = null
let closeModalOnly = () => {}

function Harness({ recipeKey = 3, onClose, editable = false, recipe = RECIPE }) {
  api = useApp()
  const [open, setOpen] = useState(true)
  closeModalOnly = () => setOpen(false)
  if (!open) return null
  return (
    <RecipeModal
      recipe={recipe}
      recipeKey={recipeKey}
      editable={editable}
      onClose={onClose || closeModalOnly}
    />
  )
}

function renderModal(props = {}) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider><Harness {...props} /></AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  api = null
  h.client = createMockSupabase()
})

describe('accessibility', () => {
  it('is an accessible dialog labelled by its title', async () => {
    renderModal()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Test Carbonara')
  })

  it('moves focus into the dialog and closes on Escape', async () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('names the icon buttons for screen readers', async () => {
    renderModal()
    expect(await screen.findByRole('button', { name: 'Save Test Carbonara' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add to shopping list' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share Test Carbonara' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close recipe' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rate 4 stars' })).toBeTruthy()
  })

  it('restores body scroll when unmounted', async () => {
    const { unmount } = renderModal()
    await screen.findByRole('dialog')
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('notes', () => {
  // Regression: cleanup cleared the debounce timer without flushing, so a note
  // typed and closed within 600ms was silently discarded.
  it('flushes an in-flight note when the modal closes inside the debounce window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderModal({ recipeKey: 3 })
    await screen.findByRole('dialog')

    const textarea = screen.getByLabelText('Your notes on Test Carbonara')
    fireEvent.change(textarea, { target: { value: 'use guanciale' } })

    // Close well before the 600ms debounce would have fired. Only the modal
    // goes away — the provider (and its state) stays mounted, as in the app.
    act(() => { vi.advanceTimersByTime(100) })
    await act(async () => { closeModalOnly() })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.notes['3']).toBe('use guanciale')
    vi.useRealTimers()
  })

  it('saves a note normally once the debounce elapses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderModal({ recipeKey: 3 })
    await screen.findByRole('dialog')

    fireEvent.change(screen.getByLabelText('Your notes on Test Carbonara'), {
      target: { value: 'extra pepper' },
    })
    await act(async () => { vi.advanceTimersByTime(700) })

    expect(api.notes['3']).toBe('extra pepper')
    expect(screen.getByText('Saved')).toBeTruthy()
    vi.useRealTimers()
  })
})

describe('ratings and notes are addressed by recipe key', () => {
  it('reads and writes under the key, not the recipe name', async () => {
    renderModal({ recipeKey: 'u_abc' })
    await screen.findByRole('dialog')

    await act(async () => { screen.getByRole('button', { name: 'Rate 5 stars' }).click() })

    expect(api.ratings['u_abc']).toBe(5)
    expect(api.ratings['Test Carbonara']).toBeUndefined()
  })
})

/**
 * The imported recipes are CC-BY-SA, and that licence is only satisfied while
 * the credit is shown alongside the recipe — a note in the repo is not enough.
 * See LICENSE-DATA.md.
 */
describe('attribution', () => {
  const LICENSED = {
    ...RECIPE,
    source: 'Wikibooks Cookbook',
    sourceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Test_Dish',
    license: 'CC-BY-SA-4.0',
  }

  it('credits the source and links the licence', async () => {
    renderModal({ recipe: LICENSED })

    const src = await screen.findByRole('link', { name: 'Wikibooks Cookbook' })
    expect(src).toHaveAttribute('href', LICENSED.sourceUrl)
    expect(screen.getByRole('link', { name: /CC BY-SA 4\.0/ }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/')
  })

  it('says nothing for a recipe that carries no licence', async () => {
    renderModal()
    await screen.findByText('Boil the pasta')
    expect(screen.queryByText(/adapted from/i)).toBeNull()
  })
})

describe('ingredient scaling', () => {
  it('multiplies amounts and labels by servings', async () => {
    renderModal()
    await screen.findByRole('dialog')

    expect(screen.getByText('½ cup')).toBeTruthy()
    await act(async () => { screen.getByRole('button', { name: '4 servings' }).click() })
    expect(screen.getByText('1 cup')).toBeTruthy()
  })
})

describe('sharing', () => {
  it('builds a catalog deep link', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })

    renderModal({ recipeKey: 7 })
    await screen.findByRole('dialog')
    await act(async () => { screen.getByRole('button', { name: 'Share Test Carbonara' }).click() })

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?r=7'))
    vi.unstubAllGlobals()
  })

  // Regression: user recipes shared the bare app URL, which pointed at nothing.
  it('builds a user-recipe deep link with ?u=', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })

    renderModal({ recipeKey: 'u_dead-beef' })
    await screen.findByRole('dialog')
    await act(async () => { screen.getByRole('button', { name: 'Share Test Carbonara' }).click() })

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?u=dead-beef'))
    vi.unstubAllGlobals()
  })

  // Regression: cancelling the native share sheet rejects with AbortError,
  // which was an unhandled rejection and surfaced as a spurious error.
  it('treats a cancelled share sheet as a non-event', async () => {
    const share = vi.fn(() => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })))
    vi.stubGlobal('navigator', { ...navigator, share })

    renderModal()
    await screen.findByRole('dialog')
    await act(async () => { screen.getByRole('button', { name: 'Share Test Carbonara' }).click() })

    expect(share).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('editing', () => {
  it('offers an edit affordance only for the user’s own recipe', async () => {
    const { unmount } = renderModal({ editable: false })
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Edit Test Carbonara' })).toBeNull()
    unmount()

    renderModal({ recipeKey: 'u_abc', editable: true })
    expect(await screen.findByRole('button', { name: 'Edit Test Carbonara' })).toBeTruthy()
  })

  it('opens the edit form prefilled', async () => {
    renderModal({ recipeKey: 'u_abc', editable: true })
    await screen.findByRole('dialog')
    await act(async () => { screen.getByRole('button', { name: 'Edit Test Carbonara' }).click() })

    expect(screen.getByRole('heading', { name: 'Edit Recipe' })).toBeTruthy()
    expect(screen.getByLabelText('Recipe Name *').value).toBe('Test Carbonara')
    expect(screen.getByLabelText('Step 1').value).toBe('Boil the pasta')
  })
})

describe('lists', () => {
  it('creates a list and adds the recipe to it in one step', async () => {
    const user = userEvent.setup()
    h.client = createMockSupabase({ profiles: [{ id: 'user-1', username: 'c', username_set: true }] })
    renderModal({ recipeKey: 3 })
    await screen.findByRole('dialog')
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(api.syncing).toBe(false))

    await user.click(screen.getByRole('button', { name: 'Add to a list' }))
    await user.type(screen.getByLabelText('New list name'), 'Sunday')
    await act(async () => { screen.getByRole('button', { name: 'Add' }).click() })

    await waitFor(() => {
      const list = api.lists.find(l => l.name === 'Sunday')
      expect(list).toBeTruthy()
      expect(list.items).toContain(3)
    })
  })
})
