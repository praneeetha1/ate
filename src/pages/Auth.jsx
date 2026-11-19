import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Sketch'
import { useAuth } from '../context/AuthContext'

export default function Auth() {
  // 'login' | 'signup' | 'forgot'
  const [tab,      setTab]      = useState('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')
  const [loading,  setLoading]  = useState(false)

  const { user, signIn, signUp, signInWithGoogle, sendPasswordReset, resendConfirmation } = useAuth()
  // Set when logging in fails only because the email isn't confirmed yet.
  const [unconfirmed, setUnconfirmed] = useState(false)
  const navigate = useNavigate()
  // Where to go back to after signing in, e.g. the Fridge page that sent you
  // here. Only an in-app path: never a full URL someone could put in a link.
  const [params] = useSearchParams()
  const next = /^\/(?!\/)/.test(params.get('next') || '') ? params.get('next') : '/'

  function switchTab(next) {
    setTab(next)
    setError('')
    setSuccess('')
    setUnconfirmed(false)
  }

  async function resend() {
    setError('')
    try {
      await resendConfirmation(email)
      setUnconfirmed(false)
      setSuccess('Sent. Check your inbox (and spam) for the confirmation link.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setUnconfirmed(false)
    setLoading(true)
    try {
      if (tab === 'login') {
        await signIn(email, password)
        navigate(next)
      } else if (tab === 'signup') {
        const outcome = await signUp(email, password)
        if (outcome === 'signed-in') navigate(next)
        else if (outcome === 'exists') {
          setTab('login')
          setError('That email already has an account. Log in instead, or reset your password.')
        } else {
          setSuccess(`We sent a confirmation link to ${email}. Open it on this device, then log in here. Check spam if it doesn’t arrive.`)
        }
      } else {
        // Password reset had no entry point at all before this.
        await sendPasswordReset(email)
        setSuccess('If that email has an account, a reset link is on its way.')
      }
    } catch (err) {
      // Supabase's wording, made plainer for the two everyone hits.
      if (/email not confirmed/i.test(err.message)) {
        setUnconfirmed(true)
        setError('Confirm your email first: open the link we sent you.')
      } else if (/invalid login credentials/i.test(err.message)) {
        setError('That email and password don’t match. Try again, or reset your password.')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    try {
      await signInWithGoogle()
      // The page redirects to Google — no navigate() needed.
    } catch (err) {
      setError(err.message)
    }
  }

  const inputCls = 'w-full border-2 border-ink rounded-xl px-4 py-3 text-[0.92rem] text-ink bg-paper outline-none focus:border-accent-dk transition-colors placeholder:text-muted font-sans'

  const submitLabel = tab === 'login' ? 'Log in' : tab === 'signup' ? 'Create account' : 'Send reset link'

  // Already signed in (a bookmark, or Back after logging in): nothing to do here.
  if (user) return <Navigate to={next} replace />

  return (
    <div className="min-h-[calc(100dvh-var(--nav-h))] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <Logo height={52} className="mx-auto text-ink" />
          <p className="text-[0.9rem] text-muted mt-2">
            Your cozy recipe companion
          </p>
        </div>

        <div className="bg-card border-2 border-ink rounded-2xl shadow-warm-lg overflow-hidden">

          <div className="px-6 pt-5">
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === 'login'}  onClick={() => switchTab('login')}>Log in</button>
              <button role="tab" aria-selected={tab === 'signup'} onClick={() => switchTab('signup')}>Sign up</button>
            </div>
          </div>

          <div className="p-6">
            {tab !== 'forgot' && (
              <>
                <button
                  onClick={handleGoogle}
                  className="w-full flex items-center justify-center gap-3 bg-white border-2 border-ink rounded-xl py-2.5 text-[0.88rem] font-bold text-ink hover:bg-paper hover:bg-paper transition-all mb-5 shadow-warm"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-rim" />
                  <span className="text-[0.8rem] text-muted">or</span>
                  <div className="flex-1 h-px bg-rim" />
                </div>
              </>
            )}

            {tab === 'forgot' && (
              <p className="text-[0.82rem] text-muted mb-4">
                Enter your email and we’ll send you a link to choose a new password.
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="Email"
                aria-label="Email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className={inputCls}
              />
              {tab !== 'forgot' && (
                <input
                  type="password"
                  placeholder="Password"
                  aria-label="Password"
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputCls}
                />
              )}

              {error   && <p role="alert" className="text-[0.8rem] text-heart bg-danger-bg rounded-xl px-3 py-2">{error}</p>}
              {unconfirmed && (
                <button type="button" onClick={resend} className="self-start text-[0.8rem] font-bold text-ink underline underline-offset-2 min-h-[36px]">
                  Send the confirmation email again
                </button>
              )}
              {success && <p role="status" className="text-[0.8rem] text-ok bg-ok-bg rounded-xl px-3 py-2">{success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="bg-accent text-ink border-2 border-ink shadow-pop press font-bold text-[0.9rem] rounded-xl py-3 mt-1 hover:bg-accent-dk transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '…' : submitLabel}
              </button>
            </form>

            <div className="mt-4 text-center">
              {tab === 'forgot' ? (
                <button onClick={() => switchTab('login')} className="text-[0.78rem] text-muted hover:text-accent-dk underline">
                  Back to log in
                </button>
              ) : (
                <button onClick={() => switchTab('forgot')} className="text-[0.78rem] text-muted hover:text-accent-dk underline">
                  Forgot your password?
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
