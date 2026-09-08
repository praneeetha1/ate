import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  scopeFor, loadSlice, saveSlice, clearScope, migrateLegacyKeys, LEGACY_KEYS,
} from './storage'

beforeEach(() => localStorage.clear())

describe('scopeFor', () => {
  it('separates a signed-in identity from the guest one', () => {
    expect(scopeFor('uid-1')).toBe('uid-1')
    expect(scopeFor(null)).toBe('guest')
    expect(scopeFor(undefined)).toBe('guest')
  })
})

describe('slice isolation', () => {
  // Regression: with one global key per slice, signing out left the previous
  // account's recipes and notes in storage for the next session to read back.
  it('keeps two identities’ data completely separate', () => {
    saveSlice('user-a', 'favs', ['1', '2'])
    saveSlice('user-b', 'favs', ['9'])
    saveSlice('guest',  'favs', [])

    expect(loadSlice('user-a', 'favs', null)).toEqual(['1', '2'])
    expect(loadSlice('user-b', 'favs', null)).toEqual(['9'])
    expect(loadSlice('guest',  'favs', null)).toEqual([])
  })

  it('returns the fallback for an untouched scope', () => {
    expect(loadSlice('nobody', 'favs', 'FALLBACK')).toBe('FALLBACK')
  })

  it('returns the fallback rather than throwing on corrupt JSON', () => {
    localStorage.setItem('ate:user-a:ratings', '{not json')
    expect(loadSlice('user-a', 'ratings', {})).toEqual({})
  })

  it('distinguishes a stored null from a missing key', () => {
    saveSlice('user-a', 'notes', null)
    expect(loadSlice('user-a', 'notes', 'FB')).toBe('FB')
  })

  it('clearScope removes only that scope', () => {
    saveSlice('guest',  'favs', ['1'])
    saveSlice('user-a', 'favs', ['2'])
    clearScope('guest')
    expect(loadSlice('guest',  'favs', null)).toBeNull()
    expect(loadSlice('user-a', 'favs', null)).toEqual(['2'])
  })
})

describe('resilience when storage is unavailable', () => {
  it('saveSlice swallows a quota error', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => saveSlice('user-a', 'favs', ['1'])).not.toThrow()
    spy.mockRestore()
  })

  it('loadSlice swallows a blocked read', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    expect(loadSlice('user-a', 'favs', 'FB')).toBe('FB')
    spy.mockRestore()
  })
})

describe('migrateLegacyKeys', () => {
  it('moves every pre-scoping key into the guest scope', () => {
    localStorage.setItem('ate_favs',         JSON.stringify([1, 2]))
    localStorage.setItem('ate_ratings',      JSON.stringify({ 'Some Recipe': 5 }))
    localStorage.setItem('ate_user_recipes', JSON.stringify([{ id: 'local_1' }]))

    migrateLegacyKeys()

    expect(loadSlice('guest', 'favs', null)).toEqual([1, 2])
    expect(loadSlice('guest', 'ratings', null)).toEqual({ 'Some Recipe': 5 })
    expect(loadSlice('guest', 'user_recipes', null)).toEqual([{ id: 'local_1' }])

    // Old keys are gone, so this can't run twice.
    for (const legacy of Object.values(LEGACY_KEYS)) {
      expect(localStorage.getItem(legacy)).toBeNull()
    }
  })

  it('is idempotent and does not clobber existing guest data', () => {
    localStorage.setItem('ate_favs', JSON.stringify([1]))
    migrateLegacyKeys()

    saveSlice('guest', 'favs', [1, 2, 3])
    localStorage.setItem('ate_favs', JSON.stringify([99]))
    migrateLegacyKeys() // already marked as migrated — must be a no-op

    expect(loadSlice('guest', 'favs', null)).toEqual([1, 2, 3])
  })
})
