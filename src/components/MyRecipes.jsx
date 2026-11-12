import { useState } from 'react'
import { useApp } from '../context/AppContext'
import CreateRecipeModal from './CreateRecipeModal'

const smallBtn = 'text-[0.78rem] font-bold border-2 rounded-full px-3 py-[5px] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ink'

/**
 * The recipes you've written or imported: open, edit or delete them. The one
 * place to manage them (Saved → My Recipes); Home still shows them to browse.
 */
export default function MyRecipes({ onOpen }) {
  const { userRecipes, deleteUserRecipe } = useApp()
  const [showCreate,    setShowCreate]    = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(null)

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

      <section aria-labelledby="my-recipes-heading">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="my-recipes-heading" className="font-display text-[1.15rem] font-semibold text-ink">My Recipes</h2>
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
                    className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded"
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
                      className="text-[0.72rem] text-muted hover:text-accent-dk transition-colors px-2 py-1 rounded"
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
                  <div className="flex items-center justify-between gap-3 mx-5 mb-2 px-3.5 py-2.5 bg-danger-bg border border-ink rounded-xl">
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
