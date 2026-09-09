import { useState, useMemo } from 'react'
import RecipeCard from '../components/RecipeCard'
import CreateRecipeModal from '../components/CreateRecipeModal'
import { applyFilters, VISIBLE_CATALOG } from '../utils/recipe'
import { useApp } from '../context/AppContext'
import { usePantry } from '../context/PantryContext'
import { pantryFit, compareFit } from '../utils/pantry'
import PantryFit from '../components/PantryFit'
import Icon from '../components/Icon'

const CATEGORIES = [...new Set(VISIBLE_CATALOG.map(({ r }) => r.category))]

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
  const [pantryMode,     setPantryMode]      = useState(false)
  const [catFilter,      setCatFilter]       = useState('')
  const { userRecipes } = useApp()
  const { pantryEnabled, pantryReady, pantryState, pantry } = usePantry()

  const filtered = useMemo(
    () => applyFilters(VISIBLE_CATALOG, dietFilter, timeFilter),
    [dietFilter, timeFilter],
  )

  // The same filters now apply to the My Recipes strip, which previously
  // ignored them and stayed fully visible under any filter.
  const filteredMine = useMemo(
    () => applyFilters(userRecipes.map(r => ({ r })), dietFilter, timeFilter).map(({ r }) => r),
    [userRecipes, dietFilter, timeFilter],
  )

  const visibleCats = CATEGORIES.filter(cat => filtered.some(({ r }) => r.category === cat))

  /**
   * Everything the filters allow, ordered by how little you'd have to buy.
   *
   * A flat list rather than the category strips: "what can I make" is a
   * question about the whole catalogue at once, and ranking inside each
   * category would bury the best answer under whichever heading it fell into.
   */
  const ranked = useMemo(() => {
    // Also feeds the "Closest to ready" strip, so it can't be gated on the
    // toggle — but it stays idle until the pantry actually knows something.
    if (!pantryEnabled || (!pantryMode && pantry.size === 0)) return []
    return [
      ...filtered,
      ...filteredMine.map(r => ({ r, i: 'u_' + r.id })),
    ]
      .map(p => ({ ...p, fit: pantryFit(p.r, pantryState) }))
      .sort((a, b) => compareFit(a.fit, b.fit))
  }, [pantryEnabled, pantryMode, pantry, filtered, filteredMine, pantryState])

  /**
   * The categories actually represented in the ranking, in catalogue order.
   *
   * Derived from the results rather than from the full category list so no
   * pill ever leads to an empty screen — and so a category that only exists
   * among the user's own recipes still gets one.
   */
  const rankedCats = useMemo(() => {
    const present = new Set(ranked.map(({ r }) => r.category))
    return [
      ...CATEGORIES.filter(c => present.has(c)),
      ...[...present].filter(c => !CATEGORIES.includes(c)).sort(),
    ]
  }, [ranked])

  // Category narrowing applies to the full ranked list only. The "Closest to
  // ready" strip stays unfiltered: it's a preview of your best options
  // overall, and its pills aren't on screen to explain a narrowed one.
  const rankedVisible = useMemo(
    () => (catFilter ? ranked.filter(({ r }) => r.category === catFilter) : ranked),
    [ranked, catFilter],
  )

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
        {pantryEnabled && (
          <>
            <div className="w-px h-[22px] bg-rim shrink-0 mx-0.5" />
            <button
              onClick={() => setPantryMode(p => !p)}
              aria-pressed={pantryMode}
              className={`${pillBase} ${pantryMode ? pillActive : pillInactive}`}
            >
              <Icon name="plate" size={13} />What can I make
            </button>
          </>
        )}
        <button
          onClick={surprise}
          className="shrink-0 ml-auto text-[0.75rem] font-bold text-accent-dk bg-paper border-2 border-ink rounded-full px-3.5 py-[5px] whitespace-nowrap hover:bg-accent hover:text-ink transition-all"
        ><Icon name="dice" size={14} />Surprise me</button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="shrink-0 text-[0.75rem] font-bold text-ink bg-accent border-2 border-ink shadow-pop press rounded-full px-3.5 py-[5px] whitespace-nowrap hover:bg-accent-dk transition-all"
        >+ My Recipe</button>
      </div>

      {/* Once the pantry knows anything, the payoff comes to the user rather
          than waiting behind the toggle. Capped at eight: a strip, not a
          replacement for the catalogue. */}
      {!pantryMode && pantry.size > 0 && ranked.length > 0 && (
        <section className="mb-2" aria-labelledby="closest-strip-heading">
          <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
            <h2 id="closest-strip-heading" className="font-display text-[1.1rem] font-semibold text-ink flex items-center gap-2">
              <Icon name="fridge" size={17} />Closest to ready
            </h2>
            <button
              onClick={() => setPantryMode(true)}
              className="text-[0.72rem] font-bold text-accent-dk border-2 border-ink bg-card shadow-pop press rounded-full px-3 py-[3px] hover:bg-accent hover:text-ink transition-all"
            >See all</button>
          </div>
          <div className="flex gap-3.5 overflow-x-auto px-5 pb-4 scrollbar-hide snap-x-mandatory">
            {ranked.slice(0, 8).map(({ r, i, fit }) => (
              <div key={i} className="snap-start shrink-0 w-[240px]">
                <RecipeCard recipe={r} recipeKey={i} onOpen={onOpen} fill />
                <PantryFit fit={fit} />
              </div>
            ))}
          </div>
          <div className="h-px bg-warm-tan opacity-60 mx-5" />
        </section>
      )}

      {pantryMode ? (
        <section aria-labelledby="closest-heading" className="pb-2">
          <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
            <h2 id="closest-heading" className="font-display text-[1.1rem] font-semibold text-ink">
              Closest to ready
            </h2>
            <span className="text-[0.72rem] text-muted">{rankedVisible.length} recipes</span>
          </div>

          {/* Course filter, only in this mode: the flat ranking replaces the
              category strips, so this is what puts "just breakfast" back. */}
          {rankedCats.length > 1 && (
            <div
              className="flex items-center gap-2 px-5 pb-3 overflow-x-auto scrollbar-hide"
              role="group"
              aria-label="Filter by category"
            >
              {/* "Any course", not "All" — the diet row above already has an
                  All pill, and two identically named buttons on one screen is
                  ambiguous in the UI and indistinguishable to a screen
                  reader. Matches the existing "Any time" wording. */}
              <button
                onClick={() => setCatFilter('')}
                aria-pressed={catFilter === ''}
                className={`${pillBase} ${catFilter === '' ? pillActive : pillInactive}`}
              >Any course</button>
              {rankedCats.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  aria-pressed={catFilter === cat}
                  className={`${pillBase} ${catFilter === cat ? pillActive : pillInactive}`}
                >{cat}</button>
              ))}
            </div>
          )}

          {/* An untouched pantry ranks by recipe size alone, which looks like a
              broken feature unless we say why. */}
          {pantryReady && pantry.size === 0 && (
            <p className="mx-5 mb-3 text-[0.78rem] text-muted italic border-2 border-dashed border-rim rounded-xl px-4 py-3">
              Nothing in your pantry yet — staples like salt and oil are assumed.
              Add what you have from the fridge icon at the top, and this list
              will reorder around it.
            </p>
          )}

          {rankedVisible.length === 0 ? (
            <p className="text-center py-[60px] font-display text-[1.1rem] text-muted px-5">
              No recipes match those filters.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-5 pb-6">
              {rankedVisible.map(({ r, i, fit }) => (
                <div key={i}>
                  <RecipeCard recipe={r} recipeKey={i} onOpen={onOpen} fill />
                  <PantryFit fit={fit} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
      <>
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
      )}
    </>
  )
}
