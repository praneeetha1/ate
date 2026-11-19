import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createMockSupabase, fakeSession } from './test/supabaseMock'
import RECIPES from './data/recipes.json'

const h = vi.hoisted(() => ({ client: null, arrival: {} }))
vi.mock('./lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))
vi.mock('./lib/arrival', () => ({ get authArrival() { return h.arrival } }))

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
  h.arrival = {}
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

describe('the bottom nav', () => {
  const tabs = async () => {
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    return [...nav.querySelectorAll('a')].map(a => a.textContent.trim())
  }

  // The Fridge took the slot Friends used to hold. It's the thing you check
  // before deciding what to cook, so it earns a tab rather than living at the
  // bottom of Profile.
  it('offers the Fridge where Friends used to be', async () => {
    renderApp()
    await waitFor(async () => expect(await tabs()).toContain('Fridge'))
    expect(await tabs()).toEqual(['Home', 'Search', 'Saved', 'Fridge', 'Profile'])
  })

  it('no longer offers Friends', async () => {
    renderApp()
    await screen.findByRole('navigation', { name: 'Main' })
    expect(await tabs()).not.toContain('Friends')
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
  /**
   * Waits for the destination, not for the splash to leave.
   *
   * <Navigate> redirects in an effect, so there is one render pass where auth
   * has resolved (no "Loading…") but <main> is still empty. Asserting the
   * moment the splash disappears caught that gap on a slow CI runner while
   * passing locally — findBy* waits for the thing the test is actually about.
   */
  it('redirects an unknown route home rather than rendering nothing', async () => {
    renderApp({ route: '/this-does-not-exist' })
    // Home's filter bar is the tell.
    expect(await screen.findByRole('button', { name: /Surprise me/ })).toBeTruthy()
  })

  it('renders the login page', async () => {
    renderApp({ route: '/login' })
    expect(await screen.findByRole('tab', { name: 'Sign up' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Forgot your password?' })).toBeTruthy()
  })

  it('exposes the reset-password route', async () => {
    renderApp({ route: '/reset-password' })
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeTruthy()
  })
})

describe('signing in, the edges', () => {
  it('sends a signed-in visitor on from the login page', async () => {
    h.client = createMockSupabase({ __session: fakeSession('user-1'), profiles: [{ id: 'user-1', username: 'cook', username_set: true }] })
    renderApp({ route: '/login' })
    expect(await screen.findByRole('button', { name: /Surprise me/ })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Sign up' })).toBeNull()
  })

  // These used to land on the home page with no word about what happened.
  it('explains an expired email link and offers the login page', async () => {
    h.arrival = { error: 'Email link is invalid or has expired', errorCode: 'otp_expired' }
    renderApp()
    expect(await screen.findByText(/email link has expired or was already used/i)).toBeTruthy()
    expect(await screen.findByRole('tab', { name: 'Log in' })).toBeTruthy()
  })

  it('says the email is confirmed when the link could not sign this browser in', async () => {
    h.arrival = { code: true }
    renderApp()
    expect(await screen.findByText(/your email is confirmed/i)).toBeTruthy()
  })

  it('says so when a saved session has run out', async () => {
    h.arrival = { hadSession: true }
    renderApp()
    expect(await screen.findByText(/you were signed out/i)).toBeTruthy()
  })

  it('stays quiet for someone who simply never signed in', async () => {
    renderApp()
    await screen.findByRole('button', { name: /Surprise me/ })
    expect(screen.queryByText(/signed out|email is confirmed|expired/i)).toBeNull()
  })

  it('tells a sign-up with a taken email to log in instead', async () => {
    h.client.auth.signUp = vi.fn(() => Promise.resolve({ data: { user: { identities: [] }, session: null }, error: null }))
    renderApp({ route: '/login' })
    ;(await screen.findByRole('tab', { name: 'Sign up' })).click()
    const email = await screen.findByRole('textbox', { name: 'Email' })
    fireEvent.change(email, { target: { value: 'cook@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/already has an account/i)).toBeTruthy()
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
