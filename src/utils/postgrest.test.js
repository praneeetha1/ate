import { describe, it, expect } from 'vitest'
import { escapeLike } from './postgrest'

describe('escapeLike', () => {
  it('leaves an ordinary username untouched', () => {
    expect(escapeLike('praneetha')).toBe('praneetha')
    expect(escapeLike('cook_99')).toBe('cook\\_99')
  })

  it('escapes LIKE wildcards so they match literally', () => {
    expect(escapeLike('100%')).toBe('100\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
  })

  it('escapes PostgREST filter-expression syntax', () => {
    // An unescaped comma or paren could terminate the filter early.
    expect(escapeLike('a,b')).toBe('a\\,b')
    expect(escapeLike('f(x)')).toBe('f\\(x\\)')
    expect(escapeLike('a.b')).toBe('a\\.b')
    expect(escapeLike('say "hi"')).toBe('say \\"hi\\"')
  })

  it('escapes a backslash itself', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  it('handles nullish input', () => {
    expect(escapeLike(null)).toBe('')
    expect(escapeLike(undefined)).toBe('')
  })
})
