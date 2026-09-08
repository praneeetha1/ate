import { useState, useMemo } from 'react'
import RECIPES from '../data/recipes.json'
import RecipeCard from '../components/RecipeCard'
import CreateRecipeModal from '../components/CreateRecipeModal'
import { applyFilters } from '../utils/recipe'
import { useApp } from '../context/AppContext'
import Icon from '../components/Icon'

const CATEGORIES = [...new Set(RECIPES.map(r => r.category))]

const DIET_PILLS = [
  { label: 'All',           value: '' },
  { label: 'Vegetarian', value: 'vegetarian', icon: 'leaf' },
]
const TIME_PILLS = [
  { label: 'Any time',       value: '' },
  { label: 'Under 30 min', value: '30', icon: 'clock' },
  { label: 'Under 1 hr',   value: '60', icon: 'clock' },
]

export default function Home({ onOpen }) {
  const [dietFilter,      setDietFilter]      = useState('')
  const [timeFilter,      setTimeFilter]      = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { userRecipes } = useApp()

  const filtered = useMemo(
    () => applyFilters(RECIPES.map((r, i) => ({ r, i })), dietFilter, timeFilter),
    [dietFilter, timeFilter],
  )

  // The same filters now apply to the My Recipes strip, which previously
  // ignored them and stayed fully visible under any filter.
  const filteredMine = useMemo(
    () => applyFilters(userRecipes.map(r => ({ r })), dietFilter, timeFilter).map(({ r }) => r),
    [userRecipes, dietFilter, timeFilter],
  )

  const visibleCats = CATEGORIES.filter(cat => filtered.some(({ r }) => r.category === cat))

  function surprise() {
    if (!filtered.length) return
    const { i } = filtered[Math.floor(Math.random() * filtered.length)]
    onOpen(i)
  }

  const pillBase     = 'shrink-0 inline-flex items-center gap-1.5 text-[0.75rem] font-bold tracking-[0.06em] uppercase px-3.5 py-[5px] rounded-full border-2 transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
  const pillActive   = 'bg-accent border-ink text-ink shadow-pop'
  const pillInactive = 'bg-card border-ink text-muted hover:bg-paper hover:text-accent-dk'

  return (
    <>
      {showCreateModal && (
        <CreateRecipeModal
          onClose={() => setShowCreateModal(false)}
          onCreated={key => onOpen(key)}
        />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-5 py-3 overflow-x-auto scrollbar-hide border-b border-ink bg-cream sticky-under-header z-[80]">
        <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Filter by diet">
          {DIET_PILLS.map(p => (
            <button
              key={p.value}
              onClick={() => setDietFilter(p.value)}
              aria-pressed={dietFilter === p.value}
              className={`${pillBase} ${dietFilter === p.value ? pillActive : pillInactive}`}
            >
              {p.icon && <Icon name={p.icon} size={13} />}{p.label}
            </button>
          ))}
        </div>
        <div className="w-px h-[22px] bg-rim shrink-0 mx-0.5" />
        <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Filter by time">
          {TIME_PILLS.map(p => (
            <button
              key={p.value}
              onClick={() => setTimeFilter(p.value)}
              aria-pressed={timeFilter === p.value}
              className={`${pillBase} ${timeFilter === p.value ? pillActive : pillInactive}`}
            >
              {p.icon && <Icon name={p.icon} size={13} />}{p.label}
            </button>
          ))}
        </div>
        <button
          onClick={surprise}
          className="shrink-0 ml-auto text-[0.75rem] font-bold text-accent-dk bg-paper border-2 border-ink rounded-full px-3.5 py-[5px] whitespace-nowrap hover:bg-accent hover:text-ink transition-all"
        ><Icon name="dice" size={14} />Surprise me</button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="shrink-0 text-[0.75rem] font-bold text-ink bg-accent border-2 border-ink shadow-pop press rounded-full px-3.5 py-[5px] whitespace-nowrap hover:bg-accent-dk transition-all"
        >+ My Recipe</button>
      </div>

      {/* My Recipes section */}
      {filteredMine.length > 0 && (
        <section className="mb-2" aria-labelledby="my-recipes-heading">
          <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
            <h2 id="my-recipes-heading" className="font-display text-[1.1rem] font-semibold text-ink">My Recipes</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-[0.72rem] font-bold text-ink border-2 border-ink bg-card shadow-pop press rounded-full px-3 py-[3px] hover:bg-accent hover:text-ink transition-all"
            >+ New</button>
          </div>
          <div className="flex gap-3.5 overflow-x-auto px-5 pb-4 scrollbar-hide snap-x-mandatory">
            {filteredMine.map(r => (
              <div key={r.id} className="snap-start shrink-0">
                <RecipeCard recipe={r} recipeKey={'u_' + r.id} onOpen={onOpen} />
              </div>
            ))}
          </div>
          <div className="h-px bg-warm-tan opacity-60 mx-5" />
        </section>
      )}

      {/* Category sections */}
      <div>
        {visibleCats.length === 0 && filteredMine.length === 0 && (
          <p className="text-center py-[60px] font-display text-[1.1rem] text-muted px-5">
            No recipes match those filters.
          </p>
        )}
        {visibleCats.map((cat, ci) => {
          const recipes = filtered.filter(({ r }) => r.category === cat)
          return (
            <section key={cat} className="mb-2">
              <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
                <h2 className="font-display text-[1.1rem] font-semibold text-ink">{cat}</h2>
                <span className="text-[0.72rem] text-muted">
                  {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3.5 overflow-x-auto px-5 pb-4 scrollbar-hide snap-x-mandatory">
                {recipes.map(({ r, i }) => (
                  <div key={i} className="snap-start shrink-0">
                    <RecipeCard recipe={r} recipeKey={i} onOpen={onOpen} />
                  </div>
                ))}
              </div>
              {ci < visibleCats.length - 1 && (
                <div className="h-px bg-warm-tan opacity-60 mx-5" />
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
