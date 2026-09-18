import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'

const h = vi.hoisted(() => ({ client: null, importRecipe: null }))

vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

// The network is the point of the importer, so it's the thing to mock: these
// tests are about what the form does with a draft, not about the model.
vi.mock('../utils/importRecipe', async orig => ({
  ...(await orig()),
  importRecipe: (...args) => h.importRecipe(...args),
}))

const { default: CreateRecipeModal } = await import('./CreateRecipeModal')
const { AppProvider }  = await import('../context/AppContext')
const { AuthProvider } = await import('../context/AuthContext')
const { ToastProvider } = await import('../context/ToastContext')

const DRAFT = {
  name: 'Lemon Rice',
  category: 'Main Dish',
  dietary: ['vegetarian'],
  ingredients: [
    { amount: '2', unit: 'cup', item: 'cooked rice' },
    { amount: '1', unit: '',    item: 'lemon' },
  ],
  steps: ['Temper the spices.', 'Fold through the rice and the lemon juice.'],
  timeMinutes: 20,
  servings: 3,
  image: 'https://example.com/lemon-rice.jpg',
  sourceUrl: 'https://example.com/lemon-rice',
}

function renderModal() {
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true }],
    __session: fakeSession('user-1'),
  })
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <CreateRecipeModal onClose={() => {}} onCreated={() => {}} />
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

const box       = () => screen.getByLabelText(/import from a link or pasted text/i)
const importBtn = () => screen.getByRole('button', { name: /^import$/i })

beforeEach(() => {
  localStorage.clear()
  h.importRecipe = vi.fn().mockResolvedValue({ recipe: DRAFT })
})

describe('importing a recipe', () => {
  it('fills the form from the draft', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(box(), 'https://example.com/lemon-rice')
    await user.click(importBtn())

    await waitFor(() => expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Lemon Rice'))
    expect(screen.getByLabelText(/time \(minutes\)/i)).toHaveValue(20)
    expect(screen.getByLabelText(/servings/i)).toHaveValue(3)
    expect(screen.getByLabelText(/^photo$/i)).toHaveValue(DRAFT.image)
    expect(screen.getByDisplayValue('cooked rice')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Temper the spices.')).toBeInTheDocument()
  })

  // A link gets fetched server-side; anything else is the recipe text itself,
  // which is how a YouTube description or a pasted caption gets in.
  it('sends a link as a url', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(box(), 'https://example.com/lemon-rice')
    await user.click(importBtn())

    await waitFor(() => expect(h.importRecipe).toHaveBeenCalledWith({
      url: 'https://example.com/lemon-rice',
    }))
  })

  it('sends pasted prose as text', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(box(), 'Ingredients: 2 cups rice, 1 lemon')
    await user.click(importBtn())

    await waitFor(() => expect(h.importRecipe).toHaveBeenCalledWith({
      text: 'Ingredients: 2 cups rice, 1 lemon',
    }))
  })

  /**
   * It lands as a draft, never a save. A model can misread a quantity, and a
   * wrong "2 tbsp" is only ever caught by a person looking at it.
   */
  it('saves nothing on its own', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(box(), 'https://example.com/lemon-rice')
    await user.click(importBtn())

    await waitFor(() => expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Lemon Rice'))
    expect(h.client.__db.user_recipes).toEqual([])
    expect(await screen.findByRole('status')).toHaveTextContent(/check it over/i)
  })

  it('surfaces a partial read rather than pretending it worked', async () => {
    h.importRecipe = vi.fn().mockResolvedValue({
      recipe: { ...DRAFT, steps: [] },
      warning: 'No method found — add the steps by hand.',
    })
    const user = userEvent.setup()
    renderModal()

    await user.type(box(), 'https://example.com/lemon-rice')
    await user.click(importBtn())

    expect(await screen.findByRole('status')).toHaveTextContent(/no method found/i)
  })

  it('reports a failure without clearing what you typed', async () => {
    h.importRecipe = vi.fn().mockRejectedValue(new Error('That page returned 404.'))
    const user = userEvent.setup()
    renderModal()

    await user.type(box(), 'https://example.com/gone')
    await user.click(importBtn())

    expect(await screen.findByText(/that page returned 404/i)).toBeInTheDocument()
    expect(box()).toHaveValue('https://example.com/gone')
  })

  // Enter in the import box means import. Letting it submit the form would try
  // to save a recipe that hasn't been filled in yet.
  it('imports on Enter instead of submitting the form', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(box(), 'https://example.com/lemon-rice{Enter}')

    await waitFor(() => expect(h.importRecipe).toHaveBeenCalled())
    expect(h.client.__db.user_recipes).toEqual([])
  })

  it('has nothing to import until something is typed', async () => {
    renderModal()
    expect(importBtn()).toBeDisabled()
  })
})
