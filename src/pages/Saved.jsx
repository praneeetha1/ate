import { useState } from 'react'
import RECIPES from '../data/recipes.json'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import RecipeCard from '../components/RecipeCard'
import RecipeListItem from '../components/RecipeListItem'

export default function Saved({ onOpen }) {
  const { favorites, lists, userRecipes, deleteList, createList } = useApp()
  const { showError } = useToast()
  const [tab,        setTab]        = useState('favorites') // 'favorites' | 'lists'
  const [layout,     setLayout]     = useState('grid')
  const [expanded,   setExpanded]   = useState(null)
  const [newListName, setNewListName] = useState('')
  const favList = [...favorites]

  function resolveRecipe(key) {
    if (typeof key === 'number') return { recipe: RECIPES[key], idx: key }
    const id = key.replace('u_', '')
    const recipe = userRecipes.find(r => r.id === id)
    return recipe ? { recipe, idx: key } : null
  }

  async function handleCreateList(e) {
    e.preventDefault()
    if (!newListName.trim()) return
    try {
      await createList(newListName.trim())
      setNewListName('')
    } catch (err) {
      showError('Could not create list.')
    }
  }

  const tabCls = active =>
    `flex-1 py-2.5 text-[0.8rem] font-bold tracking-[0.06em] uppercase transition-colors border-b-2 ${
      active ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
    }`

  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-rim bg-paper">
        <button className={tabCls(tab === 'favorites')} onClick={() => setTab('favorites')}>
          ♥ Saved
        </button>
        <button className={tabCls(tab === 'lists')} onClick={() => setTab('lists')}>
          📋 Lists
        </button>
      </div>

      {/* ── Favorites tab ── */}
      {tab === 'favorites' && (
        <>
          <div className="flex items-center justify-between px-5 py-[18px] pb-3">
            <span className="font-display text-[1.3rem] font-semibold text-ink">Saved Recipes</span>
            <div className="flex gap-1">
              {[{ key: 'grid', icon: '⊞' }, { key: 'list', icon: '☰' }].map(({ key, icon }) => (
                <button
                  key={key}
                  onClick={() => setLayout(key)}
                  className={`w-8 h-8 rounded-md text-[1.1rem] flex items-center justify-center border-[1.5px] transition-all ${
                    layout === key ? 'bg-accent border-accent text-white' : 'bg-card border-rim text-muted'
                  }`}
                >{icon}</button>
              ))}
            </div>
          </div>

          {!favList.length ? (
            <div className="text-center py-[60px] font-display text-[1.1rem] text-muted px-5">
              No saved recipes yet — tap ♥ on any recipe to save it here.
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-5 pb-5">
              {favList.map(i => {
                const resolved = resolveRecipe(i)
                if (!resolved) return null
                return <RecipeCard key={i} recipe={resolved.recipe} idx={resolved.idx} onOpen={onOpen} fill />
              })}
            </div>
          ) : (
            <div>
              {favList.map(i => {
                const resolved = resolveRecipe(i)
                if (!resolved) return null
                return <RecipeListItem key={i} recipe={resolved.recipe} idx={resolved.idx} onOpen={onOpen} />
              })}
            </div>
          )}
        </>
      )}

      {/* ── Lists tab ── */}
      {tab === 'lists' && (
        <div className="px-5 py-4">
          {/* Create list */}
          <form onSubmit={handleCreateList} className="flex gap-2 mb-5">
            <input
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              placeholder="New list name…"
              className="flex-1 border-[1.5px] border-rim rounded-xl px-4 py-2.5 text-[0.9rem] text-ink bg-card outline-none focus:border-accent placeholder:text-muted"
            />
            <button
              type="submit"
              className="bg-accent text-white font-bold text-[0.88rem] rounded-xl px-4 hover:bg-accent-dk transition-colors"
            >+ Create</button>
          </form>

          {!lists.length ? (
            <div className="text-center py-[40px] font-display text-[1.05rem] text-muted">
              No lists yet — create one above or use 📋 in any recipe.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {lists.map(list => {
                const isOpen   = expanded === list.id
                const resolved = list.items.map(k => resolveRecipe(k)).filter(Boolean)
                return (
                  <div key={list.id} className="border-[1.5px] border-warm-tan rounded-xl overflow-hidden bg-card">
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-paper transition-colors"
                      onClick={() => setExpanded(isOpen ? null : list.id)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-display text-[1rem] font-semibold text-ink">{list.name}</span>
                        <span className="text-[0.72rem] text-muted">{list.items.length} recipe{list.items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); deleteList(list.id) }}
                          className="text-[0.72rem] text-muted hover:text-heart transition-colors px-1.5 py-0.5 rounded"
                        >Delete</button>
                        <span className={`text-muted transition-transform text-[1.1rem] ${isOpen ? 'rotate-90' : ''}`}>›</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-warm-tan">
                        {!resolved.length ? (
                          <div className="px-4 py-4 text-[0.85rem] text-muted italic">No recipes in this list yet.</div>
                        ) : (
                          resolved.map(({ recipe, idx }) => (
                            <RecipeListItem key={idx} recipe={recipe} idx={idx} onOpen={onOpen} />
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
