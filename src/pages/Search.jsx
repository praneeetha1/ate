import { useState, useMemo } from 'react'
import RECIPES from '../data/recipes.json'
import RecipeCard from '../components/RecipeCard'
import { useApp } from '../context/AppContext'
import { usePantry } from '../context/PantryContext'
import { pantryFit } from '../utils/pantry'
import PantryFit from '../components/PantryFit'
import Icon from '../components/Icon'

/** Reduces "flour, sifted (optional)" to "flour" for the suggestion list. */
function coreIngredient(item) {
  return String(item).toLowerCase().replace(/,.*/, '').replace(/\(.*\)/, '').trim()
}

const CATALOG_INGREDIENTS = (() => {
  const seen = new Set()
  RECIPES.forEach(r => r.ingredients.forEach(ing => {
    if (!ing.item) return
    const core = coreIngredient(ing.item)
    if (core.length > 1) seen.add(core)
  }))
  return seen
})()

function scoreRecipe(recipe, selected) {
  return selected.filter(sel =>
    recipe.ingredients.some(ing => String(ing.item).toLowerCase().includes(sel.toLowerCase()))
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
  const { userRecipes } = useApp()
  const { pantryEnabled, pantryState, pantry } = usePantry()

  const [mode,         setMode]         = useState('name')
  const [nameQuery,    setNameQuery]    = useState('')
  const [selectedIngs, setSelectedIngs] = useState([])
  const [ingQuery,     setIngQuery]     = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [ingResults,   setIngResults]   = useState(null)

  // Search now spans the user's own recipes as well as the catalog — they were
  // previously unreachable from this page entirely.
  const searchable = useMemo(() => [
    ...RECIPES.map((r, i) => ({ r, key: i })),
    ...userRecipes.map(r => ({ r, key: 'u_' + r.id })),
  ], [userRecipes])

  const allIngredients = useMemo(() => {
    const seen = new Set(CATALOG_INGREDIENTS)
    userRecipes.forEach(r => (r.ingredients || []).forEach(ing => {
      if (!ing.item) return
      const core = coreIngredient(ing.item)
      if (core.length > 1) seen.add(core)
    }))
    return [...seen].sort()
  }, [userRecipes])

  const nameResults = useMemo(() => {
    const q = nameQuery.trim().toLowerCase()
    if (!q) return null
    return searchable.filter(({ r }) => r.name.toLowerCase().includes(q))
  }, [nameQuery, searchable])

  const suggestions = useMemo(() => {
    if (!ingQuery) return []
    const q = ingQuery.toLowerCase()
    return allIngredients.filter(n => n.includes(q) && !selectedIngs.includes(n)).slice(0, 12)
  }, [ingQuery, selectedIngs, allIngredients])

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
      searchable
        .map(({ r, key }) => ({ r, key, matchCount: scoreRecipe(r, selectedIngs), total }))
        .filter(x => x.matchCount > 0)
        .sort((a, b) => b.matchCount - a.matchCount)
    )
  }

  const results = mode === 'name' ? nameResults : ingResults
  const pillCls = active =>
    `text-[0.78rem] font-bold tracking-[0.06em] px-4 py-1.5 rounded-full border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
      active ? 'bg-accent border-ink text-ink shadow-pop' : 'bg-card border-ink text-muted hover:bg-paper'
    }`

  return (
    <>
      {/* Search header */}
      <div className="px-5 py-4 pb-3 bg-cream sticky-under-header z-[90] border-b border-ink">
        <div className="relative mb-3">
          <input
            type="search"
            placeholder={mode === 'ingredient' ? 'Ingredient search active below' : 'Search recipes by name…'}
            value={nameQuery}
            onChange={e => setNameQuery(e.target.value)}
            disabled={mode === 'ingredient'}
            aria-label="Search recipes by name"
            className="w-full border-2 border-ink rounded-xl px-4 py-[11px] pr-10 text-[0.95rem] bg-card text-ink outline-none focus:border-accent transition-colors placeholder:text-muted disabled:opacity-60"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" ><Icon name="search" size={17} /></span>
        </div>
        <div className="flex gap-2" role="group" aria-label="Search mode">
          <button onClick={() => setMode('name')}       aria-pressed={mode === 'name'}       className={pillCls(mode === 'name')}>By Recipe Name</button>
          <button onClick={() => setMode('ingredient')} aria-pressed={mode === 'ingredient'} className={pillCls(mode === 'ingredient')}>What can I make?</button>
        </div>
      </div>

      {/* Ingredient picker */}
      {mode === 'ingredient' && (
        <div className="px-5 py-3.5 pb-3 bg-paper border-b border-ink">
          <div className="flex gap-2 relative">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="e.g. garlic, eggs, butter…"
                value={ingQuery}
                onChange={e => { setIngQuery(e.target.value); setShowDropdown(true) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (suggestions[0]) addIngredient(suggestions[0]) }
                  if (e.key === 'Escape') setShowDropdown(false)
                }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                aria-label="Add an ingredient you have"
                aria-expanded={showDropdown && suggestions.length > 0}
                className="w-full border-2 border-ink rounded-xl px-3.5 py-2.5 text-[0.9rem] bg-card text-ink outline-none focus:border-accent transition-colors placeholder:text-muted"
              />
              {showDropdown && suggestions.length > 0 && (
                <ul className="absolute top-[calc(100%+4px)] left-0 right-0 bg-card border-2 border-ink rounded-xl shadow-warm-lg max-h-[180px] overflow-y-auto z-50 list-none">
                  {suggestions.map(n => (
                    <li key={n}>
                      <button
                        type="button"
                        onMouseDown={() => addIngredient(n)}
                        className="w-full text-left px-3.5 py-2.5 text-[0.88rem] cursor-pointer border-b border-[rgba(200,180,130,0.2)] last:border-0 hover:bg-paper transition-colors"
                      >
                        <Highlight text={n} query={ingQuery} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={findRecipes}
              disabled={!selectedIngs.length}
              className="bg-accent text-ink border-2 border-ink shadow-pop press rounded-xl px-4 text-[0.8rem] font-bold whitespace-nowrap hover:bg-accent-dk disabled:opacity-40 disabled:cursor-default transition-colors"
            >Find Recipes</button>
          </div>
          {selectedIngs.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mt-2.5 list-none">
              {selectedIngs.map(name => (
                <li key={name} className="inline-flex items-center gap-1.5 bg-warm-tan text-accent-dk rounded-full px-3 py-1 text-[0.8rem] font-bold">
                  {name}
                  <button
                    onClick={() => removeIngredient(name)}
                    aria-label={`Remove ${name}`}
                    className="text-[0.85rem] text-muted hover:text-heart transition-colors"
                  ><Icon name="close" size={12} strokeWidth={3} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Results */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-5 pb-6">
        {results === null ? (
          <p className="col-span-full text-center py-[60px] text-muted text-[1rem]">
            {mode === 'name' ? 'Type a recipe name above' : 'Pick ingredients above, then tap Find Recipes'}
          </p>
        ) : results.length === 0 ? (
          <p className="col-span-full text-center py-[60px] font-display text-[1.1rem] text-muted">
            No recipes found
          </p>
        ) : (
          results.map(({ r, key, matchCount, total }) => {
            const matched = mode === 'ingredient' && matchCount > 0
            return (
              <div key={key}>
                <RecipeCard recipe={r} recipeKey={key} onOpen={onOpen} fill />
                {matched && (
                  <p className="text-[0.72rem] text-accent-dk bg-paper border border-t-0 border-ink rounded-b-xl px-4 py-1.5 font-bold -mt-1">
                    <Icon name="check" size={13} className="inline align-[-2px] mr-1" /> matches {matchCount} of {total} ingredient{total !== 1 ? 's' : ''} you have
                  </p>
                )}
                {/* Only when the pantry has something to say, and never
                    stacked under the ingredient-match line above — two
                    captions about the same card contradict each other more
                    often than they help. */}
                {!matched && pantryEnabled && pantry.size > 0 && (
                  <PantryFit fit={pantryFit(r, pantryState)} />
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
