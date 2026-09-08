import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Reached after following a password-reset email. Supabase has already
 * exchanged the link for a recovery session by this point, so all that's left
 * is to set the new password — App routes here on the PASSWORD_RECOVERY event.
 */
export default function ResetPassword() {
  const { updatePassword, user } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Those passwords don’t match'); return }

    setSaving(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not update your password.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border-2 border-ink rounded-xl px-4 py-3 text-[0.92rem] text-ink bg-paper outline-none focus:border-accent transition-colors placeholder:text-muted'

  return (
    <div className="min-h-[calc(100vh-var(--nav-h))] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm bg-card border-2 border-ink rounded-2xl shadow-warm-lg p-6">
        <h1 className="font-display text-[1.3rem] font-semibold text-ink mb-1">Choose a new password</h1>

        {done ? (
          <>
            <p role="status" className="text-[0.85rem] text-[#2A6035] bg-[#D5EBD8] rounded-xl px-3 py-2 mt-3">
              Password updated.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-accent text-ink border-2 border-ink shadow-pop press font-bold text-[0.9rem] rounded-xl py-3 mt-4 hover:bg-accent-dk transition-colors"
            >Start cooking</button>
          </>
        ) : !user ? (
          <>
            <p className="text-[0.85rem] text-muted mt-2">
              This reset link has expired or was already used. Request a new one from the
              log in screen.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full border-2 border-ink text-ink bg-card shadow-pop press font-bold text-[0.9rem] rounded-xl py-3 mt-4 hover:bg-accent hover:text-ink transition-colors"
            >Back to log in</button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-4">
            <input
              type="password"
              placeholder="New password"
              aria-label="New password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputCls}
              autoFocus
            />
            <input
              type="password"
              placeholder="Confirm new password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
              className={inputCls}
            />

            {error && <p role="alert" className="text-[0.8rem] text-heart bg-[#fde8e8] rounded-xl px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="bg-accent text-ink border-2 border-ink shadow-pop press font-bold text-[0.9rem] rounded-xl py-3 mt-1 hover:bg-accent-dk transition-colors disabled:opacity-50"
            >{saving ? 'Saving…' : 'Update password'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
