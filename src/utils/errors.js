/**
 * Turns a Supabase/PostgREST error into something a user can act on.
 *
 * A generic "Could not do X" hides the one detail that matters — an RLS denial,
 * a missing column from an unapplied migration, and a dropped connection all
 * need different fixes, so the message and code are surfaced rather than eaten.
 */
export function describeError(err, fallback = 'Something went wrong.') {
  if (!err) return fallback

  const code = err.code || err.status
  const raw  = err.message || err.error_description || err.details || ''

  // Map the codes we can explain precisely.
  if (code === '42501') return 'The database rejected that write (row-level security). You may need to log in again.'
  if (code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205') {
    return `The database is missing something this build expects (${raw || code}). A migration may not have been applied.`
  }
  if (code === '23505') return 'That already exists.'
  if (code === '23514') return 'That value isn’t allowed.'
  if (err instanceof TypeError || /fetch|network/i.test(raw)) {
    return 'Could not reach the server. Check your connection.'
  }

  return raw ? `${fallback} (${raw})` : fallback
}
