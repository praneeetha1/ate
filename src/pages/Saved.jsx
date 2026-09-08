import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { resolveRecipe, keyToText } from '../utils/recipe'
import RecipeCard from '../components/RecipeCard'
import RecipeListItem from '../components/RecipeListItem'

export default function Saved({ onOpen }) {
  const { favorites, lists, userRecipes, deleteList, renameList, createList, syncing } = useApp()
  const { showError } = useToast()

  const [tab,         setTab]         = useState('favorites') // 'favorites' | 'lists'
  const [layout,      setLayout]      = useState('grid')
  const [expanded,    setExpanded]    = useState(null)
  const [newListName, setNewListName] = useState('')
  const [renaming,    setRenaming]    = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmList, setConfirmList] = useState(null)

  const favList = [...favorites]

  /** Pairs a recipe key with its recipe, skipping keys that no longer resolve. */
  function resolve(key) {
    const recipe = resolveRecipe(key, userRecipes)
    return recipe ? { recipe, key } : null
  }

  async function handleCreateList(e) {
    e.preventDefault()
    const name = newListName.trim()
    if (!name) return
    try {
      await createList(name)
      setNewListName('')
    } catch (err) {
      console.error('Create list failed:', err)
      showError('Could not create list.')
    }
  }

  async function handleRename(e, id) {
    e.preventDefault()
    const name = renameValue.trim()
    if (!name) return
    await renameList(id, name)
    setRenaming(null)
  }

  const tabCls = active =>
    `flex-1 py-2.5 text-[0.8rem] font-bold tracking-[0.06em] uppercase transition-colors border-b-2 ${
      active ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
    }`

  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-rim bg-paper" role="tablist">
        <button role="tab" aria-selected={tab === 'favorites'} className={tabCls(tab === 'favorites')} onClick={() => setTab('favorites')}>
          ♥ Saved
        </button>
        <button role="tab" aria-selected={tab === 'lists'} className={tabCls(tab === 'lists')} onClick={() => setTab('lists')}>
          📋 Lists
        </button>
      </div>

      {syncing && (
        <p className="text-center py-2 text-[0.75rem] text-muted" role="status">Syncing…</p>
      )}

      {/* ── Favorites tab ── */}
      {tab === 'favorites' && (
        <>
          <div className="flex items-center justify-between px-5 py-[18px] pb-3">
            <h1 className="font-display text-[1.3rem] font-semibold text-ink">Saved Recipes</h1>
            <div className="flex gap-1" role="group" aria-label="Layout">
              {[{ key: 'grid', icon: '⊞', label: 'Grid' }, { key: 'list', icon: '☰', label: 'List' }].map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => setLayout(key)}
                  aria-pressed={layout === key}
                  aria-label={`${label} layout`}
                  className={`w-8 h-8 rounded-md text-[1.1rem] flex items-center justify-center border-[1.5px] transition-all ${
                    layout === key ? 'bg-accent border-accent text-white' : 'bg-card border-rim text-muted'
                  }`}
                >{icon}</button>
              ))}
            </div>
          </div>

          {!favList.length ? (
            <p className="text-center py-[60px] font-display text-[1.1rem] text-muted px-5">
              No saved recipes yet — tap ♥ on any recipe to save it here.
            </p>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-5 pb-5">
              {favList.map(key => {
                const hit = resolve(key)
                if (!hit) return null
                return <RecipeCard key={keyToText(key)} recipe={hit.recipe} recipeKey={hit.key} onOpen={onOpen} fill />
              })}
            </div>
          ) : (
            <div>
              {favList.map(key => {
                const hit = resolve(key)
                if (!hit) return null
                return <RecipeListItem key={keyToText(key)} recipe={hit.recipe} recipeKey={hit.key} onOpen={onOpen} />
              })}
            </div>
          )}
        </>
      )}

      {/* ── Lists tab ── */}
      {tab === 'lists' && (
        <div className="px-5 py-4">
          <form onSubmit={handleCreateList} className="flex gap-2 mb-5">
            <input
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              placeholder="New list name…"
              aria-label="New list name"
              maxLength={60}
              className="flex-1 border-[1.5px] border-rim rounded-xl px-4 py-2.5 text-[0.9rem] text-ink bg-card outline-none focus:border-accent placeholder:text-muted"
            />
            <button
              type="submit"
              className="bg-accent text-white font-bold text-[0.88rem] rounded-xl px-4 hover:bg-accent-dk transition-colors"
            >+ Create</button>
          </form>

          {!lists.length ? (
            <p className="text-center py-[40px] font-display text-[1.05rem] text-muted">
              No lists yet — create one above or use 📋 in any recipe.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {lists.map(list => {
                const isOpen   = expanded === list.id
                const resolved = list.items.map(resolve).filter(Boolean)
                return (
                  <div key={list.id} className="border-[1.5px] border-warm-tan rounded-xl overflow-hidden bg-card">
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-paper transition-colors gap-2">
                      {renaming === list.id ? (
                        <form onSubmit={e => handleRename(e, list.id)} className="flex gap-2 flex-1">
                          <input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            aria-label={`Rename ${list.name}`}
                            maxLength={60}
                            autoFocus
                            className="flex-1 border-[1.5px] border-rim rounded-lg px-2.5 py-1.5 text-[0.88rem] bg-paper outline-none focus:border-accent"
                          />
                          <button type="submit" className="text-[0.75rem] font-bold text-accent px-2">Save</button>
                          <button type="button" onClick={() => setRenaming(null)} className="text-[0.75rem] text-muted px-2">Cancel</button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : list.id)}
                            aria-expanded={isOpen}
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                          >
                            <span className="font-display text-[1rem] font-semibold text-ink truncate">{list.name}</span>
                            <span className="text-[0.72rem] text-muted shrink-0">
                              {list.items.length} recipe{list.items.length !== 1 ? 's' : ''}
                            </span>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => { setRenaming(list.id); setRenameValue(list.name) }}
                              aria-label={`Rename ${list.name}`}
                              className="text-[0.72rem] text-muted hover:text-accent transition-colors px-1.5 py-0.5 rounded"
                            >Rename</button>
                            <button
                              onClick={() => setConfirmList(list.id)}
                              aria-label={`Delete ${list.name}`}
                              className="text-[0.72rem] text-muted hover:text-heart transition-colors px-1.5 py-0.5 rounded"
                            >Delete</button>
                            <span className={`text-muted transition-transform text-[1.1rem] ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Deleting a list throws away its contents, so confirm first. */}
                    {confirmList === list.id && (
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#fde8e8] border-t border-warm-tan">
                        <span className="text-[0.8rem] text-heart">Delete “{list.name}”?</span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => { deleteList(list.id); setConfirmList(null) }}
                            className="text-[0.75rem] font-bold text-white bg-heart rounded-lg px-3 py-1"
                          >Delete</button>
                          <button
                            onClick={() => setConfirmList(null)}
                            className="text-[0.75rem] font-bold text-muted px-2"
                          >Cancel</button>
                        </div>
                      </div>
                    )}

                    {isOpen && (
                      <div className="border-t border-warm-tan">
                        {!resolved.length ? (
                          <p className="px-4 py-4 text-[0.85rem] text-muted italic">No recipes in this list yet.</p>
                        ) : (
                          resolved.map(({ recipe, key }) => (
                            <RecipeListItem key={keyToText(key)} recipe={recipe} recipeKey={key} onOpen={onOpen} />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
