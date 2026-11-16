import { vi } from 'vitest'
import { createFakeSupabase, fakeSession } from '../lib/fakeSupabase'

/** The in-memory Supabase, with every client method a vi.fn spy. */
export const createMockSupabase = (seed = {}) => createFakeSupabase(seed, vi.fn)
export { fakeSession }
