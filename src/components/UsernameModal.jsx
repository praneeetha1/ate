import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../hooks/useDialog'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function UsernameModal({ onClose }) {
  const { updateUsername, user, profile } = useAuth()
  // The first-run prompt has no dismiss path — the account needs a username
  // before it can be found or followed — so Escape only closes the edit case.
  const { titleId, backdropProps, panelProps } = useDialog({ onClose: onClose })

  const [username, setUsername] = useState(profile?.username ?? '')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const defaultName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  const suggestion  = defaultName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20)

  async function handleSubmit(e) {
    e.preventDefault()
    const val = username.trim().toLowerCase()
    if (!val) { setError('Username is required'); return }
    if (!USERNAME_RE.test(val)) {
      setError('3–20 characters, lowercase letters, numbers and underscores only')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateUsername(val)
      onClose?.()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-[rgba(60,35,15,0.6)] backdrop-blur-[3px] z-[700] flex items-center justify-center px-5"
      {...backdropProps}
    >
      <div
        className="bg-card border-[3px] border-ink rounded-2xl shadow-warm-xl w-full max-w-sm p-7"
        {...panelProps}
      >

        <div className="text-center mb-6">
          <div className="font-display text-[2rem] font-semibold text-accent-dk leading-none mb-1" aria-hidden="true">
            ate<span className="italic font-normal text-accent">.</span>
          </div>
          <h2 id={titleId} className="font-display text-[1.2rem] font-semibold text-ink mt-3">
            {profile?.username_set ? 'Change your username' : 'Choose your username'}
          </h2>
          <p className="text-[0.82rem] text-muted mt-1.5">
            This is how your friends will find and recognise you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[0.9rem]" aria-hidden="true">@</span>
            <input
              id="username-input"
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              placeholder={suggestion}
              aria-label="Username"
              aria-describedby="username-help"
              aria-invalid={!!error}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full border-2 border-ink rounded-xl pl-8 pr-4 py-3 text-[0.95rem] text-ink bg-paper outline-none focus:border-accent transition-colors placeholder:text-muted"
              autoFocus
            />
          </div>
          <p id="username-help" className="text-[0.72rem] text-muted -mt-1">
            Lowercase letters, numbers and underscores · 3–20 characters
          </p>

          {error && (
            <p role="alert" className="text-[0.8rem] text-heart bg-[#fde8e8] rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving || username.trim().length < 3}
            className="bg-accent text-ink border-2 border-ink shadow-pop press font-bold text-[0.95rem] rounded-xl py-3 mt-1 hover:bg-accent-dk disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving…' : profile?.username_set ? 'Save username' : 'Set username'}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[0.82rem] font-bold text-muted py-2 hover:text-ink transition-colors"
            >Cancel</button>
          )}
        </form>
      </div>
    </div>
  )
}
