import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockSupabase } from '../test/supabaseMock'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: RecipeCard } = await import('./RecipeCard')
const { AppProvider }   = await import('../context/AppContext')
const { AuthProvider }  = await import('../context/AuthContext')
const { ToastProvider } = await import('../context/ToastContext')

const BASE = {
  name: 'Lemon Rice',
  category: 'Main Dish',
  dietary: ['vegetarian'],
  ingredients: [{ amount: '2', unit: 'cup', item: 'cooked rice' }],
  steps: ['Fold it together.'],
  timeMinutes: 20,
}

function renderCard(recipe) {
  h.client = createMockSupabase()
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <RecipeCard recipe={recipe} recipeKey={1} onOpen={() => {}} />
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

beforeEach(() => { localStorage.clear() })

/**
 * The reason photos were added at all: with none, every card looked identical
 * and nothing could look worth cooking.
 */
describe('the card photo', () => {
  it('shows the image when the recipe has one', () => {
    renderCard({ ...BASE, image: 'https://example.com/lemon-rice.jpg' })
    const img = document.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/lemon-rice.jpg')
  })

  /**
   * Most of the catalog has no photo, and a grid of grey placeholders reads
   * worse than a grid of clean text cards — so the no-image card is unchanged
   * rather than reserving empty space.
   */
  it('renders no frame at all without one', () => {
    renderCard(BASE)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('Lemon Rice')).toBeInTheDocument()
  })

  // Linked images belong to someone else's server, so they go dead. A
  // broken-image glyph looks worse than no photo.
  it('hides the frame if the link is dead', () => {
    renderCard({ ...BASE, image: 'https://example.com/gone.jpg' })
    const img = document.querySelector('img')
    img.dispatchEvent(new Event('error'))
    expect(img.parentElement.style.display).toBe('none')
  })

  it('leaves the image out of the accessible name', () => {
    renderCard({ ...BASE, image: 'https://example.com/lemon-rice.jpg' })
    // Decorative: the recipe name is right beside it, so alt text would only
    // repeat it to a screen reader.
    expect(document.querySelector('img')).toHaveAttribute('alt', '')
  })
})
