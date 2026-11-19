/**
 * What the address bar said when the app opened, read before the auth client
 * tidies the URL. Email links come back with either a `code` to exchange or an
 * error (expired, already used) — in the query or, on some Supabase paths, in
 * the fragment, where the hash router would otherwise swallow it unseen.
 * `hadSession` notes a saved sign-in, so App can tell "signed out because the
 * session expired" apart from "never signed in".
 */
function readArrival() {
  try {
    const q = new URLSearchParams(window.location.search)
    const h = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''))
    const pick = k => q.get(k) || h.get(k)
    const hadSession = Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k))
    const error = pick('error_description')
    // Clear an error out of the address now, before the hash router reads
    // "#error=…" as a route and redirects over App's own redirect to log in.
    // (A `code` stays: the auth client still has to exchange it.)
    if (error) window.history.replaceState(null, '', window.location.pathname + '#/')
    return { code: q.has('code'), error, errorCode: pick('error_code'), hadSession }
  } catch {
    return {}
  }
}
export const authArrival = readArrival()
