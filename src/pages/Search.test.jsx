import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockSupabase } from '../test/supabaseMock'

vi.mock('../data/recipes.json', async () => ({
  default: (await import('../test/catalogFixture')).default,
}))

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: Search } = await import('./Search')
const { AppProvider }     = await import('../context/AppContext')
const { PantryProvider }  = await import('../context/PantryContext')
const { AuthProvider }    = await import('../context/AuthContext')
const { ToastProvider }   = await import('../context/ToastContext')

function renderSearch() {
  h.client = createMockSupabase({ profiles: [] })
  return render(
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <PantryProvider><Search onOpen={() => {}} /></PantryProvider>
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

/** The suggestion dropdown, in the order the user sees it. */
const suggestions = () =>
  [...document.querySelectorAll('ul li button')].map(b => b.textContent.trim())

async function pickIngredient(user, typed) {
  await user.type(screen.getByLabelText(/add an ingredient/i), typed)
  const first = document.querySelector('ul li button')
  await user.click(first)
  return first.textContent.trim()
}

async function toIngredientMode(user) {
  await user.click(screen.getByRole('button', { name: /what can i make/i }))
}

/** Result card titles, which are the only buttons inside the results grid. */
const resultTitles = () =>
  [...document.querySelectorAll('.grid > div')]
    .map(d => d.querySelector('button')?.textContent.trim())
    .filter(Boolean)

beforeEach(() => { localStorage.clear() })

describe('ingredient suggestions', () => {
  /**
   * Regression: the list was alphabetical with a 12-item cap, so typing
   * "tomato" filled every slot with "cherry tomato", "grape tomato", "plum
   * tomato"… and the plain item was unreachable.
   */
  it('offers the exact match first', async () => {
    const user = userEvent.setup()
    renderSearch()
    await toIngredientMode(user)
    await user.type(screen.getByLabelText(/add an ingredient/i), 'tomato')

    await waitFor(() => expect(suggestions().length).toBeGreaterThan(0))
    expect(suggestions()[0]).toBe('tomato')
  })

  it('puts prefix matches ahead of mid-word ones', async () => {
    const user = userEvent.setup()
    renderSearch()
    await toIngredientMode(user)
    await user.type(screen.getByLabelText(/add an ingredient/i), 'onion')

    await waitFor(() => expect(suggestions().length).toBeGreaterThan(0))
    expect(suggestions()[0]).toBe('onion')
  })

  // One canonical name per kitchen item, shared with the pantry — this used to
  // list "eggs", "large egg", "egg white" and "egg yolk" separately.
  it('offers one name per item rather than one per phrasing', async () => {
    const user = userEvent.setup()
    renderSearch()
    await toIngredientMode(user)
    await user.type(screen.getByLabelText(/add an ingredient/i), 'egg')

    await waitFor(() => expect(suggestions().length).toBeGreaterThan(0))
    const opts = suggestions()
    expect(opts[0]).toBe('egg')
    expect(opts).not.toContain('eggs')
    expect(opts).not.toContain('large egg')
  })

  it('leaves hyphenated products with their meaning intact', async () => {
    const user = userEvent.setup()
    renderSearch()
    await toIngredientMode(user)
    await user.type(screen.getByLabelText(/add an ingredient/i), 'sun-dried')

    // Stripping "dried" out of the compound used to yield "sun- tomato".
    await waitFor(() => expect(suggestions().length).toBeGreaterThan(0))
    expect(suggestions().some(s => s.includes('sun-dried'))).toBe(true)
    expect(suggestions().some(s => /sun-? tomato/.test(s))).toBe(false)
  })
})

describe('ingredient matching', () => {
  it('finds recipes that use the ingredient', async () => {
    const user = userEvent.setup()
    renderSearch()
    await toIngredientMode(user)
    await pickIngredient(user, 'tomato')
    await user.click(screen.getByRole('button', { name: /find recipes/i }))

    expect((await screen.findAllByText(/uses \d+ of your \d+/i)).length).toBeGreaterThan(0)
  })

  /**
   * Regression: matching was a plain `.includes()` on raw ingredient text, so
   * "pepper" matched "peppermint oil" and "egg" matched "chopped veggies" —
   * both real rows in the catalogue.
   */
  it('does not match a word buried inside another word', async () => {
    const user = userEvent.setup()
    renderSearch()
    await toIngredientMode(user)
    await pickIngredient(user, 'pepper')
    await user.click(screen.getByRole('button', { name: /find recipes/i }))
    await screen.findAllByText(/uses \d+ of your \d+/i)

    const titles = resultTitles()
    expect(titles.length).toBeGreaterThan(0)
    for (const peppermint of ['Homemade candy canes', 'Peppermint crunch bark']) {
      expect(titles).not.toContain(peppermint)
    }
  })

  it('still matches a plural the vocabulary cannot singularise', async () => {
    const user = userEvent.setup()
    renderSearch()
    await toIngredientMode(user)
    await pickIngredient(user, 'tomato')
    await user.click(screen.getByRole('button', { name: /find recipes/i }))
    await screen.findAllByText(/uses \d+ of your \d+/i)

    // canonicalItem only singularises the head noun and assumes it comes last,
    // so "diced tomatoes in juice" keeps its plural.
    expect(resultTitles()).toContain('Old Fashioned Vegetable Soup')
  })
})

/**
 * The arrival state. Review point 3: the page used to open on one grey line
 * and a large blank area, asking the cook to invent a query first.
 */
describe('arriving at search with nothing typed', () => {
  it('offers starter searches instead of a blank page', async () => {
    renderSearch()
    expect(await screen.findByText(/what are you looking for/i)).toBeInTheDocument()
    const chips = document.querySelectorAll('ul li button')
    expect(chips.length).toBeGreaterThan(0)
  })

  // Derived from the catalog, so a chip can never be a dead end.
  it('runs a real search when a starter is tapped', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByText(/what are you looking for/i)

    const chip = document.querySelector('ul li button')
    const word = chip.textContent.trim().toLowerCase()
    await user.click(chip)

    await waitFor(() => expect(screen.queryByText(/what are you looking for/i)).not.toBeInTheDocument())
    expect(screen.queryByText(/no recipes found/i)).not.toBeInTheDocument()
    expect(word.length).toBeGreaterThan(3)
  })

  it('points at ingredient search as the other way in', async () => {
    const user = userEvent.setup()
    renderSearch()
    await user.click(await screen.findByRole('button', { name: /what.s in your kitchen/i }))
    expect(await screen.findByText(/what have you got in/i)).toBeInTheDocument()
  })
})

describe('when a name search finds nothing', () => {
  it('explains and offers a way out rather than a dead end', async () => {
    const user = userEvent.setup()
    renderSearch()
    await user.type(screen.getByLabelText(/search recipes by name/i), 'zzzzqqq')

    expect(await screen.findByText(/no recipes found/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear search/i }))
    expect(await screen.findByText(/what are you looking for/i)).toBeInTheDocument()
  })
})
