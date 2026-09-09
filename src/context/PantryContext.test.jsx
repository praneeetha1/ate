import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { createMockSupabase, fakeSession } from '../test/supabaseMock'

const h = vi.hoisted(() => ({ client: null }))
vi.mock('../lib/supabase', () => ({
  get supabase() { return h.client },
  configError: null,
  appUrl: 'http://localhost:3000/ate/',
}))

const { PantryProvider, usePantry } = await import('./PantryContext')
const { AuthProvider }              = await import('./AuthContext')
const { ToastProvider }             = await import('./ToastContext')

let api = null
function Probe({ items = [] }) {
  api = usePantry()
  return (
    <div>
      <span data-testid="enabled">{String(api.pantryEnabled)}</span>
      <span data-testid="ready">{String(api.pantryReady)}</span>
      <span data-testid="rows">
        {[...api.pantry.entries()].map(([k, v]) => `${k}=${v}`).sort().join(',')}
      </span>
      <span data-testid="states">
        {items.map(i => `${i}:${api.pantryState(i)}`).join(' ')}
      </span>
    </div>
  )
}

function renderPantry(props = {}) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <PantryProvider><Probe {...props} /></PantryProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

const seedProfile = uid => ({ profiles: [{ id: uid, username: 'cook', username_set: true }] })

beforeEach(() => {
  localStorage.clear()
  api = null
})

describe('signed out', () => {
  it('is disabled and reports everything as unknown', async () => {
    h.client = createMockSupabase()
    renderPantry({ items: ['salt', 'pecorino'] })

    await waitFor(() => expect(screen.getByTestId('enabled')).toHaveTextContent('false'))
    // Not even staples are claimed: without a server there's nothing to trust.
    expect(screen.getByTestId('states')).toHaveTextContent('salt:unknown pecorino:unknown')
  })

  it('never writes', async () => {
    h.client = createMockSupabase()
    renderPantry()
    await waitFor(() => expect(screen.getByTestId('enabled')).toHaveTextContent('false'))

    await act(async () => { api.cyclePantry('pecorino') })
    expect(h.client.__callsTo('pantry')).toEqual([])
  })
})

describe('signed in', () => {
  it('loads the user’s rows', async () => {
    h.client = createMockSupabase({
      ...seedProfile('user-1'),
      __session: fakeSession('user-1'),
      pantry: [
        { user_id: 'user-1', item: 'pecorino', state: 'have' },
        { user_id: 'user-1', item: 'guanciale', state: 'out' },
        { user_id: 'user-2', item: 'basil',    state: 'have' },
      ],
    })
    renderPantry({ items: ['pecorino', 'guanciale', 'basil'] })

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('rows')).toHaveTextContent('guanciale=out,pecorino=have')
    // user-2's row must not leak in.
    expect(screen.getByTestId('states')).toHaveTextContent('pecorino:have guanciale:out basil:unknown')
  })

  it('assumes staples are present without a row', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    renderPantry({ items: ['Kosher salt', 'extra-virgin olive oil', 'eggs', 'pecorino'] })

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('states')).toHaveTextContent(
      'Kosher salt:have extra-virgin olive oil:have eggs:have pecorino:unknown',
    )
    // Assumed state is not stored — no rows were written to say so.
    expect(h.client.__db.pantry).toEqual([])
  })

  it('lets an explicit state override an assumed staple', async () => {
    h.client = createMockSupabase({
      ...seedProfile('user-1'),
      __session: fakeSession('user-1'),
      pantry: [{ user_id: 'user-1', item: 'salt', state: 'out' }],
    })
    renderPantry({ items: ['Kosher salt'] })

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('states')).toHaveTextContent('Kosher salt:out')
  })

  it('stores state against the canonical item, so synonyms share a row', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    renderPantry({ items: ['Parmigiano-Reggiano, grated'] })
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    await act(async () => { api.setPantryState('Parmigiano-Reggiano, grated', 'low') })

    expect(h.client.__db.pantry).toEqual([
      expect.objectContaining({ user_id: 'user-1', item: 'parmesan', state: 'low' }),
    ])
    // The same kitchen item written any other way reads back the same.
    await waitFor(() => expect(api.pantryState('parmesan cheese')).toBe('low'))
  })

  it('cycles a non-staple through every state and back to unknown', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    renderPantry({ items: ['pecorino'] })
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    for (const expected of ['have', 'low', 'out']) {
      await act(async () => { api.cyclePantry('pecorino') })
      await waitFor(() => expect(api.pantryState('pecorino')).toBe(expected))
    }

    // Fourth tap removes the row rather than storing a fourth state.
    await act(async () => { api.cyclePantry('pecorino') })
    await waitFor(() => expect(api.pantryState('pecorino')).toBe('unknown'))
    expect(h.client.__db.pantry).toEqual([])
  })

  it('cycles a staple through three states, never to unknown', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    renderPantry({ items: ['salt'] })
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    // Starts assumed-have, so the first tap moves it to low.
    for (const expected of ['low', 'out', 'have', 'low']) {
      await act(async () => { api.cyclePantry('salt') })
      await waitFor(() => expect(api.pantryState('salt')).toBe(expected))
    }
  })

  it('updates a row in place instead of duplicating it', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    renderPantry({ items: ['pecorino'] })
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    await act(async () => { api.setPantryState('pecorino', 'have') })
    await act(async () => { api.setPantryState('pecorino', 'low') })

    expect(h.client.__db.pantry).toHaveLength(1)
    expect(h.client.__db.pantry[0]).toEqual(expect.objectContaining({ item: 'pecorino', state: 'low' }))
  })

  it('ignores an ingredient that canonicalises to nothing', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    renderPantry()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    await act(async () => { api.cyclePantry('') })
    await act(async () => { api.setPantryState(null, 'have') })
    expect(h.client.__db.pantry).toEqual([])
  })

  it('surfaces a failed load and still becomes ready', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    h.client.__failOn('pantry', 'select', { code: '42P01', message: 'relation "pantry" does not exist' })
    renderPantry({ items: ['pecorino'] })

    // A missing table means migration 007 hasn't been applied — the app has to
    // stay usable rather than hang on a spinner.
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByTestId('states')).toHaveTextContent('pecorino:unknown')
  })

  it('surfaces a failed write', async () => {
    h.client = createMockSupabase({ ...seedProfile('user-1'), __session: fakeSession('user-1') })
    renderPantry({ items: ['pecorino'] })
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    h.client.__failOn('pantry', 'upsert', { code: '42501', message: 'violates row-level security policy' })
    await act(async () => { api.setPantryState('pecorino', 'have') })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('drops the previous identity’s pantry on sign-out', async () => {
    h.client = createMockSupabase({
      ...seedProfile('user-1'),
      __session: fakeSession('user-1'),
      pantry: [{ user_id: 'user-1', item: 'pecorino', state: 'have' }],
    })
    renderPantry({ items: ['pecorino'] })
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('pecorino=have'))

    await act(async () => { h.client.__setSession(null) })

    await waitFor(() => expect(screen.getByTestId('enabled')).toHaveTextContent('false'))
    expect(screen.getByTestId('rows')).toHaveTextContent('')
  })
})
