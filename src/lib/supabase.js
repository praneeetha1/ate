import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// createClient() throws on empty credentials, and it does so at module scope —
// before React renders, so ErrorBoundary can never catch it and the user just
// gets a blank page. Detect the misconfiguration instead and let main.jsx show
// a real message.
export const configError = !SUPABASE_URL
  ? 'VITE_SUPABASE_URL is not set.'
  : !SUPABASE_ANON_KEY
    ? 'VITE_SUPABASE_ANON_KEY is not set.'
    : null

// Where OAuth and email-confirmation links should come back to. Derived from
// the Vite base so local dev returns to localhost instead of production.
export const appUrl = window.location.origin + import.meta.env.BASE_URL

export const supabase = configError
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
