import { useState, useMemo } from 'react'
import RECIPES from '../data/recipes.json'
import RecipeCard from '../components/RecipeCard'

const ALL_INGREDIENTS = (() => {
  const seen = new Set()
  RECIPES.forEach(r => r.ingredients.forEach(ing => {
    if (!ing.item) return
    const core = ing.item.toLowerCase().replace(/,.*/, '').replace(/\(.*\)/, '').trim()
    if (core.length > 1) seen.add(core)
  }))
  return [...seen].sort()
})()

function scoreRecipe(recipe, selected) {
  return selected.filter(sel =>
    recipe.ingredients.some(ing => ing.item.toLowerCase().includes(sel.toLowerCase()))
  ).length
}

function Highlight({ text, query }) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <em className="text-accent-dk font-bold not-italic">{text.slice(idx, idx + query.length)}</em>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function Search({ onOpen }) {
  const [mode,          setMode]          = useState('name')
  const [nameQuery,     setNameQuery]     = useState('')
  const [selectedIngs,  setSelectedIngs]  = useState([])
  const [ingQuery,      setIngQuery]      = useState('')
  const [showDropdown,  setShowDropdown]  = useState(false)
  const [ingResults,    setIngResults]    = useState(null)

  const nameResults = useMemo(() => {
    if (!nameQuery.trim()) return null
    const q = nameQuery.toLowerCase()
    return RECIPES.map((r, i) => ({ r, i })).filter(({ r }) => r.name.toLowerCase().includes(q))
  }, [nameQuery])

  const suggestions = useMemo(() => {
    if (!ingQuery) return []
    return ALL_INGREDIENTS
      .filter(n => n.includes(ingQuery.toLowerCase()) && !selectedIngs.includes(n))
      .slice(0, 12)
  }, [ingQuery, selectedIngs])

  function addIngredient(name) {
    if (!selectedIngs.includes(name)) setSelectedIngs(p => [...p, name])
    setIngQuery('')
    setShowDropdown(false)
    setIngResults(null)
  }

  function removeIngredient(name) {
    setSelectedIngs(p => p.filter(n => n !== name))
    setIngResults(null)
  }

  function findRecipes() {
    if (!selectedIngs.length) return
    const total = selectedIngs.length
    setIngResults(
      RECIPES
        .map((r, i) => ({ r, i, matchCount: scoreRecipe(r, selectedIngs), total }))
        .filter(x => x.matchCount > 0)
        .sort((a, b) => b.matchCount - a.matchCount)
    )
  }

  const results = mode === 'name' ? nameResults : ingResults
  const pillCls = active =>
    `text-[0.78rem] font-bold tracking-[0.06em] px-4 py-1.5 rounded-full border-[1.5px] transition-all ${
      active ? 'bg-accent border-accent text-white' : 'bg-card border-rim text-muted hover:border-accent'
    }`

  return (
    <>
      {/* Search header */}
      <div className="px-5 py-4 pb-3 bg-cream sticky top-[72px] z-[90] border-b border-warm-tan">
        <div className="relative mb-3">
          <input
            type="text"
            placeholder={mode === 'ingredient' ? 'Ingredient search active below ↓' : 'Search recipes by name…'}
            value={nameQuery}
            onChange={e => setNameQuery(e.target.value)}
            disabled={mode === 'ingredient'}
            className="w-full border-[1.5px] border-rim rounded-[10px] px-4 py-[11px] pr-10 text-[0.95rem] bg-card text-ink outline-none focus:border-accent transition-colors placeholder:text-muted disabled:opacity-60"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">🔍</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMode('name')}       className={pillCls(mode === 'name')}>By Recipe Name</button>
          <button onClick={() => setMode('ingredient')} className={pillCls(mode === 'ingredient')}>What can I make?</button>
        </div>
      </div>

      {/* Ingredient picker */}
      {mode === 'ingredient' && (
        <div className="px-5 py-3.5 pb-3 bg-paper border-b border-warm-tan">
          <div className="flex gap-2 relative">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="e.g. garlic, eggs, butter…"
                value={ingQuery}
                onChange={e => { setIngQuery(e.target.value); setShowDropdown(true) }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && suggestions[0]) addIngredient(suggestions[0])
                  if (e.key === 'Escape') setShowDropdown(false)
                }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className="w-full border-[1.5px] border-rim rounded-lg px-3.5 py-2.5 text-[0.9rem] bg-card text-ink outline-none focus:border-accent transition-colors placeholder:text-muted"
              />
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-card border-[1.5px] border-rim rounded-lg shadow-warm-lg max-h-[180px] overflow-y-auto z-50">
                  {suggestions.map(n => (
                    <div
                      key={n}
                      onMouseDown={() => addIngredient(n)}
                      className="px-3.5 py-2.5 text-[0.88rem] cursor-pointer border-b border-[rgba(200,180,130,0.2)] last:border-0 hover:bg-paper transition-colors"
                    >
                      <Highlight text={n} query={ingQuery} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={findRecipes}
              disabled={!selectedIngs.length}
              className="bg-accent text-white rounded-lg px-4 text-[0.8rem] font-bold whitespace-nowrap hover:bg-accent-dk disabled:opacity-40 disabled:cursor-default transition-colors"
            >Find Recipes</button>
          </div>
          {selectedIngs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {selectedIngs.map(name => (
                <span key={name} className="inline-flex items-center gap-1.5 bg-warm-tan text-accent-dk rounded-full px-3 py-1 text-[0.8rem] font-bold">
                  {name}
                  <button onClick={() => removeIngredient(name)} className="text-[0.85rem] text-muted hover:text-heart transition-colors">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-5 pb-6">
        {results === null ? (
          <div className="col-span-full text-center py-[60px] text-muted text-[1rem]">
            {mode === 'name' ? 'Type a recipe name above 🍳' : 'Pick ingredients above, then tap Find Recipes 🍳'}
          </div>
        ) : results.length === 0 ? (
          <div className="col-span-full text-center py-[60px] font-display text-[1.1rem] text-muted">
            No recipes found
          </div>
        ) : (
          results.map(({ r, i, matchCount, total }) => (
            <div key={i}>
              <RecipeCard recipe={r} idx={i} onOpen={onOpen} fill />
              {mode === 'ingredient' && matchCount > 0 && (
                <div className="text-[0.72rem] text-accent-dk bg-paper border border-t-0 border-warm-tan rounded-b-xl px-4 py-1.5 font-bold -mt-1">
                  ✓ matches {matchCount} of {total} ingredient{total !== 1 ? 's' : ''} you have
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}
