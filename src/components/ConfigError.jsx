/**
 * Rendered instead of the app when Supabase credentials are missing. This has
 * to be dependency-free: it is the one screen that must work when nothing else
 * has been configured.
 */
export default function ConfigError({ message }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
      <div className="text-[3rem]" aria-hidden="true">🔌</div>
      <h1 className="font-display text-[1.3rem] font-semibold text-ink">
        ate. isn’t configured yet
      </h1>
      <p className="text-[0.85rem] text-muted max-w-sm">{message}</p>
      <p className="text-[0.8rem] text-muted max-w-sm">
        Add both values to a <code className="font-mono">.env.local</code> file
        (or to the repository’s Actions secrets for a deployed build) and restart
        the dev server:
      </p>
      <pre className="text-left text-[0.72rem] bg-paper border-[1.5px] border-rim rounded-lg px-4 py-3 overflow-x-auto max-w-full">
{`VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>`}
      </pre>
    </div>
  )
}
