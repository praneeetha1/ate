import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function UsernameModal({ onClose }) {
  const { updateUsername, user, profile } = useAuth()
  const [username, setUsername] = useState('')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const defaultName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''

  async function handleSubmit(e) {
    e.preventDefault()
    const val = username.trim().toLowerCase()
    if (!val) { setError('Username is required'); return }
    if (!/^[a-z0-9_]{3,20}$/.test(val)) {
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
    <div className="fixed inset-0 bg-[rgba(60,35,15,0.6)] backdrop-blur-[3px] z-[700] flex items-center justify-center px-5">
      <div className="bg-card border-[1.5px] border-rim rounded-2xl shadow-warm-xl w-full max-w-sm p-7">

        <div className="text-center mb-6">
          <div className="font-display text-[2rem] font-semibold text-accent-dk leading-none mb-1">
            ate<span className="italic font-normal text-accent">.</span>
          </div>
          <h2 className="font-display text-[1.2rem] font-semibold text-ink mt-3">
            Choose your username
          </h2>
          <p className="text-[0.82rem] text-muted mt-1.5">
            This is how your friends will find and recognise you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[0.9rem]">@</span>
            <input
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              placeholder={defaultName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20)}
              maxLength={20}
              className="w-full border-[1.5px] border-rim rounded-xl pl-8 pr-4 py-3 text-[0.95rem] text-ink bg-paper outline-none focus:border-accent transition-colors placeholder:text-muted"
              autoFocus
            />
          </div>
          <p className="text-[0.72rem] text-muted -mt-1">
            Lowercase letters, numbers and underscores · 3–20 characters
          </p>

          {error && (
            <p className="text-[0.8rem] text-heart bg-[#fde8e8] rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving || username.length < 3}
            className="bg-accent text-white font-bold text-[0.95rem] rounded-xl py-3 mt-1 hover:bg-accent-dk disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving…' : 'Set username'}
          </button>
        </form>
      </div>
    </div>
  )
}
