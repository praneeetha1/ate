/**
 * Escapes a user-supplied value for use inside a PostgREST `ilike` filter.
 *
 * `%` and `_` are LIKE wildcards, and `,` `(` `)` `.` `"` are filter-expression
 * syntax — an unescaped query could turn a search into a malformed filter
 * rather than matching what the user typed.
 */
export function escapeLike(value) {
  return String(value ?? '').replace(/[\\%_,()."]/g, ch => '\\' + ch)
}
