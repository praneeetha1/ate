import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { describeError } from '../utils/errors'
import CreateRecipeModal from '../components/CreateRecipeModal'
import Icon from '../components/Icon'

const MAX_BIO = 300

export default function Profile({ onOpen }) {
  const { userRecipes, deleteUserRecipe, syncing } = useApp()
  const { user, profile, signOut, updateProfile } = useAuth()
  const { showError, showToast } = useToast()
  const navigate = useNavigate()

  const [showCreate,    setShowCreate]    = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(null)

  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft,   setBioDraft]   = useState('')
  const [savingBio,  setSavingBio]  = useState(false)
  const [savingPriv, setSavingPriv] = useState(false)

  // `select('*')` simply omits a column that doesn't exist, so an absent key
  // here means migration 006 hasn't been applied to this database yet. Better
  // to say so than to offer a checkbox whose every click fails.
  const privacySupported = !!profile && 'is_private' in profile

  const displayName = profile?.username
    ? `@${profile.username}`
    : (user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Home cook')
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url

  async function handleSaveBio(e) {
    e.preventDefault()
    setSavingBio(true)
    try {
      await updateProfile({ bio: bioDraft.trim() || null })
      setEditingBio(false)
    } catch (err) {
      console.error('Bio update failed:', err)
      showError(describeError(err, 'Could not save your bio.'))
    } finally {
      setSavingBio(false)
    }
  }

  async function handleTogglePrivacy() {
    setSavingPriv(true)
    const next = !profile?.is_private
    try {
      await updateProfile({ is_private: next })
      showToast(
        next
          ? 'Your profile is now private.'
          : 'Your profile is now public.',
        'info',
      )
    } catch (err) {
      console.error('Privacy update failed:', err)
      showError(describeError(err, 'Could not change your privacy setting.'))
    } finally {
      setSavingPriv(false)
    }
  }

  const smallBtn = 'text-[0.78rem] font-bold border-2 rounded-full px-3 py-[5px] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <>
      {showCreate && (
        <CreateRecipeModal
          onClose={() => setShowCreate(false)}
          onCreated={key => { setShowCreate(false); onOpen(key) }}
        />
      )}
      {editingRecipe && (
        <CreateRecipeModal
          recipe={editingRecipe}
          onClose={() => setEditingRecipe(null)}
          onSaved={() => setEditingRecipe(null)}
        />
      )}

      {/* Profile section */}
      <div className="flex flex-col items-center px-5 pt-7 pb-5 gap-2.5 border-b border-ink">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full border-2 border-ink object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-warm-tan border-2 border-ink flex items-center justify-center text-[2.5rem]" aria-hidden="true">
            <Icon name="user" size={34} />
          </div>
        )}
        <h1 className="font-display text-[1.3rem] font-semibold text-ink">{displayName}</h1>

        {user ? (
          <div className="flex flex-col items-center gap-2 mt-0.5 w-full max-w-sm">
            <div className="text-[0.78rem] text-muted">{user.email}</div>

            {/* Bio — displayed on public profiles but previously had no editor,
                so the field could never actually be filled in. */}
            {editingBio ? (
              <form onSubmit={handleSaveBio} className="w-full flex flex-col gap-2 mt-1">
                <textarea
                  value={bioDraft}
                  onChange={e => setBioDraft(e.target.value)}
                  maxLength={MAX_BIO}
                  rows={3}
                  aria-label="Your bio"
                  placeholder="A line about you and how you cook…"
                  className="w-full border-2 border-ink rounded-xl px-3 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent resize-none placeholder:text-muted"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[0.7rem] text-muted">{bioDraft.length}/{MAX_BIO}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingBio(false)} className={`${smallBtn} border-ink text-muted`}>Cancel</button>
                    <button type="submit" disabled={savingBio} className={`${smallBtn} border-ink bg-accent text-ink disabled:opacity-50`}>
                      {savingBio ? 'Saving…' : 'Save bio'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <>
                {profile?.bio && (
                  <p className="text-[0.82rem] text-muted text-center max-w-xs">{profile.bio}</p>
                )}
                <div className="flex gap-2 flex-wrap justify-center">
                  <button
                    onClick={() => { setBioDraft(profile?.bio || ''); setEditingBio(true) }}
                    className={`${smallBtn} border-ink text-ink hover:bg-accent hover:text-ink`}
                  >{profile?.bio ? 'Edit bio' : 'Add bio'}</button>
                  <button
                    onClick={() => signOut().catch(err => { console.error(err); showError('Could not sign out.') })}
                    className={`${smallBtn} border-ink text-muted hover:text-heart hover:border-heart`}
                  >Sign out</button>
                </div>
              </>
            )}

            {/* Privacy. Public reads of recipes/saves/lists/activity are gated
                on this flag, so it genuinely hides content rather than only
                hiding the profile page. */}
            <div className="w-full mt-3 pt-3 border-t border-ink">
              <label className={`flex items-start gap-3 ${privacySupported ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                <input
                  type="checkbox"
                  checked={!!profile?.is_private}
                  onChange={handleTogglePrivacy}
                  disabled={savingPriv || !privacySupported}
                  className="accent-accent w-[16px] h-[16px] shrink-0 mt-[2px]"
                />
                <span>
                  <span className="block text-[0.82rem] font-bold text-ink">Private profile</span>
                  <span className="block text-[0.75rem] text-muted">
                    Hide your recipes, saved recipes, lists and activity from everyone else.
                  </span>
                </span>
              </label>
              {profile && !privacySupported && (
                <p role="status" className="text-[0.75rem] text-heart mt-2">
                  Unavailable until the pending database migration
                  (<code className="font-mono">006_hardening.sql</code>) is applied.
                </p>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="mt-0.5 text-[0.85rem] font-bold text-ink border-2 border-ink bg-card shadow-pop press rounded-full px-5 py-[6px] hover:bg-accent hover:text-ink transition-all"
          >Log in / Sign up</button>
        )}
      </div>

      {syncing && <p className="text-center py-2 text-[0.75rem] text-muted" role="status">Syncing…</p>}

      {/* My Recipes section */}
      <section className="border-b border-ink" aria-labelledby="profile-recipes-heading">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="profile-recipes-heading" className="font-display text-[1.15rem] font-semibold text-ink">My Recipes</h2>
          <button
            onClick={() => setShowCreate(true)}
            className={`${smallBtn} border-ink text-ink hover:bg-accent hover:text-ink`}
          >+ New Recipe</button>
        </div>

        {!userRecipes.length ? (
          <p className="px-5 pb-5 text-[0.85rem] text-muted italic">
            No recipes yet — create your first one!
          </p>
        ) : (
          <div className="flex flex-col gap-1 pb-3">
            {userRecipes.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between px-5 py-2.5 hover:bg-paper transition-colors gap-2">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                    onClick={() => onOpen('u_' + r.id)}
                  >
                    <div className="font-display text-[0.95rem] font-semibold text-ink truncate">{r.name}</div>
                    <div className="text-[0.75rem] text-muted">
                      {r.category}
                      {r.servings ? ` · ${r.servings} servings` : ''}
                      {r.timeMinutes ? ` · ${r.timeMinutes} min` : ''}
                    </div>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setEditingRecipe(r)}
                      aria-label={`Edit ${r.name}`}
                      className="text-[0.72rem] text-muted hover:text-accent transition-colors px-2 py-1 rounded"
                    >Edit</button>
                    <button
                      onClick={() => setConfirmDelete(r.id)}
                      aria-label={`Delete ${r.name}`}
                      className="text-[0.72rem] text-muted hover:text-heart transition-colors px-2 py-1 rounded"
                    >Delete</button>
                  </div>
                </div>

                {/* Deletion is permanent and also strips the recipe from every
                    list, save and shopping entry — so ask first. */}
                {confirmDelete === r.id && (
                  <div className="flex items-center justify-between gap-3 mx-5 mb-2 px-3.5 py-2.5 bg-[#fde8e8] border border-ink rounded-xl">
                    <span className="text-[0.8rem] text-heart">Delete “{r.name}” permanently?</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        disabled={deleting === r.id}
                        onClick={async () => {
                          setDeleting(r.id)
                          const ok = await deleteUserRecipe(r.id)
                          setDeleting(null)
                          // Keep the confirmation open on failure, so the
                          // recipe and the reason stay on screen together.
                          if (ok) setConfirmDelete(null)
                        }}
                        className="text-[0.75rem] font-bold text-ink bg-heart border-2 border-ink shadow-pop press rounded-xl px-3 py-1 disabled:opacity-50"
                      >{deleting === r.id ? 'Deleting…' : 'Delete'}</button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[0.75rem] font-bold text-muted px-2"
                      >Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

    </>
  )
}
