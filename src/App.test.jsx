import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createMockSupabase, fakeSession } from './test/supabaseMock'
import RECIPES from './data/recipes.json'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('./lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { default: App }   = await import('./App')
const { AppProvider }    = await import('./context/AppContext')
const { AuthProvider }   = await import('./context/AuthContext')
const { ToastProvider }  = await import('./context/ToastContext')
const { default: ConfigError } = await import('./components/ConfigError')

function renderApp({ route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>
          <AppProvider><App /></AppProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

/** Sets the browser query string that the deep-link effect reads. */
function setQuery(search) {
  window.history.replaceState({}, '', '/' + search)
}

beforeEach(() => {
  localStorage.clear()
  setQuery('')
  h.client = createMockSupabase({
    profiles: [{ id: 'user-1', username: 'cook', username_set: true, is_private: false }],
  })
})

describe('auth gating', () => {
  // Regression: `loading` was exposed but never consumed, so the first paint
  // showed the logged-out UI and then flipped once the session resolved.
  it('shows a splash until the session resolves', async () => {
    let release
    h.client.auth.getSession = vi.fn(() => new Promise(res => { release = res }))

    renderApp()
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()

    await act(async () => { release({ data: { session: null }, error: null }) })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy()
  })
})

describe('shared recipe links', () => {
  it('opens a catalog recipe from ?r=', async () => {
    setQuery('?r=42')
    renderApp()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName(RECIPES[42].name)
  })

  it('strips the query so a refresh does not reopen the modal', async () => {
    setQuery('?r=42')
    renderApp()
    await screen.findByRole('dialog')
    expect(window.location.search).toBe('')
  })

  it('reports an out-of-range ?r= instead of opening nothing', async () => {
    setQuery(`?r=${RECIPES.length + 500}`)
    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('no longer valid')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Regression: user recipes had no deep-link form at all.
  it('fetches and opens a user recipe from ?u=', async () => {
    h.client.__db.user_recipes.push({
      id: 'ur-77', user_id: 'user-2', name: 'Shared Sambar',
      category: 'Soup & Stew', dietary: [], ingredients: [{ amount: '1', unit: 'cup', item: 'dal' }],
      steps: ['Simmer'], time_minutes: 30, servings: 3,
    })
    setQuery('?u=ur-77')
    renderApp()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Shared Sambar')
    expect(screen.getByText('dal')).toBeTruthy()
  })

  it('reports a ?u= link the viewer cannot see', async () => {
    setQuery('?u=does-not-exist')
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t available')
  })

  it('does nothing when there is no link', async () => {
    renderApp()
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('routing', () => {
  it('redirects an unknown route home rather than rendering nothing', async () => {
    renderApp({ route: '/this-does-not-exist' })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    // Home's filter bar is the tell.
    expect(screen.getByRole('button', { name: /Surprise me/ })).toBeTruthy()
  })

  it('renders the login page', async () => {
    renderApp({ route: '/login' })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.getByRole('tab', { name: 'Sign up' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Forgot your password?' })).toBeTruthy()
  })

  it('exposes the reset-password route', async () => {
    renderApp({ route: '/reset-password' })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeTruthy()
  })
})

describe('username prompt', () => {
  it('prompts a new account that has no username yet', async () => {
    h.client = createMockSupabase({
      profiles: [{ id: 'user-1', username: null, username_set: false }],
    })
    renderApp()
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())

    await act(async () => { h.client.__setSession(fakeSession('user-1')) })

    expect(await screen.findByRole('heading', { name: 'Choose your username' })).toBeTruthy()
    // The first-run prompt has no escape hatch — an account needs a handle.
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('does not prompt once a username is set', async () => {
    renderApp()
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    await act(async () => { h.client.__setSession(fakeSession('user-1')) })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())

    expect(screen.queryByRole('heading', { name: 'Choose your username' })).toBeNull()
  })

  // Regression: fetchProfile used single() and swallowed the error, leaving
  // profile null forever — so the prompt never appeared and the account stayed
  // permanently without a handle.
  it('self-heals a missing profile row and then prompts', async () => {
    h.client = createMockSupabase({ profiles: [] })
    renderApp()
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())

    await act(async () => { h.client.__setSession(fakeSession('user-1')) })

    await waitFor(() => expect(h.client.__db.profiles).toHaveLength(1))
    expect(h.client.__db.profiles[0].id).toBe('user-1')
    expect(await screen.findByRole('heading', { name: 'Choose your username' })).toBeTruthy()
  })
})

describe('ConfigError', () => {
  it('explains which credential is missing', () => {
    render(<ConfigError message="VITE_SUPABASE_URL is not set." />)
    expect(screen.getByRole('heading', { name: /isn’t configured yet/ })).toBeTruthy()
    expect(screen.getByText('VITE_SUPABASE_URL is not set.')).toBeTruthy()
  })
})

describe('ErrorBoundary', () => {
  it('catches a render error and offers a reload', async () => {
    const { ErrorBoundary } = await import('./App')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Boom() { throw new Error('kaboom') }
    render(<ErrorBoundary><Boom /></ErrorBoundary>)

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy()
    expect(screen.getByText('kaboom')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeTruthy()
    spy.mockRestore()
  })
})
