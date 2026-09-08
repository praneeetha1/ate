import { describe, it, expect } from 'vitest'
import { describeError } from './errors'

describe('describeError', () => {
  it('explains an RLS denial', () => {
    expect(describeError({ code: '42501', message: 'new row violates row-level security policy' }))
      .toMatch(/row-level security/)
  })

  it('points at an unapplied migration for a missing column or table', () => {
    expect(describeError({ code: '42703', message: 'column ratings.recipe_key does not exist' }))
      .toMatch(/migration may not have been applied/)
    expect(describeError({ code: 'PGRST204', message: "could not find the 'x' column" }))
      .toMatch(/migration may not have been applied/)
    expect(describeError({ code: '42P01', message: 'relation "public.foo" does not exist' }))
      .toMatch(/migration may not have been applied/)
  })

  it('recognises a duplicate and a failed check', () => {
    expect(describeError({ code: '23505' })).toBe('That already exists.')
    expect(describeError({ code: '23514' })).toBe('That value isn’t allowed.')
  })

  it('recognises a network failure', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toMatch(/Could not reach the server/)
  })

  it('appends an unrecognised message to the fallback', () => {
    expect(describeError({ code: 'XX000', message: 'boom' }, 'Could not create list.'))
      .toBe('Could not create list. (boom)')
  })

  it('returns the bare fallback when there is nothing to add', () => {
    expect(describeError(null, 'Could not create list.')).toBe('Could not create list.')
    expect(describeError({}, 'Could not create list.')).toBe('Could not create list.')
  })
})
